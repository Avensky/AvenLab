use rapier3d::prelude::*;
use crate::aven_tire::steering::SteeringState;

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
    pub steer_rate: f32,        // radians / sec
    pub steering: SteeringState,// state
    pub rack_torque: f32,       // from tires
    pub rack_torque_filtered: f32, // from tires
}