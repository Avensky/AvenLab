// src/physics.rs

use rapier3d::prelude::*;
use std::collections::HashMap;

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
    sideways_grip: 4.0,     // tire friction
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
    pub gravity: Vector<Real>,
    pub pipeline: PhysicsPipeline,
    pub island_manager: IslandManager,
    pub broad_phase: DefaultBroadPhase,
    pub narrow_phase: NarrowPhase,
    pub bodies: RigidBodySet,
    pub colliders: ColliderSet,
    pub joints: ImpulseJointSet,
    pub multibody_joints: MultibodyJointSet,
    pub ccd: CCDSolver,
    pub query_pipeline: QueryPipeline,
    // pub suspension: VehicleSuspension,
    pub wheels: HashMap<RigidBodyHandle, Vec<Wheel>>,
    pub vehicles: HashMap<String, Vehicle>, // playerId → vehicle   
}

impl PhysicsWorld {

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
        }
    }

    /// Spawn a simple "car" for this player:
    /// - Dynamic rigid body with a box collider.
    /// - Positioned slightly above the ground so it can fall and settle.
    pub fn spawn_vehicle_for_player(&mut self, id: String, position: [f32; 3]) {
        let spawn_x = position[0];
        let spawn_z = position[2];
        let spawn_y = 1.0; // fixed server convention
        let config = GT86; // you can choose different configs per player if desired
        let volume = 2.0 * 1.0 * 4.0; // box size
        let density = config.mass / volume;
        
        let rb = RigidBodyBuilder::dynamic()
        .translation(vector![spawn_x, spawn_y, spawn_z])
        .linear_damping(config.linear_damping)
        .angular_damping(config.angular_damping)
        .build();
        
        let collider = ColliderBuilder::cuboid(1.0, 0.5, 2.0)
        .density(density)
        .friction(1.2)
        .build();

        let handle = self.bodies.insert(rb);
        
        self.colliders.insert_with_parent(collider, handle, &mut self.bodies);
        // self.register_simple_car(handle)
        
        // Register the vehicle in our map.
        self.register_car(handle);

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
        let m_wheel = vehicle_mass / wheels as f32;             // kg per wheel
        let omega = 2.0 * std::f32::consts::PI * frequency_hz;  // natural frequency (rad/s)
        let k = m_wheel * omega * omega;                        // N/m
        let c = 2.0  * m_wheel * omega;                         // N*s/m - critical damping
        (k, c)                                                  // spring constant, damper constant
    }
    
    /// GTA-style car placeholder with 4 suspension raycasts.
    pub fn register_car(&mut self, body: RigidBodyHandle) {
        // Find vehicle config & input

        let (k, c) = self.derive_suspension(1500.0, 4, 4.5);

        let w = vec![
            Wheel { offset: point![-0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true  },
            Wheel { offset: point![ 0.8, -0.3,  1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: false, steer: true  },
            Wheel { offset: point![-0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false },
            Wheel { offset: point![ 0.8, -0.3, -1.5], rest_length: 0.5, max_length: 0.9, radius: 0.35, stiffness: k, damping: c, drive: true,  steer: false },
        ];

        self.wheels.insert(body, w);
    }

    // -------------------------------------------------------------------------
    // Suspension raycast + forces
    // -------------------------------------------------------------------------
    fn apply_suspension(&mut self, _dt: Real) {
        use std::time::{Instant, Duration};
        static mut LAST_LOG: Option<Instant> = None;
    
        let now = Instant::now();
        let log_this_frame = unsafe {
            match LAST_LOG {
                Some(t) if now.duration_since(t) < Duration::from_secs(1) => false,
                _ => {
                    LAST_LOG = Some(now);
                    true
                }
            }
        };


        // Update spatial queries (raycasts)
        self.query_pipeline.update(&self.colliders);

        let solid = true;

        // Collect forces first (borrow rules)
        let mut forces: Vec<(RigidBodyHandle, Vector<Real>, Point<Real>)> = Vec::new();
        
        // ------------------------------------------------------------
        // For EACH vehicle body
        // ------------------------------------------------------------
        for (&handle, wheels) in self.wheels.iter() {
            let Some(body) = self.bodies.get(handle) else { continue; };
            
            if log_this_frame {
                println!("[VEHICLE] {:?}", handle);
            }
            
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
            let Some(vehicle) = self.vehicles.values().find(|v| v.body == handle) else {
                continue;
            };

            // Chassis basis (world-space)
            let chassis_forward = rot * vector![0.0, 0.0, -1.0];
            let chassis_right   = rot * vector![1.0, 0.0,  0.0];

            // --------------------------------------------------------
            // For EACH wheel (this is the ONLY inner loop)
            // --------------------------------------------------------
            for wheel in wheels.iter() {

                // Ray origin = wheel attachment in world space
                let origin: Point<Real> = pos * wheel.offset;

                // Ray direction (downwards)
                let dir: Vector<Real> = vector![0.0, -1.0, 0.0];

                // Max suspension travel
                let max_dist = wheel.rest_length + wheel.max_length + wheel.radius;

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

                let dist = toi - wheel.radius;
                let compression =
                    (wheel.rest_length - dist).clamp(0.0, wheel.max_length);

                if compression <= 0.0 {
                    continue;
                }

                // ----------------------------------------------------
                // POINT VELOCITY (critical Cannon detail)
                // ----------------------------------------------------
                let r: Vector<Real> = hit_point.coords - com.coords;
                let point_vel: Vector<Real> = linvel + angvel.cross(&r);

                let suspension_vel = point_vel.dot(&ground_n);

                // ----------------------------------------------------
                // Spring + damper (CRITICALLY DAMPED)
                // ----------------------------------------------------
                let spring_force = wheel.stiffness * compression;
                // let damper_force = wheel.damping * suspension_vel;
                let damper_force = (-wheel.damping * suspension_vel)
                    .clamp(-spring_force * 2.0, spring_force * 2.0); // limit damper force
                
                let mut normal_force = spring_force + damper_force;

                // Wheel cannot pull the ground
                if normal_force < 0.0 {
                    normal_force = 0.0;
                }

                normal_force = normal_force.min(25_000.0);

                if normal_force <= 0.0 {
                    continue; // wheel not grounded
                }
                #[cfg(debug_assertions)]
                if normal_force > 0.0 && wheel.drive && vehicle.throttle.abs() > 0.01 {
                    println!(
                        "  DRIVE wheel | normal={:.0}N | traction cap={:.0}N",
                        normal_force,
                        normal_force * 0.8
                    );
                }

                // let suspension_force = ground_n * normal_force;
                // forces.push((handle, suspension_force, hit_point));
                let suspension_impulse = ground_n * (normal_force * _dt);
                forces.push((handle, suspension_impulse, hit_point));

                #[cfg(debug_assertions)]
                {
                    println!(
                        "[SUSP] body={:?} wheel_offset={:?}",
                        handle, wheel.offset
                    );
                    println!(
                        "  compression={:.3} m | spring={:.1} N | damper={:.1} N",
                        compression, spring_force, damper_force
                    );
                    println!(
                        "  normal_force={:.1} N | suspension_vel={:.3} m/s",
                        normal_force, suspension_vel
                    );
                }


                // ----------------------------------------------------
                // TRACTION (longitudinal)
                // ----------------------------------------------------
                if wheel.drive {
                    // Forward projected onto ground plane
                    let fwd = {
                        let v = chassis_forward - ground_n * chassis_forward.dot(&ground_n);
                        if v.magnitude() > 1e-6 { v.normalize() } else { vector![0.0, 0.0, -1.0] }
                    };

                    let engine_force =
                        vehicle.throttle * vehicle.config.engine_force;

                    // Grip limited by normal force (Cannon-style)
                    let max_long = normal_force * 0.8; // μ ≈ 0.8 tire friction
                    let traction = engine_force.clamp(-max_long, max_long);
                    let traction_impulse = fwd * (traction * _dt);
                    forces.push((handle, traction_impulse, hit_point));
                    
                    #[cfg(debug_assertions)]
                    {
                        println!(
                            "  traction={:.1} N | throttle={:.2}",
                            traction, vehicle.throttle
                        );
                    }
                }
                
                // ----------------------------------------------------
                // SIDE FRICTION (slip damping)
                // ----------------------------------------------------
                let side = {
                    let v = chassis_right - ground_n * chassis_right.dot(&ground_n);
                    if v.magnitude() > 1e-6 { v.normalize() } else { vector![1.0, 0.0, 0.0] }
                };
                
                let side_speed = point_vel.dot(&side);
                let side_force =
                -side_speed
                * vehicle.config.sideways_grip
                * normal_force
                * 0.001;
                
                let side_impulse = side * (side_force * _dt);
                forces.push((handle, side_impulse, hit_point));
            }
        }

        // ------------------------------------------------------------
        // APPLY ALL FORCES (single mutable pass)
        // ------------------------------------------------------------
        for (handle, force, point) in forces {
            if let Some(body) = self.bodies.get_mut(handle) {
                // body.add_force_at_point(force, point, true);
                body.apply_impulse_at_point(force, point, true);
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
        }
    }

    pub fn step(&mut self, dt: Real) {
        let hooks = ();
        let mut events = ();

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
