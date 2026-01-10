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
use crate::aven_tire::steering::{ apply_vehicle_controls, SteeringState, SteeringConfig, solve_steering};
use crate::aven_tire::{ ContactPatch, ControlInput, SolveContext, WheelId, solve_step};
use crate::aven_tire::state::{TireState};
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

    pub tire_state: TireState,
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

/// Accumulated impulses for one rigid body this frame
struct ImpulseAccumulator {
    linear: Vec<Vector<Real>>,
    at_points: Vec<(Vector<Real>, Point<Real>)>,
}

impl ImpulseAccumulator {
    fn new() -> Self {
        Self { linear: vec![], at_points: vec![] }
    }

    fn apply(self, body: &mut RigidBody) {
        for j in self.linear {
            body.apply_impulse(j, true);
        }
        for (j, p) in self.at_points {
            body.apply_impulse_at_point(j, p, true);
        }
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
    //  GTA-style car placeholder with 4 suspension raycasts.
    // ===========================================================================
    pub fn register_car(&mut self, body: RigidBodyHandle) {
        // Find vehicle config & input

        let vehicle_mass = 1350.0;  // kg
        let wheels = 4;             // number of wheels
        let sag_m = 0.065;     // meters
        let zeta = 1.05;     // damping ratio (0.7–1.0)
        
        let (k, c) = self.suspension_from_sag(vehicle_mass, wheels, sag_m, zeta);
        let w = vec![
            Wheel { offset: point![-0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true, debug_id: "FL".to_string(), tire_state: TireState::Grip},
            Wheel { offset: point![ 0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true, debug_id: "FR".to_string(), tire_state: TireState::Grip},
            Wheel { offset: point![-0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false, debug_id: "RL".to_string(), tire_state: TireState::Grip},
            Wheel { offset: point![ 0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false, debug_id: "RR".to_string(), tire_state: TireState::Grip},
        ];
        self.wheels.insert(body, w);
    }

    // ============================================================================
    //  Apply Suspension
    // ============================================================================
    fn apply_suspension(&mut self, dt: Real) {
        self.query_pipeline.update(&self.colliders);

        
        for (&handle, wheels) in self.wheels.iter_mut() {
            let Some(body_ro) = self.bodies.get(handle) else { continue };
            let Some(player_id) = self.body_to_player.get(&handle) else { continue };
            let Some(vehicle) = self.vehicles.get_mut(player_id) else { continue };
            
            // ======================================================
            //  Debug: chassis
            // ======================================================
            let pos = body_ro.position();
            self.debug_overlay.chassis = Some(DebugChassis {
                position: pos.translation.vector.into(),
                rotation: [ pos.rotation.i, pos.rotation.j, pos.rotation.k, pos.rotation.w, ],
                half_extents: vehicle.config.chassis_half_extents,
            });

            // ==================================================
            //  Impulse Accumulator
            // ==================================================
            let mut impulses = ImpulseAccumulator::new();

            // --------------------------------------------------
            //  VEHICLE CONSTANTS
            // --------------------------------------------------
            let body_mass = body_ro.mass() as f32;
            let fz_ref = body_mass * 9.81 / wheels.len() as f32;
            
            
            // --------------------------------------------------
            // PHASE 1 — SENSE
            // --------------------------------------------------
            let mut contacts: Vec<ContactPatch> = Vec::new();
            let mut suspension_contacts: Vec<(WheelId, SuspensionContact)> = Vec::new();
            let mut axle_compression = HashMap::new();
            let mut axle_normal_force = HashMap::new();
            
            let cfg = SteeringConfig {
                wheelbase: vehicle.config.wheelbase,
                track_width: vehicle.config.track_width,
                max_steer_angle: vehicle.config.max_steer_angle,
                ackermann: vehicle.config.ackermann,
            };
            
            let target = vehicle.steer * cfg.max_steer_angle;
            
            let tau = 0.10; // seconds to reach ~63%
            let k = 1.0 - (-dt as f32 / tau).exp();
            vehicle.steer_angle += (target - vehicle.steer_angle) * k;


            let (fl, fr) = solve_steering(&cfg, &body_ro.position().rotation, vehicle.steer_angle);
            vehicle.steering.fl = fl;
            vehicle.steering.fr = fr;
            
            for wheel in wheels.iter_mut() {
                let normal_force = 0.0;
                let mut grounded = false;
                if let Some(contact) = build_suspension_contact(
                    wheel,
                    vehicle,
                    &vehicle.steering,
                    body_ro,
                    &self.query_pipeline,
                    &self.bodies,
                    &self.colliders,
                    handle,
                    fz_ref,
                    dt as f32,
                ) {
                    let id = WheelId::from_debug(&wheel.debug_id);

                    axle_compression.insert(id, contact.compression);
                    axle_normal_force.insert(id, contact.normal_force);
                    suspension_contacts.push((id, contact.clone()));

                    let forward = if contact.forward.magnitude_squared() < 1e-6 {
                        body_ro.position().rotation * vector![0.0, 0.0, 1.0]
                    } else { contact.forward };

                    let v = contact.point_vel;

                    // suspension axis (world-space)
                    // ground normal (for now flat; later use contact.ground_normal)
                    let n = vector![0.0, 1.0, 0.0];

                    // planar/tangent velocity at contact
                    let v_n = v.dot(&n);
                    let v_t = v - n * v_n;

                    // safe normalize
                    let speed_t = v_t.norm();
                    let brake_dir = if speed_t > 1e-4 {
                        -v_t / speed_t   // oppose motion
                    } else {
                        // if nearly stopped, fall back to opposing v_long in wheel frame
                        let s = if contact.v_long >= 0.0 { -1.0 } else { 1.0 };
                        forward * s
                    };

                    let yaw_rate = body_ro.angvel().y as f32; // assuming Y-up
                    
                    let com_world: Point<Real> = body_ro.position() * body_ro.center_of_mass();
                    let relative_com = contact.apply_point - com_world;

                    grounded = contact.grounded;

                    contacts.push(ContactPatch {
                        wheel: id,
                        grounded,
                        hit_point: p3(contact.hit_point),
                        apply_point: p3(contact.apply_point),
                        forward: v3(forward),
                        side: v3(contact.side),
                        v_long: contact.v_long,
                        v_lat: contact.v_lat,
                        normal_force:contact.normal_force,
                        mu_lat: contact.mu_lat,
                        mu_long: contact.mu_long,
                        roll_factor: contact.roll_factor,
                        drive: wheel.drive,
                        brake: vehicle.brake,
                        steer_angle: vehicle.steer_angle,
                        compression_ratio: contact.compression_ratio,
                        vel_world: v3(contact.point_vel),
                        brake_dir: v3(brake_dir),
                        speed_planar: speed_t as f32,
                        yaw_rate,
                        relative_com: v3(relative_com),
                        tire_state: wheel.tire_state,
                    });

                    // ===============================================================================
                    // debug slip rays
                    // ===============================================================================
                    if contact.forward.magnitude() > 1e-4 {
                        let slip_mag = contact.v_lat.abs();
                        if slip_mag > 0.01 {
                            let slip_dir = if contact.v_lat >= 0.0 { contact.side } else { -contact.side };
                            let slip_len = (slip_mag * 0.25).clamp(0.02, 0.6);
                            let color = match contact.wheel_id.as_str() {
                                "FL" | "RL" => [0.2, 0.6, 1.0],
                                "FR" | "RR" => [1.0, 0.4, 0.2],
                                _ => [1.0, 1.0, 1.0],
                            };
                            let slip_origin = contact.hit_point + contact.ground_normal * wheel.radius * 0.25;
                            let slip_angle = 0.0;
                            self.debug_overlay.slip_vectors.push(DebugSlipRay {
                                origin: slip_origin.into(),
                                direction: slip_dir.into(),
                                slip_angle: slip_angle,
                                magnitude: slip_len,
                                color,
                            });
                        }
                    }

                    // ==================================================================
                    //  Shared Debug Params
                    // ==================================================================
                    let origin = pos * (wheel.offset + vector![0.0, wheel.radius + 0.02, 0.0]);
                    let dir = vector![0.0, -1.0, 0.0];
                    let ground_n = vector![0.0, 1.0, 0.0];
                    let max_dist = wheel.rest_length + wheel.max_length + wheel.radius;
                    let wheel_center = contact.hit_point + contact.ground_normal * wheel.radius;
                    
                    // ==========================================================
                    //  DEBUG: suspension ray (ALWAYS push)
                    // ==========================================================
                    self.debug_overlay.suspension_rays.push(DebugRay {
                        origin: origin.into(),
                        direction: dir.into(),
                        length: max_dist,
                        hit: Some(p3(contact.hit_point)),
                        color: if contact.grounded { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] },
                    });

                    // ----------------------------------------------------------
                    // DEBUG: wheel numeric (ALWAYS push)
                    // ----------------------------------------------------------
                    self.debug_overlay.wheels.push(DebugWheel {
                        id: wheel.debug_id.clone(),
                        center: wheel_center.into(),
                        radius: wheel.radius as f32,
                        grounded: contact.grounded,
                        compression: contact.compression,
                        normal_force: contact.normal_force,
                        steer: vehicle.steer,
                        steering: wheel.steer,
                        drive: wheel.drive,
                    });

                    // ----------------------------------------------------------
                    // DEBUG: load bar (optional but super helpful)
                    // ----------------------------------------------------------
                    let norm = (contact.normal_force / 12000.0).clamp(0.0, 1.0);
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

                } // end contact creation
                
            } // end wheel iter()

            // --------------------------------------------------
            // PHASE 2 — REDISTRIBUTE (ARB)
            // --------------------------------------------------
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

            // --------------------------------------------------
            // PHASE 3A — SUSPENSION IMPULSES (STORE ONLY)
            // --------------------------------------------------
            for (wheel_id, contact) in suspension_contacts.iter() {

                let axel_normal = axle_normal_force.get(wheel_id).copied().unwrap_or(contact.normal_force);
                let max_normal_impulse = fz_ref * 1.5 * dt; // ≈ 1.5g per wheel
                let normal_impulse_mag = (axel_normal * dt as f32).clamp(0.0, max_normal_impulse as f32);

                impulses.at_points.push((
                    contact.ground_normal * normal_impulse_mag as Real,
                    contact.apply_point,
                ));
            }

            // --------------------------------------------------
            // PHASE 3B — TIRE SOLVER
            // --------------------------------------------------
            for contact in contacts.iter_mut() {
                if let Some(nf) = axle_normal_force.get(&contact.wheel) {
                    contact.normal_force = *nf;
                }
            }

            let ctx = SolveContext {
                dt: dt as f32,
                mass: body_mass,
                engine_force: vehicle.config.engine_force,
                brake_force: vehicle.config.brake_force,
                abs_enabled: vehicle.config.abs_enabled,
                tcs_enabled: vehicle.config.tcs_enabled,
                abs_limit: vehicle.config.abs_nx_limit,
                tcs_limit: vehicle.config.tcs_nx_limit,
                driven_wheels: 2.0,
                base_front_bias: 0.66,
                bias_gain: 0.25,
                wheelbase: vehicle.config.wheelbase,
                mu_base: vehicle.config.mu_base,
            };

            let control = ControlInput {
                throttle: vehicle.throttle,
                brake: vehicle.brake,
                steer: vehicle.steer,
            };

            let tire_forces = solve_step(&ctx, &control, &mut contacts);
            for imp in tire_forces.impulses {
                let j: Vector<Real> = imp.impulse.into();
                match imp.at_point {
                    Some(p) => impulses.at_points.push((j, Point::from(p))),
                    None => impulses.linear.push(j),
                }
            }

            // --------------------------------------------------
            // PHASE 3C — APPLY ALL IMPULSES (ONCE)
            // --------------------------------------------------

            // Static Friction lock at low speed
            let body = self.bodies.get_mut(handle).unwrap();
            let v = body.linvel();
            let speed = (v.x * v.x + v.z * v.z).sqrt();

            let hard_brake = control.brake > 0.8;
            let near_rest  = speed < 0.4;

            if hard_brake && near_rest {
                // Kill planar velocity
                body.set_linvel(vector![0.0, v.y, 0.0], true);

                // Kill yaw
                body.set_angvel(vector![0.0, 0.0, 0.0], true);
            }

            impulses.apply(body);

        } // Players loop
        
    } // end

    pub fn step(&mut self, dt: Real) {

        // prevent ui clutter
        self.debug_overlay.clear();
        
        // Convert inputs → intent (NO PHYSICS)
        apply_vehicle_controls(self.vehicles.values_mut(), dt);
        
        // Apply suspension + traction + tire forces
        self.apply_suspension(dt);
        
        // Step physics
        let hooks = ();
        let mut events = ();
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

        // Safety: prevent bodies from exploding to insane coordinates
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
