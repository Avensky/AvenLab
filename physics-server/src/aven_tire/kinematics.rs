// ==============================================================================
// kinematics.rs — WHEEL BASIS + SLIP DECOMPOSITION (WORLD SPACE)
// ------------------------------------------------------------------------------
// This module converts chassis orientation + steering angles into a per-wheel
// orthonormal basis:
// - forward: wheel rolling direction (world)
// - side: lateral direction (world), right-handed with world up
//
// wheel_basis_world(...):
// - Starts with chassis forward vector (rotation * [0,0,1])
// - Applies per-wheel steering rotation for front wheels (ackermann angles)
// - Builds side = up × forward, then normalizes
//
// slip_components(point_vel, forward, side):
// - Projects point velocity onto forward/side to yield:
//     v_long = dot(v, forward)
//     v_lat  = dot(v, side)
//
// These values feed the tire solver (brush + longitudinal).
// ==============================================================================

use rapier3d::na::UnitQuaternion;
use rapier3d::prelude::{Point, Real, Vector};

use crate::aven_tire::steering::WheelSteering;

/// World-space velocity of an arbitrary point rigidly attached to the body:
/// v(p) = v_com + ω × (p - com)
#[inline]
pub fn point_velocity(linvel: Vector<Real>, angvel: Vector<Real>, com: Point<Real>, p: Point<Real>) -> Vector<Real> {
    let r = p.coords - com.coords;
    linvel + angvel.cross(&r)
}

// Returns (wheel_forward, wheel_side) in world space.
// - Front wheels use steering solution output
// - Rear wheels use chassis orientation (rot)
#[inline]
pub fn wheel_basis_world(
    wheel_id: &str,
    rot: &UnitQuaternion<Real>,
    fl: &WheelSteering,
    fr: &WheelSteering,
) -> (Vector<Real>, Vector<Real>) {

    // World up (authoritative)
    // let up = Vector::new(0.0, 1.0, 0.0);

    // -----------------------------
    // Select forward direction
    // -----------------------------
    match wheel_id {
        // -------------------------
        // FRONT WHEELS (STEERED)
        // -------------------------
        "FL" => (
            Vector::new(
                fl.forward[0] as Real, 
                fl.forward[1] as Real, 
                fl.forward[2] as Real
            ),
            Vector::new(
                fl.side[0] as Real, 
                fl.side[1] as Real, 
                fl.side[2] as Real
            )
        ),
        "FR" => (
            Vector::new(
                fr.forward[0] as Real,
                fr.forward[1] as Real,
                fr.forward[2] as Real,
            ),
            Vector::new(
                fr.side[0] as Real,
                fr.side[1] as Real,
                fr.side[2] as Real,
            )
        ),
        // -------------------------
        // REAR WHEELS (STRAIGHT)
        // -------------------------
        "RL" | "RR" => {
            // Rear wheels: chassis forward
            let forward = *rot * Vector::new(0.0, 0.0, 1.0);   // +Z is forward
            let side    = *rot * Vector::new(-1.0, 0.0, 0.0);  // -X is right, +X left

            (forward, side)

        },
        // -------------------------
        // FALLBACK (SAFE)
        // -------------------------
        _ => {
            let forward = *rot * Vector::new(0.0, 0.0, 1.0);   // +Z is forward
            let side    = *rot * Vector::new(1.0, 0.0, 0.0);   // +X is right

            (forward, side)
        }

    }

}


/// Compute (v_long, v_lat) given point velocity and wheel basis.
#[inline]
pub fn slip_components(point_vel: Vector<Real>, wheel_forward: Vector<Real>, wheel_side: Vector<Real>) -> (Real, Real) {
    (-point_vel.dot(&wheel_forward), point_vel.dot(&wheel_side))
}

#[inline]
fn safe_normalize(v: Vector<Real>, fallback: Vector<Real>) -> Vector<Real> {
    let n = v.norm();
    if n > 1e-6 { v / n } else { fallback }
}
