use rapier3d::prelude::*;

use crate::aven_tire::state::TireState;
use crate::physics::PhysicsWorld;
use crate::vehicle_state::{VehicleConfig, Wheel};
use crate::powertrain::{ROAD_RESOURCES, MUSCLE_RESOURCES, SUPRA_RESOURCES, TANK_RESOURCES};

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

        "enforcer" => Some(VehicleConfig {
            front_axle_z: 1.2426, rear_axle_z: -1.4379, front_track_width: 1.7011, rear_track_width: 1.7257,
            wheel_radius: 0.3470, wheel_y: -0.0431,
            chassis_half_extents: [1.1211, 0.5353, 2.2422], chassis_com_offset: [0., 0.09, 0.],
            suspension_max_length: 0.14, suspension_sag: 0.085, suspension_damping_ratio: 0.96,
            ..GT86
        }),
        "interceptor" => Some(VehicleConfig {
            front_axle_z: 1.3006, rear_axle_z: -1.3804, front_track_width: 1.5149, rear_track_width: 1.6476,
            wheel_radius: 0.3213, wheel_y: -0.0306,
            chassis_half_extents: [1.0493, 0.4970, 2.2272], chassis_com_offset: [0., 0.09, 0.],
            suspension_max_length: 0.14, suspension_sag: 0.085, suspension_damping_ratio: 0.96,
            ..GT86
        }),
        "charger70" => Some(VehicleConfig {
            front_axle_z: 1.6319, rear_axle_z: -1.2921, front_track_width: 1.5409, rear_track_width: 1.5351,
            wheel_radius: 0.3460, wheel_y: -0.1296,
            chassis_half_extents: [0.9915, 0.6208, 2.6327], chassis_com_offset: [0., 0.09, 0.],
            ..CAMARO
        }),
        "skyline34" => Some(VehicleConfig {
            front_axle_z: 1.3365, rear_axle_z: -1.3011, front_track_width: 1.4583, rear_track_width: 1.4682,
            wheel_radius: 0.3233, wheel_y: -0.1031,
            chassis_half_extents: [0.9393, 0.5729, 2.3000], chassis_com_offset: [0., 0.09, 0.],
            suspension_max_length: 0.14, suspension_sag: 0.085, suspension_damping_ratio: 0.96,
            ..GT86
        }),
        "timecar" => Some(VehicleConfig {
            front_axle_z: 1.2727, rear_axle_z: -1.1613, front_track_width: 1.5241, rear_track_width: 1.5084,
            wheel_radius: 0.3136, wheel_y: -0.0924,
            chassis_half_extents: [0.9874, 0.5513, 2.2102], chassis_com_offset: [0., 0.09, 0.],
            suspension_max_length: 0.14, suspension_sag: 0.085, suspension_damping_ratio: 0.96,
            ..GT86
        }),

        // Camaro
        "camaro" | "camaro-2017" | "camaro_2017" => Some(CAMARO),

        // GT86
        "gt86" | "toyota-gt86" | "toyota_gt86" => Some(GT86),

        // GR Supra (A90 / 2020)
        "supra" | "supra-2020" | "supra_2020"
        | "gr-supra" | "gr_supra"
        | "toyota-supra" | "toyota_supra"
        | "a90" | "toyota-a90" | "toyota_a90" => Some(SUPRA),

        "mini" | "mini-cooper" => Some(MINI),
        "sierra" => Some(SIERRA),
        "fortuner" => Some(FORTUNER),
        "landcruiser" => Some(LAND_CRUISER),
        "cx30" => Some(CX30),

        // Tank
        "tank" => Some(TANK),

        // Naval rescue craft; intentionally no wheels or tire contact solver.
        "hawaii-rescue" => Some(HAWAII_RESCUE),

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
        // Static quarter-car approximation, evaluated once at registration.
        // Sag is in METERS, not a 0..1 compression ratio. k = static load / sag;
        // c = 2*zeta*sqrt(k*m) is N*s/m. Damper forces are evaluated per substep.
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
        if config.wheels == 0 {
            self.wheels.insert(body, Vec::new());
            return;
        }
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
            debug_id: &str
        | -> Wheel {
            Wheel {
                // Dynamic suspension state
                compression: 0.0,
                compression_ratio: 0.0,
                grounded: false,
                normal_force: 0.0,

                // The mount is below the body origin; suspension length extends
                // downward from here. It is not an additional mesh wheel offset.
                // Final wheel centers/rotations are sampled after physics integrates.
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
            thermal: Default::default(),
            }
        };

        // Physics coordinates: +Z forward, +X side; these internal IDs are used
        // for Ackermann/ARB. The existing asset-ID mapping occurs once when
        // snapshots are serialized, preserving the current correct visual sides.
        // This implementation registers four wheels for every current config.
        let drive_front = config.tracked || config.front_wheel_drive;
        let drive_rear = config.tracked || !config.front_wheel_drive;
        let wheels = vec![
            make_wheel(-half_front_track, front_z, drive_front, !config.tracked, "FL"),
            make_wheel(half_front_track, front_z, drive_front, !config.tracked, "FR"),
            make_wheel(-half_rear_track, rear_z, drive_rear, false, "RL"),
            make_wheel(half_rear_track, rear_z, drive_rear, false, "RR"),
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
// center_of_mass_height controls roll without changing ride height or collider
// geometry. wheel_y, radius, travel and sag still determine body ride height;
// keep the GLB's static import registration separate from handling tuning.
// =============================================================================

// -----------------------------------------------------------------------------
// BASELINE / CLASSIC RWD SPORTS CAR
// -----------------------------------------------------------------------------

pub const AE86: VehicleConfig = VehicleConfig {
    hull_hp: 500.0,
    front_wheel_drive: false,
    tracked: false,
    resources: ROAD_RESOURCES,
    // Performance and identity
    mass: 950.0,
    engine_force: 7_800.0,
    brake_force: 6_500.0,
    max_speed: 50.0,

    // Physical dimensions
    chassis_half_extents: [0.86, 0.35, 2.10],
    chassis_com_offset: [0.0, 0.0, 0.0],
    center_of_mass_height: 0.50,
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
    linear_damping: 0.006,
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
    tracked: false,
    // Performance and identity
    mass: 1_270.0,
    engine_force: 9_600.0,
    brake_force: 7_500.0,
    max_speed: 55.0,

    // Physical dimensions
    chassis_half_extents: [1.00, 0.35, 2.10],
    center_of_mass_height: 0.46,
    front_axle_z: 1.365,
    rear_axle_z: -1.205,
    front_track_width: 1.52,
    rear_track_width: 1.52,
    wheel_radius: 0.34,

    ..AE86
};

pub const BRZ: VehicleConfig = VehicleConfig {
    tracked: false,
    // Performance and identity
    mass: 1_280.0,
    engine_force: 10_200.0,
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

// CX-30 asset measurements are in metres. The collider follows the bodywork
// and roof, excluding accessories and mirrors. Handling values are alpha tuning.
pub const CX30: VehicleConfig = VehicleConfig {
    mass: 1510.0, engine_force: 10_080.0, brake_force: 8600.0, max_speed: 48.0,
    chassis_half_extents: [0.935,0.695,2.165], chassis_com_offset: [0.0,0.0,0.0],
    front_axle_z: 1.2449, rear_axle_z: -1.3740, front_track_width: 1.6249, rear_track_width: 1.6249,
    wheel_radius: 0.3406, wheel_y: -0.2694, center_of_mass_height: 0.58,
    ..BRZ
};

// Hub positions and radius are measured from the exported Mini. The suspension
// mount includes the inherited spring travel so the nominal pose matches the GLB.
pub const MINI: VehicleConfig = VehicleConfig {
    front_wheel_drive: true, mass: 1180.0, engine_force: 9_360.0,
    brake_force: 7500.0, max_speed: 53.0, chassis_half_extents: [0.865, 0.62, 1.938],
    front_axle_z: 1.1682, rear_axle_z: -1.3197, front_track_width: 1.4776,
    rear_track_width: 1.4776, wheel_radius: 0.3079, wheel_y: -0.2264,
    center_of_mass_height: 0.47, ..AE86
};

// Measured hub positions in chassis space. The front axle uses the midpoint
// of the Fortuner source's slightly asymmetric left/right tire centers.
pub const FORTUNER: VehicleConfig = VehicleConfig {
    mass: 2100.0, engine_force: 12_960.0, brake_force: 11300.0, max_speed: 45.0,
    chassis_half_extents: [0.93,0.80,2.398], center_of_mass_height: 0.64,
    front_axle_z: 1.4003, rear_axle_z: -1.3497, front_track_width: 1.5434,
    rear_track_width: 1.5427, wheel_radius: 0.3725, wheel_y: -0.3707, ..CX30
};

pub const LAND_CRUISER: VehicleConfig = VehicleConfig {
    mass: 2450.0, engine_force: 14_280.0, brake_force: 12800.0, max_speed: 43.0,
    chassis_half_extents: [0.966,0.82,2.464], center_of_mass_height: 0.67,
    front_axle_z: 1.5258, rear_axle_z: -1.3272, front_track_width: 1.6860,
    rear_track_width: 1.6860, wheel_radius: 0.4134, wheel_y: -0.3215, ..CX30
};

// The AT4X is a wheeled Tank. Its independent hull capacity does not enable
// tracked pivot steering, the Vanguard cannon, scope or directional barrier.
pub const SIERRA: VehicleConfig = VehicleConfig {
    hull_hp: 900.0, mass: 2650.0, engine_force: 15_720.0, brake_force: 14100.0,
    max_speed: 45.0, chassis_half_extents: [1.045,0.92,2.934], center_of_mass_height: 0.68,
    front_axle_z: 2.0058, rear_axle_z: -1.7030, front_track_width: 1.7235,
    rear_track_width: 1.7235, wheel_radius: 0.4305, wheel_y: -0.4278, ..CX30
};

pub const CAMARO: VehicleConfig = VehicleConfig {
    tracked: false,
    resources: MUSCLE_RESOURCES,
    // Performance and identity
    mass: 1_650.0,
    engine_force: 13_200.0,
    brake_force: 9_000.0,
    max_speed: 65.0,

    // Physical dimensions
    chassis_half_extents: [1.05, 0.40, 2.35],
    center_of_mass_height: 0.53,
    front_axle_z: 1.485,
    rear_axle_z: -1.325,
    front_track_width: 1.60,
    rear_track_width: 1.60,
    wheel_radius: 0.36,

    // Extra travel and static sag preserve ride height while letting the
    // driven rear axle load up under acceleration.
    suspension_max_length: 0.165,
    suspension_sag: 0.110,
    suspension_damping_ratio: 0.86,

    // Heavier anti-roll tuning
    arb_front: 18_000.0,
    arb_rear: 14_000.0,

    ..GT86
};

// -----------------------------------------------------------------------------
// MODERN RWD SPORTS CAR
// -----------------------------------------------------------------------------

pub const SUPRA: VehicleConfig = VehicleConfig {
    hull_hp: 500.0,
    front_wheel_drive: false,
    tracked: false,
    resources: SUPRA_RESOURCES,
    // Performance and identity
    mass: 1_540.0,
    engine_force: 12_600.0,
    brake_force: 8_800.0,
    max_speed: 69.0, // approximately 155 mph

    // Collider dimensions intentionally cover the lower body, not the roof.
    // The wide-body GLB measures about 2.03 m x 1.29 m x 4.51 m overall.
    chassis_half_extents: [1.00, 0.36, 2.20],
    chassis_com_offset: [0.0, -0.08, 0.0],
    center_of_mass_height: 0.46,

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
    linear_damping: 0.006,
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
    hull_hp: 1200.0,
    front_wheel_drive: false,
    tracked: true,
    resources: TANK_RESOURCES,
    // Performance and identity
    mass: 40_000.0,
    engine_force: 200_000.0,
    brake_force: 240_000.0,
    max_speed: 30.0,

    // Physical dimensions
    chassis_half_extents: [1.38, 0.60, 2.80],
    chassis_com_offset: [-0.005, -0.03, -0.04],
    center_of_mass_height: 0.85, // Preserve the tracked vehicle's existing mass height.
    front_axle_z: 1.694,
    rear_axle_z: -1.720,
    front_track_width: 2.216,
    rear_track_width: 2.216,
    wheel_radius: 0.416,
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
    linear_damping: 0.003,
    angular_damping: 0.32,
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

/// First playable naval hull. Buoyancy/propulsion are solved on water tiles,
/// never by the road tire solver. Dimensions approximate a full-size cruiser.
pub const HAWAII_RESCUE: VehicleConfig = VehicleConfig {
    tracked: false,
    hull_hp: 6500.0,
    mass: 7_000_000.0,
    engine_force: 5_400_000.0,
    brake_force: 3_600_000.0,
    max_speed: 16.0,
    linear_damping: 0.025,
    angular_damping: 1.7,
    chassis_half_extents: [12.0, 5.0, 77.0],
    chassis_com_offset: [0.0, 0.0, 0.0],
    center_of_mass_height: 0.7,
    wheels: 0,
    // Used as an equivalent drivetrain radius by the telemetry model only.
    wheel_radius: 1.0,
    max_steer_angle: 0.0,
    ..TANK
};
