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
    let nl = axle_normal_force.get(&left).copied().unwrap_or(0.0);
    let nr = axle_normal_force.get(&right).copied().unwrap_or(0.0);
    

    // scale by load to avoid jacking
    let load_scale = (nl + nr) / (2.0 * fz_ref);
    let transfer = transfer * load_scale.clamp(0.3, 1.2);


    // Saturation: cannot exceed available load
    // let max_transfer = 0.6 * (nl + nr);
    let max_transfer = 0.4 * fz_ref;
    let transfer = transfer.clamp(-max_transfer, max_transfer);

    // redistribute
    axle_normal_force.insert(left,  (nl - transfer).max(0.0));
    axle_normal_force.insert(right, (nr + transfer).max(0.0));
}
