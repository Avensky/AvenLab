// ==============================================================================
// suspension_contact.rs — RAYCAST SUSPENSION + CONTACT PATCH KINEMATICS
// ------------------------------------------------------------------------------
// This module performs per-wheel raycasts against the scene and produces a
// SuspensionContact that includes:
// - geometry: hit_point, ground_normal, application point
// - suspension state: compression, compression_ratio, suspension velocity,
//   raw normal force from spring+damper
// - kinematics: point velocity at the contact (linvel + ω×r)
// - wheel basis (forward/side) including steering/ackermann
// - slip components (v_long, v_lat) used by the tire solver
//
// Main entry:
// - build_suspension_contact(...)
//     Casts a ray from wheel mount downward, computes compression, computes
//     suspension force via compute_suspension_force(), then builds the wheel
//     basis via steering::solve_steering() and kinematics::wheel_basis_world(),
//     and finally computes slip components via kinematics::slip_components().
//
// Notes:
// - This file does NOT apply impulses. It only measures/constructs contact data.
// - Ground normal is currently assumed flat-up; for slopes, read normal from
//   Ray intersection data and propagate it through basis + forces.
// ==============================================================================

use rapier3d::prelude::*;
use rapier3d::prelude::vector;

use crate::physics::{Wheel, Vehicle};
use crate::aven_tire::steering::{solve_steering, SteeringConfig};
use crate::aven_tire::kinematics::{wheel_basis_world, slip_components};
use crate::aven_tire::WheelId;

pub struct RawSuspension {
    wheel_id: WheelId,
    normal_force: f32,
    compression: f32,
}

#[derive(Clone)]
pub struct SuspensionContact {
    pub wheel_id: String,

    // geometry
    pub hit_point: Point<Real>,
    pub apply_point: Point<Real>,
    pub ground_normal: Vector<Real>,

    // suspension state
    pub compression: f32,
    pub compression_ratio: f32,
    pub suspension_vel: f32,
    pub normal_force: f32,

    // kinematics
    pub point_vel: Vector<Real>,

    // friction
    pub mu_lat: f32,
    pub mu_long: f32,

    // wheel basis (world)
    pub forward: Vector<Real>,
    pub side: Vector<Real>,

    // slip
    pub v_long: f32,
    pub v_lat: f32,

    // misc
    pub grounded: bool,
    pub roll_factor: f32,
}

pub(crate) fn compute_suspension_force(
    compression: f32,
    suspension_vel: f32,
    k: f32,
    c: f32,
) -> f32 {
    // Deadzone
    let v = if suspension_vel.abs() < 0.05 { 0.0 } else { suspension_vel };

    // One-way damper (kills rebound)
    let v = if v > 0.0 { v * 0.4 } else { v };

    let spring = k * compression;
    let damper = (-c * v).clamp(-spring * 0.6, spring * 0.6);

    (spring + damper).max(0.0)
}


pub fn build_suspension_contact(
    wheel: &Wheel,
    vehicle: &Vehicle,
    body_ro: &RigidBody,
    query: &QueryPipeline,
    bodies: &RigidBodySet,
    colliders: &ColliderSet,
    handle: RigidBodyHandle,
    fz_ref: f32,
    _dt: f32,
) -> Option<SuspensionContact> {

    let pos = body_ro.position();
    let rot = pos.rotation;
    let linvel = *body_ro.linvel();
    let angvel = *body_ro.angvel();
    let com = pos * body_ro.center_of_mass();

    let origin = pos * (wheel.offset + vector![0.0, wheel.radius + 0.02, 0.0]);
    let dir = vector![0.0, -1.0, 0.0];
    let ground_n = vector![0.0, 1.0, 0.0];

    let ray = Ray::new(origin, dir);
    let max_dist = wheel.rest_length + wheel.max_length + wheel.radius;

    let filter = QueryFilter::default().exclude_rigid_body(handle);

    let (_hit, toi) = query.cast_ray(
        bodies,
        colliders,
        &ray,
        max_dist,
        true,
        filter,
    )?;

    if toi <= wheel.radius {
        return None;
    }

    let hit_point = origin + dir * toi;
    let suspension_length = toi - wheel.radius;
    let compression = (wheel.rest_length - suspension_length)
        .clamp(0.0, wheel.max_length);

    if compression <= 0.0 {
        return None;
    }

    let compression_ratio = compression / wheel.max_length;

    let r = hit_point.coords - com.coords;
    let point_vel = linvel + angvel.cross(&r);
    let suspension_vel = point_vel.dot(&ground_n) as f32;

    let normal_force = compute_suspension_force(
        compression,
        suspension_vel,
        wheel.stiffness as f32,
        wheel.damping as f32,
    );

    // load-sensitive friction
    let mu0 = vehicle.config.mu_base;
    let k = vehicle.config.load_sensitivity;
    let load_ratio = (normal_force / fz_ref).max(0.2);
    let mu_lat = (mu0 * load_ratio.powf(-k)).clamp(mu0 * 0.6, mu0 * 1.1);

    // steering basis
    let cfg = SteeringConfig {
        wheelbase: vehicle.config.wheelbase,
        track_width: vehicle.config.track_width,
        max_steer_angle: vehicle.config.max_steer_angle,
        ackermann: vehicle.config.ackermann,
    };

    let speed = linvel.magnitude();
    // let steer_angle = vehicle.steer_angle / cfg.max_steer_angle;
    let steer_angle = vehicle.steer_angle;
    let (fl, fr) = solve_steering(&cfg, &rot, steer_angle, speed);

    let (forward, side) =
        wheel_basis_world(&wheel.debug_id, &rot, &fl, &fr);

    let (v_long, v_lat) =
        slip_components(point_vel, forward, side);

    let steer_intensity = vehicle.steer.abs().clamp(0.0, 1.0);
    let roll_factor = 0.30 * (1.0 - steer_intensity * 0.65);

    Some(SuspensionContact {
        wheel_id: wheel.debug_id.clone(),
        hit_point,
        apply_point: hit_point,
        ground_normal: ground_n,
        compression,
        compression_ratio,
        suspension_vel,
        normal_force,
        point_vel,
        mu_lat,
        mu_long: mu0,
        forward,
        side,
        v_long: v_long as f32,
        v_lat: v_lat as f32,
        grounded: true,
        roll_factor,
    })
}
