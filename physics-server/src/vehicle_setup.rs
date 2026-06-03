use rapier3d::prelude::*;
use crate::physics::PhysicsWorld;
use crate::vehicle_state::{VehicleConfig, Wheel};
use crate::aven_tire::state::TireState;

impl PhysicsWorld {
    pub(crate) fn suspension_from_sag(
        &self,
        vehicle_mass: f32,
        wheels: usize,
        sag_m: f32,
        zeta: f32,
    ) -> (f32, f32) {
        let m = vehicle_mass / wheels as f32;
        let g = 9.81_f32;
        let f_static = m * g;
        let k = f_static / sag_m.max(1e-3);
        let c = 2.0 * zeta * (k * m).sqrt();
        (k, c)
    }

    pub fn register_vehicle(&mut self, body: RigidBodyHandle, config: VehicleConfig) {
        let (k, c) = self.suspension_from_sag(config.mass, config.wheels, config.suspension_sag, config.suspension_damping_ratio);

        let half_track = config.track_width * 0.5;
        let half_wheelbase = config.wheelbase * 0.5;
        let wheel_forward_offset = config.wheel_forward_offset;

        let rest_length = config.suspension_rest_length;     // meters (neutral suspension length)
        let max_length = config.suspension_max_length;      // meters (max suspension extension + compression from rest)
        let radius = config.wheel_radius;
        let wheel_y = config.wheel_y;
        
        let grounded = false;
        let world_center = [0.0, 0.0, 0.0];
        let world_rotation = [0.0, 0.0, 0.0, 1.0];
        let wheel_speed = 0.0;
        let steer_angle = 0.0;

        let w = vec![
            Wheel {  offset: point![-half_track, wheel_y,  half_wheelbase + wheel_forward_offset], grounded, world_center, world_rotation, wheel_speed, steer_angle, rest_length, max_length, radius, stiffness: k, damping: c, drive: false, steer: true, debug_id: "FL".to_string(), tire_state: TireState::Grip},
            Wheel {  offset: point![half_track, wheel_y,  half_wheelbase + wheel_forward_offset], grounded, world_center, world_rotation, wheel_speed, steer_angle, rest_length, max_length, radius, stiffness: k, damping: c, drive: false, steer: true, debug_id: "FR".to_string(), tire_state: TireState::Grip},
            Wheel {  offset: point![-half_track, wheel_y,  -half_wheelbase + wheel_forward_offset], grounded, world_center, world_rotation, wheel_speed, steer_angle, rest_length, max_length, radius, stiffness: k, damping: c, drive: true,  steer: false, debug_id: "RL".to_string(), tire_state: TireState::Grip},
            Wheel {  offset: point![half_track, wheel_y,  -half_wheelbase + wheel_forward_offset], grounded, world_center, world_rotation, wheel_speed, steer_angle, rest_length, max_length, radius, stiffness: k, damping: c, drive: true,  steer: false, debug_id: "RR".to_string(), tire_state: TireState::Grip},
        ];
        self.wheels.insert(body, w);
    }
}

pub const AE86: VehicleConfig = VehicleConfig {
    mass: 950.0,
    engine_force: 6500.0,
    brake_force: 6500.0,
    max_speed: 50.0,
    linear_damping: 0.08,
    angular_damping: 0.6,
    mu_base: 0.85,
    load_sensitivity: 0.15,

    wheelbase: 2.38,
    track_width: 1.35,
    max_steer_angle: 0.6,
    ackermann: 0.8,
    wheel_forward_offset: 0.08,

    wheels: 4,
    wheel_radius: 0.31,
    suspension_rest_length: 0.18,
    suspension_max_length: 0.30,
    suspension_sag: 0.065,
    suspension_damping_ratio: 1.05,
    wheel_y: -0.31,

    arb_front: 14_000.0,
    arb_rear: 10_000.0,

    abs_enabled: true,
    tcs_enabled: true,
    abs_nx_limit: 0.90,
    tcs_nx_limit: 0.85,

    chassis_half_extents: [0.86, 0.57, 2.1],
    chassis_com_offset: [0.0, -0.15, 0.0],
};

pub const GT86: VehicleConfig = VehicleConfig {
    mass: 1270.0,
    engine_force: 8000.0,
    brake_force: 7500.0,
    max_speed: 55.0,

    wheelbase: 2.57,
    track_width: 1.52,
    wheel_radius: 0.34,
    chassis_half_extents: [1.0, 0.35, 2.1],

    ..AE86
};

pub const BRZ: VehicleConfig = VehicleConfig {
    mass: 1280.0,
    engine_force: 7900.0,
    brake_force: 7500.0,
    max_speed: 55.0,

    wheelbase: 2.57,
    track_width: 1.52,
    wheel_radius: 0.34,
    chassis_half_extents: [1.0, 0.35, 2.1],

    ..GT86
};

pub const CAMARO: VehicleConfig = VehicleConfig {
    mass: 1650.0,
    engine_force: 11000.0,
    brake_force: 9000.0,
    max_speed: 65.0,

    wheelbase: 2.81,
    track_width: 1.60,
    wheel_radius: 0.36,
    chassis_half_extents: [1.05, 0.4, 2.35],

    arb_front: 18_000.0,
    arb_rear: 14_000.0,

    ..GT86
};

pub const TANK: VehicleConfig = VehicleConfig {
    mass: 40_000.0,
    engine_force: 30_000.0,
    brake_force: 30_000.0,
    max_speed: 18.0,
    linear_damping: 0.15,
    angular_damping: 1.2,
    mu_base: 1.2,

    wheelbase: 4.5,
    track_width: 3.2,
    max_steer_angle: 0.0,
    ackermann: 0.0,

    wheels: 4,
    wheel_radius: 0.5,
    suspension_rest_length: 0.3,
    suspension_max_length: 0.5,
    suspension_sag: 0.1,
    suspension_damping_ratio: 1.1,
    wheel_y: -0.35,

    arb_front: 30_000.0,
    arb_rear: 30_000.0,

    tcs_enabled: false,

    chassis_half_extents: [1.5, 0.8, 3.0],
    chassis_com_offset: [0.0, -0.25, 0.0],

    ..AE86
};