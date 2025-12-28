//src/aven_tire/solve.rs

//! High-level solve step orchestration.
//!
//! Host engine provides contacts and applies returned impulses.

use crate::aven_tire::types::{
    ContactPatch, ControlInput, Impulse, SolveContext,
    v_mag, v_scale,
};
use crate::aven_tire::longitudinal::solve_longitudinal;
use crate::aven_tire::brush_lite::{solve_brush_lite, BrushLiteConfig};
use rapier3d::prelude::Real;

// ============================================================
// Return impulses to apply to the chassis body.
// Solve one chassis step: builds impulses (COM + at-point) for all grounded wheels.
// ============================================================
pub fn solve_step(
    ctx: &SolveContext,
    ctrl: &ControlInput,
    contacts: &[ContactPatch],
) -> Vec<Impulse> {

    let mut impulses: Vec<Impulse> = Vec::new();
    
    // (optional) pick defaults here if ctx doesn’t store brush config
    let brush_cfg = BrushLiteConfig::default();

    // -----------------------------
    // Dynamic brake bias (same logic as before)
    // -----------------------------
    let mut fz_front: Real = 0.0;
    let mut fz_rear: Real  = 0.0;

    for c in contacts.iter() {
        if !c.grounded { continue; }
        if c.wheel.is_front() { fz_front += c.normal_force; }
        else { fz_rear += c.normal_force; }
    }

    let fz_total = (fz_front + fz_rear).max(1e-6);
    let front_load_frac = (fz_front / fz_total).clamp(0.0, 1.0);

    let base_front: Real = 0.66;
    let bias_gain: Real  = 0.25;

    let mut front_bias = base_front + bias_gain * (front_load_frac - 0.5);
    front_bias = front_bias.clamp(0.55, 0.90);
    let rear_bias = 1.0 - front_bias;

    let front_per_wheel = front_bias * 0.5;
    let rear_per_wheel  = rear_bias  * 0.5;

     // --- per contact solve ---
    for c in contacts.iter() {
        if !c.grounded { continue; }

        let brake_share =
            if c.wheel.is_front() { front_per_wheel } else { rear_per_wheel };

        // Longitudinal (returns Vec3)
        let long = solve_longitudinal(ctx, ctrl, c, brake_share);

        // Lateral (returns Vec3)
        let lat = solve_brush_lite(&brush_cfg, ctx, ctrl, c);

        // Combined slip ellipse
        let max_long = (c.normal_force * ctx.dt * 0.8).max(1e-6);
        let max_lat  = (c.mu_lat * c.normal_force * ctx.dt).max(1e-6);

        let nx = (v_mag(long.impulse) / max_long).abs();
        let ny = (v_mag(lat) / max_lat).abs();

        let ellipse = nx * nx + ny * ny;
        let scale = if ellipse > 1.0 {
            1.0 / ellipse.sqrt()
        } else {
            1.0
        };

        let long_scaled = v_scale(long.impulse, scale);
        let lat_scaled  = v_scale(lat, scale);

        // traction at COM
        if v_mag(long_scaled) > 1e-7 {
            impulses.push(Impulse {
                impulse: long_scaled,
                at_point: None,
            });
        }

        // lateral split between at-point and COM using roll_factor
        // let roll = c.roll_factor; // ~0.3, already computed correctly
        let roll = (c.roll_factor * 1.15).clamp(0.2, 0.45);

        // yaw-producing component (at contact)
        let lat_at_point = v_scale(lat_scaled, roll);

        // pure lateral accel (at COM)
        let lat_at_com = v_scale(lat_scaled, 1.0 - roll);

        if v_mag(lat_at_point) > 1e-7 {
            impulses.push(Impulse {
                impulse: lat_at_point,
                at_point: Some(c.apply_point),
            });
        }

        if v_mag(lat_at_com) > 1e-7 {
            impulses.push(Impulse {
                impulse: lat_at_com,
                at_point: None,
            });
        }

    }

    impulses
}