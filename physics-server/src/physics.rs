// src/physic.rs
// ================================================================================
// ================================================================================
// We are implementing a hybrid impulse-based tire model, best described as:
// Raycast suspension + brush tire model + impulse-domain friction ellipse
// Specifically:
// 1) Suspension
// - Raycast wheels
// - Linear spring + damper
// - Normal force computed explicitly
// - Applied as impulses (F * dt)
//
// 2) Tire forces
// - Longitudinal: force-based model → impulse (engine + brake + ABS/TCS)
// - Lateral: brush-lite model (slip velocity → force → impulse)
// - Combined slip: friction ellipse in impulse space
// - Yaw: produced by applying lateral impulse at contact point
//
// This is very close to:
// - rFactor / early iRacing
// - Project Cars 1
// - Cannon.js RaycastVehicle (but more advanced)
// ===============================================================================
// ===============================================================================

// src/physics.rs
use rapier3d::prelude::*;
use rapier3d::prelude::{InteractionGroups, Group};
use std::collections::HashMap;
use serde::Serialize;
use crate::suspension_contact::{SuspensionContact, build_suspension_contact};
use crate::aven_tire::anti_roll::{ apply_arb_load_transfer};
use crate::aven_tire::{ContactPatch, ControlInput, SolveContext, WheelId, solve_step};
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

// NEW: slip-angle visualization ray
#[derive(Clone, Serialize)]
pub struct DebugSlipRay {
    pub origin: [f32; 3],
    pub direction: [f32; 3],
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

}

pub struct VehicleConfig {
    pub mass: f32,              // kg
    pub engine_force: f32,      // N
    pub brake_force: f32,       // N
    pub max_speed: f32,         // m/s
    pub linear_damping: f32,    // drag
    pub angular_damping: f32,   // rotational drag
    pub mu_base: f32,          // base friction coefficient
    pub load_sensitivity: f32, // how much friction decreases with load

    // --- Geometry ---
    pub wheelbase: f32,      // meters (front axle to rear axle)
    pub track_width: f32,    // meters (left to right)
    pub max_steer_angle: f32,// radians
    pub ackermann: f32,      // 0..1 blend (0 = parallel, 1 = full ackermann)

    // --- Anti-roll bars ---
    pub arb_front: f32,         // N/m
    pub arb_rear: f32,          // N/m

    // NEW: assists (toggles + thresholds)
    pub abs_enabled: bool,
    pub tcs_enabled: bool,

    // “how aggressive” (dimensionless, relative demand vs capacity)
    pub abs_nx_limit: f32,  // typical 0.85–1.0
    pub tcs_nx_limit: f32,  // typical 0.85–1.0

    // --- Chassis geometry ---
    pub chassis_half_extents: [f32; 3], // [hx, hy, hz] meters
    pub chassis_com_offset: [f32; 3],   // local offset from collider center
}

pub struct Vehicle {
    pub body: RigidBodyHandle,  // the chassis body
    pub config: VehicleConfig,  // vehicle parameters
    pub throttle: f32,          // -1.0 (full reverse) .. 1.0 (full forward)
    pub steer: f32,             // -1.0 (full left) .. 1.0 (full right)
    pub brake: f32,             // 0.0 (no brake) .. 1.0 (full brake)
    pub pitch: f32,             // for flying vehicles
    pub yaw: f32,               // for flying vehicles
    pub roll: f32,              // for flying vehicles
    pub ascend: f32,            // for flying vehicles
    pub steer_angle: f32,       // current steering angle (radians)
}

#[derive(Clone, Serialize)]
pub struct DebugChassis {
    pub position: [f32; 3],
    pub rotation: [f32; 4], // quaternion
    pub half_extents: [f32; 3],
}

pub const GT86: VehicleConfig = VehicleConfig {
    mass: 1350.0,             // kg
    engine_force: 6000.0,     // N
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

    /// Attach input to a player's vehicle (just stores it; actual forces are
    /// applied in `step`).
    pub fn apply_player_input(&mut self,player_id: &str,throttle: f32,steer: f32,brake: f32,ascend: f32,pitch: f32,yaw: f32,roll: f32) {
        if let Some(v) = self.vehicles.get_mut(player_id) {

            // Log only when values CHANGE (to avoid spam)
            // if (v.throttle - throttle).abs() > 0.01 || (v.steer - steer).abs() > 0.01 {
            //     println!(
            //         "🔧 Input changed for {} → throttle: {:.2}, steer: {:.2}",
            //         player_id, throttle, steer
            //     );
            // }

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

    /// Spawn a simple "car" for this player:
    /// - Dynamic rigid body with a box collider.
    /// - Positioned slightly above the ground so it can fall and settle.
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

            
        // let collider = ColliderBuilder::cuboid(1.0, 0.5, 2.0)
        //     .density(density)
        //     .friction(1.2)
        //     .build();

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
            },
        );

        println!(
            "🚗 Spawned vehicle for player {} at {:?} (body = {:?})",
            id, position, handle
        );
    }

  
    // fn export_heightfield() -> serde_json::Value {
    //     let nx: usize = 64;
    //     let ny: usize = 64;
    //     let width = 200.0_f32;
    //     let depth = 200.0_f32;
    //     let dx = width / (nx - 1) as f32;
    //     let dz = depth / (ny - 1) as f32;
    //     let mut heights = vec![0.0_f32; nx * ny];
    //     for iy in 0..ny {
    //         for ix in 0..nx {
    //             let i = iy * nx + ix;
    //             // World-space x/z
    //             let _x = -width * 0.5 + ix as f32 * dx;
    //             let _z = -depth * 0.5 + iy as f32 * dz;
    //             // TODO: use real heightmap here
    //             heights[i] = 0.0;
    //         }
    //     }
    //     serde_json::json!({
    //         "nx": nx,
    //         "ny": ny,
    //         "width": width,
    //          "depth": depth,
    //          "heights": heights
    //      })
    //  }    
    
    fn suspension_from_sag(&mut self, vehicle_mass: f32, wheels: usize, sag_m: f32, zeta: f32) -> (f32, f32) {
        let m = vehicle_mass / wheels as f32;
        let g = 9.81_f32;
        let f_static = m * g;              // per wheel
        let k = f_static / sag_m.max(1e-3); // N/m

        // damping: c = 2*zeta*sqrt(k*m)
        let c = 2.0 * zeta * (k * m).sqrt();
        (k, c)
    }

    

    /// GTA-style car placeholder with 4 suspension raycasts.
    pub fn register_car(&mut self, body: RigidBodyHandle) {
        // Find vehicle config & input

        let vehicle_mass = 1350.0;  // kg
        let wheels = 4;             // number of wheels
        let sag_m = 0.05;     // meters
        let zeta = 0.9;     // damping ratio (0.7–1.0)
        // let (k, c) = self.derive_suspension(vehicle_mass, wheels, frequency_hz);
        let (k, c) = self.suspension_from_sag(vehicle_mass, wheels, sag_m, zeta);
        // println!("🔧 Suspension: k = {:.2} N/m, c = {:.2} N*s/m", k, c);
        let w = vec![
            Wheel { offset: point![-0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true, debug_id: "FL".to_string(),},
            Wheel { offset: point![ 0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true, debug_id: "FR".to_string(),},
            Wheel { offset: point![-0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false, debug_id: "RL".to_string(),},
            Wheel { offset: point![ 0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false, debug_id: "RR".to_string(),},
        ];
        self.wheels.insert(body, w);
    }


    fn apply_suspension(&mut self, dt: Real) {
        self.query_pipeline.update(&self.colliders);
 
        for (&handle, wheels) in self.wheels.iter_mut() {
            let Some(body) = self.bodies.get(handle) else { continue };
            let Some(player_id) = self.body_to_player.get(&handle) else { continue };
            let Some(vehicle) = self.vehicles.get(player_id) else { continue };


            // ====================================================================================
            // Debug: chassis
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
            let mut impulses: Vec<(RigidBodyHandle, Vector<Real>, Option<Point<Real>>)> = Vec::new();
            
            // =====================================================================================
            // PHASE 1 — SENSE (raycast + raw suspension)
            // =====================================================================================

            // vehicle physics
            let body_mass = body.mass() as f32;
            let wheels_count = wheels.len() as f32;
            let fz_ref = (body_mass * 9.81) / wheels_count;
            // let pos = body.position();

            // tire data for solver
            let mut contacts: Vec<ContactPatch> = Vec::new();
            let mut suspension_contacts: Vec<(WheelId, SuspensionContact)> = Vec::new();

            // Per-vehicle (per chassis) data for ARB
            let mut axle_compression: HashMap<WheelId, f32> = HashMap::new();
            let mut axle_hit_point: HashMap<WheelId, Point<Real>> = HashMap::new();
            let mut axle_normal_force: HashMap<WheelId, f32> = HashMap::new();

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

                    hit_point = Some(contact.hit_point);
                    
                    // grounded wheel center = ground contact + normal * radius
                    wheel_center = contact.hit_point + contact.ground_normal * wheel.radius;
                    
                    let wheel_id = WheelId::from_debug(&wheel.debug_id);

                    // ARB debug / physics
                    axle_compression.insert(wheel_id, compression);
                    axle_hit_point.insert(wheel_id, contact.hit_point);
                    axle_normal_force.insert(wheel_id, normal_force);

                    suspension_contacts.push((wheel_id, contact.clone()));
                    
                    // let nf = axle_normal_force.get(&wheel_id).copied().unwrap_or(0.0);
                    // // suspension impulse
                    // let jn = contact.ground_normal * (nf * dt);
                    // impulses.push((handle, jn, Some(contact.hit_point)));
                    
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
                            
                            self.debug_overlay.slip_vectors.push(DebugSlipRay {
                                origin: contact.hit_point.into(),
                                direction: slip_dir.into(),
                                magnitude: slip_len,
                                color,
                            });
                        }
                    }
                }
                
                // ----------------------------------------------------------
                // DEBUG: suspension ray (ALWAYS push)
                // ----------------------------------------------------------
                // self.debug_overlay.suspension_rays.push(DebugRay {
                //     origin: origin.into(),
                //     direction: dir.into(),
                //     length: max_dist,
                //     hit: hit_point_opt.map(|p| p.into()),
                //     color: if grounded { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] },
                // });
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

                let wheel_id = WheelId::from_debug(&wheel.debug_id);

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
            // PHASE 3 — ACT (impulses)
            // ======================================================================================

            // --- Suspension impulses ---
            for (wheel_id, contact) in suspension_contacts.iter_mut() {
                if let Some(nf) = axle_normal_force.get(wheel_id) {
                    contact.normal_force = *nf;
                }
            }

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

            let tire_impulses = solve_step(&ctx, &control, &contacts);
            for imp in tire_impulses {
                let mut j: Vector<Real> = imp.impulse.into(); // if impulse is [f32;3]

                let p: Option<Point<Real>> = imp.at_point.map(Point::from);
                impulses.push((handle, j, p));
            } 

            // --- Apply impulses ---
            for (handle, impulse, point) in impulses {
                if let Some(body) = self.bodies.get_mut(handle) {
                    match point {
                        Some(p) => body.apply_impulse_at_point(impulse, p, true),
                        None => body.apply_impulse(impulse, true),
                    }
                }
            }
        
        } // per player
        
    } // end
    
    /// Apply vehicle controls (throttle + steering) to each vehicle.
    fn apply_vehicle_controls(&mut self, dt: Real) {
        for v in self.vehicles.values_mut() {
            // Clamp inputs (already done, but safe)
            v.throttle = v.throttle.clamp(-1.0, 1.0);
            v.steer    = v.steer.clamp(-1.0, 1.0);
            v.brake    = v.brake.clamp(0.0, 1.0);

            // Steering angle (radians)
            // Cannon default ~0.6 rad max (~34°)
            // v.steer_angle += (target - v.steer_angle) * 0.15; // steering smoothing

            //---------------------------------------------------------------------------------
            //-- STEERING: speed-sensitive with rate limiting ---------------------------------
            //-- Dynamic max steering angle based on speed  -----------------------------------
            //---------------------------------------------------------------------------------
            let max_angle = 0.75; // radians
            let speed = self.bodies.get(v.body).map(|b| b.linvel().magnitude()).unwrap_or(0.0);
            let steer_scale = (1.0 - (speed / 30.0)).clamp(0.35, 1.0);
            let target = v.steer * max_angle * steer_scale;
            
            // Rate-limit steering angle change
            let max_steer_rate = 2.5; // rad/sec (1.8–3.0 realistic)

            let delta = target - v.steer_angle;
            let max_step = max_steer_rate * dt;

            let step = delta.clamp(-max_step, max_step);
            v.steer_angle += step;


            // println!(
            //     "[CTRL] AFTER apply_vehicle_controls → throttle={} steer={}",
            //     v.throttle, v.steer
            // );
        }
    }


    // --------------------------------------------------------------
    // anisotropic linear damping to reduce creep + oscillations
    // --------------------------------------------------------------

    pub fn apply_velocity_damping(&mut self, dt: Real) {
        for v in self.vehicles.values() {
            if let Some(body) = self.bodies.get_mut(v.body) {
                
                // ----------------------------------------------
                // Angular damping (kills roll/yaw oscillations)
                // ----------------------------------------------
                let angvel = *body.angvel();
                // println!(
                //     "ω = {:.3?}",
                //     body.angvel()
                // );
                let ang_damp_per_sec = 2.0; // tune
                let factor = (-ang_damp_per_sec * dt).exp();
                let speed = body.linvel().magnitude();
                
                if speed < 1.0 {
                    let yaw_damp = 6.0; // strong
                    let factor = (-yaw_damp * dt).exp();
                    body.set_angvel(vector![0.0, body.angvel().y * factor, 0.0], true);
                }else {
                    body.set_angvel(angvel * factor, true);
                }
            }
        }
    }

    pub fn step(&mut self, dt: Real) {

        self.debug_overlay.clear();

        let hooks = ();
        let mut events = ();

        // 1) Convert inputs → intent (NO PHYSICS)
        self.apply_vehicle_controls(dt);

        // 2) Apply suspension + traction + tire forces
        self.apply_suspension(dt);

        // 3) Apply velocity damping (kills creep & oscillations)
        self.apply_velocity_damping(dt);

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
