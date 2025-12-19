// src/physics.rs

use rapier3d::prelude::*;
use crate::physics::nalgebra::UnitQuaternion;
use rapier3d::prelude::{InteractionGroups, Group};
// use nalgebra::UnitQuaternion;
use serde::Serialize;

use std::collections::HashMap;
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
pub struct DebugWheel {
    pub center: [f32; 3],
    pub radius: f32,
    pub grounded: bool,
    pub compression: f32,
    pub normal_force: f32,
}

#[derive(Clone, Serialize)]
pub struct DebugOverlay {
    pub rays: Vec<DebugRay>,
    pub wheels: Vec<DebugWheel>,
    pub chassis_right: [f32; 3],
    // pub springs: Vec<DebugSpring>, 
}

impl DebugOverlay {
    pub fn clear(&mut self) {
        self.rays.clear();
        self.wheels.clear();
    }
}

#[derive(Clone)]
pub struct Wheel {
    pub offset: Point<Real>,     // position in chassis local space
    pub rest_length: Real,       // suspension neutral length
    pub max_length: Real,        // max compression + extension
    pub radius: Real,            // wheel radius

    pub stiffness: Real,         // spring constant
    pub damping: Real,           // damper constant

    pub drive: bool,             // is this a driven wheel?
    pub steer: bool,             // is this a steering wheel?
    pub last_normal: Real,      // for smoothing

}


pub struct VehicleConfig {
    pub mass: f32,            // kg
    pub engine_force: f32,    // N
    pub max_speed: f32,       // m/s
    pub linear_damping: f32,  // drag
    pub angular_damping: f32, // rotational drag
    pub sideways_grip: f32,   // tire friction
}

pub struct Vehicle {
    pub body: RigidBodyHandle,  // the chassis body
    pub config: VehicleConfig,  // vehicle parameters
    pub throttle: f32,          // -1.0 (full reverse) .. 1.0 (full forward)
    pub steer: f32,             // -1.0 (full left) .. 1.0 (full right)
    pub pitch: f32,             // for flying vehicles
    pub yaw: f32,               // for flying vehicles
    pub roll: f32,              // for flying vehicles
    pub ascend: f32,            // for flying vehicles
    pub steer_angle: f32,       // current steering angle (radians)
}

pub const GT86: VehicleConfig = VehicleConfig {
    mass: 1350.0,           // kg
    engine_force: 4200.0,   // N
    max_speed: 55.0,        // m/s (~198 km/h)
    linear_damping: 0.9,    // some drag
    angular_damping: 1.6,   // some rotational drag
    sideways_grip: 0.9,     // tire friction
};

pub const TANK: VehicleConfig = VehicleConfig {
    mass: 32000.0,
    engine_force: 18000.0,
    max_speed: 18.0,
    linear_damping: 2.0,
    angular_damping: 4.0,
    sideways_grip: 8.0,
};


// #[derive(Default)]
// pub struct VehicleSuspension {
//     /// Each dynamic body handle → its wheels.
//     pub vehicles: HashMap<RigidBodyHandle, Vec<WheelConfig>>,
// }

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
        self.debug_overlay.rays.clear();
        self.debug_overlay.wheels.clear();
        // self.debug_overlay.springs.clear();
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

        let ground_collider = ColliderBuilder::cuboid(500.0, 0.1, 500.0)
            .collision_groups(InteractionGroups::new(
                GROUP_GROUND,
                Group::empty(),
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
                rays: Vec::new(),
                wheels: Vec::new(),
                chassis_right: [1.0, 0.0, 0.0] //default
            },
        }
    }

    /// Attach input to a player's vehicle (just stores it; actual forces are
    /// applied in `step`).
    pub fn apply_player_input(&mut self,player_id: &str,throttle: f32,steer: f32,ascend: f32,pitch: f32,yaw: f32,roll: f32) {
        if let Some(v) = self.vehicles.get_mut(player_id) {

            // Log only when values CHANGE (to avoid spam)
            if (v.throttle - throttle).abs() > 0.01 || (v.steer - steer).abs() > 0.01 {
                println!(
                    "🔧 Input changed for {} → throttle: {:.2}, steer: {:.2}",
                    player_id, throttle, steer
                );
            }

            v.throttle = throttle.clamp(-1.0, 1.0);
            v.steer = steer.clamp(-1.0, 1.0);
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
            .build();
        
        // Box collider
        let collider = ColliderBuilder::cuboid(1.0, 0.35, 2.0)
            .collision_groups(InteractionGroups::new(
                GROUP_CHASSIS,
                Group::empty(),
            ))
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

    
    fn derive_suspension(&mut self,
        vehicle_mass: f32,                                      // kg
        wheels: usize,                                          // number of wheels
        frequency_hz: f32,                                      // Cannon ≈ 4.0–6.0
    ) -> (f32, f32) {

        let mass_per_wheel = vehicle_mass / wheels as f32;      // kg per wheel
        let omega = 2.0 * std::f32::consts::PI * frequency_hz;  // natural frequency (rad/s)
        let k = mass_per_wheel * omega * omega;                 // N/m - spring constant
        let c_crit = 2.0 * mass_per_wheel * omega;              // N*s/m - critical damping
        let c = c_crit * 0.8;                                   // 80% critical
        
        (k, c)                                                  // spring constant, damper constant
    }
    
    /// GTA-style car placeholder with 4 suspension raycasts.
    pub fn register_car(&mut self, body: RigidBodyHandle) {
        // Find vehicle config & input

        let vehicle_mass = 1350.0;  // kg
        let wheels = 4;             // number of wheels
        let frequency_hz = 4.5;     // softer suspension
        let (k, c) = self.derive_suspension(vehicle_mass, wheels, frequency_hz);
        let w = vec![
            Wheel { offset: point![-0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true, last_normal: 0.0,  },
            Wheel { offset: point![ 0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true, last_normal: 0.0,  },
            Wheel { offset: point![-0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false, last_normal: 0.0, },
            Wheel { offset: point![ 0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false, last_normal: 0.0, },
        ];
        assert!(
            w.iter().any(|w| w.drive),
            "Vehicle registered with NO drive wheels!"
        );

        self.wheels.insert(body, w);

    }

    // -------------------------------------------------------------------------
    // Suspension raycast + forces
    // -------------------------------------------------------------------------
    fn apply_suspension(&mut self, dt: Real) {
        let dt = dt.clamp(1.0 / 240.0, 1.0 / 30.0);

        // Update spatial queries (raycasts)
        self.query_pipeline.update(&self.colliders);

        let solid = true;

        // Collect forces first (borrow rules)
        let mut forces: Vec<(RigidBodyHandle, Vector<Real>, Point<Real>)> = Vec::new();
        let mut impulses: Vec<(RigidBodyHandle, Vector<Real>, Point<Real>)> = Vec::new();
        
        // ------------------------------------------------------------
        // For EACH vehicle body
        // ------------------------------------------------------------

        for (&handle, wheels) in self.wheels.iter_mut() {
            let Some(body) = self.bodies.get(handle) else { continue; };
            
            // Per-vehicle filter: don't raycast against your own chassis colliders
            let filter = QueryFilter::default().exclude_rigid_body(handle);

            // Body pose
            let pos = body.position();
            let rot = pos.rotation;

            // Body velocities
            let linvel: Vector<Real> = *body.linvel();
            let angvel: Vector<Real> = *body.angvel();

            // Center of mass (Rapier equivalent of Cannon world_com)
            // ✅ world-space COM
            let com_local: Point<Real> = *body.center_of_mass();
            let com: Point<Real> = pos * com_local;

            // Find vehicle config & input
            let player_id = match self.body_to_player.get(&handle) {
                Some(id) => id,
                None => continue,
            };

            let vehicle = match self.vehicles.get(player_id) {
                Some(v) => v,
                None => continue,
            };

            // println!(
            //     "[VEH] mass={} engine_force={} throttle={}",
            //     vehicle.config.mass,
            //     vehicle.config.engine_force,
            //     vehicle.throttle
            // );

            // Chassis basis (world-space)
            let chassis_forward = rot * vector![0.0, 0.0, 1.0];
            let chassis_right   = rot * vector![1.0, 0.0,  0.0];
            self.debug_overlay.chassis_right = [
                chassis_right.x,
                chassis_right.y,
                chassis_right.z,
            ];

            // Y-axis rotation for steering (world space)
            let steer_rot = |angle: Real| {
                UnitQuaternion::from_axis_angle(&Vector::y_axis(), angle)
            };

            // -------------------------------------------------------------
            // ---- derive wheelbase + rear lateral scale (per vehicle) ----
            // -------------------------------------------------------------
            let z_front = wheels.iter().filter(|w| w.steer).map(|w| w.offset.z).sum::<Real>()
                / wheels.iter().filter(|w| w.steer).count().max(1) as Real;

            let z_rear = wheels.iter().filter(|w| !w.steer).map(|w| w.offset.z).sum::<Real>()
                / wheels.iter().filter(|w| !w.steer).count().max(1) as Real;

            let wheelbase = (z_front - z_rear).abs().max(0.5); // meters
            let z_com_local: Real = com_local.z;               // chassis-local COM z (usually ~0)

            let a = (z_front - z_com_local).max(0.1);          // COM->front
            let b = (z_com_local - z_rear).max(0.1);           // COM->rear

            let fzf = vehicle.config.mass as Real * 9.81 * (b / wheelbase);
            let fzr = vehicle.config.mass as Real * 9.81 * (a / wheelbase);

            // rear stiffness authority relative to front (neutral steer-ish), biased to understeer
            let understeer_bias: Real = 0.85;
            let rear_scale = ((fzr / fzf) * understeer_bias).clamp(0.35, 0.95);

            // println!("drive_wheels={}", wheels.iter().filter(|w| w.drive).count());

            // println!(
            //     "[DEBUG] body={:?} wheels={} drive_wheels={}",
            //     handle,
            //     wheels.len(),
            //     wheels.iter().filter(|w| w.drive).count()
            // );

            // --------------------------------------------------------
            // For EACH wheel (this is the ONLY inner loop)
            // --------------------------------------------------------
            let wheel_count = wheels.len() as Real;
            let weight_per_wheel = vehicle.config.mass as Real * 9.81 / wheel_count;

            for wheel in wheels.iter_mut() {

                // Ray origin = wheel attachment in world space
                let origin: Point<Real> = pos * (wheel.offset + vector![0.0, wheel.radius, 0.0]);
                // let origin: Point<Real> = pos * (wheel.offset + vector![0.0, wheel.rest_length, 0.0]);
                // let origin: Point<Real> = pos * (wheel.offset + vector![0.0, wheel.rest_length + wheel.radius, 0.0]);

                // let origin: Point<Real> = pos * wheel.offset;

                // Ray direction (downwards)
                let dir: Vector<Real> = vector![0.0, -1.0, 0.0];

                // Max suspension travel
                // let max_dist = wheel.max_length + wheel.radius;
                let max_dist = wheel.rest_length + wheel.max_length + wheel.radius; // temp 

                let ray = Ray::new(origin, dir);

                // ---- Raycast ----
                let Some((_hit, toi)) =
                    self.query_pipeline.cast_ray(
                        &self.bodies,
                        &self.colliders,
                        &ray,
                        max_dist,
                        solid,
                        filter,
                    )
                else {
                    continue; // wheel is airborne
                };

                if toi <= wheel.radius {
                    continue; // invalid or self-hit
                }

                // Contact point
                let hit_point: Point<Real> = origin + dir * toi;

                // Ground normal (flat for now)
                let ground_n: Vector<Real> = vector![0.0, 1.0, 0.0];

                // ----------------------------------------------------
                // Suspension compression
                // ----------------------------------------------------
                if toi < wheel.radius * 0.5 {
                    println!("⚠️ suspicious toi={:.4} (likely self-hit) for body {:?}", toi, handle);
                }

                let suspension_length = toi - wheel.radius; // distance from chassis to ground

                // STATIC EQUILIBRIUM
                // let weight_per_wheel =
                //     vehicle.config.mass as Real * 9.81 / wheels.len() as Real;

                let rest_compression = weight_per_wheel / wheel.stiffness;

                // FINAL compression
                let compression =
                    (wheel.rest_length - suspension_length)
                        .clamp(0.0, wheel.max_length);

                let grounded = compression > 0.0;

                // ALWAYS push debug ray
                self.debug_overlay.rays.push(DebugRay {
                    origin: origin.into(),
                    direction: dir.into(),
                    length: max_dist,
                    hit: Some(hit_point.into()),
                    color: if grounded {
                        [0.0, 1.0, 0.0]
                    } else {
                        [1.0, 0.0, 0.0]
                    },
                });

                // Emit wheel debug ALWAYS
                let wheel_center = origin - ground_n * wheel.radius;
                let wheel_debug_index = self.debug_overlay.wheels.len();

                self.debug_overlay.wheels.push(DebugWheel {
                    center: wheel_center.into(),
                    radius: wheel.radius,
                    grounded,
                    compression,
                    normal_force: 0.0,
                });

                // ⛔ STOP here only for physics
                if !grounded {
                    continue;
                }

                

                // #[cfg(debug_assertions)]
                // if wheel.drive {
                //     println!(
                //         "[HIT] toi={:.3} susp_len={:.3} comp={:.3}",
                //         toi, suspension_length, compression
                //     );
                // }
                
                // ----------------------------------------------------
                // POINT VELOCITY (critical Cannon detail)
                // ----------------------------------------------------
                let r: Vector<Real> = hit_point.coords - com.coords; // vector from COM to contact point
                let point_vel: Vector<Real> = linvel + angvel.cross(&r); // m/s
                
                // Relative velocity ALONG suspension axis
                let suspension_vel = point_vel.dot(&ground_n); // m/s

                // ----------------------------------------------------
                // Spring + damper (CRITICALLY DAMPED)
                // ----------------------------------------------------
                let spring_force = wheel.stiffness * compression; // N

                // Damper must oppose motion
                // let damper_force = (-wheel.damping * suspension_vel)
                //     .clamp(-spring_force, spring_force);

                // damper opposes relative motion ONLY
                let damper_force = -wheel.damping * suspension_vel;

                // DO NOT let damper exceed spring force magnitude
                let damper_force = damper_force.clamp(
                    -spring_force.abs(),
                    spring_force.abs()
                );

                // Total normal force
                let gravity_force_per_wheel = vehicle.config.mass as Real * self.gravity.y.abs() / wheel_count;

                let mut normal_force = spring_force + damper_force - gravity_force_per_wheel;
                
                // Update last wheel debug entry with real normal force
                // self.debug_overlay.wheels[wheel_debug_index].normal_force = normal_force;
                if let Some(last) = self.debug_overlay.wheels.last_mut() {
                    last.normal_force = normal_force;
                }

                let smooth = 0.6;

                normal_force =
                    wheel.last_normal * smooth +
                    normal_force * (1.0 - smooth);

                wheel.last_normal = normal_force;

                // Suspension NEVER pulls
                if normal_force < 0.0 {
                    normal_force = 0.0;
                }

                // normal_force = normal_force.min(25_000.0);

                if normal_force <= 0.0 {
                    continue; // wheel not grounded
                }

                let wheel_center = origin - ground_n * wheel.radius;
                self.debug_overlay.wheels.push(DebugWheel {
                    center: wheel_center.into(),
                    radius: wheel.radius,
                    grounded: compression > 0.0,
                    compression,
                    normal_force: 0.0, // placeholder (updated later if grounded)
                });

                // #[cfg(debug_assertions)]
                // if normal_force > 0.0 && wheel.drive && vehicle.throttle.abs() > 0.01 {
                //     println!(
                //         "  DRIVE wheel | normal={:.0}N | traction cap={:.0}N",
                //         normal_force,
                //         normal_force * 0.8
                //     );
                // }

                let suspension_impulse = ground_n * (normal_force * dt);
                impulses.push((handle, suspension_impulse, hit_point));



                // let suspension_force = ground_n * normal_force;
                // forces.push((handle, suspension_force, hit_point));
            
                // #[cfg(debug_assertions)]
                // {
                //     println!(
                //         "[SUSP] body={:?} wheel_offset={:?}",
                //         handle, wheel.offset
                //     );
                //     println!(
                //         "  compression={:.3} m | spring={:.1} N | damper={:.1} N",
                //         compression, spring_force, damper_force
                //     );
                //     println!(
                //         "  normal_force={:.1} N | suspension_vel={:.3} m/s",
                //         normal_force, suspension_vel
                //     );
                // }

                // ----------------------------------------------------
                // Ackermann steering
                // ----------------------------------------------------
                let axle_half = 0.8; // half track width
                let steer_sign = wheel.offset.x.signum();

                let ackermann_angle =
                    vehicle.steer_angle * (1.0 - 0.3 * steer_sign);

                let wheel_forward = if wheel.steer {
                    steer_rot(ackermann_angle) * chassis_forward
                } else {
                    chassis_forward
                };

                // Project onto ground plane
                let wheel_forward = {
                    let v = wheel_forward - ground_n * wheel_forward.dot(&ground_n);
                    if v.magnitude() > 1e-6 { v.normalize() } else { vector![0.0, 0.0, -1.0] }
                };

                // ----------------------------------------------------
                // LATERAL / CORNERING FORCE (front + rear, capped)
                // ----------------------------------------------------
                let wheel_side = ground_n.cross(&wheel_forward).normalize();

                let side_speed = point_vel.dot(&wheel_side);
                // let forward_speed = point_vel.dot(&wheel_forward).abs().max(1.0);
                // let slip_angle = (side_speed / forward_speed).clamp(-1.0, 1.0);

                let forward_speed = point_vel.dot(&wheel_forward);
                let slip_angle = if forward_speed.abs() < 0.5 {
                    side_speed * 2.0
                } else {
                    (side_speed / forward_speed).clamp(-1.0, 1.0)
                };

                // front = 1.0, rear = rear_scale
                let axle_scale: Real = if wheel.steer { 1.0 } else { rear_scale };

                // treat sideways_grip as μ_lat (so values like 0.9–1.4 make sense)
                // if you keep it at 4.0 you WILL get bounce/energy injection
                let mu_lat: Real = vehicle.config.sideways_grip as Real;

                let max_lat = mu_lat * normal_force;               // friction cap
                let desired_lat = -slip_angle * max_lat * axle_scale;

                // let corner_impulse = wheel_side * (desired_lat * dt);
                // forces.push((handle, corner_impulse, hit_point));

                let corner_force = wheel_side * desired_lat;
                forces.push((handle, corner_force, hit_point));
               
                // ----------------------------------------------------
                // TRACTION (longitudinal)
                // ----------------------------------------------------

                if wheel.drive {
                    let engine_force =
                        vehicle.throttle * vehicle.config.engine_force;

                    // Grip limited by normal force (Cannon-style)
                    let max_long = normal_force * 0.8; // μ ≈ 0.8
                    let traction = engine_force.clamp(-max_long, max_long);

                    // let traction_impulse = wheel_forward * (traction * dt);
                    // forces.push((handle, traction_impulse, hit_point));

                    let traction_force = wheel_forward * traction;
                    forces.push((handle, traction_force, hit_point));

                    // #[cfg(debug_assertions)]
                    // {
                    //     println!(
                    //         "  traction={:.1} N | throttle={:.2} | steer={:.2}",
                    //         traction, vehicle.throttle, vehicle.steer_angle
                    //     );
                    // }

                    // println!(
                    //     "[CHECK] fwd={:?} traction={} vel={:?}",
                    //     wheel_forward,
                    //     traction,
                    //     linvel
                    // );

                    // #[cfg(debug_assertions)]
                    // if wheel.drive {
                    //     println!(
                    //         "[DRIVE] throttle={:.2} engine={:.0}N normal={:.0}N traction={:.0}N",
                    //         vehicle.throttle,
                    //         vehicle.config.engine_force,
                    //         normal_force,
                    //         traction
                    //     );
                    // }
                }
            }
        }

        // ------------------------------------------------------------
        // APPLY ALL FORCES (single mutable pass)
        // ------------------------------------------------------------
        for (handle, force, point) in forces {
            if let Some(body) = self.bodies.get_mut(handle) {
                body.add_force_at_point(force, point, true);
            }
        }
        for (handle, impulse, point) in impulses {
            if let Some(body) = self.bodies.get_mut(handle) {
                body.apply_impulse_at_point(impulse, point, true);
            }
        }
    }

    /// Apply vehicle controls (throttle + steering) to each vehicle.
    fn apply_vehicle_controls(&mut self, _dt: Real) {
        for v in self.vehicles.values_mut() {
            // Clamp inputs (already done, but safe)
            v.throttle = v.throttle.clamp(-1.0, 1.0);
            v.steer    = v.steer.clamp(-1.0, 1.0);

            // Steering angle (radians)
            // Cannon default ~0.6 rad max (~34°)
            v.steer_angle = v.steer * 0.6;
            // println!(
            //     "[CTRL] AFTER apply_vehicle_controls → throttle={} steer={}",
            //     v.throttle, v.steer
            // );
        }
    }

    pub fn step(&mut self, dt: Real) {
        self.debug_overlay.rays.clear();
        self.debug_overlay.wheels.clear();

        let hooks = ();
        let mut events = ();

        // let vehicle_inputs: Vec<(RigidBodyHandle, f32, f32)> =
        //     self.vehicles
        //         .values()
        //         .map(|v| (v.body, v.throttle, v.steer))
        //         .collect();

        // 1) Convert inputs → intent (NO PHYSICS)
        self.apply_vehicle_controls(dt);

        // 2) Apply suspension + traction + tire forces
        self.apply_suspension(dt);

        // 3) Step physics.
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

        // 3) Safety: prevent bodies from exploding to insane coordinates
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
