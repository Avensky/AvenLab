// One tire solve per grounded patch per physics substep, in N*s.
// Longitudinal: demand -> actuator/ABS/TCS limits. Lateral: brush response.
// Their final impulses share one combined-slip ellipse. The individual clamps
// enforce axis limits; the ellipse enforces simultaneous use of both axes.
// Apply the combined impulse at the tire contact. Its lever arm produces
// braking dive, launch squat, yaw and roll without applying a second torque.

use crate::aven_tire::types::{ ContactPatch, ControlInput, Impulse, SolveContext, v_mag, v_scale,};
use crate::aven_tire::longitudinal::solve_longitudinal;
use crate::aven_tire::brush_lite::{solve_brush_lite, BrushLiteConfig};
use crate::aven_tire::state::update_tire_state;

// Reserved experiment; not instantiated or consumed by the active solve.
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
            trail0: 0.10,
            alpha_falloff: 0.35,
            min_speed: 0.5,
            max_mz: 4500.0,
        }
    }
}


pub struct TireForces {
    pub impulses: Vec<Impulse>,
    // pub rack_torque: f32, // N·m (about steering axis)
}

pub fn solve_step(
    ctx: &SolveContext,
    ctrl: &ControlInput,
    contacts: &mut[ContactPatch],
) -> TireForces {

    let mut impulses = Vec::with_capacity(contacts.len());

    let brush_cfg = BrushLiteConfig::default();

    // --------------------------------------------------
    // Per-wheel tire solve
    // --------------------------------------------------
    for patch in contacts.iter_mut() {
        if !patch.grounded || patch.normal_force < 50.0 { continue; }

        // Total brake actuator force is split between axles, then between the
        // two wheels on each axle. These four shares sum to 1, not 2.
        let front_bias = ctx.base_front_bias.clamp(0.0, 1.0);
        let brake_share = if patch.wheel.is_front() {
            front_bias * 0.5
        } else {
            (1.0 - front_bias) * 0.5
        };

        // Longitudinal impulse (engine + brake)
        let long = solve_longitudinal(ctx, ctrl, patch, brake_share);

        // Lateral impulse (brush model)
        let lat  = solve_brush_lite(&brush_cfg, ctx, ctrl, patch);

        // =====================================================
        // combined friction ellipse
        // =====================================================

        // friction capacities
        // Final normal load comes from suspension AFTER anti-roll redistribution.
        let jx_cap = (patch.mu_long * patch.normal_force * ctx.dt).max(1e-6);
        let jy_cap = (patch.mu_lat  * patch.normal_force * ctx.dt).max(1e-6);


        let fwd_xz_len = (patch.forward[0]*patch.forward[0] + patch.forward[2]*patch.forward[2]).sqrt().max(1e-6);
        let fwd_xz = [patch.forward[0]/fwd_xz_len, 0.0, patch.forward[2]/fwd_xz_len];


        // longitudinal demand measured along forward
        let jx = (long.impulse[0]*fwd_xz[0] + long.impulse[2]*fwd_xz[2]).abs();
        let nx = jx / jx_cap;

        // lateral is fine as magnitude (since lat is aligned with side already)
        let ny = v_mag(lat) / jy_cap;

        // ellipse constraint
        // nx^2 + ny^2 <= 1 is the shared traction budget. Scaling both demands
        // once preserves their ratio; no extra brake/steer grip multiplier follows.
        let k = (nx*nx + ny*ny).sqrt();

        let scale = if k > 1.0 {
            1.0 / k
        } else {
            1.0
        };


        let new_state = update_tire_state(
            patch.tire_state,
            nx,
            ny,
            ctrl.brake,
            patch.speed_planar,
        );

        patch.tire_state = new_state;

        let combined = std::array::from_fn(|axis| long.impulse[axis] + lat[axis]);
        impulses.push(Impulse {
            impulse: v_scale(combined, scale),
            at_point: Some(patch.hit_point),
        });
    } // Contacts iter end


    TireForces {
        impulses,
        // rack_torque: rack_torque_sum,
    }
}
