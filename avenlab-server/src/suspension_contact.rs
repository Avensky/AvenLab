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
//     basis from the precomputed steering directions via kinematics::wheel_basis_world(),
//     and finally computes slip components via kinematics::slip_components().
//
// Notes:
// - This file does NOT apply impulses. It only measures/constructs contact data.
// - Ground normal is currently assumed flat-up; for slopes, read normal from
//   Ray intersection data and propagate it through basis + forces.
// ==============================================================================

use rapier3d::prelude::*;
use rapier3d::prelude::vector;
use crate::vehicle_state::Wheel;
use crate::aven_tire::steering::SteeringState;
use crate::aven_tire::kinematics::{point_velocity, wheel_basis_world, slip_components};
// Raycast reach tolerance in meters; extends only the ray maximum distance.
pub(crate) const CONTACT_EPSILON: Real = 0.005;

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

    // wheel basis (world)
    pub forward: Vector<Real>,
    pub side: Vector<Real>,

    // slip
    pub v_long: f32,
    pub v_lat: f32,

    // misc
    pub grounded: bool,
}

// ==========================================================
// This guarantees:
// - forward ⟂ normal
// - side ⟂ normal
// ==========================================================
#[inline]
pub(crate) fn planar_wheel_basis(
    forward_world: Vector<Real>,
    ground_normal: Vector<Real>,
) -> (Vector<Real>, Vector<Real>) {
    // Project forward onto contact plane
    let fwd_dot_n = forward_world.dot(&ground_normal);
    let mut forward = forward_world - ground_normal * fwd_dot_n;

    let fwd_len = forward.norm();
    if fwd_len < 1e-6 {
        forward = Vector::z();
    } else {
        forward /= fwd_len;
    }

    // Side is guaranteed planar
    let mut side = ground_normal.cross(&forward);
    let side_len = side.norm();
    if side_len < 1e-6 {
        side = Vector::x();
    } else {
        side /= side_len;
    }

    (forward, side)
}

pub(crate) fn compute_suspension_force(
    compression: f32,
    suspension_vel: f32,
    k: f32,
    c: f32,
) -> f32 {
    // Positive mount velocity is rebound. Damping must also act at first
    // contact, when spring compression can still be zero.
    let spring = k * compression.max(0.0);
    // N/m * m - N*s/m * m/s = N. Never let a road contact pull downward.
    (spring - c * suspension_vel).max(0.0)
}

/// The same ground measurement is used by force solving and final wheel poses.
pub(crate) struct WheelGroundHit {
    pub origin: Point<Real>,
    pub hit_point: Point<Real>,
    pub ground_normal: Vector<Real>,
    pub compression: f32,
    pub compression_ratio: f32,
}

pub(crate) fn cast_wheel_ground(
    wheel: &Wheel,
    body: &RigidBody,
    query: &QueryPipeline,
    bodies: &RigidBodySet,
    colliders: &ColliderSet,
    handle: RigidBodyHandle,
) -> Option<WheelGroundHit> {
    // Wheel.offset is a mount, transformed once from body space to world space.
    let origin = body.position() * wheel.offset;
    // This model supports a flat map and keeps suspension rays world-vertical.
    // Tilting chassis axes must not rotate the ray into a building wall.
    let dir = vector![0.0, -1.0, 0.0];
    let full_droop = wheel.full_droop_length();
    // Self and sensors are excluded. The road/building shapes in Rapier, not a
    // frontend ground plane or a second fallback floor, determine the hit height.
    let filter = QueryFilter::default()
        .exclude_rigid_body(handle)
        .exclude_sensors();
    let (_, toi) = query.cast_ray(
        bodies, colliders, &Ray::new(origin, dir),
        full_droop + wheel.radius + CONTACT_EPSILON, true, filter,
    )?;
    if toi <= CONTACT_EPSILON {
        // A ray starting inside a collider is not a usable suspension contact.
        return None;
    }
    let suspension_length = (toi - wheel.radius).clamp(0.0, full_droop);
    // ray distance includes the radius; subtract it once to get mount-to-center
    // length. Spring compression is measured from ZERO-LOAD full droop.
    let compression = (full_droop - suspension_length).clamp(0.0, wheel.max_length);
    Some(WheelGroundHit {
        origin,
        hit_point: origin + dir * toi,
        ground_normal: vector![0.0, 1.0, 0.0],
        compression,
        compression_ratio: compression / wheel.max_length.max(1.0e-6),
    })
}


pub fn build_suspension_contact(
    wheel: &Wheel,
    steering: &SteeringState,
    body_ro: &RigidBody,
    query: &QueryPipeline,
    bodies: &RigidBodySet,
    colliders: &ColliderSet,
    handle: RigidBodyHandle,
    fz_ref: f32,
) -> Option<SuspensionContact> {

    let pos = body_ro.position();
    let rot = pos.rotation;

    let hit = cast_wheel_ground(wheel, body_ro, query, bodies, colliders, handle)?;
    let origin = hit.origin;
    let hit_point = hit.hit_point;
    let ground_n = hit.ground_normal;
    let compression = hit.compression;
    let compression_ratio = hit.compression_ratio;

    let linvel = *body_ro.linvel();
    let angvel = *body_ro.angvel();
    let com = *body_ro.center_of_mass();
    // Rapier returns WORLD COM. Applying pos * com again would manufacture
    // angular point velocities that increase with distance across the city.
    let point_vel = point_velocity(linvel, angvel, com, hit_point);
    // The damper follows the mount, while the tire follows the contact point.
    // These two velocities represent different mechanics; do not combine them.
    let suspension_vel = point_velocity(linvel, angvel, com, origin).dot(&ground_n) as f32;

    let normal_force = compute_suspension_force(
        compression,
        suspension_vel,
        wheel.stiffness as f32,
        wheel.damping as f32,
    );

    // Pre-transfer impact guard. The final per-wheel 1.5*reference support cap
    // lives after the anti-roll pass in vehicle_forces. Neither cap applies a
    // force here: this module only measures the candidate normal load.
    let max_nf = fz_ref * 2.2;
    let normal_force = normal_force.min(max_nf);

    let (raw_forward, _) = wheel_basis_world(&wheel.debug_id, &rot, &steering.fl, &steering.fr);

    // Build planar basis using contact normal
    let (forward, side) = planar_wheel_basis(raw_forward, ground_n);

    let (v_long, v_lat) = slip_components(point_vel, forward, side);

    Some(SuspensionContact {
        wheel_id: wheel.debug_id.clone(),
        hit_point,
        apply_point: hit_point,
        ground_normal: ground_n,
        compression,
        compression_ratio,
        suspension_vel,
        normal_force,
        forward,
        side,
        v_long: v_long as f32,
        v_lat: v_lat as f32,
        grounded: true,
        point_vel: point_vel,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wheel() -> Wheel {
        Wheel {
            debug_id: "FL".into(), offset: point![0.0, 0.0, 0.0],
            rest_length: 0.18, max_length: 0.12, radius: 0.33,
            grounded: false, normal_force: 0.0, world_center: [0.0; 3],
            world_rotation: [0.0, 0.0, 0.0, 1.0], wheel_speed: 0.0, steer_angle: 0.0,
            stiffness: 48295.38, damping: 8255.57, drive: false, steer: true,
            compression: 0.0, compression_ratio: 0.0,
            tire_state: crate::aven_tire::state::TireState::Grip,
        }
    }

    #[test]
    fn sag_supports_the_static_wheel_load() {
        let load = 1280.0 * 9.81 / 4.0;
        let sag = 0.065;
        let force = compute_suspension_force(sag, 0.0, load / sag, 8255.57);
        assert!((force - load).abs() < 0.001);
    }

    #[test]
    fn damping_opposes_motion_including_first_contact() {
        let resting = compute_suspension_force(0.065, 0.0, 48295.38, 8255.57);
        assert!(compute_suspension_force(0.065, -0.1, 48295.38, 8255.57) > resting);
        assert!(compute_suspension_force(0.065, 0.1, 48295.38, 8255.57) < resting);
        assert!(compute_suspension_force(0.0, -0.1, 48295.38, 8255.57) > 0.0);
        assert_eq!(compute_suspension_force(0.065, 1.0, 48295.38, 8255.57), 0.0);
    }

    #[test]
    fn grounded_wheel_bottom_matches_the_actual_ground_hit() {
        let mut bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();
        colliders.insert(ColliderBuilder::cuboid(1000.0, 0.05, 1000.0)
            .translation(vector![0.0, -0.05, 0.0]).build());
        let mut query = QueryPipeline::new();
        query.update(&colliders);
        let wheel = wheel();
        for z in [0.0, 400.0] {
            let handle = bodies.insert(RigidBodyBuilder::dynamic()
                .translation(vector![5.0, 0.565, z]).build());
            let hit = cast_wheel_ground(&wheel, &bodies[handle], &query, &bodies, &colliders, handle).unwrap();
            let center = hit.hit_point + hit.ground_normal * wheel.radius;
            assert!((center.y - wheel.radius).abs() < 1.0e-5);
            assert!((hit.compression - 0.065).abs() < 1.0e-5);
        }
    }

    #[test]
    fn wheel_above_full_droop_has_no_ground_contact() {
        let mut bodies = RigidBodySet::new();
        let handle = bodies.insert(RigidBodyBuilder::dynamic()
            .translation(vector![0.0, 0.70, 0.0]).build());
        let mut colliders = ColliderSet::new();
        colliders.insert(ColliderBuilder::cuboid(10.0, 0.05, 10.0)
            .translation(vector![0.0, -0.05, 0.0]).build());
        let mut query = QueryPipeline::new();
        query.update(&colliders);
        assert!(cast_wheel_ground(&wheel(), &bodies[handle], &query, &bodies, &colliders, handle).is_none());
    }
}
