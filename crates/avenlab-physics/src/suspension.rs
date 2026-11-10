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
// - Ray intersection normals reject unusable surfaces. The model uses vertical
//   support for accepted contacts, including on slopes.
// ==============================================================================

use crate::tire::kinematics::{point_velocity, slip_components, wheel_basis_world};
use crate::tire::steering::SteeringState;
use crate::tire::{WheelId, state::TireState, thermal::TireThermal};
use rapier3d::prelude::*;
// Raycast reach tolerance in meters; extends only the ray maximum distance.
pub const CONTACT_EPSILON: Real = 0.005;

#[derive(Clone, Debug)]
pub struct Wheel {
    pub debug_id: String,    // "FL", "FR", "RL", "RR"
    pub offset: Point<Real>, // suspension mount in body-local meters
    pub rest_length: Real,   // minimum represented suspension length (m)
    pub max_length: Real,    // available compression from full droop (m)
    pub radius: Real,        // wheel radius

    pub grounded: bool,           // is the wheel currently touching the ground?
    pub normal_force: f32,        // final load actually applied in the last substep (N)
    pub world_center: [f32; 3],   // world position of wheel center (for debug visualization)
    pub world_rotation: [f32; 4], // world rotation of wheel (for debug visualization)
    pub wheel_speed: f32, // rad/s; rolling kinematics for visual spin, not a tire inertia state
    pub steer_angle: f32, // current steer angle (for debug visualization)

    pub stiffness: Real, // spring constant
    pub damping: Real,   // damper constant

    pub drive: bool, // is this a driven wheel?
    pub steer: bool, // is this a steering wheel?

    pub compression: f32, // current suspension compression (for debug visualization)
    pub compression_ratio: f32, // current suspension compression ratio (for debug visualization)

    pub skid_intensity: f32,
    pub tire_contact: Option<[f32; 7]>,
    pub tire_state: TireState,
    pub thermal: TireThermal,
}

impl Wheel {
    /// Shared by contact sensing and final visual placement. Adding a second
    /// rest length in either path would give forces and meshes different travel.
    #[inline]
    pub fn full_droop_length(&self) -> Real {
        self.rest_length + self.max_length
    }
}

/// Geometry and spring settings for a single raycast wheel.
#[derive(Clone, Copy, Debug)]
pub struct WheelConfig {
    pub id: WheelId,
    pub offset: Point<Real>,
    pub rest_length: Real,
    pub max_length: Real,
    pub radius: Real,
    pub stiffness: Real,
    pub damping: Real,
    pub drive: bool,
    pub steer: bool,
}

impl Wheel {
    pub fn new(config: WheelConfig) -> Self {
        Self {
            debug_id: config.id.as_str().to_owned(),
            offset: config.offset,
            rest_length: config.rest_length,
            max_length: config.max_length,
            radius: config.radius,
            grounded: false,
            normal_force: 0.0,
            world_center: [0.0; 3],
            world_rotation: [0.0, 0.0, 0.0, 1.0],
            wheel_speed: 0.0,
            steer_angle: 0.0,
            stiffness: config.stiffness,
            damping: config.damping,
            drive: config.drive,
            steer: config.steer,
            compression: 0.0,
            compression_ratio: 0.0,
            skid_intensity: 0.0,
            tire_contact: None,
            tire_state: TireState::Grip,
            thermal: TireThermal::default(),
        }
    }

    /// Load actually applied during the last substep, after anti-roll transfer.
    pub fn load(&self) -> WheelLoad {
        WheelLoad {
            normal_force_n: self.normal_force,
        }
    }
}

/// A wheel's resolved vertical support load in newtons.
#[derive(Clone, Copy, Debug)]
pub struct WheelLoad {
    pub normal_force_n: f32,
}

impl WheelLoad {
    /// Map load to a compressed 0..1 bar fraction for diagnostic views.
    /// The caller chooses the full-scale load in newtons.
    pub fn bar_fraction(self, full_scale_n: f32) -> f32 {
        if !self.normal_force_n.is_finite() || !full_scale_n.is_finite() || full_scale_n <= 0.0 {
            return 0.0;
        }
        (self.normal_force_n / full_scale_n).clamp(0.0, 1.0).sqrt()
    }
}

pub fn suspension_from_sag(
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
    let damping = 2.0 * damping_ratio * (stiffness * sprung_mass_per_wheel).sqrt();

    (stiffness, damping)
}

#[derive(Clone)]
pub struct SuspensionContact {
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
pub fn planar_wheel_basis(
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

pub fn compute_suspension_force(compression: f32, suspension_vel: f32, k: f32, c: f32) -> f32 {
    // Positive mount velocity is rebound. Damping must also act at first
    // contact, when spring compression can still be zero.
    let spring = k * compression.max(0.0);
    // N/m * m - N*s/m * m/s = N. Never let a road contact pull downward.
    (spring - c * suspension_vel).max(0.0)
}

/// The same ground measurement is used by force solving and final wheel poses.
pub struct WheelGroundHit {
    pub origin: Point<Real>,
    pub hit_point: Point<Real>,
    pub ground_normal: Vector<Real>,
    pub surface_normal: Vector<Real>,
    pub compression: f32,
    pub compression_ratio: f32,
    pub overtravel: f32,
}

pub fn cast_wheel_ground(
    wheel: &Wheel,
    body: &RigidBody,
    query: &QueryPipeline,
    bodies: &RigidBodySet,
    colliders: &ColliderSet,
    handle: RigidBodyHandle,
    fallback_groups: InteractionGroups,
) -> Option<WheelGroundHit> {
    // Wheel.offset is a mount, transformed once from body space to world space.
    let origin = body.position() * wheel.offset;
    // Suspension travel is along the chassis strut. An inverted wheel cannot
    // find the ground through the roof or gain traction on a side wall.
    let dir = body.rotation() * -Vector::y();
    if dir.y >= 0.0 {
        return None;
    }
    let full_droop = wheel.full_droop_length();
    // Self and sensors are excluded. The road/building shapes in Rapier, not a
    // frontend ground plane or a second fallback floor, determine the hit height.
    let groups = body
        .colliders()
        .first()
        .and_then(|h| colliders.get(*h))
        .map(|c| c.collision_groups())
        .unwrap_or(fallback_groups);
    let filter = QueryFilter::default()
        .groups(groups)
        .exclude_rigid_body(handle)
        .exclude_sensors();
    let (_, hit) = query.cast_ray_and_get_normal(
        bodies,
        colliders,
        &Ray::new(origin, dir),
        full_droop + wheel.radius + CONTACT_EPSILON,
        true,
        filter,
    )?;
    let toi = hit.time_of_impact;
    if toi <= CONTACT_EPSILON || hit.normal.y < 0.35 || -dir.dot(&hit.normal) < 0.35 {
        // A ray starting inside a collider is not a usable suspension contact.
        return None;
    }
    // Preserve the existing vertical load model while measuring travel along the axle hardpoint.
    let length = toi - wheel.radius;
    let suspension_length = length.clamp(0.0, full_droop);
    // ray distance includes the radius; subtract it once to get mount-to-center
    // length. Spring compression is measured from ZERO-LOAD full droop.
    let compression = (full_droop - suspension_length).clamp(0.0, wheel.max_length);
    Some(WheelGroundHit {
        origin,
        hit_point: origin + dir * toi,
        ground_normal: Vector::y(),
        surface_normal: hit.normal,
        overtravel: (wheel.rest_length - length).max(0.0),
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
    fallback_groups: InteractionGroups,
) -> Option<SuspensionContact> {
    let pos = body_ro.position();
    let rot = pos.rotation;

    let hit = cast_wheel_ground(
        wheel,
        body_ro,
        query,
        bodies,
        colliders,
        handle,
        fallback_groups,
    )?;
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

    // Pre-transfer impact guard. Do not clip again after ARB redistribution:
    // doing so would discard axle support when the outside tire takes load.
    // This module measures candidate normal load; it never applies a force.
    let max_nf = fz_ref * 2.2;
    let bump_stop = if hit.overtravel > 0.04 && suspension_vel < -2.0 {
        // The rubber stop acts only at full compression, including on hard landings.
        (hit.overtravel.powi(2) / 0.1 * wheel.stiffness).min(0.5 * fz_ref)
    } else {
        0.0
    };
    let normal_force = (normal_force + bump_stop).min(max_nf);

    let (raw_forward, _) = wheel_basis_world(&wheel.debug_id, &rot, &steering.fl, &steering.fr);

    // Build planar basis using contact normal
    let (forward, side) = planar_wheel_basis(raw_forward, ground_n);

    let (v_long, v_lat) = slip_components(point_vel, forward, side);

    Some(SuspensionContact {
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
            debug_id: "FL".into(),
            offset: point![0.0, 0.0, 0.0],
            rest_length: 0.18,
            max_length: 0.12,
            radius: 0.33,
            grounded: false,
            normal_force: 0.0,
            world_center: [0.0; 3],
            world_rotation: [0.0, 0.0, 0.0, 1.0],
            wheel_speed: 0.0,
            steer_angle: 0.0,
            stiffness: 48295.38,
            damping: 8255.57,
            drive: false,
            steer: true,
            compression: 0.0,
            compression_ratio: 0.0,
            skid_intensity: 0.0,
            tire_contact: None,
            tire_state: TireState::Grip,
            thermal: Default::default(),
        }
    }

    #[test]
    fn load_bar_reads_the_resolved_normal_force_and_saturates_at_full_scale() {
        let mut wheel = wheel();
        assert_eq!(wheel.load().bar_fraction(12_000.0), 0.0);
        wheel.normal_force = 3_000.0;
        assert_eq!(wheel.load().normal_force_n, 3_000.0);
        assert_eq!(wheel.load().bar_fraction(12_000.0), 0.5);
        assert_eq!(wheel.load().bar_fraction(0.0), 0.0);
        wheel.normal_force = 20_000.0;
        assert_eq!(wheel.load().bar_fraction(12_000.0), 1.0);
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
        colliders.insert(
            ColliderBuilder::cuboid(1000.0, 0.05, 1000.0)
                .translation(vector![0.0, -0.05, 0.0])
                .build(),
        );
        let mut query = QueryPipeline::new();
        query.update(&colliders);
        let wheel = wheel();
        for z in [0.0, 400.0] {
            let handle = bodies.insert(
                RigidBodyBuilder::dynamic()
                    .translation(vector![5.0, 0.565, z])
                    .build(),
            );
            let hit = cast_wheel_ground(
                &wheel,
                &bodies[handle],
                &query,
                &bodies,
                &colliders,
                handle,
                InteractionGroups::all(),
            )
            .unwrap();
            let center = hit.hit_point + hit.ground_normal * wheel.radius;
            assert!((center.y - wheel.radius).abs() < 1.0e-5);
            assert!((hit.compression - 0.065).abs() < 1.0e-5);
        }
    }

    #[test]
    fn wheel_above_full_droop_has_no_ground_contact() {
        let mut bodies = RigidBodySet::new();
        let handle = bodies.insert(
            RigidBodyBuilder::dynamic()
                .translation(vector![0.0, 0.70, 0.0])
                .build(),
        );
        let mut colliders = ColliderSet::new();
        colliders.insert(
            ColliderBuilder::cuboid(10.0, 0.05, 10.0)
                .translation(vector![0.0, -0.05, 0.0])
                .build(),
        );
        let mut query = QueryPipeline::new();
        query.update(&colliders);
        assert!(
            cast_wheel_ground(
                &wheel(),
                &bodies[handle],
                &query,
                &bodies,
                &colliders,
                handle,
                InteractionGroups::all()
            )
            .is_none()
        );
    }
}

impl SuspensionContact {
    /// Construct a force-solver patch. The caller supplies effective friction
    /// from the road/tire combination, including any per-wheel thermal grip.
    pub fn tire_patch(
        &self,
        wheel: &Wheel,
        body: &RigidBody,
        friction: f32,
        brake: f32,
    ) -> crate::tire::ContactPatch {
        let local_forward = body.rotation().inverse() * self.forward;
        let steer_angle = if wheel.steer {
            local_forward.x.atan2(local_forward.z)
        } else {
            0.0
        };
        let tangent_velocity =
            self.point_vel - self.ground_normal * self.point_vel.dot(&self.ground_normal);
        let speed = tangent_velocity.norm();
        let brake_dir = if speed > 1.0e-4 {
            -tangent_velocity / speed
        } else {
            self.forward * if self.v_long >= 0.0 { -1.0 } else { 1.0 }
        };
        crate::tire::ContactPatch {
            wheel: WheelId::from_debug(&wheel.debug_id),
            grounded: self.grounded,
            hit_point: self.hit_point.coords.into(),
            apply_point: self.apply_point.coords.into(),
            forward: self.forward.into(),
            side: self.side.into(),
            v_long: self.v_long,
            v_lat: self.v_lat,
            normal_force: self.normal_force,
            mu_long: friction,
            mu_lat: friction,
            roll_factor: 1.0,
            drive: wheel.drive,
            brake,
            steer_angle,
            compression_ratio: self.compression_ratio,
            vel_world: self.point_vel.into(),
            brake_dir: brake_dir.into(),
            speed_planar: speed,
            yaw_rate: body.angvel().y,
            relative_com: (self.apply_point - *body.center_of_mass()).into(),
            tire_state: wheel.tire_state,
        }
    }
}
