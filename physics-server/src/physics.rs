// src/physics.rs

use rapier3d::prelude::*;
use rapier3d::prelude::{InteractionGroups, Group};
use crate::physics::nalgebra::UnitQuaternion;
use crate::aven_tire::{ContactPatch, ControlInput, SolveContext, WheelId, solve_step};
use std::collections::HashMap;
use serde::Serialize;

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

    pub lateral_force: [f32; 3],                // for debug visualization
    pub lateral_magnitude: f32,                 // for debug visualization
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
    engine_force: 3200.0,     // N
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
    mu_base: 0.9,             // base friction coefficient

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
// --------------------------------------------------
// ackermann steering angles (stateless)
// -------------------------------------------------
fn ackermann_angles(base: f32, wheelbase: f32, track: f32) -> (f32, f32) {
    // base is "bicycle model" steer angle at vehicle centerline
    // returns (left, right) in radians

    let eps = 1e-4;
    if base.abs() < eps {
        return (0.0, 0.0);
    }

    let sign = base.signum();
    let a = base.abs();

    // turning radius of the centerline bicycle model
    let r = wheelbase / a.tan();

    // inside/outside radii for front wheels
    let r_in  = (r - track * 0.5).max(0.01);
    let r_out = (r + track * 0.5).max(0.01);

    let left  = (wheelbase / r_in).atan() * sign;
    let right = (wheelbase / r_out).atan() * sign;

    // If turning left (base>0), left is inside; if right turn, right is inside
    if sign > 0.0 { (left, right) } else { (right, left) }
}

// --------------------------------------------------
// Anti-roll bars (derived, stateless)
// --------------------------------------------------
fn compute_arb_impulses(
    handle: RigidBodyHandle,
    left_id: &str,
    right_id: &str,
    stiffness: f32,
    axle_compression: &HashMap<String, f32>,
    axle_hit_point: &HashMap<String, Point<Real>>,
    dt: f32,
) -> Vec<(RigidBodyHandle, Vector<Real>, Option<Point<Real>>)> {

    let mut out: Vec<(RigidBodyHandle, Vector<Real>, Option<Point<Real>>)> = Vec::new();

    let (Some(&cl), Some(&cr)) = (
        axle_compression.get(left_id),
        axle_compression.get(right_id),
    ) else {
        return out;
    };

    let (Some(&pl), Some(&pr)) = (
        axle_hit_point.get(left_id),
        axle_hit_point.get(right_id),
    ) else {
        return out;
    };

    let delta = cl - cr;

    // if delta.abs() < 0.005 {
    //     return;
    // }
    if delta.abs() < 1e-4 {
        return out;
    }

    let force = stiffness * delta;
    let impulse = vector![0.0, 1.0, 0.0] * (force * dt);

    out.push((handle, -impulse, Some(pl)));
    out.push((handle,  impulse, Some(pr)));

    out
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

    // fn derive_suspension(&mut self,
    //     vehicle_mass: f32,                                      // kg
    //     wheels: usize,                                          // number of wheels
    //     frequency_hz: f32,                                      // Cannon ≈ 4.0–6.0
    // ) -> (f32, f32) {

    //     let mass_per_wheel = vehicle_mass / wheels as f32;      // kg per wheel
    //     let omega = 2.0 * std::f32::consts::PI * frequency_hz;  // natural frequency (rad/s)
    //     let k = mass_per_wheel * omega * omega;                 // N/m - spring constant
    //     let c_crit = 2.0 * mass_per_wheel * omega;              // N*s/m - critical damping
    //     let c = c_crit * 0.80;                                   // 80% critical
        
    //     (k, c)                                                  // spring constant, damper constant
    // }

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

            // let Some(body) = self.bodies.get_mut(handle) else { continue };
            let Some(body) = self.bodies.get_mut(handle) else { continue };
            let Some(body_ro) = self.bodies.get(handle) else { continue };

            let player_id = match self.body_to_player.get(&handle) {
                Some(id) => id, None => continue,
            };

            let vehicle = match self.vehicles.get(player_id) {
                Some(v) => v, None => continue,
            };


            let iso = body_ro.position();

            self.debug_overlay.chassis = Some(DebugChassis {
                position: iso.translation.vector.into(),
                rotation: [
                    iso.rotation.i,
                    iso.rotation.j,
                    iso.rotation.k,
                    iso.rotation.w,
                ],
                half_extents: vehicle.config.chassis_half_extents,
            });
            

            let throttle = vehicle.throttle as Real;
            let brake = vehicle.brake as Real;
            
            // collect impulses here, apply later
            let mut impulses: Vec<(RigidBodyHandle, Vector<Real>, Option<Point<Real>>)> = Vec::new();
            let mut contacts: Vec<ContactPatch> = Vec::new(); // for tire solver

            // ============================================================
            // Suspension raycast + forces
            // ============================================================
            
            // ✅ Per-vehicle (per chassis) data for ARB + debug
            let mut axle_compression: HashMap<String, f32> = HashMap::new();
            let mut axle_hit_point: HashMap<String, Point<Real>> = HashMap::new();
            // let mut axle_normal_force: HashMap<String, f32> = HashMap::new();

            let pos = body_ro.position();
            let rot = pos.rotation;
            let linvel = *body_ro.linvel();
            let angvel = *body_ro.angvel();
            let body_mass = body_ro.mass() as f32;
            let com_local = *body_ro.center_of_mass();
            let com = pos * com_local;


            let filter = QueryFilter::default().exclude_rigid_body(handle);
            let wheels_count = wheels.len() as Real;
            let fz_ref = (body_mass * 9.81) / wheels_count; // static per-wheel load

            // ----------------------------------------------------------------------------
            // 1) Raycast + suspension
            // ----------------------------------------------------------------------------
            for wheel in wheels.iter_mut() {
                let max_dist = wheel.rest_length + wheel.max_length + wheel.radius;
                // let origin = pos * (wheel.offset + vector![0.0, wheel.radius, 0.0]);
                let origin = pos * (wheel.offset + vector![0.0, wheel.radius + 0.02, 0.0]);

                let ground_n: Vector<Real>  = vector![0.0, 1.0, 0.0];
                let dir: Vector<Real> = vector![0.0, -1.0, 0.0];
                let ray = Ray::new(origin, dir);

                // --- DEBUG STATE (always valid) ---
                let mut grounded = false;
                let mut compression = 0.0;
                let mut normal_force = 0.0;
                let mut hit_point_opt: Option<Point<Real>> = None;
                let mut lateral_force = [0.0; 3];
                let mut lateral_magnitude = 0.0;
                
                
                if let Some((_hit, toi)) = self.query_pipeline.cast_ray(
                    &self.bodies,
                    &self.colliders,
                    &ray,
                    max_dist,
                    true,
                    filter,
                ){

                    if toi > wheel.radius {
                        let hit_point = origin + dir * toi;
                        // let apply_point = hit_point + ground_n * (wheel.radius * 0.25);
                        let suspension_length = toi - wheel.radius;
                        let raw_compression = wheel.rest_length - suspension_length;
                        compression = raw_compression.clamp(0.0, wheel.max_length);
                        let compression_ratio = (compression / wheel.max_length).clamp(0.0, 1.0);

                        // Limits
                        // let mut max_long = 1.0;

                        if compression > 0.0{
                            grounded = true;                    // grounded!
                            hit_point_opt = Some(hit_point);

                            // ✅ Store per-wheel contact info for ARB (keys are owned Strings)
                            axle_compression.insert(wheel.debug_id.clone(), compression);
                            axle_hit_point.insert(wheel.debug_id.clone(), hit_point);

                            // --- point velocity ---
                            let r = hit_point.coords - com.coords;              // r = p - com
                            let point_vel = linvel + angvel.cross(&r);          // v = v + ω × r
                            let mut suspension_vel = point_vel.dot(&ground_n);  // v_n = v · n
                            
                            
                            // Deadzone to kill micro jitter
                            if suspension_vel.abs() < 0.05 { suspension_vel = 0.0; } // 0.05 m/s deadzone

                            // Kill rebound bounce (one-way damper)
                            if suspension_vel > 0.0 {
                                suspension_vel *= 0.15;
                            }


                            let spring_force = wheel.stiffness * compression;       // F_s = k * x
                            let damper_force = (-wheel.damping * suspension_vel)    // F_d = -c * v_n
                            .clamp(-spring_force * 0.6, spring_force * 0.6);    // clamped to 80% of spring force
                            
                            // Total normal force
                            normal_force = (spring_force + damper_force).max(0.0);  // F_n = F_s + F_d
                            normal_force = normal_force.min(25_000.0);              // max force
                            
                            // ----------------------------------------------------
                            // LOAD-SENSITIVE FRICTION (μ decreases with load)
                            // ----------------------------------------------------
                            // let mu_base = vehicle.config.sideways_grip as Real; // sideways friction coefficient
                            let mu0 = vehicle.config.mu_base as Real;           // base friction coefficient
                            let k   = vehicle.config.load_sensitivity as Real;  // load sensitivity factor
                            
                            let load_ratio = (normal_force / fz_ref).max(0.2); // normalized load
                            
                            // μ_eff = μ0 * (Fz/Fz_ref)^(-k)
                            let mu_lat = (mu0 * load_ratio.powf(-k)).clamp(mu0 * 0.6, mu0 * 1.1);

                            // Limits (impulse capacity this frame)
                            // max_long = (normal_force * dt * 0.8).max(1e-6);
                            
                            // ----------------------------------------------------
                            // ANTI-SQUAT / PITCH COMPENSATION (optional)
                            // ----------------------------------------------------
                            if suspension_vel.abs() > 1.5 {normal_force *= 0.7;} // high-speed damping (failsafe): Detect hop & damp it

                            // Failsafe: keep minimal support force to avoid tunneling
                            if grounded && normal_force < 200.0 {
                                normal_force = 200.0;
                            }

                            // axle_normal_force.insert(wheel.debug_id.clone(), normal_force);

                            if !(linvel.magnitude() < 0.05 && normal_force < 200.0) {
                                let normal_impulse = ground_n * (normal_force * dt);
                                impulses.push((handle, normal_impulse, Some(hit_point)));
                            }

                            if normal_force < 50.0 {
                                continue; // no cornering force if wheel barely touching
                            }
                            
                            // ----------------------------------------------------
                            // STEERING: yaw-based (minimal, stable)
                            // ----------------------------------------------------
                            let base = vehicle.steer_angle; // already speed limited
                            let (ack_l, ack_r) = ackermann_angles(base, vehicle.config.wheelbase, vehicle.config.track_width);

                            // blend
                            let (fl, fr) = (
                                (1.0 - vehicle.config.ackermann) * base + vehicle.config.ackermann * ack_l,
                                (1.0 - vehicle.config.ackermann) * base + vehicle.config.ackermann * ack_r,
                            );

                            let wheel_angle = match wheel.debug_id.as_str() {
                                "FL" => fl,
                                "FR" => fr,
                                _ => 0.0,
                            };

                            let steer_rot = UnitQuaternion::from_axis_angle(&Vector::y_axis(), wheel_angle);

                            // Steered forward direction in world space
                            let chassis_forward_world = rot * vector![0.0, 0.0, -1.0];

                            let chassis_forward = steer_rot * chassis_forward_world;
                            
                            // ----------------------------------------------------
                            // LATERAL (CORNERING) IMPULSE
                            // ----------------------------------------------------
                            
                            // Project onto ground plane
                            let wheel_forward = {
                                let v = chassis_forward - ground_n * chassis_forward.dot(&ground_n);
                                if v.magnitude() > 1e-6 { 
                                    v.normalize() 
                                } else {
                                    vector![0.0, 0.0, -1.0] 
                                }
                            };
                            
                            let v_long = point_vel.dot(&wheel_forward);
                            
                            // ----------------------------------------------------
                            // Combined slip placeholders (must exist even if lateral = 0)
                            // ----------------------------------------------------
            
                            let mut apply_point = hit_point + ground_n * (wheel.radius * 0.25);
                            let steer_intensity: Real = vehicle.steer.abs().clamp(0.0, 1.0); // 0.0 .. 1.0
                            let vertical_coupling = 1.0 - steer_intensity * 0.65; // reduces roll effect when steering hard
                            let roll_factor = 0.30 * vertical_coupling; //x for tire roll torque
                            let wheel_side: Vector<Real> = wheel_forward.cross(&ground_n); // right hand rule
                            // let wheel_side: Vector<Real> = wheel_forward.cross(&ground_n);

                            let lateral_speed = point_vel.dot(&wheel_side); // slip velocity at contact point

                            if wheel_forward.magnitude() > 1e-4 {
                                // ------------------------------------------
                                // DEBUG SLIP-ANGLE VECTOR Ray
                                // This does not affect physics. It only shows what already exists.
                                // ------------------------------------------
                                let slip_mag = lateral_speed.abs();

                                if slip_mag > 0.01 {
                                    let slip_dir = if lateral_speed >= 0.0 {
                                        wheel_side
                                    } else {
                                        -wheel_side
                                    };

                                    // Visual scale (purely debug)
                                    let slip_len = (slip_mag * 0.25).clamp(0.02, 0.6);

                                    // Color by axle
                                    let color = match wheel.debug_id.as_str() {
                                        "FL" | "RL" => [0.2, 0.8, 1.0], // left = blue
                                        "FR" | "RR" => [1.0, 0.4, 0.2], // right = red
                                        _ => [1.0, 1.0, 1.0],
                                    };

                                    self.debug_overlay.slip_vectors.push(DebugSlipRay {
                                        origin: hit_point.into(),
                                        direction: slip_dir.into(),
                                        magnitude: slip_len,
                                        color,
                                    });
                                }


                                // Deadzone to prevent jitter
                                // if lateral_speed.abs() > 0.02 {
                                    

                                //     // further reduce lateral force when near stop and braking
                                //     if speed < 0.5 && brake > 0.3 {
                                //         // kill lateral completely near stop
                                //         let scrub = ((5.0 - speed) / 5.0).clamp(0.0, 1.0);
                                //         desired_lat_impulse += -lateral_speed * body.mass() * 0.25 * scrub;
                                //     }

                                //     desired_lat_impulse = desired_lat_impulse.clamp(-max_lat_impulse, max_lat_impulse); // final clamp
                                //     lat_impulse_vec = wheel_side * desired_lat_impulse; // lateral impulse vector
                                //     lat_impulse_mag = lat_impulse_vec.magnitude(); // Store for combined slip calculation later

                                //     // for debug
                                //     lateral_force = [
                                //         wheel_side.x * (desired_lat_impulse / dt),
                                //         wheel_side.y * (desired_lat_impulse / dt),
                                //         wheel_side.z * (desired_lat_impulse / dt),
                                //     ];
                                //     lateral_magnitude = (desired_lat_impulse / dt).abs(); // N
                                //     apply_point = hit_point + ground_n * (wheel.radius * 0.25); // slightly above ground
                                    
                                // } // if lateral_speed.abs() > 0.02

                            } // if wheel_forward.magnitude() > 1e-4


                            contacts.push(ContactPatch {
                                wheel: WheelId::from_debug(&wheel.debug_id),
                                grounded: true,

                                hit_point: p3(hit_point),
                                apply_point: p3(apply_point),

                                forward: v3(wheel_forward),
                                side: v3(wheel_side),

                                v_long: v_long as f32,
                                v_lat: lateral_speed as f32,

                                normal_force: normal_force as f32,
                                mu_lat: mu_lat as f32,
                                roll_factor: roll_factor as f32,

                                drive: wheel.drive,
                                compression_ratio,
                            });

                        } // if compression > 0.0 grounded

                    } // if ray hit

                } // raycast


                // ----------------------------------------------------------
                // DEBUG RAY (suspension ray)
                // ----------------------------------------------------------
                 self.debug_overlay.suspension_rays.push(DebugRay {
                    origin: origin.into(),
                    direction: dir.into(),
                    length: max_dist,
                    hit: hit_point_opt.map(|p| p.into()),
                    // color: [0.0, 1.0, 0.0],
                    color: if grounded {
                        [0.0, 1.0, 0.0]          // solid green
                    } else if hit_point_opt.is_some() {
                        [0.6, 0.6, 0.6]          // faded (recent contact)
                    } else {
                        [1.0, 0.0, 0.0]          // fully airborne
                    },
                });

                // ----------------------------------------------------------
                // DEBUG LOAD TRANSFER BAR (vertical)
                // ----------------------------------------------------------

                // Scale: tune this constant to taste (bigger = shorter bars).
                // let load_scale = 6000.0_f32;
                // let load_scale = 6000.0_f32;
                let norm = (normal_force / 12000.0).clamp(0.0, 1.0);
                let bar_len = norm.powf(0.5) * 1.25; // visual exaggeration

                // Use hit point when grounded, else wheel center
                let bar_origin = hit_point_opt.unwrap_or(origin) + ground_n * 0.03;
                // let load_ratio = (normal_force / 12000.0).clamp(0.0, 1.0);
                let color =  match wheel.debug_id.as_str() {
                    "FL" | "RL" => [0.2, 0.6, 1.0], // left = blue
                    "FR" | "RR" => [1.0, 0.4, 0.2], // right = red
                    _ => [1.0, 1.0, 1.0],
                };
                self.debug_overlay.load_bars.push(DebugRay {
                    origin: bar_origin.into(),
                    direction: ground_n.into(),
                    // direction: [0.0, 1.0, 0.0], // ALWAYS UP
                    length: bar_len,
                    hit: Some((bar_origin + ground_n * bar_len).into()),
                    color: color,
                });
                // ----------------------------------------------------
                // DEBUG WHEEL (per-wheel numeric data)
                // ----------------------------------------------------
                self.debug_overlay.wheels.push(DebugWheel {
                    id: wheel.debug_id.clone(),
                    center: (origin - ground_n * wheel.radius).into(),
                    radius: wheel.radius,
                    grounded,
                    compression,
                    normal_force,
                    lateral_force,
                    lateral_magnitude,                
                });

            } // for each wheel

            // ---------------------------
            // 2) Tire solve (ONCE)
            // ---------------------------
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
                mu_base: vehicle.config.mu_base,
            };

            let control = ControlInput {
                throttle: throttle as f32,
                brake: brake as f32,
                steer: vehicle.steer as f32,
            };

            let tire_impulses = solve_step(&ctx, &control, &contacts);
            for imp in tire_impulses {
                let j: Vector<Real> = imp.impulse.into(); // if impulse is [f32;3]
                let p: Option<Point<Real>> = imp.at_point.map(Point::from);
                impulses.push((handle, j, p));
            }

            for (handle, impulse, point) in impulses {
                if let Some(body) = self.bodies.get_mut(handle) {
                    match point {
                        Some(p) => body.apply_impulse_at_point(impulse, p, true),
                        None => body.apply_impulse(impulse, true),
                    }
                }
            }

            // --------------------------------------------------
            // ANTI-ROLL DEBUG + IMPULSES (front + rear)
            // --------------------------------------------------

            // Assumption: all wheels share same radius (true for GT86/TANK)
            let wheel_radius = wheels
                .first()
                .map(|w| w.radius)
                .unwrap_or(0.35);

            let mut arb_debug = |left: &str, right: &str, k: f32, color_pos: [f32; 3], color_neg: [f32; 3]| {
                let (Some(&cl), Some(&cr)) = (
                    axle_compression.get(left),
                    axle_compression.get(right),
                ) else {
                    return;
                };

            
                let grounded_l = axle_compression.get(left).unwrap_or(&0.0) > &0.0;
                let grounded_r = axle_compression.get(right).unwrap_or(&0.0) > &0.0;
                if !(grounded_l && grounded_r) {
                    return;
                }

                let (Some(&pl), Some(&pr)) = (
                    axle_hit_point.get(left),
                    axle_hit_point.get(right),
                ) else {
                    return;
                };

                // Wheel-center positions for ARB DEBUG ONLY
                let wheel_center_l = pl + vector![0.0, wheel_radius + 0.05, 0.0];
                let wheel_center_r = pr + vector![0.0, wheel_radius + 0.05, 0.0];
                
                let delta = cl - cr;
                if delta.abs() < 1e-4 {
                    return;
                }
                
                let force = k * delta;
                
                let color = if force >= 0.0 { color_pos } else { color_neg };

                // --------------------------------------------------
                // DEBUG: axle link (shows roll direction)
                // --------------------------------------------------
                let axis = wheel_center_r - wheel_center_l;
                let dist = axis.magnitude();
                if dist > 1e-4 {
                    let dir = axis / dist;

                    self.debug_overlay.arb_links.push(DebugRay {
                        origin: wheel_center_l.into(),
                        direction: dir.into(),
                        length: dist,
                        hit: Some(wheel_center_r.into()),
                        color,
                    });
                }

                // --------------------------------------------------
                // DEBUG: vertical ARB forces at wheels
                // --------------------------------------------------
                let arb_scale = 20_000.0_f32;
                let arb_len_raw = delta.abs() * k / arb_scale;
                let arb_len = arb_len_raw.clamp(0.08, 0.8); // 👈 minimum 8 cm
                
                // let arb_len = (delta.abs() * k / arb_scale).clamp(0.0, 0.8);

                let up = vector![0.0, 1.0, 0.0];

                let left_dir = if force >= 0.0 { -up } else { up };
                let right_dir = if force >= 0.0 { up } else { -up };

                let lateral_offset = vector![0.06, 0.0, 0.0]; // tune per side

                let arb_origin_l = wheel_center_l + up * 0.05 - lateral_offset;
                let arb_origin_r = wheel_center_r + up * 0.05 + lateral_offset;

                self.debug_overlay.arb_links.push(DebugRay {
                    origin: wheel_center_l.into(),
                    direction: left_dir.into(),
                    length: arb_len,
                    hit: Some((arb_origin_l + left_dir * arb_len).into()),
                    color: color_pos,
                });

                self.debug_overlay.arb_links.push(DebugRay {
                    origin: wheel_center_r.into(),
                    direction: right_dir.into(),
                    length: arb_len,
                    hit: Some((arb_origin_r + right_dir * arb_len).into()),
                    color: color_pos,
                });

                // --------------------------------------------------
                // PHYSICS: ARB impulses
                // --------------------------------------------------
                // impulses.extend(
                //     compute_arb_impulses(
                //         handle,
                //         left,
                //         right,
                //         k,
                //         &axle_compression,
                //         &axle_hit_point,
                //         dt,
                //     )
                // );
            };


            // Front axle: FL/FR
            arb_debug("FL", "FR", vehicle.config.arb_front, [0.7, 0.2, 1.0], [0.2, 0.8, 1.0]);

            // Rear axle: RL/RR
            arb_debug("RL", "RR", vehicle.config.arb_rear, [0.7, 0.2, 1.0], [0.2, 0.8, 1.0]);
        
        }
        
    }

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
