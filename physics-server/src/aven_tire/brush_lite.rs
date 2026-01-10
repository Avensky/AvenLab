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
    // Cardinal Rules 
    // ==============================================================================
    // - Braking must oppose vehicle motion, not wheel heading.
    // ==============================================================================

    use rapier3d::prelude::Real;
    use crate::aven_tire::types::{ContactPatch, ControlInput, SolveContext, Vec3, v_scale};
    use crate::aven_tire::state::TireState;

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
                v_lat_deadzone: 1.5,
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

        // HARD braking → no lateral correction (pure slide)
        if ctrl.brake > 0.6 && patch.speed_planar > 3.0 {
            return [0.0, 0.0, 0.0];
        }

        let dt = ctx.dt;

        // 1) lat deadzone
        let v_lat = patch.v_lat;
        // let v_lat = patch.v_lat_relaxed;

        let v_lat_eff = patch.v_lat;

        // Smooth deadzone (not hard cutoff)
        let dead = cfg.v_lat_deadzone;
        let scale = ((v_lat_eff.abs() - dead) / dead).clamp(0.0, 1.0);

        if scale <= 0.0 {
            return [0.0, 0.0, 0.0];
        }

        let steer_factor = 1.0;

        let compression_ratio = patch.compression_ratio.clamp(0.0, 1.0);
        let suspension_factor = 1.0 - compression_ratio * cfg.suspension_falloff;
        let speed = (patch.v_long * patch.v_long + v_lat * v_lat).sqrt();
        let mass = (ctx.mass * 0.25).max(1.0);

        // 5) Same desired impulse  
        let mut lateral_impulse =
            (-patch.v_lat * mass)
            * suspension_factor
            * steer_factor
            * scale;


        // Coulomb clamp
        let max_lat_impulse = patch.mu_lat * patch.normal_force * dt;
        lateral_impulse = lateral_impulse.clamp(-max_lat_impulse, max_lat_impulse);


        // slip factor
        // let alpha = patch.v_lat_relaxed.atan2(patch.v_long.abs().max(1.0));
        let alpha = patch.v_lat.atan2(patch.v_long.abs().max(1.0));
        let alpha_sat = 0.6; // ~35°

        let slip_factor = (1.0 - (alpha.abs() / alpha_sat)).clamp(0.2, 1.0);

        lateral_impulse *= slip_factor;


        // Brake reduces lateral authority
        let brake_lat_scale = (1.0 - ctrl.brake * 0.6).clamp(0.3, 1.0);
        lateral_impulse *= brake_lat_scale;

        // rear saturation
        if patch.wheel.is_rear() { lateral_impulse *= 0.85; }

        // Brake-stabilized lateral reduction
        if ctrl.brake > 0.4 && speed > 10.0 {
            lateral_impulse *= 0.6;
        }

        if ctrl.brake > 0.3 {
            lateral_impulse *= 0.6;
        }

        match patch.tire_state {
            TireState::Grip => { /* full model */ }

            TireState::Slide => {
                // Allow lateral force, but reduced (drift)
                lateral_impulse *= 0.6;
            }

            TireState::Lock => {
                // Locked tire cannot generate lateral force
                lateral_impulse *= 0.0;
            }
        }

        v_scale(patch.side, lateral_impulse)

    }