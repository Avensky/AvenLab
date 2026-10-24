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
    pub front_axle_z: f32,       // chassis-local meters; forward is positive Z
    pub rear_axle_z: f32,        // chassis-local meters; rearward is negative Z
    pub front_track_width: f32,  // front wheel-center distance, left to right
    pub rear_track_width: f32,   // rear wheel-center distance, left to right
    pub max_steer_angle: f32,    // radians
    pub ackermann: f32,          // 0..1 blend (0 = parallel, 1 = full ackermann)

    pub wheels: usize,                  // number of wheels (for load distribution);
    pub wheel_radius: f32,              // meters (for visual size + suspension geometry)
    // This solver uses rest + max as its zero-load/full-droop length and caps
    // compression at max. These names are retained for the network config.
    pub suspension_rest_length: f32,    // m; shortest represented suspension length
    pub suspension_max_length: f32,     // m; travel from full droop to maximum compression
    pub suspension_sag: f32,            // m; desired compression from full droop under static load
    pub suspension_damping_ratio: f32,  // dimensionless; 1 = critical damping in the quarter-car approximation
    pub wheel_y: f32,                   // m; SUSPENSION MOUNT Y relative to the body origin, not wheel center Y

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
    // The only massive collider is translated by this local offset. Therefore
    // it moves BOTH the collision box and the COM; it is not an independent
    // center-of-mass adjustment. Its world COM is read directly from Rapier.
    pub chassis_com_offset: [f32; 3],
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
    pub steer: f32,             // positive = left toward local -X; negative = right toward +X
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
    pub offset: Point<Real>,     // suspension mount in body-local meters
    pub rest_length: Real,       // minimum represented suspension length (m)
    pub max_length: Real,        // available compression from full droop (m)
    pub radius: Real,            // wheel radius

    pub grounded: bool,             // is the wheel currently touching the ground?
    pub normal_force: f32,          // final load actually applied in the last substep (N)
    pub world_center: [f32; 3],     // world position of wheel center (for debug visualization)
    pub world_rotation: [f32; 4],   // world rotation of wheel (for debug visualization)
    pub wheel_speed: f32,           // rad/s; rolling kinematics for visual spin, not a tire inertia state
    pub steer_angle: f32,           // current steer angle (for debug visualization)

    pub stiffness: Real,         // spring constant
    pub damping: Real,           // damper constant

    pub drive: bool,             // is this a driven wheel?
    pub steer: bool,             // is this a steering wheel?

    pub compression: f32,          // current suspension compression (for debug visualization)
    pub compression_ratio: f32,    // current suspension compression ratio (for debug visualization)

    pub tire_state: TireState,
}

impl VehicleConfig {
    /// Static body-local wheel-center Y for aligning imported visual assets.
    /// The existing body pose and runtime suspension remain authoritative.
    pub fn nominal_wheel_center_y(&self) -> f32 {
        self.wheel_y - self.suspension_rest_length - self.suspension_max_length
            + self.suspension_sag
    }

    /// Nominal body-origin height that gives each upright wheel its target sag.
    /// mount_y = body_y + wheel_y; center_y = road_y + radius;
    /// mount_y - center_y = full_droop - sag. Solve once for body_y.
    /// This is a spawn estimate; Rapier still resolves axle load/pitch at runtime.
    pub fn nominal_chassis_y(&self, road_y: f32) -> f32 {
        road_y + self.wheel_radius
            + self.suspension_rest_length + self.suspension_max_length
            - self.suspension_sag - self.wheel_y
    }

    /// Front-to-rear axle distance used by Ackermann and tire physics.
    #[inline]
    pub fn wheelbase(&self) -> f32 {
        (self.front_axle_z - self.rear_axle_z).abs()
    }
}

impl Wheel {
    /// Shared by contact sensing and final visual placement. Adding a second
    /// rest length in either path would give forces and meshes different travel.
    #[inline]
    pub fn full_droop_length(&self) -> Real {
        self.rest_length + self.max_length
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vehicle_setup::{AE86, BRZ, GT86, CAMARO, SUPRA, TANK};

    #[test]
    fn visual_reference_matches_nominal_wheel_center_in_body_coordinates() {
        for config in [AE86, BRZ, GT86, CAMARO, SUPRA, TANK] {
            let body_y = config.nominal_chassis_y(0.32);
            let world_wheel_y = body_y + config.nominal_wheel_center_y();
            assert!((world_wheel_y - (0.32 + config.wheel_radius)).abs() < 1.0e-5);
        }
    }

    #[test]
    fn every_config_spawns_at_target_sag_above_its_chassis_clearance() {
        for road_y in [0.0, 0.32, 12.0] {
            for config in [AE86, BRZ, GT86, CAMARO, SUPRA, TANK] {
                let body_y = config.nominal_chassis_y(road_y);
                let mount_y = body_y + config.wheel_y;
                let wheel_center_y = road_y + config.wheel_radius;
                let compression = config.suspension_rest_length + config.suspension_max_length
                    - (mount_y - wheel_center_y);
                assert!((compression - config.suspension_sag).abs() < 1.0e-5);
                let bottom = body_y + config.chassis_com_offset[1] - config.chassis_half_extents[1];
                assert!(bottom >= road_y + 0.05);
            }
        }
    }
}
