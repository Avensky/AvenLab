use serde::Serialize;
use crate::world::block_colliders::DebugAabbBox;

bitflags::bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct DebugFlags: u32 {
        const NONE       = 0;
        const CHASSIS    = 1 << 0;
        const WHEELS     = 1 << 1;
        const RAYS       = 1 << 2;
        const SLIP       = 1 << 3;
        const LOAD_BARS  = 1 << 4;
        const ARB        = 1 << 5;
        const BLOCKS     = 1 << 6;
        const ALL        = Self::CHASSIS.bits()
                         | Self::WHEELS.bits()
                         | Self::RAYS.bits()
                         | Self::SLIP.bits()
                         | Self::LOAD_BARS.bits()
                         | Self::ARB.bits()
                         | Self::BLOCKS.bits();
    }
}

#[derive(Clone, Serialize)]
pub struct DebugChassis {
    pub position: [f32; 3],
    pub rotation: [f32; 4], // quaternion
    pub half_extents: [f32; 3],
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

#[derive(Clone, Serialize)]
pub struct DebugRay {
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub length: f32,
    pub hit: Option<[f32; 3]>,
    pub color: [f32; 3],
}

#[derive(Clone, Serialize)]
pub struct DebugSlipRay {
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub slip_angle: f32,
    pub magnitude: f32,
    pub color: [f32; 3],
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
    pub block_boxes: Vec<DebugAabbBox>,
}

impl DebugOverlay {
    pub fn clear(&mut self) {
        self.chassis = None;
        self.suspension_rays.clear();
        self.load_bars.clear();
        self.arb_links.clear();
        self.wheels.clear();
        self.slip_vectors.clear();
    }
}