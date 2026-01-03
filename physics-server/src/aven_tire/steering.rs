// src/aven_tire/steering.rs
//
// ====================================================================
// STEERING GEOMETRY MODULE
// --------------------------------------------------------------------
// Responsibilities:
// - Convert driver steering intent into wheel orientations
// - Apply Ackermann steering geometry
// - Apply speed-sensitive steering limits
// - Output per-wheel forward & side directions (unit vectors)
//
// This module MUST NOT:
// - Apply forces or impulses
// - Modify velocities
// - Perform tire slip or friction logic
//
// Steering defines GEOMETRY.
// Tires define FORCES.
// ====================================================================

// use rapier3d::prelude::*;
use rapier3d::na::{UnitQuaternion, Vector3};
use crate::aven_tire::types::{Vec3, v_norm, v_cross};

/// Steering configuration (per vehicle)
#[derive(Clone, Copy)]
pub struct SteeringConfig {
    pub wheelbase: f32,        // meters
    pub track_width: f32,      // meters
    pub max_steer_angle: f32,  // radians
    pub ackermann: f32,        // 0 = parallel, 1 = full Ackermann
}

/// Output per wheel
#[derive(Clone, Copy)]
pub struct WheelSteering {
    pub forward: Vec3, // unit vector in world space
    pub side: Vec3,    // unit vector (right)
}

/// Compute Ackermann inner/outer wheel angles
fn ackermann_angles(
    base: f32,
    wheelbase: f32,
    track: f32,
) -> (f32, f32) {
    let eps = 1e-4;
    if base.abs() < eps {
        return (0.0, 0.0);
    }

    let sign = base.signum();
    let a = base.abs();

    // Bicycle-model turning radius
    let r = wheelbase / a.tan();

    let r_in  = (r - track * 0.5).max(0.01);
    let r_out = (r + track * 0.5).max(0.01);

    let inner = (wheelbase / r_in).atan() * sign;
    let outer = (wheelbase / r_out).atan() * sign;

    if sign > 0.0 {
        (inner, outer) // left turn
    } else {
        (outer, inner) // right turn
    }
}

/// Main steering solve
///
/// Inputs:
/// - chassis rotation
/// - driver steer input (-1..1)
/// - current vehicle speed
///
/// Output:
/// - per-wheel forward & side directions
pub fn solve_steering(
    config: &SteeringConfig,
    chassis_rot: &UnitQuaternion<f32>,
    steer_input: f32,
    speed: f32,
) -> (WheelSteering, WheelSteering) {
    // ------------------------------------------------------------
    // 1) Speed-sensitive steering limit
    // ------------------------------------------------------------
    let speed_fade = (1.0 - speed / 30.0).clamp(0.35, 1.0);
    let base_angle = steer_input * config.max_steer_angle * speed_fade;

    // ------------------------------------------------------------
    // 2) Ackermann geometry
    // ------------------------------------------------------------
    let (ack_l, ack_r) =
        ackermann_angles(base_angle, config.wheelbase, config.track_width);

    let fl_angle =
        (1.0 - config.ackermann) * base_angle + config.ackermann * ack_l;
    let fr_angle =
        (1.0 - config.ackermann) * base_angle + config.ackermann * ack_r;

    // ------------------------------------------------------------
    // 3) Build wheel directions in world space
    // ------------------------------------------------------------
    let up = Vector3::y_axis();
    let chassis_fwd = chassis_rot * Vector3::z_axis().into_inner();

    let fl_rot = UnitQuaternion::from_axis_angle(&up, -fl_angle);
    let fr_rot = UnitQuaternion::from_axis_angle(&up, -fr_angle);

    let fl_forward = v_norm((fl_rot * chassis_fwd).into());
    let fr_forward = v_norm((fr_rot * chassis_fwd).into());

    let fl_side = v_norm(v_cross([0.0, 1.0, 0.0], fl_forward));
    let fr_side = v_norm(v_cross([0.0, 1.0, 0.0], fr_forward));

    (
        WheelSteering {
            forward: fl_forward,
            side: fl_side,
        },
        WheelSteering {
            forward: fr_forward,
            side: fr_side,
        },
    )
}
