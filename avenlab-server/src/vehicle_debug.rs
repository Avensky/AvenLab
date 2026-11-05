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
    pub player_id: String,
    pub position: [f32; 3],
    pub rotation: [f32; 4], // quaternion
    pub half_extents: [f32; 3],
}

#[derive(Clone, Serialize)]
pub struct DebugWheel {
    pub player_id: String,
    pub id: String,                 // "FL", "FR", "RL", "RR"
    pub center: [f32; 3],           // in world space
    pub radius: f32,
    pub grounded: bool,
    pub compression: f32,
    pub compression_ratio: f32,
    pub normal_force: f32,
    pub steer: f32,
    pub steering: bool,
    pub drive: bool,
    pub rotation: [f32; 4],
    pub wheel_speed: f32,
    pub steer_angle: f32,
    pub v_long: f32,
    pub v_lat: f32,
    pub slip_angle: f32,
    pub slip_ratio: f32,
    #[serde(skip_serializing_if="Option::is_none")]
    pub tire: Option<[f32;2]>, // °C and gauge PSI; wheel inspection only

    // pub lateral_force: [f32; 3],                // for debug visualization
    // pub lateral_magnitude: f32,                 // for debug visualization
}

#[derive(Clone, Serialize)]
pub struct DebugRay {
    pub player_id: String,
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub length: f32,
    pub hit: Option<[f32; 3]>,
    pub color: [f32; 3],
}

#[derive(Clone, Serialize)]
pub struct DebugSlipRay {
    pub player_id: String,
    pub origin: [f32; 3],
    pub direction: [f32; 3],
    pub slip_angle: f32,
    pub magnitude: f32,
    pub color: [f32; 3],
}

#[derive(Clone, Serialize)]
pub struct DebugOverlay {
    pub chassis: Vec<DebugChassis>,
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
        self.chassis.clear();
        self.suspension_rays.clear();
        self.load_bars.clear();
        self.arb_links.clear();
        self.wheels.clear();
        self.slip_vectors.clear();
    }
}

/// Serialization projection only: requested channels share the existing physics
/// buffers; two inspectors with different masks never receive each other's data.
#[derive(Serialize)]
#[serde(untagged)]
enum Selected<'a,T> { All(&'a [T]), Local(Vec<&'a T>) }
fn selected<'a,T>(rows:&'a [T], show:bool, player:Option<&str>, id:impl Fn(&T)->&str)->Selected<'a,T> {
    if !show {Selected::All(&[])}
    else if let Some(player)=player {Selected::Local(rows.iter().filter(|row|id(row)==player).collect())}
    else {Selected::All(rows)}
}
#[derive(Serialize)]
pub struct DebugView<'a> {
    chassis:Selected<'a,DebugChassis>, suspension_rays:Selected<'a,DebugRay>, load_bars:Selected<'a,DebugRay>,
    arb_links:Selected<'a,DebugRay>, wheels:Selected<'a,DebugWheel>, chassis_right:[f32;3],
    slip_vectors:Selected<'a,DebugSlipRay>, block_boxes:&'a [DebugAabbBox],
}
impl DebugOverlay {
    pub fn view(&self,mask:DebugFlags, player:Option<&str>)->DebugView<'_> {
        DebugView{chassis:selected(&self.chassis,mask.contains(DebugFlags::CHASSIS),player,|r|&r.player_id),
            suspension_rays:selected(&self.suspension_rays,mask.contains(DebugFlags::RAYS),player,|r|&r.player_id),
            load_bars:selected(&self.load_bars,mask.contains(DebugFlags::LOAD_BARS),player,|r|&r.player_id),
            arb_links:selected(&self.arb_links,mask.contains(DebugFlags::ARB),player,|r|&r.player_id),
            wheels:selected(&self.wheels,mask.contains(DebugFlags::WHEELS),player,|r|&r.player_id),
            chassis_right:if mask.contains(DebugFlags::CHASSIS){self.chassis_right}else{[0.0;3]},
            slip_vectors:selected(&self.slip_vectors,mask.contains(DebugFlags::SLIP),player,|r|&r.player_id),
            block_boxes:if mask.contains(DebugFlags::BLOCKS){&self.block_boxes}else{&[]}}
    }
}
