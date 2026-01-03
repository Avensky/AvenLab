// src/aven_tire/solve.rs
//
// ====================================================================
// TIRE FORCE SOLVER (Impulse Domain)
// --------------------------------------------------------------------
// Physics model:
// - Impulse-domain tire forces
// - Computes Longitudinal impulses (engine + brake)
// - Computes Lateral impulses via brush tire (slip velocity → impulse)
// - Applies a Combined-slip friction ellipse
// - Splits lateral impulse into:
//     * COM component (pure lateral acceleration)
//     * at-point component (yaw moment)
//
// This solver MUST NOT:
// - Directly modify velocity alignment
// - Enforce steering geometry (already handled upstream)
// - Apply artificial forces unrelated to tire slip
//
// If steering feels weak, the problem is almost always:
// - Incorrect wheel_side direction
// - Lateral impulse scaling
// - Yaw leverage point (point_frac)
//
// Steering MUST already be encoded in ContactPatch.forward / side.
// ====================================================================

use crate::aven_tire::types::{
    ContactPatch, ControlInput, Impulse, SolveContext,
    v_mag, v_scale,
};
use crate::aven_tire::longitudinal::solve_longitudinal;
use crate::aven_tire::brush_lite::{solve_brush_lite, BrushLiteConfig};

pub fn solve_step(
    ctx: &SolveContext,
    ctrl: &ControlInput,
    contacts: &[ContactPatch],
) -> Vec<Impulse> {

    let mut impulses = Vec::new();
    let brush_cfg = BrushLiteConfig::default();

    // --------------------------------------------------
    // Brake bias (pure load-based, no heuristics)
    // --------------------------------------------------
    let mut fz_front = 0.0;
    let mut fz_rear  = 0.0;

    for c in contacts.iter().filter(|c| c.grounded) {
        if c.wheel.is_front() { fz_front += c.normal_force; }
        else { fz_rear += c.normal_force; }
    }

    let fz_total = (fz_front + fz_rear).max(1e-6);
    let front_bias = (fz_front / fz_total).clamp(0.55, 0.85);
    let rear_bias  = 1.0 - front_bias;

    let front_per_wheel = front_bias * 0.5;
    let rear_per_wheel  = rear_bias  * 0.5;

    // --------------------------------------------------
    // Per-wheel tire solve
    // --------------------------------------------------
    for c in contacts.iter() {
        if !c.grounded || c.normal_force < 50.0 {
            continue;
        }

        let brake_share =
            if c.wheel.is_front() { front_per_wheel } else { rear_per_wheel };

        // Longitudinal impulse (engine + brake)
        let long = solve_longitudinal(ctx, ctrl, c, brake_share);

        // Lateral impulse (brush model)
        let lat  = solve_brush_lite(&brush_cfg, ctx, ctrl, c);

        // --------------------------------------------------
        // Combined slip ellipse (impulse domain)
        // --------------------------------------------------
        let max_long = (c.normal_force * ctx.dt * 0.8).max(1e-6);
        let max_lat  = (c.mu_lat * c.normal_force * ctx.dt).max(1e-6);

        let nx = v_mag(long.impulse) / max_long;
        let ny = v_mag(lat) / max_lat;

        let ellipse = nx * nx + ny * ny;
        let scale = if ellipse > 1.0 {
            1.0 / ellipse.sqrt()
        } else {
            1.0
        };

        let long_i = v_scale(long.impulse, scale);
        let lat_i  = v_scale(lat, scale);

        // --------------------------------------------------
        // Apply impulses
        // --------------------------------------------------

        // Longitudinal → COM
        if v_mag(long_i) > 1e-6 {
            impulses.push(Impulse {
                impulse: long_i,
                at_point: None,
            });
        }

        // Lateral → split COM + contact point (yaw moment)
        let point_frac = 0.75; // yaw-dominant
        let com_frac   = 0.25;

        let lat_point = v_scale(lat_i, point_frac);
        let lat_com   = v_scale(lat_i, com_frac);

        if v_mag(lat_point) > 1e-6 {
            impulses.push(Impulse {
                impulse: lat_point,
                at_point: Some(c.hit_point),
            });
        }

        if v_mag(lat_com) > 1e-6 {
            impulses.push(Impulse {
                impulse: lat_com,
                at_point: None,
            });
        }
    }

    impulses
}