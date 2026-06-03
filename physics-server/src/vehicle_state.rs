use bitflags::bitflags;
use rapier3d::prelude::*;
use serde::Serialize;
use crate::aven_tire::state::TireState;
use crate::aven_tire::steering::SteeringState;

#[derive(Serialize, Clone, Copy, Debug)]
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

    pub wheel_forward_offset: f32,
    pub wheels: usize,                  // number of wheels (for load distribution);
    pub wheel_radius: f32,              // meters (for visual size + suspension geometry)       
    pub suspension_rest_length: f32,    // meters (neutral suspension length)
    pub suspension_max_length: f32,     // meters (max suspension extension + compression from rest)
    pub suspension_sag: f32,            // 0..1 (how much the suspension compresses under the vehicle's weight)
    pub suspension_damping_ratio: f32,  // 0.7–1.0 for typical car suspension
    pub wheel_y: f32,                   // vertical position of the wheel relative to the chassis center (meters, usually negative) 
    
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
    // ==========================================
    // Physics
    // ==========================================
    pub body: RigidBodyHandle,  // the chassis body
    pub config: VehicleConfig,  // vehicle parameters

    // ==========================================
    // Inputs
    // ==========================================
    pub throttle: f32,          // -1.0 (full reverse) .. 1.0 (full forward)
    pub steer: f32,             // -1.0 (full left) .. 1.0 (full right)
    pub brake: f32,             // 0.0 (no brake) .. 1.0 (full brake)
    pub pitch: f32,             // for flying vehicles
    pub yaw: f32,               // for flying vehicles
    pub roll: f32,              // for flying vehicles
    pub ascend: f32,            // for flying vehicles

    // ==========================================
    // State
    // ==========================================
    pub steer_angle: f32,       // current steering angle (radians)
    pub steer_rate: f32,        // radians / sec
    pub steering: SteeringState,// state
    pub rack_torque: f32,       // from tires
    pub rack_torque_filtered: f32, // from tires

    // ==========================================
    // Bit Masking
    // ==========================================
    pub vehicle_flags: VehicleStateFlags,
    pub player_flags: u16, // later: bitflags too

    // ==========================================
    // Telemetry
    // ==========================================
    pub rpm: f32,
    pub gear: i32,
    pub fuel: f32,
    pub engine_temp: f32,
    pub engine_torque: f32,
}

bitflags! {
    #[derive(Clone, Copy, Debug, Default)]
    pub struct VehicleStateFlags: u16 {
        const ENGINE_ON     = 1 << 0;
        const HEADLIGHTS    = 1 << 1;
        const BLINKER_LEFT  = 1 << 2;
        const BLINKER_RIGHT = 1 << 3;
        const HAZARDS       = 1 << 4;
        const ABS           = 1 << 5;
        const TCS           = 1 << 6;
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PhysicsWheelSnapshot {
    pub id: String,
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub radius: f32,
    pub wheel_speed: f32,
    pub steer_angle: f32,
    pub grounded: bool,
}

#[derive(Clone, Debug)] 
pub struct Wheel {
    pub debug_id: String,        // "FL", "FR", "RL", "RR"
    pub offset: Point<Real>,     // position in chassis local space
    pub rest_length: Real,       // suspension neutral length
    pub max_length: Real,        // max compression + extension
    pub radius: Real,            // wheel radius

    pub grounded: bool,             // is the wheel currently touching the ground?
    pub world_center: [f32; 3],     // world position of wheel center (for debug visualization)
    pub world_rotation: [f32; 4],   // world rotation of wheel (for debug visualization)
    pub wheel_speed: f32,           // linear speed at the contact patch (for debug visualization)
    pub steer_angle: f32,           // current steer angle (for debug visualization)

    pub stiffness: Real,         // spring constant
    pub damping: Real,           // damper constant

    pub drive: bool,             // is this a driven wheel?
    pub steer: bool,             // is this a steering wheel?

    pub tire_state: TireState,
}