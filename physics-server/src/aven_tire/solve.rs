// ==============================================================================
// solve.rs — TIRE SOLVER (IMPULSE-DOMAIN FRICTION + YAW + ALIGNING TORQUE)
// ==============================================================================
// ------------------------------------------------------------------------------
// This module combines:
// - Longitudinal impulses (engine + brake) from longitudinal.rs
// - Lateral impulses from brush_lite.rs
// - A combined-slip friction ellipse in impulse space
// - A split of lateral impulse into:
//     (a) at-contact component -> yaw moment
//     (b) at-COM component     -> lateral translation
// - Optional aligning torque (Mz) via pneumatic trail approximation:
//
//     Fy ≈ (J_lat / dt) projected onto wheel side
//     trail(|α|) = trail0 * exp(-|α|/alpha_falloff)
//     Mz = -Fy * trail
//     torque impulse = Mz * dt around up axis
//
// Outputs a list of Impulse actions consumed by physics.rs, which applies:
// - apply_impulse() at COM
// - apply_impulse_at_point() at contact point
// - apply_torque_impulse() for aligning torque
// ==============================================================================


use crate::aven_tire::types::{
    ContactPatch, ControlInput, Impulse, SolveContext,
    v_mag, v_scale,
};
use crate::aven_tire::longitudinal::solve_longitudinal;
use crate::aven_tire::brush_lite::{solve_brush_lite, BrushLiteConfig};

#[derive(Clone, Copy, Debug)]
pub struct AligningTorqueConfig {
    pub trail0: f32,        // meters (0.04–0.12 typical)
    pub alpha_falloff: f32, // radians (0.2–0.5)
    pub min_speed: f32,     // m/s
    pub max_mz: f32,        // clamp moment (N*m)
}

impl Default for AligningTorqueConfig {
    fn default() -> Self {
        Self {
            trail0: 0.08,
            alpha_falloff: 0.35,
            min_speed: 0.5,
            max_mz: 4500.0,
        }
    }
}


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
        let speed = (c.v_long * c.v_long + c.v_lat * c.v_lat).sqrt();
        let lat_boost = (1.0 + 0.6 * (speed / 20.0)).clamp(1.0, 1.8);

        let max_lat = c.mu_lat * c.normal_force * ctx.dt * lat_boost;
        // let max_lat  = (c.mu_lat * c.normal_force * ctx.dt).max(1e-6);

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

        // =======================================================================================
        // Lateral → split COM + contact point (yaw moment)
        // More yaw at low speed, less at high speed.
        // =======================================================================================
        let speed = (c.v_long * c.v_long + c.v_lat * c.v_lat).sqrt();

        // 0 m/s => 0.70 yaw, 20 m/s => 0.20 yaw
        let yaw_frac = (0.70 - 0.50 * (speed / 20.0).clamp(0.0, 1.0)).clamp(0.15, 0.75);

        // Front wheels contribute more yaw than rear (helps turning-in)
        let yaw_frac = if c.wheel.is_front() { yaw_frac } else { yaw_frac * 0.35 };


        
        // ==========================================================================================
        // Aligning Torque 
        // ==========================================================================================
        let align_cfg = AligningTorqueConfig::default();
        
        
        // Only meaningful if we have lateral and enough speed
        if speed > align_cfg.min_speed && v_mag(lat_i) > 1e-6 {
            // Slip angle approximation (radians)
            // α = atan2(v_lat, |v_long|), stable near zero
            let alpha = c.v_lat.atan2(c.v_long.abs().max(0.5));
            
            // Pneumatic trail falls off with |α|
            let trail = align_cfg.trail0 * (-alpha.abs() / align_cfg.alpha_falloff.max(1e-3)).exp();
            
            // Offset contact point ALONG forward axis
            let align_offset = v_scale(c.forward, trail);
            
            // Shift lateral impulse application point
            let align_point = [
                c.hit_point[0] + align_offset[0],
                c.hit_point[1],
                c.hit_point[2] + align_offset[2],
                ];
                
            // reduce yaw when aligning torque is active
            let yaw_reduction = 1.0 - (trail / align_cfg.trail0).clamp(0.0, 0.6);
            let yaw_frac = yaw_frac * yaw_reduction;
    
            let com_frac   = 1.0 - yaw_frac;
    
            let lat_point = v_scale(lat_i, yaw_frac);
            let lat_com   = v_scale(lat_i, com_frac);
            
            // Apply SAME lateral impulse, different point
            impulses.push(Impulse {
                impulse: lat_point,
                at_point: Some(align_point),
            });
        }
    }

    impulses
}