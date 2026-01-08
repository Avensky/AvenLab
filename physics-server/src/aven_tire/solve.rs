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
    contacts: &[ContactPatch],
) -> TireForces {

    let mut impulses = Vec::new();
    // let mut rack_torque_sum: f32 = 0.0;

    let brush_cfg = BrushLiteConfig::default();
    // let align_cfg = AligningTorqueConfig::default();

    // --------------------------------------------------
    // Brake bias (pure load-based, no heuristics)
    // --------------------------------------------------
    // let mut fz_front = 0.0;
    // let mut fz_rear  = 0.0;

    // for c in contacts.iter().filter(|c| c.grounded) {
    //     if c.wheel.is_front() { fz_front += c.normal_force; }
    //     else { fz_rear += c.normal_force; }
    // }

    // let fz_total = (fz_front + fz_rear).max(1e-6);
    // let front_bias = (fz_front / fz_total).clamp(0.55, 0.85);
    // let rear_bias  = 1.0 - front_bias;

    // let front_per_wheel = front_bias * 0.5;
    // let rear_per_wheel  = rear_bias  * 0.5;

    // --------------------------------------------------
    // Per-wheel tire solve
    // --------------------------------------------------
    for c in contacts.iter() {
        if !c.grounded || c.normal_force < 50.0 { continue; }
        
        // let brake_share = if c.wheel.is_front() { front_per_wheel } else { rear_per_wheel };
        let brake_share = 0.5;

        // Longitudinal impulse (engine + brake)
        let long = solve_longitudinal(ctx, ctrl, c, brake_share);

        // Lateral impulse (brush model)
        let lat  = solve_brush_lite(&brush_cfg, ctx, ctrl, c);

        // --------------------------------------------------
        // Combined friction slip ellipse (impulse domain)
        // --------------------------------------------------
        // let max_long = (c.normal_force * ctx.dt * 0.8).max(1e-6);
        let max_long = (c.mu_long * c.normal_force * ctx.dt).max(1e-6);
        // let speed = (c.v_long * c.v_long + c.v_lat * c.v_lat).sqrt();
        // let speed = (c.v_long * c.v_long + c.v_lat_relaxed * c.v_lat_relaxed).sqrt();


        // let lat_boost = (1.0 + 0.6 * (speed / 20.0)).clamp(1.0, 1.8);

        // let max_lat = c.mu_lat * c.normal_force * ctx.dt * lat_boost;
        let max_lat  = (c.mu_lat * c.normal_force * ctx.dt).max(1e-6);

        let nx = v_mag(long.impulse) / max_long;
        let ny = v_mag(lat) / max_lat;

        let ellipse = nx * nx + ny * ny;
        
        let scale = if ellipse > 1.0 {
            1.0 / ellipse.sqrt()
        } else {
            1.0
        };

        let long_i = v_scale(long.impulse, scale);

        // impulses.push(Impulse {
        //     impulse: long_i,
        //     at_point: Some(c.apply_point),
        // });
       
        // Apply roll coupling reduction
        let lat_i  = v_scale(lat, scale * c.roll_factor);

        // impulses.push(Impulse {
        //     impulse: lat_i,
        //     at_point: Some(c.apply_point),
        // });
        
        // 🚨 APPLY BOTH AT CONTACT → yaw comes for free
        let impulse_total = [
            long_i[0] + lat_i[0],
            long_i[1] + lat_i[1],
            long_i[2] + lat_i[2],
        ];

        impulses.push(Impulse {
            impulse: impulse_total,
            at_point: Some(c.apply_point),
        });

        // if c.wheel.is_front() && v_mag(lat_i) > 1e-3 {
        //     println!(
        //         "[LAT SOLVE STEP {}] |J|={:.2} v_lat={:+.2}",
        //         c.wheel,
        //         v_mag(lat_i),
        //         c.v_lat
        //     );
        // }
        // =====================================================================
        // - Apply impulses at contact point 
        // =====================================================================

        // let j_total = [
        //     long_i[0] + lat_i[0],
        //     long_i[1] + lat_i[1],
        //     long_i[2] + lat_i[2],
        // ];

        // if v_mag(j_total) > 1e-6 {
        //     impulses.push(Impulse {
        //         impulse: j_total,
        //         at_point: Some(c.apply_point), // or c.hit_point if you prefer
        //     });
        // }

        // ==========================================================================================
        // - Aligning Torque → Steering Rack ONLY (front wheels only) 
        // ==========================================================================================
        // let speed = (c.v_long * c.v_long + c.v_lat * c.v_lat).sqrt();
        // if c.wheel.is_front() && speed > align_cfg.min_speed && v_mag(lat_i) > 1e-6 {
        //     // let alpha = c.v_lat.atan2(c.v_long.abs().max(0.5));
        //     let alpha = c.v_lat_relaxed.atan2(c.v_long.abs().max(0.5));


        //     let trail = align_cfg.trail0
        //         * (-alpha.abs() / align_cfg.alpha_falloff.max(1e-3)).exp();

        //     // Fy ≈ |lateral impulse| / dt
        //     // let fy = v_mag(lat_i) / ctx.dt.max(1e-6);

        //     // Fy sign = projection of lat impulse onto wheel side, / dt
        //     let mut fy = (lat_i[0]*c.side[0] + lat_i[1]*c.side[1] + lat_i[2]*c.side[2])
        //         / ctx.dt.max(1e-6);

        //     // fy = fy.clamp(-c.v_lat * 500.0, c.mu_lat);

        //     // Mz = Fy * trail
        //     let mz = (-fy * trail).clamp(-align_cfg.max_mz, align_cfg.max_mz);

        //     // AFTER computing fy and mz
        //     println!(
        //         "[SAT {:?}] v_lat={:+.2} Fy={:+.1} trail={:.3} Mz={:+.2}",
        //         c.wheel,
        //         c.v_lat,
        //         fy,
        //         trail,
        //         mz
        //     );
    
        //     // ==================================================
        //     // accumulate into rack: left/right oppose each other
        //     // ==================================================
        
        //     // - rack leverage
        //     let steering_arm = 0.14;   // meters (kingpin to tie-rod)
        //     let rack_gain = 14.0;     // steering ratio (wheel → rack)
        //     let rack_mz = mz * steering_arm * rack_gain;
            
        //     // Left/right sign based on wheel side

        //     // let side_sign = if c.wheel.is_left() { 1.0 } else { -1.0 };
        //     // rack_torque_sum += rack_mz * side_sign;

        //     // rack_torque_sum += rack_mz;
        // }
    } // Contacts iter end
    TireForces {
        impulses,
        // rack_torque: rack_torque_sum,
    }
}