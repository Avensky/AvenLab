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
}

impl PhysicsWorld {
    pub fn new() -> Self {
        let gravity = vector![0.0, -9.81, 0.0];

        let bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();

        // Simple ground plane.
        let ground = ColliderBuilder::cuboid(200.0, 1.0, 200.0)
            .translation(vector![0.0, -1.0, 0.0])
            .build();

        colliders.insert(ground);

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
        }
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

        // Temporary buffer
        let mut forces: Vec<(RigidBodyHandle, Vector<Real>, Point<Real>)> = Vec::new();

        for (handle, wheels) in self.suspension.vehicles.iter() {
            if let Some(body) = self.bodies.get(*handle) {
                let body_pos = body.position();
                let linvel = *body.linvel();

                for wheel in wheels {
                    let world_origin = body_pos * wheel.local_offset;
                    let world_dir = body_pos.rotation * wheel.suspension_dir;
                    let dir_norm = world_dir.normalize();

                    let max_toi = wheel.rest_length + wheel.max_travel + wheel.radius;

                    let ray = Ray::new(world_origin, dir_norm);

                    if let Some((_hit, toi)) = self.query_pipeline.cast_ray(
                        &self.bodies,
                        &self.colliders,
                        &ray,
                        max_toi,
                        solid,
                        filter,
                    ) {
                        let hit_dist = (toi - wheel.radius).max(0.0);
                        let compression = (wheel.rest_length - hit_dist)
                            .clamp(0.0, wheel.rest_length + wheel.max_travel);

                        if compression <= 0.0 {
                            continue;
                        }

                        let suspension_vel = linvel.dot(&dir_norm);
                        let spring = wheel.stiffness * compression;
                        let damping = wheel.damping * (-suspension_vel);

                        let force_mag = (spring + damping).max(0.0);
                        if force_mag <= 0.0 {
                            continue;
                        }

                        let force = dir_norm * force_mag;
                        let contact_point = world_origin + dir_norm * toi;

                        forces.push((*handle, force, contact_point));
                    }
                }
            }
        }

        // Apply all forces AFTER raycasting
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
    }

    /// Spawn a vehicle body (GTA-style car placeholder).
    pub fn create_vehicle_body(&mut self) -> RigidBodyHandle {
        let rb = RigidBodyBuilder::dynamic()
            .translation(vector![0.0, 3.0, 0.0])
            .linear_damping(4.0)
            .angular_damping(4.0)
            .build();

        let handle = self.bodies.insert(rb);

        // Mark it as a car with suspension.
        self.register_simple_car(handle);

        // Box-shaped car body.
        let collider = ColliderBuilder::cuboid(0.9, 0.5, 2.0).build();
        self.colliders
            .insert_with_parent(collider, handle, &mut self.bodies);

        handle
    }

    /// Spawn a drone/jet body (placeholder for air/sea craft).
    pub fn create_drone_body(&mut self) -> RigidBodyHandle {
        let rb = RigidBodyBuilder::dynamic()
            .translation(vector![0.0, 5.0, 0.0])
            .linear_damping(1.5)
            .angular_damping(1.5)
            .build();

        let handle = self.bodies.insert(rb);

        // Sphere as drone placeholder.
        let collider = ColliderBuilder::ball(0.5).build();
        self.colliders
            .insert_with_parent(collider, handle, &mut self.bodies);

        handle
    }

    /// Arcade vehicle physics (GTA-style).
    pub fn apply_vehicle_input(
        &mut self,
        handle: RigidBodyHandle,
        throttle: f32,
        steer: f32,
    ) {
        if let Some(body) = self.bodies.get_mut(handle) {
            let rot = body.rotation();
            let forward = rot * vector![0.0, 0.0, -1.0];
            let right = rot * vector![1.0, 0.0, 0.0];

            // Forward acceleration.
            let max_force = 2000.0;
            let force = forward * (throttle.clamp(-1.0, 1.0) * max_force);
            body.add_force(force, true);

            // Steering torque (yaw).
            let steer_scale = 50.0;
            let torque = vector![0.0, steer.clamp(-1.0, 1.0) * steer_scale, 0.0];
            body.add_torque(torque, true);

            // Simple traction model: damp sideways velocity.
            let linvel = *body.linvel();
            let sideways_speed = linvel.dot(&right);
            let corrected = linvel - right * sideways_speed * 0.8;
            body.set_linvel(corrected, true);
        }
    }

    /// Drone / jet / generic 6DOF controller.
    pub fn apply_drone_input(
        &mut self,
        handle: RigidBodyHandle,
        throttle: f32,
        ascend: f32,
        yaw: f32,
        pitch: f32,
        roll: f32,
    ) {
        if let Some(body) = self.bodies.get_mut(handle) {
            let rot = body.rotation();

            let forward = rot * vector![0.0, 0.0, -1.0];
            let up = rot * vector![0.0, 1.0, 0.0];

            let vel = *body.linvel();

            // Lift proportional to speed.
            let lift = up * vel.magnitude() * 10.0;
            body.add_force(lift, true);

            // Drag opposing velocity.
            let drag = -vel * 0.2;
            body.add_force(drag, true);

            // Thrust forward.
            let thrust = forward * (throttle.clamp(-1.0, 1.0) * 500.0);
            body.add_force(thrust, true);

            // Vertical thrust (hover / climb).
            if ascend.abs() > 0.001 {
                body.add_force(up * (ascend.clamp(-1.0, 1.0) * 500.0), true);
            }

            // Rotational control: pitch, yaw, roll.
            let torque = vector![
                pitch.clamp(-1.0, 1.0) * 10.0,
                yaw.clamp(-1.0, 1.0) * 10.0,
                roll.clamp(-1.0, 1.0) * 10.0,
            ];
            body.add_torque(torque, true);
        }
    }
}
