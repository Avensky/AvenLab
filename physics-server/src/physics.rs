use rapier3d::prelude::*;

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
}

impl PhysicsWorld {
    pub fn new() -> Self {
        let gravity = vector![0.0, -9.81, 0.0];

        let bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();

        // Simple ground
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
        }
    }

    pub fn step(&mut self) {
        let hooks = ();
        let events = ();

        self.pipeline.step(
            &self.gravity,
            &IntegrationParameters::default(),
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.joints,
            &mut self.multibody_joints,
            &mut self.ccd,
            Some(&mut self.query_pipeline),
            &events,
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

        // Box-shaped car body
        let collider = ColliderBuilder::cuboid(0.9, 0.5, 2.0).build();
        self.colliders
            .insert_with_parent(collider, handle, &mut self.bodies);

        handle
    }

    /// Spawn a drone/jet body.
    pub fn create_drone_body(&mut self) -> RigidBodyHandle {
        let rb = RigidBodyBuilder::dynamic()
            .translation(vector![0.0, 5.0, 0.0])
            .linear_damping(1.5)
            .angular_damping(1.5)
            .build();

        let handle = self.bodies.insert(rb);

        // Sphere as drone placeholder
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

            // Forward acceleration
            let max_force = 2000.0;
            let force = forward * (throttle.clamp(-1.0, 1.0) * max_force);
            body.add_force(force, true);

            // Steering torque (yaw)
            let steer_scale = 50.0;
            let torque = vector![0.0, steer.clamp(-1.0, 1.0) * steer_scale, 0.0];
            body.add_torque(torque, true);

            // Simple traction model: damp sideways velocity
            let linvel = *body.linvel();
            let sideways_speed = linvel.dot(&right);
            let corrected = linvel - right * sideways_speed * 0.8;
            body.set_linvel(corrected, true);
        }
    }

    /// Drone / jet flight controller.
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

            // Lift proportional to speed
            let lift = up * vel.magnitude() * 10.0;
            body.add_force(lift, true);

            // Drag opposing velocity
            let drag = -vel * 0.2;
            body.add_force(drag, true);

            // Thrust forward
            let thrust = forward * (throttle.clamp(-1.0, 1.0) * 500.0);
            body.add_force(thrust, true);

            // Vertical thrust (hover / climb)
            if ascend.abs() > 0.001 {
                body.add_force(up * (ascend.clamp(-1.0, 1.0) * 500.0), true);
            }

            // Rotational control: pitch, yaw, roll
            let torque = vector![
                pitch.clamp(-1.0, 1.0) * 10.0,
                yaw.clamp(-1.0, 1.0) * 10.0,
                roll.clamp(-1.0, 1.0) * 10.0,
            ];
            body.add_torque(torque, true);
        }
    }
}
