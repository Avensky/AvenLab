// ==============================================================================
// debug_builders.rs — DEBUG OVERLAY PRIMITIVES (SERVER -> CLIENT)
// ------------------------------------------------------------------------------
// Defines serializable debug primitives:
// - DebugRay: suspension raycasts, load bars, etc.
// - DebugWheel: per-wheel numeric state (grounded, compression, normal force)
// - DebugSlipRay: visualizes lateral slip direction/magnitude
//
// Helpers:
// - build_wheel_ray(): standardizes wheel ray origin/max distance computation
// - push_wheel_debug(): pushes DebugWheel snapshots into DebugOverlay
//
// This file is purely visualization scaffolding and should not contain physics
// side effects.
// ==============================================================================


use rapier3d::prelude::*;
use serde::Serialize;

#[derive(Clone)]
pub struct Wheel {
    pub debug_id: String,        // "FL", "FR", "RL", "RR"
    pub offset: Point<Real>,     // position in chassis local space
    pub rest_length: Real,       // suspension neutral length
    pub max_length: Real,        // max compression + extension
    pub radius: Real,            // wheel radius

    pub stiffness: Real,         // spring constant
    pub damping: Real,           // damper constant

    pub drive: bool,             // is this a driven wheel?
    pub steer: bool,             // is this a steering wheel?
}

#[derive(Clone, Serialize)]
pub struct DebugOverlay {
    pub chassis: Option<DebugChassis>,
    pub suspension_rays: Vec<DebugRay>,
    pub load_bars: Vec<DebugRay>,
    pub arb_links: Vec<DebugRay>,
    pub wheels: Vec<DebugWheel>,
    pub chassis_right: [f32; 3],
    pub slip_vectors: Vec<DebugSlipRay>,
}

#[derive(Clone, Serialize)]
pub struct DebugRay {
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub length: f32,
    pub hit: Option<[f32; 3]>,
    pub color: [f32; 3],
}

#[derive(Clone, Serialize)]
pub struct DebugChassis {
    pub position: [f32; 3],
    pub rotation: [f32; 4], // quaternion
    pub half_extents: [f32; 3],
}

// NEW: slip-angle visualization ray
#[derive(Clone, Serialize)]
pub struct DebugSlipRay {
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub magnitude: f32,
    pub color: [f32; 3],
}

impl DebugOverlay {
    pub fn clear(&mut self) {
        self.suspension_rays.clear();
        self.load_bars.clear();
        self.wheels.clear();
        self.arb_links.clear(); 
        self.slip_vectors.clear(); 
    }
}

#[derive(Clone, Serialize)]
pub struct DebugWheel {
    pub id: String,                 // "FL", "FR", "RL", "RR"

    pub center: [f32; 3],           // in world space
    pub radius: f32,
    pub grounded: bool,
    pub compression: f32,
    pub normal_force: f32,
    pub steer: f32,
    pub steering: bool,
    pub drive: bool,

    // pub lateral_force: [f32; 3],                // for debug visualization
    // pub lateral_magnitude: f32,                 // for debug visualization
}

pub fn push_wheel_debug(
    overlay: &mut DebugOverlay,
    wheel: &Wheel,
    center: Point<Real>,
    grounded: bool,
    compression: f32,
    normal_force: f32,
    steer: f32,
) {
    overlay.wheels.push(DebugWheel {
        id: wheel.debug_id.clone(),
        center: center.into(),
        radius: wheel.radius as f32,
        grounded,
        compression,
        normal_force,
        steer,
        steering: wheel.steer,
        drive: wheel.drive,
    });
}

pub struct WheelRay {
    pub origin: Point<Real>,
    pub dir: Vector<Real>,
    pub max_dist: Real,
    pub ground_n: Vector<Real>,
    pub wheel_center_air: Point<Real>,
}

pub fn build_wheel_ray(
    body_pos: &Isometry<Real>,
    wheel: &Wheel,
) -> WheelRay {
    let ground_n = vector![0.0, 1.0, 0.0];
    let dir = -ground_n;

    let origin = body_pos * (wheel.offset + vector![0.0, wheel.radius + 0.02, 0.0]);
    let wheel_center_air = origin - ground_n * (wheel.radius + 0.02);
    let max_dist = wheel.rest_length + wheel.max_length + wheel.radius;

    WheelRay {
        origin,
        dir,
        max_dist,
        ground_n,
        wheel_center_air,
    }
}