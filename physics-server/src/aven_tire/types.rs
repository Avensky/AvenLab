//! Core shared types for `aven_tire` (engine-agnostic).
// aven_tire/types.rs

pub type Vec3 = [f32; 3];
use rapier3d::prelude::Real;

// ----- tiny vec helpers (avoid pulling a math crate into the tire solver) -----
#[inline] pub fn v_add(a: Vec3, b: Vec3) -> Vec3 { [a[0]+b[0], a[1]+b[1], a[2]+b[2]] }
#[inline] pub fn v_sub(a: Vec3, b: Vec3) -> Vec3 { [a[0]-b[0], a[1]-b[1], a[2]-b[2]] }
#[inline] pub fn v_scale(v: Vec3, s: f32) -> Vec3 { [v[0]*s, v[1]*s, v[2]*s] }
#[inline] pub fn v_dot(a: Vec3, b: Vec3) -> f32 { a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
#[inline] pub fn v_mag(v: Vec3) -> f32 { v_dot(v, v).sqrt() }

#[inline]
pub fn v_norm(v: Vec3) -> Vec3 {
    let m = v_mag(v);
    if m > 1e-6 { v_scale(v, 1.0 / m) } else { [0.0, 0.0, 0.0] }
}

#[inline]
pub fn v_cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0],
    ]
}

// ============================================
// Wheel identification
// ============================================

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum WheelId { FL, FR, RL, RR }

impl WheelId {
    pub fn from_debug(s: &str) -> Self {
        match s {
            "FL" => WheelId::FL,
            "FR" => WheelId::FR,
            "RL" => WheelId::RL,
            "RR" => WheelId::RR,
            _ => WheelId::FL,
        }
    }

    pub fn is_front(&self) -> bool {
        matches!(self, WheelId::FL | WheelId::FR)
    }

    pub fn is_rear(&self) -> bool {
        matches!(self, WheelId::RL | WheelId::RR)
    }
}

// ============================================
// ----- configs / inputs ---------------------
// ============================================
#[derive(Debug, Clone, Copy)]
pub struct SolveContext {
    pub dt: f32,                // s  
    pub mass: f32,              // kg

    pub engine_force: f32,      // N
    pub brake_force: f32,       // N

    pub abs_enabled: bool,      // anti-lock braking system
    pub tcs_enabled: bool,      // traction control system
    pub abs_limit: f32,         // 0.85–1.0
    pub tcs_limit: f32,         // 0.85–1.0

    pub driven_wheels: f32,     // RL+RR => 2.0 for typical RWD

    /// brake bias params (matches your old block)
    pub base_front_bias: f32,   // 0.0–1.0
    pub bias_gain: f32,         // per total brake force

    pub mu_base: f32,
    // pub load_sensitivity: f32,

    // pub wheelbase: f32,
    // pub track_width: f32,
    // pub ackermann: f32,

    // pub arb_front: f32,
    // pub arb_rear: f32,

}

#[derive(Debug, Clone, Copy, Default)]
pub struct ControlInput {
    pub throttle: f32,  // -1..1
    pub brake: f32,     // 0..1
    pub steer: Real,    // -1..1 (normalized steer input)
}

// ============================================
// ----- contact + impulses -----
// ============================================

// ------------------------
// Contact patch (from your raycast pass)
// ------------------------
#[derive(Debug, Clone, Copy)]
pub struct ContactPatch {
    pub wheel: WheelId,
    pub grounded: bool,

    pub hit_point: Vec3,
    pub apply_point: Vec3,

    pub forward: Vec3, // wheel forward dir on ground plane
    pub side: Vec3,    // wheel side dir on ground plane

    pub v_long: f32,   // m/s along forward
    pub v_lat: f32,    // m/s along side

    pub normal_force: f32, // N
    pub mu_lat: f32,
    pub roll_factor: f32,  // 0..1

    pub drive: bool,

    pub compression_ratio: Real, // 0..1
}


#[derive(Debug, Clone, Copy)]
pub struct Impulse {
    pub impulse: Vec3,
    pub at_point: Option<Vec3>,
}
