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
// - LongitudinalResult { impulse }; solve.rs measures its normalized usage.
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
// - Returns longitudinal impulse at COM; solve.rs computes ellipse usage.
// ====================================================================
pub fn solve_longitudinal(
    ctx: &SolveContext,
    ctrl: &ControlInput,
    patch: &ContactPatch,
    brake_share: f32,
) -> LongitudinalResult {

    if !patch.grounded || patch.normal_force <= 0.0 || ctx.dt <= 0.0 {
        return LongitudinalResult { impulse: [0.0; 3] };
    }

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
    // Divide the configured total drive force once. Normal load already limits
    // usable traction through j_cap; multiplying by a load fraction again
    // halved the requested force for a normally loaded rear-drive car.
    let engine_force = if patch.drive {
        (ctx.engine_force / ctx.driven_wheels.max(1.0))
        * ctrl.throttle.clamp(-1.0, 1.0)

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

        // Contact-point velocity already includes angular motion.
        let v_long_eff = patch.v_long;

        // Deadband prevents jitter at rest
        if v_long_eff.abs() > 0.15 {

            // Desired impulse to cancel longitudinal slip
            // This solver approximates each wheel's effective mass as mass / 4.
            let j_desired = -v_long_eff * ctx.mass * 0.25;

            // Scale by brake input (driver intent)
            let j_cmd = j_desired * brake_input;

            // Driver brake input scales actuator strength once. The desired
            // velocity-cancel impulse is a separate upper bound near rest.
            let j_act = (ctx.brake_force * brake_share * brake_input * dt).max(0.0);
            let j_limit = j_cap.min(j_act);
            let j = j_cmd.clamp(-j_limit, j_limit);

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
    if ctx.tcs_enabled && ctrl.throttle.abs() > 0.01 {
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
        && brake_input > 0.01
        && patch.speed_planar > 1.0
    {
        let nx = brake_jx / j_cap;
        let s = (ctx.abs_limit / nx).clamp(0.2, 1.0);
        brake_impulse = v_scale(brake_impulse, s);
    }

    // Engine and brake can oppose each other when both controls are held.
    // Their net demand is combined with lateral demand by one ellipse in solve.rs.
    let impulse = v_add(engine_impulse, brake_impulse);

    LongitudinalResult { impulse }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aven_tire::state::TireState;
    use crate::aven_tire::types::WheelId;

    fn context() -> SolveContext {
        SolveContext {
            dt: 1.0 / 120.0, mass: 1280.0, engine_force: 0.0, brake_force: 7600.0,
            abs_enabled: false, tcs_enabled: false, abs_limit: 0.9, tcs_limit: 0.85,
            driven_wheels: 2.0, base_front_bias: 0.66, bias_gain: 0.25,
            wheelbase: 2.6, mu_base: 0.9,
        }
    }

    fn patch(v_long: f32) -> ContactPatch {
        ContactPatch {
            wheel: WheelId::FL, grounded: true, hit_point: [0.0; 3], apply_point: [0.0; 3],
            forward: [0.0, 0.0, 1.0], side: [1.0, 0.0, 0.0], v_long, v_lat: 0.0,
            normal_force: 3139.2, mu_lat: 0.9, mu_long: 0.9, roll_factor: 0.3,
            drive: false, brake: 1.0, steer_angle: 0.0, compression_ratio: 0.5,
            vel_world: [0.0, 0.0, v_long], brake_dir: [0.0, 0.0, -1.0],
            speed_planar: v_long.abs(), yaw_rate: 0.4, relative_com: [0.0, 0.0, 1.38],
            tire_state: TireState::Grip,
        }
    }

    #[test]
    fn braking_opposes_measured_motion_and_respects_actuator_strength() {
        let ctx = context();
        let ctrl = ControlInput { brake: 1.0, ..ControlInput::default() };
        for speed in [-0.2, 0.2] {
            let result = solve_longitudinal(&ctx, &ctrl, &patch(speed), 0.3);
            assert!(result.impulse[2] * speed < 0.0);
            assert!(result.impulse[2].abs() <= ctx.brake_force * 0.3 * ctx.dt + 1.0e-5);
        }
        let disabled = SolveContext { brake_force: 0.0, ..ctx };
        assert_eq!(solve_longitudinal(&disabled, &ctrl, &patch(0.2), 0.3).impulse, [0.0; 3]);
    }

    #[test]
    fn normally_loaded_driven_wheels_receive_the_configured_total_drive_force() {
        let ctx = SolveContext { engine_force: 8500.0, ..context() };
        let ctrl = ControlInput { throttle: 0.25, ..ControlInput::default() };
        let mut contact = patch(0.0);
        contact.drive = true;
        let result = solve_longitudinal(&ctx, &ctrl, &contact, 0.17);
        let total_force = result.impulse[2] * ctx.driven_wheels / ctx.dt;
        assert!((total_force - ctx.engine_force * ctrl.throttle).abs() < 0.01);
        contact.grounded = false;
        assert_eq!(solve_longitudinal(&ctx, &ctrl, &contact, 0.17).impulse, [0.0; 3]);
    }

    #[test]
    fn tcs_switch_changes_forward_and_reverse_drive_limits_without_changing_sign() {
        let mut contact = patch(5.0); contact.drive = true;
        let off = SolveContext { engine_force: 24_000.0, ..context() };
        let on = SolveContext { tcs_enabled: true, ..off };
        for throttle in [-1.0, 1.0] {
            let input = ControlInput { throttle, ..ControlInput::default() };
            let raw = solve_longitudinal(&off, &input, &contact, 0.17).impulse[2];
            let limited = solve_longitudinal(&on, &input, &contact, 0.17).impulse[2];
            assert!(raw * throttle > 0.0 && limited * throttle > 0.0);
            assert!(limited.abs() < raw.abs());
            assert!((limited.abs() / raw.abs() - on.tcs_limit).abs() < 0.001);
        }
    }

    #[test]
    fn abs_switch_limits_brake_usage_but_braking_always_opposes_motion() {
        let contact = patch(10.0);
        let off = SolveContext { brake_force: 100_000.0, ..context() };
        let on = SolveContext { abs_enabled: true, ..off };
        let input = ControlInput { brake: 1.0, ..ControlInput::default() };
        let raw = solve_longitudinal(&off, &input, &contact, 0.33).impulse[2];
        let limited = solve_longitudinal(&on, &input, &contact, 0.33).impulse[2];
        assert!(raw < 0.0 && limited < 0.0); assert!(limited.abs() < raw.abs());
    }
}
