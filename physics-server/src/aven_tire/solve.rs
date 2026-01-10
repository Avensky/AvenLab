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


use crate::aven_tire::types::{ ContactPatch, ControlInput, Impulse, SolveContext, v_mag, v_scale,};
use crate::aven_tire::longitudinal::solve_longitudinal;
use crate::aven_tire::brush_lite::{solve_brush_lite, BrushLiteConfig};
use crate::aven_tire::state::update_tire_state;

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

    let mut impulses = Vec::new();
    // let mut rack_torque_sum: f32 = 0.0;

    let brush_cfg = BrushLiteConfig::default();

    // --------------------------------------------------
    // Per-wheel tire solve
    // --------------------------------------------------
    for patch in contacts.iter_mut() {
        if !patch.grounded || patch.normal_force < 50.0 { continue; }
        
        // let brake_share = if patch.wheel.is_front() { front_per_wheel } else { rear_per_wheel };
        let brake_share = if patch.wheel.is_front() {
            0.6 * 0.5 // 60% front axle, split across two wheels
        } else {
            0.4 * 0.5 // 40% rear axle, split across two wheels
        };

        // Longitudinal impulse (engine + brake)
        let long = solve_longitudinal(ctx, ctrl, patch, brake_share);

        // Lateral impulse (brush model)
        let lat  = solve_brush_lite(&brush_cfg, ctx, ctrl, patch);

        // =====================================================
        // friction ellipsse
        // =====================================================
        
        // friction capacities
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

        // --------------------------------------------------
        // LONGITUDINAL → ENGINE
        // --------------------------------------------------
        let long_i = v_scale(long.impulse, scale);
        impulses.push(Impulse {
            impulse: long_i,
            at_point: None,
        });
        
        // --------------------------------------------------
        // LATERAL → CONTACT (yaw comes from tire geometry)
        // Apply roll coupling reduction
        // --------------------------------------------------
        let lat_i = v_scale(lat, scale);
        impulses.push(Impulse {
            impulse: lat_i,
            at_point: Some(patch.apply_point),
        });
        
    } // Contacts iter end


    TireForces {
        impulses,
        // rack_torque: rack_torque_sum,
    }
}