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
    if !patch.grounded { return LongitudinalResult { impulse: [0.0,0.0,0.0], nx: 0.0 };}

    let dt = ctx.dt.max(1e-6);

    // =========================================================
    // CARDINAL RULE: one source of truth for longitudinal capacity
    // J_cap is the max friction impulse available this step
    // =========================================================
    let j_cap = (patch.mu_long * patch.normal_force * dt).max(1e-6);

    // =========================================================
    // ENGINE (drive wheels only)
    // - produce an impulse along +forward
    // - clamp by friction capacity
    // =========================================================

    let load_frac = (patch.normal_force / (ctx.mass * 9.81 / ctx.driven_wheels.max(1.0)))
        .clamp(0.5, 1.6);

    let engine_force = if patch.drive {
        (ctx.engine_force / ctx.driven_wheels.max(1.0))
            * ctrl.throttle
            * load_frac
    } else {
        0.0
    };

    // Convert force -> impulse and clamp to friction capacity
    let mut engine_j = (engine_force * dt).clamp(-j_cap, j_cap);
    let mut engine_impulse = v_scale(patch.forward, engine_j);

    // =========================================================
    // BRAKE (all wheels)
    // CARDINAL RULE: brake must oppose v_long
    // =========================================================

    // Actuator brake limit in impulse domain (force * dt)
    let j_brake_act = (ctx.brake_force * brake_share * dt).max(0.0);

    // "How much impulse would stop the current longitudinal speed this frame?"
    // (If v_long>0, J_stop is negative, i.e. opposite forward.)
    let j_stop = -ctx.mass * patch.v_long;

    // Demand: scaled by brake input and brake share
    let j_brake_demand = j_stop * ctrl.brake;

    // Final brake impulse scalar: clamp by actuator AND friction capacity
    // Also: never exceed available friction budget for long channel
    let mut brake_j = j_brake_demand.clamp(-j_brake_act, j_brake_act);
    brake_j = brake_j.clamp(-j_cap, j_cap);

    // Optional: “no reverse push” safety
    // Brake should never be in the same direction as velocity.
    // i.e. brake_j * v_long should be <= 0
    if brake_j * patch.v_long > 0.0 {
        brake_j = 0.0;
    }

    // Low-speed handling:
    // - If braking and almost stopped, just cancel the tiny residual velocity (prevents jitter)
    // - If not braking, don’t inject noise
    if patch.v_long.abs() < 0.05 {
        if ctrl.brake > 0.1 {
            // cancel residual
            brake_j = (-ctx.mass * patch.v_long)
                .clamp(-j_brake_act, j_brake_act)
                .clamp(-j_cap, j_cap);
        } else {
            brake_j = 0.0;
        }
    }

    let mut brake_impulse = v_scale(patch.forward, brake_j);

    // direction opposite actual motion on ground
    let v = patch.vel_world;
    let v_planar = [v[0], 0.0, v[2]];
    let speed = v_mag(v_planar);

    if speed > 1e-3 {
        let brake_dir = v_scale(v_planar, -1.0 / speed);
        brake_impulse = v_scale(brake_dir, brake_j.abs());
    } else {
        brake_impulse = [0.0, 0.0, 0.0];
    }


    // =========================================================
    // ABS / TCS (operate on impulse ratios vs capacity)
    // =========================================================
    let engine_nx = v_mag(engine_impulse) / j_cap;
    let brake_nx  = v_mag(brake_impulse)  / j_cap;

    // Traction Control
    if ctx.tcs_enabled && ctrl.throttle > 0.01 && engine_nx > ctx.tcs_limit {
        let s = (ctx.tcs_limit / engine_nx).clamp(0.0, 1.0);
        engine_impulse = v_scale(engine_impulse, s);
    }

    // Reduce engine while braking at low speed (optional “auto-clutch”)
    // if ctrl.brake > 0.3 && patch.v_long.abs() < 1.0 {
    //     engine_impulse = v_scale(engine_impulse, 0.25);
    // }

    // ABS
    if ctx.abs_enabled
        && ctrl.brake > 0.01
        && patch.v_long.abs() > 1.0
        && brake_nx > ctx.abs_limit
    {
        let s = (ctx.abs_limit / brake_nx).clamp(0.0, 1.0);
        brake_impulse = v_scale(brake_impulse, s);
    }

    // =========================================================
    // IMPORTANT BUGFIX:
    // Remove speed-based "relax" that weakens brakes more at high speed.
    // If you want smoothing, use a *constant* time constant, not |v|.
    // =========================================================
    // If you want a gentle smoothing:
    // let tau = 0.10; // seconds
    // let a = 1.0 - (-dt / tau).exp();
    // brake_impulse = v_scale(brake_impulse, a);

    let impulse = v_add(engine_impulse, brake_impulse);
    let nx = v_mag(impulse) / j_cap;

    LongitudinalResult { impulse, nx }
}
