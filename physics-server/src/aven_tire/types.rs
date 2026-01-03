//! Core shared types for `aven_tire` (engine-agnostic).
// aven_tire/types.rs
use std::fmt;
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

#[inline]
fn norm(v: [f32;3]) -> f32 { (v[0]*v[0] + v[1]*v[1] + v[2]*v[2]).sqrt() }

#[inline]
fn normalize(v: [f32;3]) -> [f32;3] {
    let l = norm(v).max(1e-6);
    [v[0]/l, v[1]/l, v[2]/l]
}

// ============================================
// Wheel identification
// ============================================

#[derive(Copy, Clone, Debug, Eq, PartialEq, Hash)]
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
    pub fn as_str(&self) -> &'static str {
        match self {
            WheelId::FL => "FL",
            WheelId::FR => "FR",
            WheelId::RL => "RL",
            WheelId::RR => "RR",
        }
    }

    pub fn is_front(&self) -> bool {
        matches!(self, WheelId::FL | WheelId::FR)
    }

    pub fn is_rear(&self) -> bool {
        matches!(self, WheelId::RL | WheelId::RR)
    }
}

impl fmt::Display for WheelId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            WheelId::FL => "FL",
            WheelId::FR => "FR",
            WheelId::RL => "RL",
            WheelId::RR => "RR",
        };
        write!(f, "{s}")
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

    pub wheelbase: f32,
    pub mu_base: f32,
    // pub load_sensitivity: f32,

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
    pub mu_long: f32,
    pub roll_factor: f32,  // 0..1

    pub drive: bool,
    pub brake: f32,
    pub steer_angle: f32,
    pub compression_ratio: Real, // 0..1
}


#[derive(Clone, Copy, Debug)]
pub struct Impulse {
    /// Linear impulse in world space (N*s).
    pub impulse: Vec3,

    /// Optional application point (world). If None => apply at COM.
    pub at_point: Option<Vec3>,
}