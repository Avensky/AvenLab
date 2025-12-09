// src/physics.rs

use rapier3d::prelude::*;
use std::collections::HashMap;

/// Configuration for a single suspension / wheel.
#[derive(Clone, Debug)]
pub struct WheelConfig {
    /// Wheel attachment point in *local chassis space* (a point).
    pub local_offset: Point<Real>,
    /// Local suspension direction (usually down: (0, -1, 0)).
    pub suspension_dir: Vector<Real>,
    /// Rest length of the suspension (meters).
    pub rest_length: Real,
    /// Max extra travel *beyond* rest length raycast (meters).
    pub max_travel: Real,
    /// Wheel radius (meters).
    pub radius: Real,
    /// Hooke spring stiffness (N/m).
    pub stiffness: Real,
    /// Damping (N·s/m).
    pub damping: Real,
}

pub struct Vehicle {
    pub body: RigidBodyHandle,
    pub throttle: f32,
    pub steer: f32,
    pub pitch: f32,
    pub yaw: f32,
    pub roll: f32,
    pub ascend: f32,
    pub steer_angle: f32,
}

#[derive(Default)]
pub struct VehicleSuspension {
    /// Each dynamic body handle → its wheels.
    pub vehicles: HashMap<RigidBodyHandle, Vec<WheelConfig>>,
}

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
    pub suspension: VehicleSuspension,
    pub vehicles: HashMap<String, Vehicle>, // playerId → vehicle   
}




impl PhysicsWorld {

    pub fn apply_player_input(
        &mut self,
        player_id: &str,
        throttle: f32,
        steer: f32,
        ascend: f32,
        pitch: f32,
        yaw: f32,
        roll: f32,
    ) {

        // println!("Applying input for {} throttle={} steer={}", player_id, throttle, steer);

        if let Some(v) = self.vehicles.get_mut(player_id) {
            v.throttle = throttle;
            v.steer = steer;
            v.pitch = pitch;
            v.roll = roll;
            v.yaw = yaw;
            v.ascend = ascend;
        }
    }


    // pub fn set_body_position(&mut self, handle: RigidBodyHandle, pos: [f32; 3]) {
    //     if let Some(body) = self.bodies.get_mut(handle) {
    //         body.set_translation(vector![pos[0], pos[1], pos[2]], true);
    //     }
    // }
    

    pub fn spawn_vehicle_for_player(&mut self, id: String, position: [f32; 3]) {
        let rb = RigidBodyBuilder::dynamic()
            .translation(vector![position[0], position[1], position[2]])
            .linear_damping(0.3)
            .angular_damping(1.0)
            .build();

        let handle = self.bodies.insert(rb);

        // Collider: car-sized box
        let collider = ColliderBuilder::cuboid(1.0, 0.5, 2.0)
            .friction(1.0)
            .build();
        self.colliders.insert_with_parent(collider, handle, &mut self.bodies);

        // Attach suspension (optional)
        self.register_simple_car(handle);

        // Add vehicle entry
        self.vehicles.insert(id.clone(), Vehicle {
            body: handle,
            throttle: 0.0,
            steer: 0.0,
            pitch: 0.0,
            yaw: 0.0,
            roll: 0.0,
            ascend: 0.0,
            steer_angle: 0.0,
        });
    }

  

    pub fn new() -> Self {
        let gravity = vector![0.0, -9.81, 0.0];

        let bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();

        // --- Build terrain heightfield from our JSON description ---
        let hf = PhysicsWorld::export_heightfield();
        let nx = hf["nx"].as_u64().unwrap() as usize;
        let ny = hf["ny"].as_u64().unwrap() as usize;
        let width = hf["width"].as_f64().unwrap() as f32;
        let depth = hf["depth"].as_f64().unwrap() as f32;

        let heights: Vec<f32> = hf["heights"]
            .as_array().unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap() as f32)
            .collect();

        // Rapier 0.22 API: DMatrix + scale vector.
        let height_matrix = rapier3d::na::DMatrix::from_row_slice(ny, nx, &heights);
        let scale = vector![width, 1.0, depth];

        let terrain_collider = ColliderBuilder::heightfield(height_matrix, scale).build();
        colliders.insert(terrain_collider);

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
            suspension: VehicleSuspension::default(),
            vehicles: HashMap::new(), 
        }
    }


    fn export_heightfield() -> serde_json::Value {
        let nx: usize = 64;
        let ny: usize = 64;
        let width = 200.0_f32;
        let depth = 200.0_f32;

        let dx = width / (nx - 1) as f32;
        let dz = depth / (ny - 1) as f32;

        let mut heights = vec![0.0_f32; nx * ny];

        for iy in 0..ny {
            for ix in 0..nx {
                let i = iy * nx + ix;

                // World-space x/z
                let _x = -width * 0.5 + ix as f32 * dx;
                let _z = -depth * 0.5 + iy as f32 * dz;

                // TODO: use real heightmap here
                heights[i] = 0.0;
            }
        }

        serde_json::json!({
            "nx": nx,
            "ny": ny,
            "width": width,
            "depth": depth,
            "heights": heights
        })
    }



    /// GTA-style car placeholder with 4 suspension raycasts.
    pub fn register_simple_car(&mut self, body_handle: RigidBodyHandle) {
        let half_length = 1.5; // front/back
        let half_width = 0.8;  // left/right
        let rest_length = 0.4;
        let max_travel = 0.3;
        let radius = 0.35;

        let stiffness = 18_000.0;
        let damping = 2_600.0;

        let down = vector![0.0, -1.0, 0.0];

        let wheels = vec![
            // Front-left
            WheelConfig {
                local_offset: point![-half_width, -0.2, half_length],
                suspension_dir: down,
                rest_length,
                max_travel,
                radius,
                stiffness,
                damping,
            },
            // Front-right
            WheelConfig {
                local_offset: point![half_width, -0.2, half_length],
                suspension_dir: down,
                rest_length,
                max_travel,
                radius,
                stiffness,
                damping,
            },
            // Rear-left
            WheelConfig {
                local_offset: point![-half_width, -0.2, -half_length],
                suspension_dir: down,
                rest_length,
                max_travel,
                radius,
                stiffness,
                damping,
            },
            // Rear-right
            WheelConfig {
                local_offset: point![half_width, -0.2, -half_length],
                suspension_dir: down,
                rest_length,
                max_travel,
                radius,
                stiffness,
                damping,
            },
        ];

        self.suspension.vehicles.insert(body_handle, wheels);
    }

    /// Suspension raycast pass – call this *before* stepping the pipeline.
    fn apply_vehicle_suspension(&mut self, _dt: Real) {
        self.query_pipeline.update(&self.colliders);

        let filter = QueryFilter::default();
        let solid = true;

        let mut forces: Vec<(RigidBodyHandle, Vector<Real>, Point<Real>)> = Vec::new();

        for (handle, wheels) in self.suspension.vehicles.iter() {
            // get the vehicle config
            let vehicle_opt = self.vehicles.iter_mut().find(|(_, v)| v.body == *handle);
            if vehicle_opt.is_none() {
                continue;
            }
            let (_player_id, v) = vehicle_opt.unwrap();

            if let Some(body) = self.bodies.get(*handle) {
                let body_pos = body.position();
                let linvel = *body.linvel();

                // steering angle
                let steer_angle = v.steer * 0.4;
                v.steer_angle = steer_angle;

                for (i, wheel) in wheels.iter().enumerate() {
                    let world_origin = body_pos * wheel.local_offset;
                    let dir = (body_pos.rotation * wheel.suspension_dir).normalize();

                    let max_dist = wheel.rest_length + wheel.max_travel + wheel.radius;
                    let ray = Ray::new(world_origin, dir);

                    if let Some((_, toi)) =
                        self.query_pipeline.cast_ray(&self.bodies, &self.colliders, &ray, max_dist, solid, filter)
                    {
                        // compute suspension
                        let dist = toi - wheel.radius;
                        let compression = wheel.rest_length - dist;
                        if compression <= 0.0 {
                            continue;
                        }

                        let suspension_vel = linvel.dot(&dir);

                        let spring = wheel.stiffness * compression;
                        let damping = wheel.damping * (-suspension_vel);

                        let force_mag = (spring + damping).max(0.0);
                        let force = dir * force_mag;

                        let contact_point = world_origin + dir * toi;

                        forces.push((*handle, force, contact_point));

                        // TRACTION FORCE (only rear wheels)
                        if i == 2 || i == 3 {
                            let forward = body_pos.rotation * vector![
                                steer_angle.sin(),
                                0.0,
                                -steer_angle.cos()
                            ];

                            let traction_force = forward * (v.throttle * 2500.0);
                            forces.push((*handle, traction_force, contact_point));
                        }
                    }
                }
            }
        }

        // apply all forces
        for (handle, force, point) in forces {
            if let Some(body) = self.bodies.get_mut(handle) {
                body.add_force_at_point(force, point, true);
            }
        }
    }




    pub fn step(&mut self, dt: Real) {
        let hooks = ();
        let mut events = ();

        // 1) Apply suspension forces based on current pose/vel.
        self.apply_vehicle_suspension(dt);

        // 2) Step physics.
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

        // 3) TEMP: clamp all bodies above the ground plane at y = 0.0
        for (_, body) in self.bodies.iter_mut() {
            let mut pos = *body.translation();
            if pos.y < 0.0 {
                pos.y = 0.0;
                body.set_translation(pos, true);

                let mut vel = *body.linvel();
                if vel.y < 0.0 {
                    vel.y = 0.0;
                    body.set_linvel(vel, true);
                }
            }
        }
    }
}
