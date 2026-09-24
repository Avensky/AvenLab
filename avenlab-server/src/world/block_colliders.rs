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

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CoordinateSystem {
    pub units: String,
    pub up_axis: String,
    pub forward_axis: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MapSurface {
    pub road_y: f32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VisualTransform {
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VisualAsset {
    pub id: String,
    pub asset: String,

    #[serde(flatten)]
    pub transform: VisualTransform,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MapLayout {
    FixedGrid {
        origin: [i32; 2],
        size: [u32; 2],
    },

    Streamed {
        radius: i32,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct DebugAabbBox {
    pub id: String,
    pub center: [f32; 3],
    pub half_extents: [f32; 3],
    pub kind: String, // "building" | "road"
    pub visual: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BlockColliderFile {
    pub schema_version: u32,
    pub map_id: String,

    pub coordinate_system: CoordinateSystem,

    pub cell: [f32; 2],

    pub surface: MapSurface,

    pub layout: MapLayout,

    #[serde(default)]
    pub spawn_points: Vec<[f32; 2]>,

    pub visuals: Vec<VisualAsset>,

    #[serde(default)]
    pub roads: Vec<BlockObject>,

    #[serde(default)]
    pub buildings: Vec<BlockObject>,
}

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

#[derive(Debug, Clone, Serialize)]
pub struct LoadedChunkInstance {
    pub x: i32,
    pub z: i32,

    pub origin: [f32; 3],
}

#[derive(Debug, Clone, Serialize)]
pub struct MapSnapshot {
    pub schema_version: u32,
    pub map_id: String,

    pub coordinate_system: CoordinateSystem,

    pub cell: [f32; 2],

    pub surface: MapSurface,

    pub layout: MapLayout,

    pub visuals: Vec<VisualAsset>,

    pub chunks: Vec<LoadedChunkInstance>,
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


impl BlockColliderFile {
     pub fn tile_size(&self) -> [f32; 2] {
        self.cell
    }

    
    pub fn initial_chunks(&self) -> Vec<(i32, i32)> {
        match self.layout {
            MapLayout::FixedGrid { origin, size } => {
                let mut chunks = Vec::new();

                for z in 0..size[1] as i32 {
                    for x in 0..size[0] as i32 {
                        chunks.push((
                            origin[0] + x,
                            origin[1] + z,
                        ));
                    }
                }
                chunks
            }

            MapLayout::Streamed { radius } => {
                let mut chunks = Vec::new();

                for z in -radius..=radius {
                    for x in -radius..=radius {
                        chunks.push((x, z));
                    }
                }
                chunks
            }
        }
    }

    pub fn snapshot(
        &self,
        world: &BlockColliderWorld,
    ) -> MapSnapshot {
        MapSnapshot {
            schema_version: self.schema_version,
            map_id: self.map_id.clone(),
            coordinate_system: self.coordinate_system.clone(),
            cell: self.cell,
            surface: self.surface.clone(),
            layout: self.layout.clone(),
            visuals: self.visuals.clone(),
            chunks: world.chunk_instances(self.cell),
        }
    }
}

#[derive(Default)]
pub struct BlockColliderWorld {
    // (bx, by) -> rigid bodies spawned for that block
    pub loaded: HashMap<(i32, i32), Vec<RigidBodyHandle>>,
    pub debug_boxes: HashMap<(i32, i32), Vec<DebugAabbBox>>,
    pub tile_size: Option<[f32; 2]>,
}



impl BlockColliderWorld {

    pub fn chunk_instances(
        &self,
        tile_size: [f32; 2],
    ) -> Vec<LoadedChunkInstance> {
        let [tile_x, tile_z] = tile_size;

        let mut chunks: Vec<LoadedChunkInstance> = self.loaded
            .keys()
            .map(|&(x, z)| LoadedChunkInstance {
                x,
                z,
                origin: [
                    x as f32 * tile_x,
                    0.0,
                    z as f32 * tile_z,
                ],
            })
            .collect();

        chunks.sort_by_key(|chunk| (chunk.z, chunk.x));

        chunks
    }


    pub fn new() -> Self {
        Self { loaded: HashMap::new(), debug_boxes: HashMap::new(), tile_size: None }
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

pub fn load_block_collider_file(
    path: String
) -> anyhow::Result<BlockColliderFile> {
    let bytes = fs::read(&path)?;
    let file: BlockColliderFile = serde_json::from_slice(&bytes)?;

    if file.map_id.trim().is_empty() {
        anyhow::bail!("Map definition has an empty map_id");
    }

    if file.cell[0] <= 0.0 || file.cell[1] <= 0.0 {
        anyhow::bail!(
            "Map '{}' has invalid cell size {:?}",
            file.map_id,
            file.cell,
        );
    }

    if file.coordinate_system.units != "meters" {
        anyhow::bail!(
            "Map '{}' must use meters, got '{}'",
            file.map_id,
            file.coordinate_system.units,
        );
    }

    if file.coordinate_system.up_axis != "y" {
        anyhow::bail!(
            "Map '{}' must use Y-up",
            file.map_id,
        );
    }

    if file.visuals.is_empty() {
        anyhow::bail!(
            "Map '{}' has no visual assets",
            file.map_id,
        );
    }

    Ok(file)
}


#[inline]
fn blender_local_to_world(
    bx: i32,
    by: i32,
    tile_x: f32,
    tile_z: f32,
    p: [f32; 3],
) -> [f32; 3] {
    let base_x = bx as f32 * tile_x;
    let base_z = by as f32 * tile_z;

    // Blender [x, y_depth, z_up] -> Rapier [x, y_up, z_depth]
    let wx = base_x + p[0];
    let wy = p[2];
    let wz = base_z - p[1]; // flip Blender Y/depth

    [wx, wy, wz]
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

    let [tile_x, tile_z] = file.tile_size();

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

        let [wx, wy, wz] = blender_local_to_world(bx, by, tile_x, tile_z, b.pos);
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

        boxes.push(DebugAabbBox {
            id: b.id.clone(),
            center: [wx, wy, wz], 
            half_extents: [hx, hy, hz], 
            kind: "building".to_string(),
            visual: b.visual.clone(),
        });
   
    }


    // ---- spawn roads/intersections ----
    for road in &file.roads {
        // ignore road.pos; we place it in the gap based on id
        let local = road.pos;

        // auto-size so everything is flush
        let he_blender = road.half_extents;

        let [wx, wy, wz] = blender_local_to_world(bx, by,  tile_x, tile_z, local);
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

        let kind = match &road.kind {
            BlockObjectKind::Road => "road",
            BlockObjectKind::Intersection => "intersection",
            _ => "road",
        };

        boxes.push(DebugAabbBox {
            id: road.id.clone(),
            center: [wx, wy, wz], 
            half_extents: [hx, hy, hz], 
            kind: kind.to_string(),
            visual: road.visual.clone(),
        });
    }

    (handles, boxes)
}
