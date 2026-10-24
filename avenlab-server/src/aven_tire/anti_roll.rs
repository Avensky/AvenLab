// ==============================================================================
// anti_roll.rs — ANTI-ROLL BAR (ARB) LOAD TRANSFER (IMPULSE-DOMAIN SUPPORT)
// ------------------------------------------------------------------------------
// Anti-roll bars do NOT create net vertical force; they redistribute load across
// left/right wheels on the same axle based on suspension compression difference.
//
// apply_arb_load_transfer(left, right, ...):
// - Reads compression(left/right)
// - Computes delta = cl - cr
// - Computes a transfer amount proportional to delta (arb_stiffness * delta)
// - Clamps transfer to avoid negative loads / exceeding reference load
// - Updates axle_normal_force map for left/right
//
// Output of this module is consumed by physics.rs Phase 3:
// - Updated normal forces drive:
//   (a) suspension impulses Jn = n * Fz * dt
//   (b) tire limits (mu*Fz) inside the tire solver
// ==============================================================================


use rapier3d::prelude::*;
use std::collections::HashMap;
use crate::aven_tire::WheelId;

/// One anti-roll bar axle pair (FL/FR or RL/RR)
#[derive(Clone)]
pub struct AntiRollPair {
    pub left_id: WheelId,
    pub right_id: WheelId,

    pub compression_l: f32,
    pub compression_r: f32,

    pub hit_l: Point<Real>,
    pub hit_r: Point<Real>,

    pub stiffness: f32, // N/m
}

pub fn apply_arb_load_transfer(
    left: WheelId,
    right: WheelId,
    axle_normal_force: &mut HashMap<WheelId, f32>,
    axle_compression: &HashMap<WheelId, f32>,
    arb_stiffness: f32,
    fz_ref: f32,
) {
    let (Some(cl), Some(cr)) = (
        axle_compression.get(&left),
        axle_compression.get(&right),
    ) else { return };

    let delta = cl - cr;

    if delta.abs() < 1e-4 {
        return;
    }

    // Raw Force transfer proportional to compression difference
    let transfer = arb_stiffness * delta;

    
    // left / right normals
    let nl = axle_normal_force.get(&left).copied().unwrap_or(0.0).max(0.0);
    let nr = axle_normal_force.get(&right).copied().unwrap_or(0.0).max(0.0);
    

    // scale by load to avoid jacking
    let load_scale = (nl + nr) / (2.0 * fz_ref.max(1.0e-6));
    let transfer = transfer * load_scale.clamp(0.3, 1.2);


    // Saturation: cannot exceed available load
    // let max_transfer = 0.6 * (nl + nr);
    let max_transfer = 0.4 * fz_ref.max(0.0);
    let transfer = transfer.clamp(-max_transfer, max_transfer);
    let transfer = transfer.clamp(-nl, nr);

    // redistribute
    // Support the lower, more compressed side without creating axle load.
    axle_normal_force.insert(left, nl + transfer);
    axle_normal_force.insert(right, nr - transfer);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redistribution_conserves_axle_load_when_a_wheel_unloads() {
        for (nl, nr) in [(100.0, 100.0), (0.0, 1000.0), (1000.0, 0.0)] {
            for (cl, cr) in [(0.06, 0.02), (0.02, 0.06), (0.12, 0.0)] {
                let mut loads = HashMap::from([(WheelId::FL, nl), (WheelId::FR, nr)]);
                let compression = HashMap::from([(WheelId::FL, cl), (WheelId::FR, cr)]);
                apply_arb_load_transfer(
                    WheelId::FL, WheelId::FR, &mut loads, &compression, 14000.0, 3139.2,
                );
                let left = loads[&WheelId::FL];
                let right = loads[&WheelId::FR];
                assert!(left >= 0.0 && right >= 0.0);
                assert!((left + right - nl - nr).abs() < 0.001);
            }
        }
    }

    #[test]
    fn more_compressed_side_receives_restoring_support() {
        let mut loads = HashMap::from([(WheelId::FL, 3000.0), (WheelId::FR, 3000.0)]);
        let compression = HashMap::from([(WheelId::FL, 0.08), (WheelId::FR, 0.05)]);
        apply_arb_load_transfer(
            WheelId::FL, WheelId::FR, &mut loads, &compression, 14000.0, 3139.2,
        );
        assert!(loads[&WheelId::FL] > 3000.0);
        assert!(loads[&WheelId::FR] < 3000.0);
    }

    #[test]
    fn a_loaded_outside_tire_can_support_more_than_one_and_a_half_resting_loads() {
        let reference = 3000.0;
        let mut loads = HashMap::from([(WheelId::FL, 1.8 * reference), (WheelId::FR, 0.2 * reference)]);
        let compression = HashMap::from([(WheelId::FL, 0.1), (WheelId::FR, 0.01)]);
        apply_arb_load_transfer(WheelId::FL, WheelId::FR, &mut loads, &compression, 14000.0, reference);
        assert!(loads[&WheelId::FL] > 1.5 * reference);
        assert!((loads[&WheelId::FL] + loads[&WheelId::FR] - 2.0 * reference).abs() < 0.001);
    }
}
