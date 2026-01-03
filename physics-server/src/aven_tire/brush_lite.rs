// ==============================================================================
// brush_lite.rs — LIGHTWEIGHT LATERAL TIRE MODEL (IMPULSE DOMAIN)
// ==============================================================================
// This is a "brush-lite" lateral model
// ------------------------------------------------------------------------------
// Inputs:
// - ContactPatch (v_lat, v_long, normal_force, mu_lat, compression_ratio, basis)
// - SolveContext (mass, dt)
// - ControlInput (steer/brake shaping)
//
// Model steps (high-level):
// 1) deadzone for tiny v_lat
// 2) slip relaxation via relaxation length (reduces instantaneous lateral demand)
// 3) authority falloffs (steer + suspension compression shaping)
// 4) brake-stiction shaping near low speed
// 5) desired lateral impulse ~ -v_lat * mass (impulse cancels lateral slip)
// 6) Coulomb clamp: |J_lat| <= mu_lat * Fz * dt
//
// Output:
// - A world-space lateral impulse vector aligned with patch.side.
//
// This file does NOT apply impulses; solve.rs combines it with longitudinal and
// applies a friction ellipse + yaw split.
// ==============================================================================

use rapier3d::prelude::Real;
use crate::aven_tire::types::{ContactPatch, ControlInput, SolveContext, Vec3, v_scale};

/// Configuration for lightweight brush tire model
#[derive(Clone, Copy, Debug)]
pub struct BrushLiteConfig {
    pub relaxation_length: Real,    // meters (0.5–1.5 typical)
    pub steer_falloff: Real,        // 0..1 (reduces lateral authority with steer)
    pub suspension_falloff: Real,   // 0..1 (reduces lateral authority when compressed)
    pub v_lat_deadzone: Real,       // m/s
}

impl Default for BrushLiteConfig {
    fn default() -> Self {
        Self {
            relaxation_length: 1.0,
            steer_falloff: 0.45,
            suspension_falloff: 0.10,
            v_lat_deadzone: 0.02,
        }
    }
}


/// Output remains identical to old behavior
#[derive(Clone, Copy, Debug)]
pub struct BrushLiteOutput {
    pub impulse_lat: Vec3,
    pub ny: Real,
}

pub fn solve_brush_lite(
    cfg: &BrushLiteConfig,
    ctx: &SolveContext,
    ctrl: &ControlInput,
    patch: &ContactPatch,
) -> Vec3 {
    if !patch.grounded { return [0.0, 0.0, 0.0]; }

    let dt = ctx.dt;

    // 1) lat deadzone
    let v_lat = patch.v_lat;
    if v_lat.abs() < cfg.v_lat_deadzone {
        return [0.0, 0.0, 0.0];
    }

    // 2) --- Slip relaxation (brush-lite) ---
    let forward_speed = patch.v_long.abs().max(0.5);
    let relaxation = (-dt * forward_speed / cfg.relaxation_length.max(1e-3)).exp();
    let relaxed_lateral_speed = v_lat * relaxation;

    // 3) --- Authority falloffs ---
    let steer_intensity = ctrl.steer.abs().clamp(0.0, 1.0);
    // let steer_factor = 1.0 - steer_intensity * cfg.steer_falloff;
    let steer_factor = if patch.wheel.is_front() {
        1.0 - steer_intensity * cfg.steer_falloff
    } else {
        1.0 - steer_intensity * 0.15
    };

    
    let compression_ratio = patch.compression_ratio.clamp(0.0, 1.0);
    let suspension_factor = 1.0 - compression_ratio * cfg.suspension_falloff;
    
    // 4) brake-stiction shaping
    // let speed = (patch.v_long * patch.v_long + v_lat * v_lat).sqrt();
    let speed = (patch.v_long * patch.v_long + patch.v_lat * patch.v_lat).sqrt();
    
    let brake_stick: Real = if ctrl.brake > 0.2 && speed < 5.0 { 1.0 } else { 0.0 };
    let tire_relaxation: Real = (0.25 as Real + 0.75 as Real * brake_stick)
    .clamp(0.25 as Real, 1.0 as Real); 
    
    // 5) Same desired impulse  
    let mut desired_lat_impulse =
        (-relaxed_lateral_speed * ctx.mass)
        * tire_relaxation
        * steer_factor
        * suspension_factor;

    // 6) Allow parking-lot turns, but limit lateral shove
    let speed_factor = if speed < 2.0 {
        0.4 + 0.6 * (speed / 2.0)
    } else {
        1.0
    };

    desired_lat_impulse *= speed_factor;
    
    // 7) near-stop scrub when braking
    if speed < 0.5 && ctrl.brake > 0.3 {
        let scrub = ((5.0 - speed) / 5.0).clamp(0.0, 1.0);
        desired_lat_impulse += -patch.v_lat * ctx.mass * 0.25 * scrub;
    };
    
    // 8) Same Coulomb clamp
    let max_lat_impulse = patch.mu_lat * patch.normal_force * dt;
    desired_lat_impulse = desired_lat_impulse.clamp(-max_lat_impulse, max_lat_impulse);

    // 9) slip factor
    let alpha = patch.v_lat.atan2(patch.v_long.abs().max(1.0));
    let alpha_sat = 0.6; // ~35°

    let slip_factor = (1.0 - (alpha.abs() / alpha_sat))
        .clamp(0.0, 1.0);

    desired_lat_impulse *= slip_factor;
    
    v_scale(patch.side, desired_lat_impulse)

}