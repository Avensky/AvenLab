// ==============================================================================
// physics.rs — WORLD STEP + VEHICLE FORCE PIPELINE (RAPIER INTEGRATION)
// ==============================================================================
// We are implementing a hybrid impulse-based tire model, best described as:
// Raycast suspension + brush tire model + impulse-domain friction ellipse
// ------------------------------------------------------------------------------
// This file owns the server-side rigid-body simulation loop and integrates a
// custom raycast-vehicle model into Rapier.
//
// Design goals:
// - Chassis collider has friction = 0.0 (no ground friction from Rapier contacts).
// - All tire forces are computed manually (impulse domain) and applied to the
//   chassis as impulses (and optional torque impulses).
// - Suspension is raycast-based: spring + damper -> normal force -> impulse.
// - Tires use a lightweight brush lateral model + longitudinal engine/brake
//   model, combined via a friction ellipse in *impulse space*.
//
// Step pipeline (high-level):
// 1) apply_vehicle_controls(dt)
//    - Converts player inputs into intent (steer smoothing / rate-limiting).
//    - Does NOT apply physics forces.
// 2) apply_suspension(dt)
//    - Phase 1 (Sense): raycast each wheel, compute compression, point velocity,
//      slip components, raw normal force, and build ContactPatch.
//    - Phase 2 (Redistribute): apply anti-roll bar load transfer (per axle),
//      updating per-wheel normal forces.
//    - Phase 3 (Act): apply suspension impulses (Jn = n * Fz * dt), then call
//      aven_tire::solve_step() to compute tire impulses (long + lat + yaw +
//      optional aligning `), then apply all impulses to the chassis.
// 3) pipeline.step(...)
//    - Rapier integrates the final velocities/poses.
// ------------------------------------------------------------------------------
// Key dependencies:
// - suspension_contact::build_suspension_contact()
// - anti_roll::apply_arb_load_transfer()
// - aven_tire::solve_step()
// ==============================================================================
// ==============================================================================

// src/physics.rs
use rapier3d::prelude::*;
use rapier3d::prelude::{InteractionGroups, Group};
use std::collections::HashMap;
use serde::Serialize;
use crate::suspension_contact::{SuspensionContact, build_suspension_contact};
use crate::aven_tire::anti_roll::{ apply_arb_load_transfer};
use crate::aven_tire::steering::{ apply_angular_damping, apply_vehicle_controls, SteeringState, SteeringConfig, solve_steering};
use crate::aven_tire::{ContactPatch, ControlInput, SolveContext, WheelId, solve_step};
use crate::vehicle::{Vehicle, VehicleConfig};
// use crate::aven_tire::v_mag;

const GROUP_GROUND: Group  = Group::from_bits_truncate(0b0001);
const GROUP_CHASSIS: Group = Group::from_bits_truncate(0b0010);

#[derive(Clone, Serialize)]
pub struct DebugRay {
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub length: f32,
    pub hit: Option<[f32; 3]>,
    pub color: [f32; 3],
}

#[derive(Clone, Serialize)]
pub struct DebugSlipRay {
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub slip_angle: f32,
    pub magnitude: f32,
    pub color: [f32; 3],
}

#[derive(Clone, Serialize)]
pub struct DebugWheel {
    pub id: String,                 // "FL", "FR", "RL", "RR"

    pub center: [f32; 3],           // in world space
    pub radius: f32,
    pub grounded: bool,
    pub compression: f32,
    pub normal_force: f32,
    pub steer: f32,
    pub steering: bool,
    pub drive: bool,

    // pub lateral_force: [f32; 3],                // for debug visualization
    // pub lateral_magnitude: f32,                 // for debug visualization
}

#[derive(Clone, Serialize)]
pub struct DebugOverlay {
    pub chassis: Option<DebugChassis>,
    pub suspension_rays: Vec<DebugRay>,
    pub load_bars: Vec<DebugRay>,
    pub arb_links: Vec<DebugRay>,
    pub wheels: Vec<DebugWheel>,
    pub chassis_right: [f32; 3],
    pub slip_vectors: Vec<DebugSlipRay>,
}

impl DebugOverlay {
    pub fn clear(&mut self) {
        self.suspension_rays.clear();
        self.load_bars.clear();
        self.wheels.clear();
        self.arb_links.clear(); 
        self.slip_vectors.clear(); 
    }
}

#[derive(Clone)]
pub struct Wheel {
    pub debug_id: String,        // "FL", "FR", "RL", "RR"
    pub offset: Point<Real>,     // position in chassis local space
    pub rest_length: Real,       // suspension neutral length
    pub max_length: Real,        // max compression + extension
    pub radius: Real,            // wheel radius

    pub stiffness: Real,         // spring constant
    pub damping: Real,           // damper constant

    pub drive: bool,             // is this a driven wheel?
    pub steer: bool,             // is this a steering wheel?

    pub v_lat_relaxed: f32,

}

#[derive(Clone, Serialize)]
pub struct DebugChassis {
    pub position: [f32; 3],
    pub rotation: [f32; 4], // quaternion
    pub half_extents: [f32; 3],
}

enum BodyImpulse {
    Linear {
        handle: RigidBodyHandle,
        impulse: Vector<Real>,
        at_point: Option<Point<Real>>,
    },
    // Torque {
    //     handle: RigidBodyHandle,
    //     torque_impulse: Vector<Real>,
    // },
}


pub const GT86: VehicleConfig = VehicleConfig {
    mass: 1350.0,             // kg
    engine_force: 9000.0,     // N
    brake_force: 8000.0,      // N
    max_speed: 55.0,          // m/s
    linear_damping: 0.08,     // coasting comes back
    angular_damping: 0.6,     // drag

    wheelbase: 2.5,           // meters (front axle to rear axle)
    track_width: 1.5,         // meters (left to right)
    max_steer_angle: 0.6,     // radians (~34 degrees)
    ackermann: 0.8,           // 0..1 blend (0 = parallel, 1 = full ackermann)
    
    chassis_half_extents: [1.0, 0.35, 2.1], // GT86-ish
    chassis_com_offset: [0.0, -0.15, 0.0], // slightly below visual center

    arb_front: 18_000.0,      // N/m
    arb_rear: 12_000.0,       // N/m
    
    load_sensitivity: 0.15,   // k spring load sensitivity
    mu_base: 0.85,             // base friction coefficient

    // NEW: assists (toggles + thresholds)
    abs_enabled: true,
    tcs_enabled: true,

    // “how aggressive” (dimensionless, relative demand vs capacity)
    abs_nx_limit: 0.90,
    tcs_nx_limit: 0.85,

};

pub const TANK: VehicleConfig = VehicleConfig {
    mass: 32000.0,
    engine_force: 18000.0,
    brake_force: 80_000.0,
    max_speed: 18.0,
    linear_damping: 2.0,
    angular_damping: 4.0,

    wheelbase: 2.5,           // meters (front axle to rear axle)
    track_width: 1.5,         // meters (left to right)
    max_steer_angle: 0.6,     // radians (~34 degrees)
    ackermann: 0.8,           // 0..1 blend (0 = parallel, 1 = full ackermann)

    chassis_half_extents: [1.0, 0.35, 2.1], // GT86-ish
    chassis_com_offset: [0.0, -0.15, 0.0], // slightly below visual center

    mu_base: 8.0,
    load_sensitivity: 0.30,

    arb_front: 18_000.0,
    arb_rear: 12_000.0,

    abs_enabled: true,
    tcs_enabled: true,
    abs_nx_limit: 0.90,
    tcs_nx_limit: 0.85,
};

#[inline] fn v3(v: Vector<Real>) -> [f32; 3] { [v.x, v.y, v.z] }
#[inline] fn p3(p: Point<Real>)  -> [f32; 3] { [p.x, p.y, p.z] }



fn effective_mass_at_point(
    body: &RigidBody,
    point_world: Point<Real>,
    dir_world: Vector<Real>,
) -> f32 {
    // dir_world must be normalized
    let mp = body.mass_properties();

    // inverse map
    let inv_m = mp.local_mprops.inv_mass;

    // World-space local center of mass
    let local_com = mp.local_mprops.local_com;
    let com_world: Point<Real> = body.position() * local_com;

    // r = contact point relative to COM
    let r = point_world - com_world;

    // Angular term:
    // (I^-1 * (r × n)) × r ⋅ n
    let rxn = r.cross(&dir_world);

    let inv_i = mp.effective_world_inv_inertia_sqrt;

    let ang = (inv_i * rxn).cross(&r).dot(&dir_world);

    let denom = inv_m + ang.max(0.0);
    if denom <= 1e-8 {
        0.0
    } else {
        (1.0 / denom) as f32
    }
}




pub struct PhysicsWorld {
    pub gravity: Vector<Real>, // gravity vector
    pub pipeline: PhysicsPipeline, // physics pipeline
    pub island_manager: IslandManager, // manages islands of bodies
    pub broad_phase: DefaultBroadPhase, // broad-phase collision detection
    pub narrow_phase: NarrowPhase, // collision detection
    pub bodies: RigidBodySet, // for rigid bodies
    pub colliders: ColliderSet, // for collision shapes
    pub joints: ImpulseJointSet, // for constraints
    pub multibody_joints: MultibodyJointSet,// for articulated bodies
    pub ccd: CCDSolver, // continuous collision detection
    pub query_pipeline: QueryPipeline, // for raycasting
    // pub suspension: VehicleSuspension,
    pub wheels: HashMap<RigidBodyHandle, Vec<Wheel>>, // body handle → wheels
    pub vehicles: HashMap<String, Vehicle>, // playerId → vehicle   
    pub body_to_player: HashMap<RigidBodyHandle, String>, // body handle → playerId
    pub debug_overlay: DebugOverlay,// for debug visualization
}

impl PhysicsWorld {

    pub fn despawn_vehicle_for_player(&mut self, player_id: &str) {
        let Some(vehicle) = self.vehicles.remove(player_id) else {
            return;
        };

        let body_handle = vehicle.body;

        self.bodies.remove(
            body_handle,
            &mut self.island_manager,
            &mut self.colliders,
            &mut self.joints,
            &mut self.multibody_joints,
            true, // remove attached colliders
        );

        println!("🧹 Physics vehicle removed for {}", player_id);
    }

    pub fn debug_snapshot(&self) -> DebugOverlay {
        self.debug_overlay.clone()
    }

    pub fn clear_debug_overlay(&mut self) {
        self.debug_overlay.suspension_rays.clear();
        self.debug_overlay.load_bars.clear();
        self.debug_overlay.arb_links.clear(); 
        self.debug_overlay.wheels.clear();
        self.debug_overlay.slip_vectors.clear();
    }

    pub fn new() -> Self {
        let gravity = vector![0.0, -9.81, 0.0];

        let mut bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();

        // === 1. Create a big static ground box at y = 0 ===
        //
        // Size: 1000 x 0.2 x 1000 (very large, very thin)
        // Centered at (0, -0.1, 0), so its top surface is exactly at y = 0.
        let ground_rb = RigidBodyBuilder::fixed()
            .translation(vector![0.0, -0.1, 0.0])
            .build();

        let ground_handle = bodies.insert(ground_rb);

        let ground_collider = ColliderBuilder::cuboid(500.0, 1.0, 500.0)
            .collision_groups(InteractionGroups::new(
                GROUP_GROUND,
                // Group::empty(),
                GROUP_CHASSIS,
            ))
            .friction(1.2)
            .restitution(0.0)
            .build();

        colliders.insert_with_parent(ground_collider, ground_handle, &mut bodies);

        println!(
            "🌎 Ground inserted. Bodies = {}, Colliders = {}",
            bodies.len(),
            colliders.len()
        );

        Self {
            gravity,
            pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            bodies,
            colliders,
            joints: ImpulseJointSet::new(),
            multibody_joints: MultibodyJointSet::new(),
            ccd: CCDSolver::new(),
            query_pipeline: QueryPipeline::new(),
            wheels:  HashMap::new(),
            vehicles: HashMap::new(),
            body_to_player: HashMap::new(),
            debug_overlay: DebugOverlay {
                chassis: None,
                arb_links: Vec::new(),
                suspension_rays: Vec::new(),
                load_bars: Vec::new(),
                wheels: Vec::new(),
                chassis_right: [1.0, 0.0, 0.0], // default
                slip_vectors: Vec::new(),
            },
        }
    }

    // ===========================================================================
    // Attach input to a player's vehicle (just stores it; actual forces are
    // applied in `step`).
    // ===========================================================================
    pub fn apply_player_input(&mut self,player_id: &str,throttle: f32,steer: f32,brake: f32,ascend: f32,pitch: f32,yaw: f32,roll: f32) {
        if let Some(v) = self.vehicles.get_mut(player_id) {
            v.throttle = throttle.clamp(-1.0, 1.0);
            v.steer = steer.clamp(-1.0, 1.0);
            v.brake = brake.clamp(0.0, 1.0);
            v.pitch = pitch;
            v.roll = roll;
            v.yaw = yaw;
            v.ascend = ascend;
            // v.last_input_time = now();
        }
    }

    // ============================================================================
    // Spawn a simple "car" for this player:
    // - Dynamic rigid body with a box collider.
    // - Positioned slightly above the ground so it can fall and settle.
    // ============================================================================
    pub fn spawn_vehicle_for_player(&mut self, id: String, position: [f32; 3]) {
        let spawn_x = position[0];
        let spawn_z = position[2];
        let spawn_y = 1.3;                  // fixed server convention
        let config = GT86;                  // you can choose different configs per player if desired
        let volume = 2.0 * 1.0 * 4.0;       // box size
        let density = config.mass / volume; // ρ = m / V
        
        // Rigid body
        let rb = RigidBodyBuilder::dynamic()
            .translation(vector![spawn_x, spawn_y, spawn_z])
            .linear_damping(config.linear_damping)
            .angular_damping(config.angular_damping)
            .ccd_enabled(true)
            .build();
        
        // Box collider
        let [hx, hy, hz] = config.chassis_half_extents;
        let [cx, cy, cz] = config.chassis_com_offset;

        let collider = ColliderBuilder::cuboid(hx, hy, hz)
            .translation(vector![cx, cy, cz]) // COM offset
            .collision_groups(InteractionGroups::new(
                GROUP_CHASSIS,
                GROUP_GROUND,
            ))
            .active_events(ActiveEvents::empty())
            .density(density)
            .friction(0.0) // IMPORTANT
            .restitution(0.0)
            .build();

        let handle = self.bodies.insert(rb); // insert rigid body
        
        self.colliders.insert_with_parent(collider, handle, &mut self.bodies); // attach to body
        self.body_to_player.insert(handle, id.clone()); // map body to player ID  
        self.register_car(handle); // setup wheels
        
        self.vehicles.insert(
            id.clone(),
            Vehicle {
                body: handle,
                config,
                throttle: 0.0,
                steer: 0.0,
                brake: 0.0,
                pitch: 0.0,
                yaw: 0.0,
                roll: 0.0,
                ascend: 0.0,
                steer_angle: 0.0,
                steer_rate: 0.0,
                steering: SteeringState::default(),
                rack_torque: 0.0,
                rack_torque_filtered: 0.0,
            },
        );

        println!(
            "🚗 Spawned vehicle for player {} at {:?} (body = {:?})",
            id, position, handle
        );
    }    
    
    fn suspension_from_sag(&mut self, vehicle_mass: f32, wheels: usize, sag_m: f32, zeta: f32) -> (f32, f32) {
        let m = vehicle_mass / wheels as f32;
        let g = 9.81_f32;
        let f_static = m * g;              // per wheel
        let k = f_static / sag_m.max(1e-3); // N/m

        // damping: c = 2*zeta*sqrt(k*m)
        let c = 2.0 * zeta * (k * m).sqrt();
        (k, c)
    }

    
    // ===========================================================================
    // - GTA-style car placeholder with 4 suspension raycasts.
    // ===========================================================================
    pub fn register_car(&mut self, body: RigidBodyHandle) {
        // Find vehicle config & input

        let vehicle_mass = 1350.0;  // kg
        let wheels = 4;             // number of wheels
        let sag_m = 0.065;     // meters
        let zeta = 1.05;     // damping ratio (0.7–1.0)
        
        // let (k, c) = self.derive_suspension(vehicle_mass, wheels, frequency_hz);
        let (k, c) = self.suspension_from_sag(vehicle_mass, wheels, sag_m, zeta);
        // println!("🔧 Suspension: k = {:.2} N/m, c = {:.2} N*s/m", k, c);
        let v_lat_relaxed:f32 = 0.0;
        let w = vec![
            Wheel { offset: point![-0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true, debug_id: "FL".to_string(), v_lat_relaxed},
            Wheel { offset: point![ 0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true, debug_id: "FR".to_string(), v_lat_relaxed},
            Wheel { offset: point![-0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false, debug_id: "RL".to_string(), v_lat_relaxed},
            Wheel { offset: point![ 0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false, debug_id: "RR".to_string(), v_lat_relaxed},
        ];
        self.wheels.insert(body, w);
    }

    // ============================================================================
    // - Apply Suspension
    // ============================================================================
    fn apply_suspension(&mut self, dt: Real) {
        self.query_pipeline.update(&self.colliders);
 
        for (&handle, wheels) in self.wheels.iter_mut() {
            let Some(body) = self.bodies.get(handle) else { continue };
            let Some(player_id) = self.body_to_player.get(&handle) else { continue };
            let Some(vehicle) = self.vehicles.get_mut(player_id) else { continue };


            let body_com: Point<Real> =
                body.position() * body.mass_properties().local_mprops.local_com;


            // ====================================================================================
            // - Debug: chassis
            // ====================================================================================
            let pos = body.position();
            self.debug_overlay.chassis = Some(DebugChassis {
                position: pos.translation.vector.into(),
                rotation: [
                    pos.rotation.i,
                    pos.rotation.j,
                    pos.rotation.k,
                    pos.rotation.w,
                ],
                half_extents: vehicle.config.chassis_half_extents,
            });
            
            // collect impulses here, apply later
            let mut impulses: Vec<BodyImpulse> = Vec::new();
            
            // =====================================================================================
            // PHASE 1 — SENSE (raycast + raw suspension)
            // =====================================================================================

            // vehicle physics
            let body_mass = body.mass() as f32;
            let wheels_count = wheels.len() as f32;
            let fz_ref = (body_mass * 9.81) / wheels_count;

            // tire data for solver
            let mut contacts: Vec<ContactPatch> = Vec::new();
            let mut suspension_contacts: Vec<(WheelId, SuspensionContact)> = Vec::new();

            // Per-vehicle (per chassis) data for ARB
            let mut axle_compression: HashMap<WheelId, f32> = HashMap::new();
            // let mut axle_hit_point: HashMap<WheelId, Point<Real>> = HashMap::new();
            let mut axle_normal_force: HashMap<WheelId, f32> = HashMap::new();




            let cfg = SteeringConfig {
                wheelbase: vehicle.config.wheelbase,
                track_width: vehicle.config.track_width,
                max_steer_angle: vehicle.config.max_steer_angle,
                ackermann: vehicle.config.ackermann,
            };

            // smooth steer angle (simple, stable)
            let target = vehicle.steer * cfg.max_steer_angle;
            vehicle.steer_angle += (target - vehicle.steer_angle) * 0.25;

            // solve rack ONCE
            let (fl, fr) = solve_steering(&cfg, &body.position().rotation, vehicle.steer_angle);

            // store
            vehicle.steering.fl = fl;
            vehicle.steering.fr = fr;






            // ======================================================================================
            // 1) Wheels Loop
            // ======================================================================================            
            for wheel in wheels.iter_mut() {

                // shared params
                let origin = pos * (wheel.offset + vector![0.0, wheel.radius + 0.02, 0.0]);
                let dir = vector![0.0, -1.0, 0.0];
                let ground_n = vector![0.0, 1.0, 0.0];
                let max_dist = wheel.rest_length + wheel.max_length + wheel.radius;
                
                // Defaults for debug (airborne)
                let mut grounded = false;
                let mut compression = 0.0;
                let mut normal_force = 0.0;
                // let mut hit_point = None;
                let mut hit_point: Option<Point<Real>> = None;

                // “wheel center” when airborne: origin is above the wheel center by (radius + 0.02)
                let mut wheel_center = origin - vector![0.0, wheel.radius + 0.02, 0.0];

                if let Some(contact) = build_suspension_contact(
                    wheel,
                    vehicle,
                    &vehicle.steering,
                    body,
                    &self.query_pipeline,
                    &self.bodies,
                    &self.colliders,
                    handle,
                    fz_ref,
                    dt as f32,
                ) {
                    grounded = true;
                    compression = contact.compression;
                    normal_force = contact.normal_force;

                    // Ignore contacts with tiny normal force
                    // if normal_force < fz_ref * 0.1 {
                    //     continue; // tire is basically unloaded
                    // }

                    hit_point = Some(contact.hit_point);
                    
                    // grounded wheel center = ground contact + normal * radius
                    wheel_center = contact.hit_point + contact.ground_normal * wheel.radius;
                    
                    let wheel_id = WheelId::from_debug(&wheel.debug_id);

                    // ARB debug / physics
                    axle_compression.insert(wheel_id, compression);
                    // axle_hit_point.insert(wheel_id, contact.hit_point);
                    axle_normal_force.insert(wheel_id, normal_force);

                    suspension_contacts.push((wheel_id, contact.clone()));
                    

                    // ----------------------------------------------------
                    // Slip relaxation (stateful, per wheel)
                    // ----------------------------------------------------
                    let forward_speed = contact.v_long.abs().max(0.5);
                    let relaxation_length = 1.5; // relaxation length (meters), tune 0.7–1.5

                    let k = 1.0 - (-dt * forward_speed / relaxation_length).exp();

                    // First-order low-pass filter
                    let v_lat_relaxed = wheel.v_lat_relaxed + (contact.v_lat as f32 - wheel.v_lat_relaxed) * k;

                    wheel.v_lat_relaxed = v_lat_relaxed;

                    // tire contact
                    contacts.push(ContactPatch {
                        wheel: wheel_id,
                        grounded,
                        hit_point: p3(contact.hit_point),
                        apply_point: p3(contact.apply_point),
                        forward: v3(contact.forward),
                        side: v3(contact.side),
                        v_long: contact.v_long,
                        v_lat: contact.v_lat,
                        v_lat_relaxed: v_lat_relaxed,
                        normal_force,
                        mu_lat: contact.mu_lat,
                        mu_long: contact.mu_long,
                        roll_factor: contact.roll_factor,
                        drive: wheel.drive,
                        brake: vehicle.brake,
                        steer_angle: vehicle.steer_angle,
                        compression_ratio: contact.compression_ratio,
                    });
                    // ===============================================================================
                    // debug hooks can read from `contact`
                    // ===============================================================================
                    if contact.forward.magnitude() > 1e-4 {
                        let slip_mag = contact.v_lat.abs();
                        
                        if slip_mag > 0.01 {
                            let slip_dir = if contact.v_lat >= 0.0 {
                                contact.side
                            } else {
                                -contact.side
                            };
                            
                            let slip_len = (slip_mag * 0.25).clamp(0.02, 0.6);
                            
                            let color = match contact.wheel_id.as_str() {
                                "FL" | "RL" => [0.2, 0.6, 1.0],
                                "FR" | "RR" => [1.0, 0.4, 0.2],
                                _ => [1.0, 1.0, 1.0],
                            };
                            let slip_origin =
                                contact.hit_point + contact.ground_normal * wheel.radius * 0.25;
                           
                            let slip_angle = 0.0;
                            self.debug_overlay.slip_vectors.push(DebugSlipRay {
                                // origin: contact.hit_point.into(),
                                origin: slip_origin.into(),
                                direction: slip_dir.into(),
                                slip_angle: slip_angle,
                                magnitude: slip_len,
                                color,
                            });
                        }
                    }


                    // if wheel.debug_id == "FL" || wheel.debug_id == "FR" {
                    //     println!(
                    //         "[WHEEL BASIS {}] steer_angle={:+.3} fwd=({:+.2},{:+.2},{:+.2}) side=({:+.2},{:+.2},{:+.2})",
                    //         wheel.debug_id,
                    //         vehicle.steer_angle,
                    //         contact.forward.x, contact.forward.y, contact.forward.z,
                    //         contact.side.x, contact.side.y, contact.side.z,
                    //     );
                    // }

                    // if wheel_id.is_front() {
                    //     println!(
                    //         "[SLIP {}] v_long={:+.2} m/s v_lat={:+.2} m/s nf={:.0}",
                    //         wheel.debug_id,
                    //         contact.v_long,
                    //         contact.v_lat,
                    //         contact.normal_force
                    //     );
                    // }

                } else {
                    // airborne: decay relaxed slip toward 0 so we don't snap on re-contact
                    let decay = (-dt * 6.0).exp(); // 6–10 is fine
                    wheel.v_lat_relaxed *= decay;
                } // end contacts
                
                // ----------------------------------------------------------
                // DEBUG: suspension ray (ALWAYS push)
                // ----------------------------------------------------------
                self.debug_overlay.suspension_rays.push(DebugRay {
                    origin: origin.into(),
                    direction: dir.into(),
                    length: max_dist,
                    hit: hit_point.map(|p| p.into()),
                    color: if grounded { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] },
                });

                // ----------------------------------------------------------
                // DEBUG: wheel numeric (ALWAYS push)
                // ----------------------------------------------------------
                self.debug_overlay.wheels.push(DebugWheel {
                    id: wheel.debug_id.clone(),
                    center: wheel_center.into(),
                    radius: wheel.radius as f32,
                    grounded,
                    compression,
                    normal_force,
                    steer: vehicle.steer,
                    steering: wheel.steer,
                    drive: wheel.drive,
                });

                // ----------------------------------------------------------
                // DEBUG: load bar (optional but super helpful)
                // ----------------------------------------------------------
                let norm = (normal_force / 12000.0).clamp(0.0, 1.0);
                let bar_len = norm.sqrt() * 1.25;

                let bar_origin = wheel_center + ground_n * 0.03;
                let color = match wheel.debug_id.as_str() {
                    "FL" | "RL" => [0.2, 0.6, 1.0],
                    "FR" | "RR" => [1.0, 0.4, 0.2],
                    _ => [1.0, 1.0, 1.0],
                };

                self.debug_overlay.load_bars.push(DebugRay {
                    origin: bar_origin.into(),
                    direction: ground_n.into(),
                    length: bar_len,
                    hit: Some((bar_origin + ground_n * bar_len).into()),
                    color,
                });
                
            } // end wheels iteration
            
            
            // ======================================================================================
            // PHASE 2 — REDISTRIBUTE (anti-roll bars)
            // ======================================================================================
            apply_arb_load_transfer(
                WheelId::FL, WheelId::FR,
                &mut axle_normal_force,
                &axle_compression,
                vehicle.config.arb_front,
                fz_ref,
            );

            apply_arb_load_transfer(
                WheelId::RL, WheelId::RR,
                &mut axle_normal_force,
                &axle_compression,
                vehicle.config.arb_rear,
                fz_ref,
            );

            // ======================================================================================
            // PHASE 3A — ACT: apply suspension normal impulses  ✅ ONCE PER WHEEL
            // ======================================================================================
            for (wheel_id, contact) in suspension_contacts.iter() {
                let nf = axle_normal_force.get(wheel_id).copied().unwrap_or(contact.normal_force);
                // let jn = contact.ground_normal * (nf as Real * dt); // N*s

                let max_jn = fz_ref * 1.5 * dt; // ≈ 1.5g per wheel
                let jn_mag = (nf * dt).clamp(0.0, max_jn);
                let jn = contact.ground_normal * (jn_mag as Real); // N*s

                impulses.push(BodyImpulse::Linear {
                    handle,
                    impulse: jn,
                    at_point: Some(contact.apply_point),
                });
            }

            
            // ======================================================================================
            // PHASE 3B — propagate ARB loads into tire contacts BEFORE solve_step()
            // ======================================================================================
            for contact in contacts.iter_mut() {
                if let Some(nf) = axle_normal_force.get(&contact.wheel) {
                    contact.normal_force = *nf;
                }
            }
            
            // ======================================================================================
            // PHASE 3C — BODY HEAVE DAMPING (impulse-based)
            // Kill vertical bounce (heave damping)
            // ======================================================================================

            // Vertical chassis velocity
            // let lv = *body.linvel();

            // Physical heave damping force (N)
            //   F = -c * v
            //   c ≈ 0.08–0.18 * mass   (empirical, vehicle-scale)

            // Converted to impulse: J = F * dt

            // let grounded_wheels = contacts.iter().filter(|c| c.grounded).count();
            // if grounded_wheels >= 2 {
            //     let lv = *body.linvel();
            //     let heave_coeff = 0.12;
            //     // let heave_coeff = 1.0;
            //     let mut j = -lv.y * body.mass() as f32 * heave_coeff * dt as f32;

            //     // clamp to prevent “stapling”
            //     j = j.clamp(-250.0, 250.0);

            //     impulses.push(BodyImpulse::Linear {
            //         handle,
            //         impulse: vector![0.0, j as Real, 0.0],
            //         at_point: None,
            //     });
            // }


            // // ======================================================================================
            // // PHASE 3D — YAW DAMPING FROM TIRES (impulse-based torque)
            // // ======================================================================================

            // // Yaw rate (rad/s)
            // let yaw_rate = body.angvel().y;

            // // Forward speed (m/s)
            // // let speed = body.linvel().magnitude();
            // let v = *body.linvel();
            // let speed = (v.x*v.x + v.z*v.z).sqrt();

            // // Only damp when moving (prevents parking-lot jitter)
            // if speed > 0.5 {
            //     // Physically motivated yaw damping:
            //     //   τ = -C * ω
            //     //   scaled by speed so it vanishes near standstill
            //     // let yaw_damp_coeff = 0.05; // tune 0.03–0.08
            //     // let yaw_damp =
            //     //     -yaw_rate
            //     //     * body.mass()
            //     //     * yaw_damp_coeff
            //     //     * (speed / 10.0).clamp(0.2, 1.0);

            //     let inertia_y = body.mass_properties().effective_world_inv_inertia_sqrt.m11 as f32;
            //     let yaw_damp_coeff = 1.2; // now in 1/sec scale-ish (tune 0.5–3.0)
            //     let yaw_torque = -yaw_rate 
            //         * inertia_y 
            //         * yaw_damp_coeff 
            //         * (speed / 10.0).clamp(0.2, 1.0);

            //     impulses.push(BodyImpulse::Torque {
            //         handle,
            //         torque_impulse: vector![0.0, yaw_torque * dt, 0.0],
            //     });
            // }


            // --- Tire Impulses ----
            let ctx = SolveContext {
                dt: dt as f32,
                mass: body_mass,
                engine_force: vehicle.config.engine_force,
                brake_force: vehicle.config.brake_force,
                abs_enabled: vehicle.config.abs_enabled,
                tcs_enabled: vehicle.config.tcs_enabled,
                abs_limit: vehicle.config.abs_nx_limit,
                tcs_limit: vehicle.config.tcs_nx_limit,
                driven_wheels: 2.0,        // RL+RR for your current setup
                base_front_bias: 0.66,
                bias_gain: 0.25,
                wheelbase: vehicle.config.wheelbase,
                mu_base: vehicle.config.mu_base,
            };

            let control = ControlInput {
                throttle: vehicle.throttle as f32,
                brake: vehicle.brake as f32,
                steer: vehicle.steer as f32,
            };

            let tire_forces = solve_step(&ctx, &control, &contacts);
            for imp in tire_forces.impulses {
                
                let tire_impulse: Vector<Real> = imp.impulse.into(); // if impulse is [f32;3]
                let at_point: Option<Point<Real>> = imp.at_point.map(Point::from);
                
                impulses.push(BodyImpulse::Linear { handle, impulse:tire_impulse, at_point })
            } 

            // vehicle.rack_torque = tire_forces.rack_torque;

            // --- Apply impulses ---
            // for (handle, impulse, point) in impulses {
            //     if let Some(body) = self.bodies.get_mut(handle) {
            //         match point {
            //             Some(p) => body.apply_impulse_at_point(impulse, p, true),
            //             None => body.apply_impulse(impulse, true),
            //         }
            //     }
            // }

            for imp in impulses {
                if let Some(body) = self.bodies.get_mut(match &imp {
                    BodyImpulse::Linear { handle, .. } => *handle,
                    // BodyImpulse::Torque { handle, .. } => *handle,
                }) {
                    match imp {
                        BodyImpulse::Linear { impulse, at_point, .. } => {
                            if let Some(p) = at_point {
                                body.apply_impulse_at_point(impulse, p, true);
                            } else {
                                body.apply_impulse(impulse, true);
                            }
                        }
                        // BodyImpulse::Torque { torque_impulse, .. } => {
                        //     body.apply_torque_impulse(torque_impulse, true);
                        // }
                    }
                }

            } // Apply Impulses

        } // per player
        
    } // end

    pub fn step(&mut self, dt: Real) {

        self.debug_overlay.clear();

        let hooks = ();
        let mut events = ();

        // 1) Convert inputs → intent (NO PHYSICS)
        apply_vehicle_controls(self.vehicles.values_mut(), dt);

        // 2) Apply suspension + traction + tire forces
        self.apply_suspension(dt);

        // 3) Apply velocity damping (kills creep & oscillations)
        apply_angular_damping(self.vehicles.values(), &mut self.bodies, dt);

        // 4) Step physics.
        self.pipeline.step(
            &self.gravity,
            &IntegrationParameters {
                dt,
                ..IntegrationParameters::default()
            },
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.joints,
            &mut self.multibody_joints,
            &mut self.ccd,
            Some(&mut self.query_pipeline),
            &mut events,
            &hooks,
        );

        // 4) Safety: prevent bodies from exploding to insane coordinates
        for (_, body) in self.bodies.iter_mut() {
            let mut pos = *body.translation();

            let bad =
                !pos.x.is_finite() || !pos.y.is_finite() || !pos.z.is_finite() ||
                pos.x.abs() > 1_000.0 || pos.y.abs() > 1_000.0 || pos.z.abs() > 1_000.0;

            if bad {
                // Reset this body to a safe position above the heightfield
                pos = vector![0.0, 1.0, 0.0];
                body.set_translation(pos, true);
                body.set_linvel(vector![0.0, 0.0, 0.0], true);
                body.set_angvel(vector![0.0, 0.0, 0.0], true);

                println!("⚠️ Reset exploding body back to {:?}", pos);
            }
        }
    }
}
