//! Road visuals never enter Rapier. This catalog contains only measured LOD0
//! asphalt, curb and paving triangles in canonical Y-up metres. All render LODs
//! share it. Source hashes reject stale layouts before any physics is spawned.
use std::{collections::HashMap, sync::{Mutex, OnceLock}};
use rapier3d::prelude::*;
use serde::{Deserialize, Serialize};
use super::authored_layout::LayoutObject;

#[derive(Debug, Clone, Deserialize)]
pub struct RoadCatalog { pub format: String, pub version: u32, pub assets: Vec<RoadAsset> }
#[derive(Debug, Clone, Deserialize)]
pub struct RoadAsset { pub id: String, pub size: [f32;3], pub lods: Vec<RoadLod>, pub colliders: Vec<RoadMesh> }
#[derive(Debug, Clone, Deserialize)]
pub struct RoadLod { pub sha256: String }
#[derive(Debug, Clone, Deserialize)]
pub struct RoadMesh { pub role: String, pub vertices: Vec<[f32;3]>, pub indices: Vec<[u32;3]> }
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RoadPlacement {
    pub asset: String,
    pub source_sha256: String,
    pub variant: RoadVariant,
    pub collision: RoadCollisionMask,
    pub lod: serde_json::Value,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RoadVariant {
    pub left: bool, pub right: bool, pub nw: bool, pub ne: bool, pub sw: bool, pub se: bool,
    pub markings: bool, pub details: bool, pub flow: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RoadCollisionMask { pub surface: bool, pub curbs: bool, pub paving: bool }

pub fn catalog() -> &'static RoadCatalog {
    static CATALOG: OnceLock<RoadCatalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let value: RoadCatalog = serde_json::from_str(include_str!("../assets/roads/road-colliders.json")).expect("valid generated road catalog");
        assert_eq!(value.format, "avenlab-road-catalog"); assert_eq!(value.version, 1);
        for asset in &value.assets { for mesh in &asset.colliders {
            assert!(mesh.vertices.iter().flatten().all(|v| v.is_finite()));
            assert!(mesh.indices.iter().flatten().all(|i| (*i as usize) < mesh.vertices.len()));
        }}
        value
    })
}
impl RoadPlacement {
    pub fn validate(&self) -> anyhow::Result<()> {
        let asset = self.definition().ok_or_else(|| anyhow::anyhow!("Unknown road asset '{}'", self.asset))?;
        anyhow::ensure!(self.source_sha256 == asset.lods[0].sha256, "Road asset revision mismatch: {}", self.asset);
        anyhow::ensure!(["source","one-way-forward","one-way-reverse","two-way"].contains(&self.variant.flow.as_str()), "Invalid road traffic intent");
        anyhow::ensure!(self.lod == "auto" || self.lod == 0 || self.lod == 1 || self.lod == 2, "Invalid road LOD");
        Ok(())
    }
    pub fn definition(&self) -> Option<&'static RoadAsset> { catalog().assets.iter().find(|a| a.id == self.asset) }
    pub fn role_enabled(&self, role: &str) -> bool {
        if role == "surface" { return self.collision.surface; }
        let Some((side, kind)) = role.split_once('-') else { return false; };
        let shown = match side { "left" => self.variant.left, "right" => self.variant.right, "nw" => self.variant.nw, "ne" => self.variant.ne, "sw" => self.variant.sw, "se" => self.variant.se, _ => false };
        shown && match kind { "curb" => self.collision.curbs, "paving" => self.collision.paving, _ => false }
    }
    pub fn shape_count(&self) -> usize { self.definition().map_or(0, |a| a.colliders.iter().filter(|m| self.role_enabled(&m.role)).count()) }
    pub fn spawn(&self, object: &LayoutObject, bodies: &mut RigidBodySet, colliders: &mut ColliderSet, origin: [f32;3], groups: InteractionGroups) -> Option<RigidBodyHandle> {
        if !object.solid || self.shape_count() == 0 { return None; }
        let asset = self.definition().expect("road validated before spawning");
        let shapes = prepared_shapes(asset, object.size);
        let handle = bodies.insert(RigidBodyBuilder::fixed()
            .translation(vector![origin[0]+object.position[0],origin[1]+object.position[1],origin[2]+object.position[2]])
            .rotation(vector![0.0,object.yaw.to_radians(),0.0]).build());
        for (role,shape) in shapes.iter().filter(|(role,_)| self.role_enabled(role)) {
            let friction = if role == "surface" {1.2} else {1.0};
            colliders.insert_with_parent(ColliderBuilder::new(shape.clone()).collision_groups(groups).friction(friction).restitution(0.0).build(),handle,bodies);
        }
        Some(handle)
    }
}
type Shapes = Vec<(String,SharedShape)>;
type ShapeKey = (String,[u32;3]);
fn prepared_shapes(asset: &RoadAsset, size: [f32;3]) -> Shapes {
    static CACHE: OnceLock<Mutex<HashMap<ShapeKey,Shapes>>> = OnceLock::new();
    let mut cache = CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock().expect("road shape cache");
    let key = (asset.id.clone(),size.map(f32::to_bits));
    if let Some(shapes) = cache.get(&key) { return shapes.clone(); }
    let scale = [size[0]/asset.size[0],size[1]/asset.size[1],size[2]/asset.size[2]];
    let shapes: Shapes = asset.colliders.iter().map(|mesh| {
        let vertices = mesh.vertices.iter().map(|v| point![v[0]*scale[0],v[1]*scale[1],v[2]*scale[2]]).collect();
        // Remove internal-edge ghost contacts without filling rounded corners,
        // openings, or the small seams that exist in the authored source.
        let shape = SharedShape::trimesh_with_flags(vertices,mesh.indices.clone(),TriMeshFlags::FIX_INTERNAL_EDGES);
        (mesh.role.clone(),shape)
    }).collect();
    // Bounded cache; common repeated modules reuse cooked BVHs across chunks.
    if cache.len() < 256 { cache.insert(key,shapes.clone()); }
    shapes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::{authored_layout::AuthoredLayout, block_colliders::{load_block_collider_file,spawn_block_building_colliders,BlockColliderWorld}};
    fn object(asset_id: &str) -> LayoutObject {
        let a=catalog().assets.iter().find(|a|a.id==asset_id).unwrap();
        serde_json::from_value(serde_json::json!({"id":"road-test","name":"Measured road","piece":format!("glb-{asset_id}"),"position":[0,0,0],"size":a.size,"yaw":0,"color":"#455466","locked":false,"solid":true,"parts":[],"road":{"asset":asset_id,"source_sha256":a.lods[0].sha256,"variant":{"left":true,"right":true,"nw":true,"ne":true,"sw":true,"se":true,"markings":true,"details":true,"flow":"source"},"collision":{"surface":true,"curbs":true,"paving":true},"lod":"auto"}})).unwrap()
    }
    fn spawn(item: &LayoutObject, origin: [f32;3]) -> (RigidBodySet,ColliderSet) {
        let mut bodies=RigidBodySet::new();let mut colliders=ColliderSet::new();
        item.road.as_ref().unwrap().spawn(item,&mut bodies,&mut colliders,origin,InteractionGroups::all());(bodies,colliders)
    }
    fn height(colliders: &ColliderSet,x:f32,z:f32) -> Option<f32> {
        let ray=Ray::new(point![x,100.0,z],vector![0.0,-1.0,0.0]);
        colliders.iter().filter_map(|(_,c)|c.shape().cast_ray(c.position(),&ray,200.0,true)).min_by(f32::total_cmp).map(|t|100.0-t)
    }
    #[test]
    fn installed_road_district_has_no_guessed_boxes_hidden_floor_or_duplicate_tiles() {
        let file=load_block_collider_file(format!("{}/src/assets/blocks/road_precision_colliders.json",env!("CARGO_MANIFEST_DIR"))).unwrap();
        assert_eq!(file.initial_chunks(),vec![(0,0)]);
        let mut bodies=RigidBodySet::new();let mut colliders=ColliderSet::new();
        let (handles,boxes)=spawn_block_building_colliders(&mut bodies,&mut colliders,&file,0,0,InteractionGroups::all());
        assert_eq!(handles.len(),4);assert!(boxes.is_empty());assert_eq!(colliders.len(),20);
        assert!(colliders.iter().all(|(_,c)|c.shape().as_trimesh().is_some()));
        assert!(height(&colliders,0.0,0.0).unwrap().abs()<1e-4);
        assert!(height(&colliders,80.0,0.0).is_none(),"empty space must remain empty");
        assert!(file.snapshot(&BlockColliderWorld::new()).visuals.is_empty());
    }
    #[test]
    fn hidden_sidewalk_removes_its_exact_faces_and_paint_never_becomes_a_collider() {
        let mut item=object("road_narrow");let (_,all)=spawn(&item,[0.0;3]);
        assert_eq!(all.len(),5);assert!((height(&all,-20.0,0.0).unwrap()-0.19964256).abs()<0.0001);
        assert!(height(&all,0.0,0.0).unwrap().abs()<0.0001);
        item.road.as_mut().unwrap().variant.left=false;
        let (_,hidden)=spawn(&item,[0.0;3]);assert_eq!(hidden.len(),3);
        assert!(height(&hidden,-20.0,0.0).is_none());assert!(height(&hidden,20.0,0.0).is_some());
        item.road.as_mut().unwrap().variant.markings=false;item.road.as_mut().unwrap().variant.details=false;
        assert_eq!(spawn(&item,[0.0;3]).1.len(),3);
        item.solid=false;assert!(spawn(&item,[0.0;3]).1.is_empty());
    }
    #[test]
    fn explicit_collision_masks_preserve_display_only_geometry() {
        let mut item=object("road_narrow");
        let r=item.road.as_mut().unwrap();r.collision.curbs=false;r.collision.paving=false;
        let (_,colliders)=spawn(&item,[0.0;3]);assert_eq!(colliders.len(),1);
        assert!(height(&colliders,-20.0,0.0).is_none());assert!(height(&colliders,0.0,0.0).is_some());
        item.road.as_mut().unwrap().collision.surface=false;assert!(spawn(&item,[0.0;3]).1.is_empty());
    }
    #[test]
    fn rotation_scale_height_and_chunk_origin_are_applied_once() {
        let mut item=object("road_narrow");item.position=[10.0,2.0,20.0];item.yaw=90.0;
        item.size[0]*=1.2;item.size[1]*=2.0;item.size[2]*=0.5;
        let (_,colliders)=spawn(&item,[100.0,3.0,-50.0]);
        assert!((height(&colliders,110.0,-30.0).unwrap()-5.0).abs()<0.0001);
        assert!((height(&colliders,110.0,-6.0).unwrap()-(5.0+0.19964256*2.0)).abs()<0.0001);
        assert!(height(&colliders,175.0,-30.0).is_none());
    }
    #[test]
    fn merged_intersection_corners_and_rounded_cutouts_remain_independent() {
        let mut item=object("intersection");let (_,all)=spawn(&item,[0.0;3]);assert_eq!(all.len(),9);
        // Pick an interior point of the actual NW paving triangle.
        let mesh=item.road.as_ref().unwrap().definition().unwrap().colliders.iter().find(|m|m.role=="nw-paving").unwrap();
        let tri=mesh.indices[mesh.indices.len()/2];let x=tri.iter().map(|i|mesh.vertices[*i as usize][0]).sum::<f32>()/3.0;let z=tri.iter().map(|i|mesh.vertices[*i as usize][2]).sum::<f32>()/3.0;
        assert!(height(&all,x,z).unwrap()>0.1);
        item.road.as_mut().unwrap().variant.nw=false;let (_,without)=spawn(&item,[0.0;3]);assert_eq!(without.len(),7);
        assert!(height(&without,x,z).is_none_or(|y|y<0.01));
        // A triangle mesh must not fill the enclosing rectangle around a curb.
        let bounds=catalog().assets.iter().find(|a|a.id=="intersection").unwrap().colliders.iter().flat_map(|m|m.vertices.iter()).fold([f32::MAX,f32::MAX,f32::MIN,f32::MIN],|mut b,v|{b[0]=b[0].min(v[0]);b[1]=b[1].min(v[2]);b[2]=b[2].max(v[0]);b[3]=b[3].max(v[2]);b});
        let misses=[(bounds[0]+0.001,bounds[1]+0.001),(bounds[2]-0.001,bounds[1]+0.001),(bounds[2]-0.001,bounds[3]-0.001),(bounds[0]+0.001,bounds[3]-0.001)].iter().filter(|(x,z)|height(&all,*x,*z).is_none()).count();assert!(misses>0);
    }
    #[test]
    fn visual_lods_do_not_change_physics_and_stale_references_fail_validation() {
        let mut item=object("road_wide");let (_,original)=spawn(&item,[0.0;3]);
        for lod in [serde_json::json!(0),serde_json::json!(1),serde_json::json!(2)]{item.road.as_mut().unwrap().lod=lod;let (_,next)=spawn(&item,[0.0;3]);assert_eq!(height(&next,0.0,0.0),height(&original,0.0,0.0));assert_eq!(next.len(),original.len());}
        let mut layout:AuthoredLayout=serde_json::from_value(serde_json::json!({"format":"avenlab-world-layout","version":1,"map_id":"test","title":"Test","base":"replace","ground":false,"objects":[item]})).unwrap();layout.validate("test").unwrap();
        layout.objects[0].road.as_mut().unwrap().source_sha256="stale".into();assert!(layout.validate("test").is_err());
    }
}
