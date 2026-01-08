// ==============================================================================
// steering.rs — ACKERMANN STEERING GEOMETRY (FRONT AXLE)
// ==============================================================================
// Responsibilities:
// - Convert driver steering intent into wheel orientations
// - Apply Ackermann steering geometry
// - Apply speed-sensitive steering limits
// - Output per-wheel forward & side directions (unit vectors)
// ------------------------------------------------------------------------------
// Given:
// - wheelbase, track_width
// - max_steer_angle
// - ackermann blend (0..1)
// - driver steer input (or steer angle)
//
// solve_steering(...):
// - Produces left/right wheel steering angles (fl, fr) that approximate
//   ackermann geometry.
// - Uses a blend between parallel steer (both wheels equal) and full ackermann.
//
// τ_net = 
//        - τ_driver 
//        - τ_sat
//        - (c * ω) 
//        - (k * θ) 
//
// where: 
//        τ_sat = Self Aligning Torque → Steering Rack ONLY
//        τ_driver = assist * steer_input
//        c = damping
//        ω = steer_rate
//        k = steering column stiffness
//        θ = steer_angle
// 
// steer_vector(rot, angle):
// - Rotates chassis forward vector around world-up by a steering angle.
// - IMPORTANT: sign convention must match your input mapping (left vs right).
//
// Output angles are used by kinematics::wheel_basis_world() to build the wheel
// forward/side basis for slip computation.
// ==============================================================================

// use rapier3d::prelude::*;
use rapier3d::prelude::{Real, RigidBodySet};
use rapier3d::prelude::Vector;
use rapier3d::na::UnitQuaternion;
use crate::aven_tire::types::{Vec3, v_norm, v_cross};
use crate::vehicle::Vehicle;
use std::collections::hash_map::{Values, ValuesMut};


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
// - steering rack (self aligning torque based)
// ================================================================================
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
    let viscous = 0.0;           // optional extra
    
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
    

    // println!(
    //     "[RACK DBG] θ={:+.3} ω={:+.3} τ_driver={:+.2} τ_sat={:+.2} τ_center={:+.2}",
    //     *steer_angle,
    //     *steer_rate,
    //     driver_torque,
    //     rack_torque,
    //     -stiffness * (*steer_angle),
    // );


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
    // - Build wheel directions in world space
    // ------------------------------------------------------------
    // let up = Vector3::y_axis();
    // let chassis_fwd = chassis_rot * Vector3::z_axis().into_inner();


    // ------------------------------------------------------------
    // World-space chassis basis (MUST match wheel_basis_world)
    // ------------------------------------------------------------
    let up = Vector::new(0.0, 1.0, 0.0);

    // your chassis basis (MUST match wheel_basis_world rear)
    // +X forward, -Z right
    let chassis_fwd   = chassis_rot * Vector::new(1.0, 0.0, 0.0);
    let chassis_right = chassis_rot * Vector::new(0.0, 0.0, -1.0);


    // ------------------------------------------------------------
    // Rotate forward direction by steering angles (PLANAR)
    // ------------------------------------------------------------
        let fl_forward =
        (chassis_fwd * fl_angle.cos() + chassis_right * fl_angle.sin()).normalize();

    let fr_forward =
        (chassis_fwd * fr_angle.cos() + chassis_right * fr_angle.sin()).normalize();

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
pub fn apply_vehicle_controls<'a>(
    vehicles: ValuesMut<'a, String, Vehicle>,
    dt: Real,
) {
    // let cutoff_hz = 12.0; // 8–20Hz
    // let alpha = 1.0 - (-2.0 * std::f32::consts::PI * cutoff_hz * dt as f32).exp();
    for v in vehicles {
        // v.rack_torque = v.rack_torque.clamp(-1500.0, 1500.0);
        // v.rack_torque_filtered += (v.rack_torque - v.rack_torque_filtered) * alpha;            
        
        // v.steer_angle = v.steer * v.config.max_steer`_angle;
        v.throttle = v.throttle.clamp(-1.0, 1.0);
        v.brake    = v.brake.clamp(0.0, 1.0);
        
        // update_steering_rack(
        //     v.steer,
        //     // v.rack_torque_filtered,
        //     &mut v.steer_angle,
        //     &mut v.steer_rate,
        //     v.config.max_steer_angle,
        //     dt as f32,
        // );

        // println!(
        //     "[STEER RACK] input={:+.2} angle={:+.3} rad rate={:+.3} rack_torque={:+.1}",
        //     v.steer,
        //     v.steer_angle,
        //     v.steer_rate,
        //     v.rack_torque
        // );

    }
}

// ===========================================================================
// Anisotropic Angular damping (kills roll/yaw oscillations)
// ===========================================================================
pub fn apply_angular_damping<'a>(
    vehicles: Values<'a, String, Vehicle>,
    bodies: &mut RigidBodySet,
    dt: Real,
) {
    
    let ang_damp_per_sec = 0.05; // tune-here

    for v in vehicles {
        if let Some(body) = bodies.get_mut(v.body) {
            let angvel = *body.angvel();
            let factor = (-ang_damp_per_sec * dt).exp();
            body.set_angvel(angvel * factor, true);
        }
    }
}