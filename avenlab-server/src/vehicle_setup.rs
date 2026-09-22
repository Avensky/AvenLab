use rapier3d::prelude::*;

use crate::aven_tire::state::TireState;
use crate::physics::PhysicsWorld;
use crate::vehicle_state::{VehicleConfig, Wheel};

// =============================================================================
// VEHICLE LOOKUP
// -----------------------------------------------------------------------------
// Canonical vehicle groups are alphabetical here so frontend ids are easy to
// find. Platform aliases resolve to the same authoritative physics config.
// =============================================================================

pub fn config_for_vehicle(vehicle_id: &str) -> Option<VehicleConfig> {
    match vehicle_id.trim().to_ascii_lowercase().as_str() {
        // AE86
        "ae86" | "toyota-ae86" | "toyota_ae86" => Some(AE86),

        // BRZ / FR-S
        "brz" | "subaru-brz" | "subaru_brz"
        | "frs" | "fr-s" | "fr_s"
        | "scion-frs" | "scion-fr-s" | "scion_frs" | "scion_fr_s" => Some(BRZ),

        // Camaro
        "camaro" | "camaro-2017" | "camaro_2017" => Some(CAMARO),

        // GT86
        "gt86" | "toyota-gt86" | "toyota_gt86" => Some(GT86),

        // GR Supra (A90 / 2020)
        "supra" | "supra-2020" | "supra_2020"
        | "gr-supra" | "gr_supra"
        | "toyota-supra" | "toyota_supra"
        | "a90" | "toyota-a90" | "toyota_a90" => Some(SUPRA),

        // Tank
        "tank" => Some(TANK),

        _ => None,
    }
}

// =============================================================================
// VEHICLE REGISTRATION
// =============================================================================

impl PhysicsWorld {
    pub(crate) fn suspension_from_sag(
        &self,
        vehicle_mass: f32,
        wheel_count: usize,
        sag_m: f32,
        damping_ratio: f32,
    ) -> (f32, f32) {
        let sprung_mass_per_wheel = vehicle_mass / wheel_count as f32;
        let gravity = 9.81_f32;
        let static_load = sprung_mass_per_wheel * gravity;
        let stiffness = static_load / sag_m.max(1.0e-3);
        let damping =
            2.0 * damping_ratio * (stiffness * sprung_mass_per_wheel).sqrt();

        (stiffness, damping)
    }

    pub fn register_vehicle(
        &mut self,
        body: RigidBodyHandle,
        config: VehicleConfig,
    ) {
        let (stiffness, damping) = self.suspension_from_sag(
            config.mass,
            config.wheels,
            config.suspension_sag,
            config.suspension_damping_ratio,
        );

        let half_front_track = config.front_track_width * 0.5;
        let half_rear_track = config.rear_track_width * 0.5;
        let front_z = config.front_axle_z;
        let rear_z = config.rear_axle_z;

        let make_wheel = |
            x: Real,
            z: Real,
            drive: bool,
            steer: bool,
            debug_id: &str,
        | Wheel {
            // Dynamic suspension state
            compression: 0.0,
            compression_ratio: 0.0,
            grounded: false,

            // Local and world transforms
            offset: point![x, config.wheel_y, z],
            world_center: [0.0, 0.0, 0.0],
            world_rotation: [0.0, 0.0, 0.0, 1.0],

            // Visual/runtime wheel state
            wheel_speed: 0.0,
            steer_angle: 0.0,

            // Suspension geometry and forces
            rest_length: config.suspension_rest_length,
            max_length: config.suspension_max_length,
            radius: config.wheel_radius,
            stiffness,
            damping,

            // Wheel role
            drive,
            steer,
            debug_id: debug_id.to_string(),
            tire_state: TireState::Grip,
        };

        let wheels = vec![
            make_wheel(-half_front_track, front_z, false, true, "FL"),
            make_wheel(half_front_track, front_z, false, true, "FR"),
            make_wheel(-half_rear_track, rear_z, true, false, "RL"),
            make_wheel(half_rear_track, rear_z, true, false, "RR"),
        ];

        self.wheels.insert(body, wheels);
    }
}

// =============================================================================
// VEHICLE CONFIGURATIONS
// -----------------------------------------------------------------------------
// Within each config, fields are organized by function:
//   1. Performance and identity
//   2. Physical dimensions
//   3. Steering and wheel layout
//   4. Suspension
//   5. Handling and damping
//   6. Anti-roll bars
//   7. Driver assists
//
// Derived configs list only their defining overrides and inherit the rest.
// =============================================================================

// -----------------------------------------------------------------------------
// BASELINE / CLASSIC RWD SPORTS CAR
// -----------------------------------------------------------------------------

pub const AE86: VehicleConfig = VehicleConfig {
    // Performance and identity
    mass: 950.0,
    engine_force: 6_500.0,
    brake_force: 6_500.0,
    max_speed: 50.0,

    // Physical dimensions
    chassis_half_extents: [0.86, 0.35, 2.10],
    chassis_com_offset: [0.0, 0.0, 0.0],
    // Axle centers in chassis-local Z. Their difference is the wheelbase.
    front_axle_z: 1.27,
    rear_axle_z: -1.11,
    front_track_width: 1.35,
    rear_track_width: 1.35,
    wheel_radius: 0.31,
    wheel_y: -0.31,

    // Steering and wheel layout
    wheels: 4,
    max_steer_angle: 0.60,
    ackermann: 0.80,

    // Suspension
    suspension_rest_length: 0.18,
    suspension_max_length: 0.12,
    suspension_sag: 0.065,
    suspension_damping_ratio: 1.05,

    // Handling and damping
    linear_damping: 0.08,
    angular_damping: 0.60,
    mu_base: 0.85,
    load_sensitivity: 0.15,

    // Anti-roll bars
    arb_front: 14_000.0,
    arb_rear: 10_000.0,

    // Driver assists
    abs_enabled: true,
    abs_nx_limit: 0.90,
    tcs_enabled: true,
    tcs_nx_limit: 0.85,
};

// -----------------------------------------------------------------------------
// TOYOTA 86 / SUBARU BRZ PLATFORM
// -----------------------------------------------------------------------------

pub const GT86: VehicleConfig = VehicleConfig {
    // Performance and identity
    mass: 1_270.0,
    engine_force: 8_000.0,
    brake_force: 7_500.0,
    max_speed: 55.0,

    // Physical dimensions
    chassis_half_extents: [1.00, 0.35, 2.10],
    front_axle_z: 1.365,
    rear_axle_z: -1.205,
    front_track_width: 1.52,
    rear_track_width: 1.52,
    wheel_radius: 0.34,

    ..AE86
};

pub const BRZ: VehicleConfig = VehicleConfig {
    // Performance and identity
    mass: 1_280.0,
    engine_force: 8_500.0,
    brake_force: 7_600.0,
    max_speed: 62.0, // approximately 139 mph

    // Physical dimensions: approximately 1.78 m x 0.70 m x 4.24 m.
    chassis_half_extents: [0.89, 0.35, 2.12],
    // Equivalent to the previous 2.60 m wheelbase with a 0.08 m
    // forward offset, but now each axle can be aligned independently.
    front_axle_z: 1.38,
    rear_axle_z: -1.22,
    // The widebody rear axle sits farther out than the front.
    front_track_width: 1.68,
    rear_track_width: 1.78,
    wheel_radius: 0.33,
    wheel_y: -0.33,

    ..GT86
};

// -----------------------------------------------------------------------------
// HIGH-POWER ROAD CAR
// -----------------------------------------------------------------------------

pub const CAMARO: VehicleConfig = VehicleConfig {
    // Performance and identity
    mass: 1_650.0,
    engine_force: 11_000.0,
    brake_force: 9_000.0,
    max_speed: 65.0,

    // Physical dimensions
    chassis_half_extents: [1.05, 0.40, 2.35],
    front_axle_z: 1.485,
    rear_axle_z: -1.325,
    front_track_width: 1.60,
    rear_track_width: 1.60,
    wheel_radius: 0.36,

    // Heavier anti-roll tuning
    arb_front: 18_000.0,
    arb_rear: 14_000.0,

    ..GT86
};

// -----------------------------------------------------------------------------
// MODERN RWD SPORTS CAR
// -----------------------------------------------------------------------------

pub const SUPRA: VehicleConfig = VehicleConfig {
    // Performance and identity
    mass: 1_540.0,
    engine_force: 10_500.0,
    brake_force: 8_800.0,
    max_speed: 69.0, // approximately 155 mph

    // Collider dimensions intentionally cover the lower body, not the roof.
    // The wide-body GLB measures about 2.03 m x 1.29 m x 4.51 m overall.
    chassis_half_extents: [1.00, 0.36, 2.20],
    chassis_com_offset: [0.0, -0.08, 0.0],

    // These axle centers and tracks come directly from supra_2020.glb so the
    // backend wheels, debug wheels and visual wheel assemblies line up.
    front_axle_z: 1.239,
    rear_axle_z: -1.227,
    front_track_width: 1.698,
    rear_track_width: 1.778,
    wheel_radius: 0.325,
    wheel_y: -0.325,

    // Steering and wheel layout
    wheels: 4,
    max_steer_angle: 0.55,
    ackermann: 0.85,

    // Suspension
    suspension_rest_length: 0.20,
    suspension_max_length: 0.14,
    suspension_sag: 0.070,
    suspension_damping_ratio: 1.08,

    // Handling and damping
    linear_damping: 0.07,
    angular_damping: 0.62,
    mu_base: 0.95,
    load_sensitivity: 0.14,

    // Anti-roll bars
    arb_front: 17_000.0,
    arb_rear: 13_000.0,

    // Driver assists
    abs_enabled: true,
    abs_nx_limit: 0.92,
    tcs_enabled: true,
    tcs_nx_limit: 0.88,
};

// -----------------------------------------------------------------------------
// HEAVY / TRACKED VEHICLE
// -----------------------------------------------------------------------------

pub const TANK: VehicleConfig = VehicleConfig {
    // Performance and identity
    mass: 40_000.0,
    engine_force: 30_000.0,
    brake_force: 30_000.0,
    max_speed: 18.0,

    // Physical dimensions
    chassis_half_extents: [1.50, 0.80, 3.00],
    chassis_com_offset: [0.0, -0.25, 0.0],
    front_axle_z: 2.33,
    rear_axle_z: -2.17,
    front_track_width: 3.20,
    rear_track_width: 3.20,
    wheel_radius: 0.50,
    wheel_y: -0.35,

    // Steering and wheel layout
    wheels: 4,
    max_steer_angle: 0.0,
    ackermann: 0.0,

    // Suspension
    suspension_rest_length: 0.30,
    suspension_max_length: 0.50,
    suspension_sag: 0.10,
    suspension_damping_ratio: 1.10,

    // Handling and damping
    linear_damping: 0.15,
    angular_damping: 1.20,
    mu_base: 1.20,
    load_sensitivity: AE86.load_sensitivity,

    // Anti-roll bars
    arb_front: 30_000.0,
    arb_rear: 30_000.0,

    // Driver assists
    abs_enabled: AE86.abs_enabled,
    abs_nx_limit: AE86.abs_nx_limit,
    tcs_enabled: false,
    tcs_nx_limit: AE86.tcs_nx_limit,
};
