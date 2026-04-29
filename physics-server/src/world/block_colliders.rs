// world/block_colliders.rs
// ==============================================================================
// block_colliders.rs — SINGLE-BLOCK SCENE DEFINITION + COLLIDER LOADING
// ------------------------------------------------------------------------------
// Defines the serialized layout for one city block.
//
// This file is the source of truth for:
// - static road collider placement
// - static building collider placement
// - object transforms used by debug visualization
// - future visual asset lookup by object id / visual key
// - future destruction state for building entities
//
// Current scope:
// - focus on loading exactly one block correctly
// - keep roads and buildings aligned to one shared coordinate system
// - support collider-first frontend visualization
//
// Out of scope for now:
// - streaming multiple blocks
// - procedural city expansion
// - runtime destruction physics
//
// Design rule:
// - one building entry in JSON should map to one building entity in runtime
// - later, each building entity can map to an intact/damaged/destroyed GLB
// ==============================================================================

use rapier3d::prelude::*;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DebugAabbBox {
    pub center: [f32; 3],
    pub half_extents: [f32; 3],
    pub kind: String, // "building" | "road"
}

#[derive(Debug, Clone, Deserialize)]
pub struct BlockColliderFile {
    pub block_id: String,
    pub version: u32,
    pub cell: [f32; 2], // [CELL_X, CELL_Z]
    #[serde(default)]
    pub roads: Vec<BlockObject>,
    #[serde(default)]    
    pub buildings: Vec<BlockObject>,
}

// #[derive(Debug, Clone, Deserialize)]
// pub struct RoadCollider {
//     pub id: String,
//     pub pos: [f32; 3],          // Blender block-local [x,y,z] (Z-up)
//     pub half_extents: [f32; 3], // Blender half extents [hx,hy,hz]
// }

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BlockObject {
    pub id: String,
    pub kind: BlockObjectKind,
    pub visual: String,
    pub pos: [f32; 3],
    pub rot: [f32; 4],
    pub half_extents: [f32; 3],
    pub collider: ColliderKind,

    #[serde(default)]
    pub destructible: bool,

    #[serde(default = "default_state")]
    pub state: StructureState,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockObjectKind {
    Road,
    Intersection,
    Building,
    Block,
    Prop,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ColliderKind {
    Box,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StructureState {
    Intact,
    Damaged,
    Destroyed,
    Removed,
}

fn default_state() -> StructureState {
    StructureState::Intact
}


const BLOCK_X: f32 = 54.0;
const BLOCK_Z: f32 = 102.0;

// gap between building blocks (road band thickness)
const GAP_X: f32 = 23.0;  // space between blocks left/right
const GAP_Z: f32 = 29.0;  // space between blocks north/south

const TILE_X: f32 = BLOCK_X + GAP_X;
const TILE_Z: f32 = BLOCK_Z + GAP_Z;

#[inline]
fn road_half_extents_from_id(id: &str) -> [f32; 3] {
    // returns Blender-style he: [hx, depth, height]
    let h = 0.1;

    if id.contains("intersection_") {
        [GAP_X * 0.5, GAP_Z * 0.5, h]
    } else if id.contains("_north") || id.contains("_south") {
        [BLOCK_X * 0.5, GAP_Z * 0.5, h]
    } else if id.contains("_east") || id.contains("_west") {
        [GAP_X * 0.5, BLOCK_Z * 0.5, h]
    } else {
        // fallback
        [1.0, 1.0, h]
    }
}


#[inline]
fn rebase_road_pos(pos: [f32; 3], he: [f32; 3], id: &str) -> [f32; 3] {
    // We assume roads/intersections in JSON are authored near the block edges:
    // - east road/intersections: x near BLOCK_X
    // - north road/intersections: y (Blender depth axis) near BLOCK_Z
    //
    // We "push" them outward by half the gap so they occupy the gap band.
    //
    // NOTE: blender axes: [x, y, z] with z-up; y is our horizontal "depth" that maps to Rapier Z.

    let mut p = pos;

    let id_l = id.to_lowercase();

    // Push "east" things into the right-side gap band.
    if id_l.contains("east") || id_l.contains("_e") || id_l.contains("ne") || id_l.contains("se") {
        // move center from inside-block to gap-center:
        // desired center x = BLOCK_X + GAP_X/2
        // if artist put it at ~BLOCK_X - road_half_width, this adds the missing offset.
        p[0] += GAP_X * 0.5;
    }

    // Push "north" things into the top gap band.
    if id_l.contains("north") || id_l.contains("_n") || id_l.contains("ne") || id_l.contains("nw") {
        p[1] += GAP_Z * 0.5;
    }

    // Push "west" things into the left gap band (negative side).
    if id_l.contains("west") || id_l.contains("_w") || id_l.contains("nw") || id_l.contains("sw") {
        p[0] -= GAP_X * 0.5;
    }

    // Push "south" things into the bottom gap band (negative side).
    if id_l.contains("south") || id_l.contains("_s") || id_l.contains("se") || id_l.contains("sw") {
        p[1] -= GAP_Z * 0.5;
    }

    // If you ever author the road centered already (in gap),
    // this still works as long as your ids are consistent.
    p
}

#[derive(Default)]
pub struct BlockColliderWorld {
    // (bx, by) -> rigid bodies spawned for that block
    pub loaded: HashMap<(i32, i32), Vec<RigidBodyHandle>>,
    pub debug_boxes: HashMap<(i32, i32), Vec<DebugAabbBox>>,
}

impl BlockColliderWorld {
    pub fn new() -> Self {
        Self { loaded: HashMap::new(), debug_boxes: HashMap::new() }
    }

    pub fn unload(
        &mut self,
        bodies: &mut RigidBodySet,
        colliders: &mut ColliderSet,
        island_manager: &mut IslandManager,
        joints: &mut ImpulseJointSet,
        multibody_joints: &mut MultibodyJointSet,
        bx: i32,
        by: i32,
    ) {
        let Some(handles) = self.loaded.remove(&(bx, by)) else { return; };
        self.debug_boxes.remove(&(bx, by));

        for bh in handles {
            bodies.remove(
                bh,
                island_manager,
                colliders,
                joints,
                multibody_joints,
                true, // remove attached colliders
            );
        }

        println!("🧱 Unloaded block ({}, {})", bx, by);
    }
}

pub fn load_block_collider_file(path: String) -> anyhow::Result<BlockColliderFile> {
    let bytes = fs::read(&path)?;
    let file: BlockColliderFile = serde_json::from_slice(&bytes)?;
    Ok(file)
}


#[inline]
fn blender_local_to_world(bx: i32, by: i32, cell_x: f32, cell_z: f32, p: [f32; 3]) -> [f32; 3]
{
    let base_x = bx as f32 * TILE_X;
    let base_z = by as f32 * TILE_Z;

    // Blender [x,y,z] (z up) -> Rapier [x,y,z] (y up)
    let wx = base_x + p[0];
    let wy = p[2];            // height
    let wz = base_z + p[1];   // depth
    [wx, wy, wz]
}






#[inline]
fn road_center_from_id(id: &str) -> [f32; 3] {
    // Blender-local: [x, depth, height]  (height=0 for roads)
    let y = 0.0;

    if id.contains("_north") {
        // centered over the NORTH gap band above the block
        [BLOCK_X * 0.5, BLOCK_Z + GAP_Z * 0.5, y]
    } else if id.contains("_south") {
        // centered over the SOUTH gap band below the block
        [BLOCK_X * 0.5, -GAP_Z * 0.5, y]
    } else if id.contains("_east") {
        // centered over the EAST gap band to the right of the block
        [BLOCK_X + GAP_X * 0.5, BLOCK_Z * 0.5, y]
    } else if id.contains("_west") {
        // centered over the WEST gap band to the left of the block
        [-GAP_X * 0.5, BLOCK_Z * 0.5, y]
    } else if id.contains("intersection_ne") {
        [BLOCK_X + GAP_X * 0.5, BLOCK_Z + GAP_Z * 0.5, y]
    } else if id.contains("intersection_nw") {
        [-GAP_X * 0.5, BLOCK_Z + GAP_Z * 0.5, y]
    } else if id.contains("intersection_se") {
        [BLOCK_X + GAP_X * 0.5, -GAP_Z * 0.5, y]
    } else if id.contains("intersection_sw") {
        [-GAP_X * 0.5, -GAP_Z * 0.5, y]
    } else {
        // fallback: keep it in-block (so you notice unknown ids)
        [BLOCK_X * 0.5, BLOCK_Z * 0.5, y]
    }
}





#[inline]
fn blender_half_extents_to_rapier(he: [f32; 3]) -> [f32; 3] {
    let hx = he[0].max(0.01);
    let hy = he[2].max(0.01); // vertical
    let hz = he[1].max(0.01); // depth
    [hx, hy, hz]
}


pub fn spawn_block_building_colliders(
    bodies: &mut RigidBodySet,
    colliders: &mut ColliderSet,
    file: &BlockColliderFile,
    bx: i32,
    by: i32,
    groups: InteractionGroups,
) -> (Vec<RigidBodyHandle>, Vec<DebugAabbBox>) {

    // let mut handles = Vec::with_capacity(file.buildings.len());
    // let mut boxes = Vec::with_capacity(file.buildings.len());

    let mut handles = Vec::new();
    let mut boxes = Vec::new();

    // ---- spawn buildings ----
    for b in &file.buildings {
        // ------------------------------------------------------------
        // Blender (Z-up) -> Engine/Rapier (Y-up)
        //
        // blender pos: [x, y, z]  where z is vertical
        // engine  pos: [x, y, z]  where y is vertical
        //
        // So:
        //   engine_x = blender_x
        //   engine_y = blender_z
        //   engine_z = blender_y
        // ------------------------------------------------------------

        let [wx, wy, wz] = blender_local_to_world(bx, by, TILE_X, TILE_Z, b.pos);
        let [hx, hy, hz] = blender_half_extents_to_rapier(b.half_extents);

        let rb = RigidBodyBuilder::fixed()
            .translation(vector![wx, wy, wz])
            .build();
        let rb_handle = bodies.insert(rb);

        let col = ColliderBuilder::cuboid(hx, hy, hz)
            .collision_groups(groups)
            .friction(1.0)
            .restitution(0.0)
            .build();

        colliders.insert_with_parent(col, rb_handle, bodies);
        handles.push(rb_handle);

        boxes.push(DebugAabbBox { center: [wx, wy, wz], half_extents: [hx, hy, hz], kind: "building".to_string() });
   
    }


    // ---- spawn roads/intersections ----
    for road in &file.roads {
        // ignore road.pos; we place it in the gap based on id
         let local = road_center_from_id(&road.id);

        // auto-size so everything is flush
        let he_blender = road_half_extents_from_id(&road.id);

        let [wx, wy, wz] = blender_local_to_world(bx, by, TILE_X, TILE_Z, local);
        let [hx, hy, hz] = blender_half_extents_to_rapier(he_blender);
        
        let rb = RigidBodyBuilder::fixed()
            .translation(vector![wx, wy, wz])
            .build();
        let rb_handle = bodies.insert(rb);

        let col = ColliderBuilder::cuboid(hx, hy, hz)
            .collision_groups(groups)
            .friction(1.2)
            .restitution(0.0)
            .build();

        colliders.insert_with_parent(col, rb_handle, bodies);
        handles.push(rb_handle);

        boxes.push(DebugAabbBox { center: [wx, wy, wz], half_extents: [hx, hy, hz], kind: "road".to_string() });
    }



    (handles, boxes)
}
