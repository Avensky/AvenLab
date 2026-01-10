// ==============================================================================
// longitudinal.rs — LONGITUDINAL (ENGINE + BRAKE) TIRE MODEL (Impulse-Based)
// src/aven_tire/longitudinal.rs
// ==============================================================================
// This model assumes:
// - Raycast suspension provides correct normal_force
// - Lateral forces are handled independently (brush model)
// ------------------------------------------------------------------------------
// Computes the longitudinal impulse demand per wheel using:
// 1) Engine force (drive wheels only)
// 2) Brake force (all wheels, brake-biased)
// 3) ABS / TCS limiting (relative demand vs capacity)
//
// Important properties:
// - No wheel angular velocity state is tracked.
// - "Slip ratio" is approximated implicitly via impulse demand and clamping.
// - Stability depends on the combined-slip ellipse in solve_step().
// - Capacity is proportional to normal force (Fz) and dt.
//
// Output:
// - LongitudinalResult { impulse, nx }
// where nx is used in solve.rs for the combined-slip ellipse.
// ================================================================================
// - cardinal rules
// ================================================================================
// Impulses are in N·s (force * dt).
// Brake impulse must always oppose v_long (never accelerate you).
// Capacity is J_cap = μ_long * Fz * dt (your friction budget in impulse space).
// Actuator limit is separate: J_brake_act = brake_force * dt * share (can’t exceed this even if friction allows).
// One source of truth for J_cap — don’t use 0.8 in one file and mu_long in another.
// ===============================================================================


// use rapier3d::prelude::Real;
// use crate::physics::Wheel;
use crate::aven_tire::state::{TireState};
use crate::aven_tire::types::{
    Vec3,
    SolveContext,
    ControlInput,
    ContactPatch,
    v_scale,
    v_add,
};

// ====================================================================
// Result of longitudinal solve
// ====================================================================

pub struct LongitudinalResult {
    pub impulse: Vec3
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
    _brake_share: f32,
) -> LongitudinalResult {

    if !patch.grounded { return LongitudinalResult { impulse: [0.0,0.0,0.0]};}
    
    let dt = ctx.dt.max(1e-6);

    // =========================================================
    //  Longitudinal friction capacity (impulse domain)
    // =========================================================
    let j_cap = (patch.mu_long * patch.normal_force * dt).max(1e-6);
    
    // =========================================================
    //  Forward projection helper (XZ plane)
    // =========================================================
    let fwd_xz = {
        let fx = patch.forward[0];
        let fz = patch.forward[2];
        let len = (fx * fx + fz * fz).sqrt().max(1e-6);
        [fx / len, 0.0, fz / len]
    };

    // =========================================================
    //  ENGINE (drive wheels only)  -> along +forward
    // =========================================================
    let load_frac = 
        (patch.normal_force / (ctx.mass * 9.81 / ctx.driven_wheels.max(1.0)))
            .clamp(0.5, 1.6);
    
    let engine_force = if patch.drive {
        (ctx.engine_force / ctx.driven_wheels.max(1.0))
        * ctrl.throttle
        * load_frac

    } else {
        0.0
    };
    
    // force -> impulse, limited by friction budget
    let engine_j = (engine_force * dt).clamp(-j_cap, j_cap);
    let mut engine_impulse = v_scale(patch.forward, engine_j);
    
    // =========================================================
    // BRAKE = longitudinal friction constraint
    // =========================================================
    let brake_input = ctrl.brake.clamp(0.0, 1.0);
    let mut brake_impulse = [0.0, 0.0, 0.0];

    if brake_input > 0.001 {

        // Longitudinal slip velocity INCLUDING yaw contribution
        let v_long_eff =
            patch.v_long
            - patch.yaw_rate * patch.relative_com[2];

        // Deadband prevents jitter at rest
        if v_long_eff.abs() > 0.15 {

            // Desired impulse to cancel longitudinal slip
            // NOTE: no mass guess — use velocity cancellation directly
            let j_desired = -v_long_eff * ctx.mass * 0.25;

            // Scale by brake input (driver intent)
            let j_cmd = j_desired * brake_input;

            // Clamp by friction capacity
            let j = j_cmd.clamp(-j_cap, j_cap);

            brake_impulse = v_scale(patch.forward, j);
        }
    }

    // =========================================================
    // Compute longitudinal usage (projection onto forward)
    // This is what ABS/TCS + solve.rs ellipse should measure.
    // =========================================================
    let engine_jx = (engine_impulse[0]*fwd_xz[0] + engine_impulse[2]*fwd_xz[2]).abs();
    let brake_jx  = (brake_impulse[0]*fwd_xz[0]  + brake_impulse[2]*fwd_xz[2]).abs();
    
    // =========================================================
    // TCS (traction control based on longitudinal usage)
    // =========================================================
    if ctx.tcs_enabled && ctrl.throttle > 0.01 {
        let nx = engine_jx / j_cap;
        if nx > ctx.tcs_limit {
            let s = (ctx.tcs_limit / nx).clamp(0.0, 1.0);
            engine_impulse = v_scale(engine_impulse, s);
        }
    }
    
    // =========================================================
    // ABS (based on longitudinal usage)
    // =========================================================
    if ctx.abs_enabled
        && ctrl.brake > 0.01
        && patch.speed_planar > 1.0
    {
        let nx = brake_jx / j_cap;
        let s = (ctx.abs_limit / nx).clamp(0.2, 1.0);
        brake_impulse = v_scale(brake_impulse, s);
    }

    let mut impulse = v_add(engine_impulse, brake_impulse);


    match patch.tire_state {
        TireState::Grip => { 
            /* unchanged */ 
        }

        TireState::Slide => {
            // soften longitudinal authority
            impulse = v_scale(impulse, 0.85);
        }

        TireState::Lock => {
            // braking lock: NO engine, NO corrective braking
            impulse = v_scale(impulse, 0.5);
        }
    }

    LongitudinalResult { impulse }
}
