// Pure front-wheel Ackermann geometry. Runtime physics forward is local +Z;
// positive steer input turns toward local -X. The final basis is projected onto
// the road plane by suspension_contact before slip is measured.
// vehicle_forces owns the ONLY active 0.10 s steering smoother, once per substep.
// solve_steering has no time integration or speed-sensitive limiting. Calling it
// again after physics is safe: final poses need the updated chassis orientation.
// The torque-rack and input-clamp helpers below are legacy APIs with no active
// PhysicsWorld callers, not additional stages of the current steering strategy.

// use rapier3d::prelude::*;
use rapier3d::prelude::{Real};
use rapier3d::prelude::Vector;
use rapier3d::na::UnitQuaternion;
use crate::aven_tire::types::{Vec3};
use crate::vehicle_state::Vehicle;
use std::collections::hash_map::{ ValuesMut};


/// Steering configuration (per vehicle)
#[derive(Clone, Copy)]
pub struct SteeringConfig {
    pub wheelbase: f32,        // meters
    pub track_width: f32,      // meters
    pub max_steer_angle: f32,  // radians
    pub ackermann: f32,        // 0 = parallel, 1 = full Ackermann
}

pub struct SteeringState {
    pub fl: WheelSteering,
    pub fr: WheelSteering,
}

impl Default for SteeringState {
    fn default() -> Self {
        Self {
            fl: WheelSteering::default(),
            fr: WheelSteering::default(),
        }
    }
}


/// Output per wheel
#[derive(Clone, Copy)]
pub struct WheelSteering {
    pub forward: Vec3, // unit vector in world space
    pub side: Vec3,    // unit vector (right)
}

impl Default for WheelSteering {
fn default() -> Self {
    Self {
        forward: [0.0, 0.0, 1.0], // world forward
        side:    [1.0, 0.0, 0.0], // world right
    }
}
}

// ================================================================================
// - Legacy steering rack experiment (INACTIVE in PhysicsWorld)
// ================================================================================
// Do not call this alongside the active exponential steering response.
// It would integrate a second, incompatible strategy into the same steer_angle.
pub fn update_steering_rack(
    steer_input: f32,     // -1..1
    // rack_torque: f32,     // Nm from tires (SAT)
    steer_angle: &mut f32,
    steer_rate: &mut f32,
    max_angle: f32,
    dt: f32,
) {
    // --- physical parameters ---
    let inertia = 1.2;    // kg·m²
    let damping = 4.0;    // N·m·s/rad
    let stiffness = 18.0;
    let assist  = 8.0;    // driver strength
    // let assist  = lerp(10.0, 4.0, speed / 30.0);    // driver strength


    // Driver input torque
    let driver_torque = assist * steer_input;

    let coulomb = 1.2;           // N*m "dry friction" around center (tune 0.5–3.0)
    // let viscous = 0.0;           // optional extra

    // let friction = coulomb * steer_rate.signum() + viscous * (*steer_rate);
    // let friction = coulomb * net_torque.signum();
    let friction = if steer_rate.abs() < 0.05 {
        0.0
    } else {
        coulomb * steer_rate.signum()
    };

    // If almost stopped, allow friction to fully cancel tiny torques
    let mut net_torque =
    driver_torque
    // - rack_torque
    - damping * (*steer_rate)
    - stiffness * (*steer_angle)
    - friction;

    // deadband: if torque is tiny, don’t integrate noise
    if net_torque.abs() < 0.05 {
        net_torque = 0.0;
    }

    // Integrate (semi-implicit)
    let max_rate = 8.0;          // rad/s rack angular speed clamp
    let steer_accel = net_torque / inertia;
    *steer_rate += steer_accel * dt;
    *steer_rate = steer_rate.clamp(-max_rate, max_rate);
    *steer_angle += *steer_rate * dt;

    // Hard mechanical stops
    if *steer_angle > max_angle { *steer_angle = max_angle; *steer_rate = 0.0; }
    else if *steer_angle < -max_angle { *steer_angle = -max_angle; *steer_rate = 0.0; }

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

// Main steering solve
pub fn solve_steering(
    config: &SteeringConfig,
    chassis_rot: &UnitQuaternion<f32>,
    steer_angle: f32,
) -> (WheelSteering, WheelSteering) {

    // ------------------------------------------------------------
    // - Ackermann geometry
    // ------------------------------------------------------------
    let (ack_l, ack_r) =
        ackermann_angles(steer_angle, config.wheelbase, config.track_width);

    let fl_angle =
        (1.0 - config.ackermann) * steer_angle + config.ackermann * ack_l;
    let fr_angle =
        (1.0 - config.ackermann) * steer_angle + config.ackermann * ack_r;

    // ------------------------------------------------------------
    // World-space chassis basis (MUST match wheel_basis_world)
    // ------------------------------------------------------------
    let up = chassis_rot * Vector::new(0.0, 1.0, 0.0);

    // +Z forward, +X right; positive input turns left (-X).
    let chassis_fwd   = chassis_rot * Vector::new(0.0, 0.0, 1.0);
    let chassis_right = chassis_rot * Vector::new(1.0, 0.0, 0.0);

    // ------------------------------------------------------------
    // Rotate forward direction by steering angles (PLANAR)
    // ------------------------------------------------------------
    let fl_forward =
        (chassis_fwd * fl_angle.cos() - chassis_right * fl_angle.sin()).normalize();

    let fr_forward =
        (chassis_fwd * fr_angle.cos() - chassis_right * fr_angle.sin()).normalize();

    // ------------------------------------------------------------
    // Side vectors (right-handed: side = up × forward)
    // ------------------------------------------------------------
    let fl_side = up.cross(&fl_forward).normalize();
    let fr_side = up.cross(&fr_forward).normalize();

    // Sanity: orthogonality
    debug_assert!(fl_forward.dot(&fl_side).abs() < 1e-4);
    debug_assert!(fr_forward.dot(&fr_side).abs() < 1e-4);

    (
        WheelSteering {
            forward: [fl_forward.x, fl_forward.y, fl_forward.z],
            side:    [fl_side.x,    fl_side.y,    fl_side.z],
        },
        WheelSteering {
            forward: [fr_forward.x, fr_forward.y, fr_forward.z],
            side:    [fr_side.x,    fr_side.y,    fr_side.z],
        },
    )
}


// =========================================================================
// - Apply vehicle controls (throttle + steering) to each vehicle.
// =========================================================================
// Legacy input clamp helper; PhysicsWorld now clamps when attaching input and
// does not call this again in substeps. Kept as an API, with no active caller.
pub fn apply_vehicle_controls<'a>(
    vehicles: ValuesMut<'a, String, Vehicle>,
    _dt: Real,
) {
    for v in vehicles {
        v.throttle = v.throttle.clamp(-1.0, 1.0);
        v.brake    = v.brake.clamp(0.0, 1.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> SteeringConfig {
        SteeringConfig { wheelbase: 2.6, track_width: 1.68, max_steer_angle: 0.6, ackermann: 0.8 }
    }

    #[test]
    fn zero_steer_matches_the_rear_forward_axis_after_chassis_yaw() {
        let rot = UnitQuaternion::from_axis_angle(&Vector::y_axis(), 1.1);
        let expected = rot * Vector::new(0.0, 0.0, 1.0);
        let (fl, fr) = solve_steering(&config(), &rot, 0.0);
        for wheel in [fl, fr] {
            let forward = Vector::new(wheel.forward[0], wheel.forward[1], wheel.forward[2]);
            assert!((forward - expected).norm() < 1.0e-5);
        }
    }

    #[test]
    fn ackermann_turns_the_inner_wheel_more_on_each_side() {
        let rot = UnitQuaternion::identity();
        for input in [-0.25, 0.25] {
            let (fl, fr) = solve_steering(&config(), &rot, input);
            assert!(fl.forward[0] * input < 0.0);
            assert!(fr.forward[0] * input < 0.0);
            if input > 0.0 {
                assert!(fl.forward[0].abs() > fr.forward[0].abs());
            } else {
                assert!(fr.forward[0].abs() > fl.forward[0].abs());
            }
        }
    }
}
