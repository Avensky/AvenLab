// Lateral tire impulses. Small sideways motion must produce grip, including
// low-speed turns. Response is a continuous function of elapsed time.
use rapier3d::prelude::Real;
use crate::aven_tire::types::{ContactPatch, ControlInput, SolveContext, Vec3, v_scale};

#[derive(Clone, Copy, Debug)]
pub struct BrushLiteConfig {
    pub relaxation_length: Real, // m; converted to a speed-dependent response time
    pub suspension_falloff: Real, // dimensionless loss at full compression, applied once
    pub v_lat_deadzone: Real, // m/s; a 0.02 m/s noise band, not a 1.5 m/s grip cutoff
}

impl Default for BrushLiteConfig {
    fn default() -> Self {
        Self {
            relaxation_length: 0.25,
            suspension_falloff: 0.10,
            v_lat_deadzone: 0.02,
        }
    }
}

pub fn solve_brush_lite(
    cfg: &BrushLiteConfig,
    ctx: &SolveContext,
    _ctrl: &ControlInput,
    patch: &ContactPatch,
) -> Vec3 {
    if !patch.grounded || ctx.dt <= 0.0 || patch.normal_force <= 0.0 {
        return [0.0; 3];
    }

    // Subtract a small noise band without introducing a jump in force.
    let v_lat = patch.v_lat.signum()
        * (patch.v_lat.abs() - cfg.v_lat_deadzone.max(0.0)).max(0.0);
    // Approximation for four wheels: impulse to cancel sideways speed is m*v.
    let mass_per_wheel = (ctx.mass * 0.25).max(1.0);
    let response_time = (cfg.relaxation_length / patch.v_long.abs().max(1.0))
        .clamp(0.025, 0.10);
    // Exponential response is stable when caller/substep frequency changes.
    let response = 1.0 - (-ctx.dt / response_time).exp();
    let suspension_factor =
        (1.0 - patch.compression_ratio.clamp(0.0, 1.0) * cfg.suspension_falloff)
        .clamp(0.0, 1.0);

    // m/s * kg gives N*s. Oppose measured slip, not driver steer intent.
    let desired = -v_lat * mass_per_wheel * response * suspension_factor;
    // This is the lateral axis limit; solve_step also enforces the shared ellipse.
    let capacity = (patch.mu_lat * patch.normal_force * ctx.dt).max(0.0);
    let lateral = desired.clamp(-capacity, capacity);

    // Braking shares the friction budget through solve_step's ellipse. Brake
    // input alone does not erase lateral grip or declare a tire locked.
    v_scale(patch.side, lateral)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aven_tire::state::TireState;
    use crate::aven_tire::types::{WheelId, v_dot, v_mag};

    fn context() -> SolveContext {
        SolveContext {
            dt: 1.0 / 120.0, mass: 1280.0, engine_force: 8500.0, brake_force: 7600.0,
            abs_enabled: false, tcs_enabled: false, abs_limit: 0.9, tcs_limit: 0.85,
            driven_wheels: 2.0, base_front_bias: 0.66, bias_gain: 0.25,
            wheelbase: 2.6, mu_base: 0.9,
        }
    }

    fn patch(v_lat: f32) -> ContactPatch {
        ContactPatch {
            wheel: WheelId::FL, grounded: true, hit_point: [0.0; 3], apply_point: [0.0; 3],
            forward: [0.0, 0.0, 1.0], side: [1.0, 0.0, 0.0], v_long: 1.0, v_lat,
            normal_force: 3139.2, mu_lat: 0.9, mu_long: 0.9, roll_factor: 0.3,
            drive: false, brake: 0.0, steer_angle: 0.3, compression_ratio: 0.5,
            vel_world: [v_lat, 0.0, 1.0], brake_dir: [0.0, 0.0, -1.0],
            speed_planar: 1.0, yaw_rate: 0.0, relative_com: [0.0, 0.0, 1.38],
            tire_state: TireState::Grip,
        }
    }

    #[test]
    fn low_speed_sideways_motion_has_restoring_grip() {
        let cfg = BrushLiteConfig::default();
        let ctx = context();
        let ctrl = ControlInput::default();
        for slip in [-1.4, -0.2, -0.05, 0.05, 0.2, 1.4] {
            let contact = patch(slip);
            let impulse = solve_brush_lite(&cfg, &ctx, &ctrl, &contact);
            assert!(v_dot(impulse, contact.side) * slip < 0.0);
            assert!(v_mag(impulse) <= contact.mu_lat * contact.normal_force * ctx.dt + 1.0e-5);
        }
    }

    #[test]
    fn hard_braking_keeps_lateral_grip_for_the_combined_budget() {
        let cfg = BrushLiteConfig::default();
        let ctx = context();
        let ctrl = ControlInput { brake: 1.0, ..ControlInput::default() };
        let mut contact = patch(0.3);
        contact.speed_planar = 5.0;
        assert!(v_mag(solve_brush_lite(&cfg, &ctx, &ctrl, &contact)) > 0.0);
        contact.grounded = false;
        assert_eq!(solve_brush_lite(&cfg, &ctx, &ctrl, &contact), [0.0; 3]);
    }

    #[test]
    fn no_motion_or_no_support_has_no_lateral_impulse() {
        let cfg = BrushLiteConfig::default();
        let ctx = context();
        let ctrl = ControlInput::default();
        assert_eq!(solve_brush_lite(&cfg, &ctx, &ctrl, &patch(0.0)), [0.0; 3]);
        let mut contact = patch(0.3);
        contact.normal_force = 0.0;
        assert_eq!(solve_brush_lite(&cfg, &ctx, &ctrl, &contact), [0.0; 3]);
    }

    #[test]
    fn braking_and_cornering_share_one_friction_budget() {
        let ctx = context();
        let ctrl = ControlInput { brake: 1.0, ..ControlInput::default() };
        let mut contact = patch(2.0);
        contact.v_long = 5.0;
        contact.speed_planar = 5.4;
        let mut contacts = [contact];
        let result = crate::aven_tire::solve_step(&ctx, &ctrl, &mut contacts);
        let mut total = [0.0; 3];
        for action in result.impulses {
            for axis in 0..3 { total[axis] += action.impulse[axis]; }
        }
        let longitudinal = v_dot(total, contact.forward) / (contact.mu_long * contact.normal_force * ctx.dt);
        let lateral = v_dot(total, contact.side) / (contact.mu_lat * contact.normal_force * ctx.dt);
        assert!(longitudinal < 0.0 && lateral < 0.0);
        assert!(longitudinal * longitudinal + lateral * lateral <= 1.0 + 1.0e-5);
    }
}
