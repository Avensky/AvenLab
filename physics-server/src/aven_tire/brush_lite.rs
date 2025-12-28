// src/aven_tire/brush_lite.rs
use rapier3d::prelude::Real;
use crate::aven_tire::types::{ContactPatch, ControlInput, SolveContext, Vec3, v_scale};
use crate::aven_tire::WheelId;

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
            suspension_falloff: 0.60,
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
    let steer_factor = 1.0 - steer_intensity * cfg.steer_falloff;
    
    let compression_ratio = patch.compression_ratio.clamp(0.0, 1.0);
    let suspension_factor = 1.0 - compression_ratio * cfg.suspension_falloff;
    
    // let authority = (steer_factor * suspension_factor).clamp(0.0, 1.0);

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
    
    let speed_factor = (speed / 3.0).clamp(0.3, 1.0);
    desired_lat_impulse *= speed_factor;
    
    // 6) near-stop scrub when braking
    if speed < 0.5 && ctrl.brake > 0.3 {
        let scrub = ((5.0 - speed) / 5.0).clamp(0.0, 1.0);
        desired_lat_impulse += -patch.v_lat * ctx.mass * 0.25 * scrub;
    };
    
    // 7) Same Coulomb clamp
    let max_lat_impulse = patch.mu_lat * patch.normal_force * dt;
    desired_lat_impulse = desired_lat_impulse.clamp(-max_lat_impulse, max_lat_impulse);
    
    v_scale(patch.side, desired_lat_impulse)

}