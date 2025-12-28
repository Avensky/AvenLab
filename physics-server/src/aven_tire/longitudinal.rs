// src/aven_tire/longitudinal.rs
// use rapier3d::prelude::Real;
use crate::aven_tire::types::{
    Vec3,
    SolveContext,
    ControlInput,
    ContactPatch,
    v_scale,
    v_add,
    v_mag,
};

// ====================================================================
// Result of longitudinal solve
// ====================================================================

pub struct LongitudinalResult {
    pub impulse: Vec3,
    pub nx: f32,
}
// ====================================================================
// Longitudinal tire model step
// - Engine + brake + ABS/TCS + traction limits.
// - Returns longitudinal impulse at COM and nx for combined-slip ellipse.
// ====================================================================
pub fn solve_longitudinal(
    ctx: &SolveContext,
    ctrl: &ControlInput,
    patch: &ContactPatch,
    brake_share: f32,
) -> LongitudinalResult {
    if !patch.grounded {
        return LongitudinalResult { impulse: [0.0,0.0,0.0], nx: 0.0 };
    }

    let dt = ctx.dt;

    let max_long = (patch.normal_force * dt * 0.8).max(1e-6);
    let max_traction = patch.normal_force * 0.8;

    // -------------------------
    // ENGINE FORCE - (per driven wheel)
    // -------------------------
    let engine_force = if patch.drive {
        (ctx.engine_force / ctx.driven_wheels.max(1.0)) * ctrl.throttle
    } else { 0.0 };

    let mut engine_impulse =
        v_scale(patch.forward, engine_force.clamp(-max_traction, max_traction) * dt);

    // -------------------------
    // BRAKE 
    // -------------------------
    // brake impulse cancels v_long (never “pushes forward” when braking)
    // Brake impulse opposes longitudinal velocity

    let desired_brake =
        (-patch.v_long * ctx.mass) * ctrl.brake * brake_share;

    let max_brake =
        (ctx.brake_force * brake_share * dt).min(max_long);

    let mut brake_scalar =
        desired_brake.clamp(-max_brake, max_brake);

   // Deadzone near zero speed
    if patch.v_long.abs() < 0.05 {
        brake_scalar = 0.0;
    }

    let mut brake_impulse = v_scale(patch.forward, brake_scalar);

    // ------------------------------------------------
    // ABS / TCS
    // ------------------------------------------------
    let engine_nx = v_mag(engine_impulse) / max_long;
    let brake_nx  = v_mag(brake_impulse)  / max_long;

    // Traction Control
    if ctx.tcs_enabled && ctrl.throttle > 0.01 && engine_nx > ctx.tcs_limit {
        let s = (ctx.tcs_limit / engine_nx).clamp(0.0, 1.0);
        engine_impulse = v_scale(engine_impulse, s);
    }


    if ctrl.brake > 0.3 && patch.v_long.abs() < 1.0 {
        engine_impulse = v_scale(engine_impulse, 0.25); // or 0.0 for arcade
    }

    // -------------------------
    // ABS
    // -------------------------
    if ctx.abs_enabled
        && ctrl.brake > 0.01
        && patch.v_long.abs() > 1.0
        && brake_nx > ctx.abs_limit
    {
        let s = (ctx.abs_limit / brake_nx).clamp(0.0, 1.0);
        brake_impulse = v_scale(brake_impulse, s);
    }

    // ------------------------------------------------
    // COMBINE ENGINE + BRAKE
    // ------------------------------------------------
    let impulse = v_add(engine_impulse, brake_impulse);

    let nx = v_mag(impulse) / max_long;

    LongitudinalResult { impulse, nx,}
}
