//! Approved prefab structures, separate from visual dressing and bounding boxes.
use std::sync::OnceLock;
use rapier3d::prelude::*;
use serde::{Deserialize,Serialize};
use super::{authored_layout::LayoutObject,road_colliders::{RoadAsset,prepared_shapes}};
#[derive(Deserialize)]struct ModelCatalog{assets:Vec<RoadAsset>}
pub fn assets()->&'static [RoadAsset]{static DATA:OnceLock<ModelCatalog>=OnceLock::new();&DATA.get_or_init(||serde_json::from_str(include_str!("../assets/models/placement-colliders.json")).expect("valid generated prefab catalog")).assets}
#[derive(Debug,Clone,Deserialize,Serialize)]
#[serde(deny_unknown_fields)]
pub struct ModelPlacement{pub asset:String,pub source_sha256:String,pub visible:Visibility,pub collision:Collision}
#[derive(Debug,Clone,Deserialize,Serialize)]
#[serde(deny_unknown_fields)]
pub struct Visibility{pub floor:bool,pub walls:bool,pub roof:bool,pub details:bool}
#[derive(Debug,Clone,Deserialize,Serialize)]
#[serde(deny_unknown_fields)]
pub struct Collision{pub floor:bool,pub walls:bool,pub roof:bool}
impl ModelPlacement{
 pub fn definition(&self)->Option<&'static RoadAsset>{assets().iter().find(|a|a.id==self.asset)}
 pub fn validate(&self)->anyhow::Result<()>{let a=self.definition().ok_or_else(||anyhow::anyhow!("Unknown prefab asset"))?;anyhow::ensure!(self.source_sha256==a.lods[0].sha256,"Prefab collision revision mismatch");Ok(())}
 pub fn role_enabled(&self,role:&str)->bool{match role{"floor"=>self.visible.floor&&self.collision.floor,"walls"=>self.visible.walls&&self.collision.walls,"roof"=>self.visible.roof&&self.collision.roof,_=>false}}
 pub fn shape_count(&self)->usize{self.definition().map_or(0,|a|a.colliders.iter().filter(|m|self.role_enabled(&m.role)).count())}
 pub fn spawn(&self,o:&LayoutObject,bodies:&mut RigidBodySet,colliders:&mut ColliderSet,origin:[f32;3],groups:InteractionGroups)->Option<RigidBodyHandle>{
  if !o.solid||self.shape_count()==0{return None;}let asset=self.definition().expect("validated prefab");let shapes=prepared_shapes(asset,o.size);
  let handle=bodies.insert(RigidBodyBuilder::fixed().translation(vector![origin[0]+o.position[0],origin[1]+o.position[1],origin[2]+o.position[2]]).rotation(vector![0.0,o.yaw.to_radians(),0.0]).build());
  for(_,shape)in shapes.iter().filter(|(role,_)|self.role_enabled(role)){colliders.insert_with_parent(ColliderBuilder::new(shape.clone()).collision_groups(groups).friction(1.2).restitution(0.0).build(),handle,bodies);}Some(handle)
 }
}

#[cfg(test)]
mod tests{
 use super::*;
 use crate::world::authored_layout::AuthoredLayout;
 fn fixture()->AuthoredLayout{let value:serde_json::Value=serde_json::from_str(include_str!("../assets/blocks/workshop_yard_colliders.json")).unwrap();serde_json::from_value(value["authored_layout"].clone()).unwrap()}
 fn spawn(layout:&AuthoredLayout)->ColliderSet{let mut b=RigidBodySet::new();let mut c=ColliderSet::new();layout.spawn(&mut b,&mut c,[0.0;3],InteractionGroups::all());c}
 fn height(c:&ColliderSet,x:f32,z:f32)->Option<f32>{let ray=Ray::new(point![x,20.0,z],vector![0.0,-1.0,0.0]);c.iter().filter_map(|(_,c)|c.shape().cast_ray(c.position(),&ray,50.0,true)).min_by(f32::total_cmp).map(|t|20.0-t)}
 #[test]fn measured_prefab_has_structural_triangles_and_a_real_open_interior(){let mut d=fixture();d.objects.truncate(1);d.validate("workshop_yard").unwrap();let c=spawn(&d);assert_eq!(c.len(),3);assert!(c.iter().all(|(_,c)|c.shape().as_trimesh().is_some()));let ray=Ray::new(point![0.0,2.0,20.0],vector![0.0,0.0,-1.0]);assert!(!c.iter().any(|(_,c)|c.shape().cast_ray(c.position(),&ray,20.0,true).is_some()),"front bay and room must stay open");let wall=Ray::new(point![-20.0,2.0,0.0],vector![1.0,0.0,0.0]);assert!(c.iter().any(|(_,c)|c.shape().cast_ray(c.position(),&wall,20.0,true).is_some()));}
 #[test]fn roof_cutaway_and_display_only_masks_change_only_explicit_physics(){let mut d=fixture();d.objects.truncate(1);assert!(height(&spawn(&d),0.0,0.0).unwrap()>7.0);d.objects[0].model.as_mut().unwrap().visible.roof=false;let c=spawn(&d);assert_eq!(c.len(),2);assert!(height(&c,0.0,0.0).unwrap().abs()<0.0001);d.objects[0].model.as_mut().unwrap().visible.details=false;assert_eq!(spawn(&d).len(),2);d.objects[0].solid=false;assert!(spawn(&d).is_empty());}
 #[test]fn floor_anchor_rotation_and_resize_match_the_visual_normalization(){let mut d=fixture();d.objects.truncate(1);let o=&mut d.objects[0];o.model.as_mut().unwrap().visible.roof=false;o.position=[10.0,3.0,20.0];o.yaw=90.0;o.size[0]*=2.0;o.size[1]*=1.5;d.validate("workshop_yard").unwrap();let c=spawn(&d);assert!((height(&c,10.0,20.0).unwrap()-3.0).abs()<0.0001);assert!(height(&c,50.0,20.0).is_none());}
 #[test]fn stale_prefab_references_and_road_prefab_mix_are_rejected(){let mut d=fixture();d.objects[0].model.as_mut().unwrap().source_sha256="old".into();assert!(d.validate("workshop_yard").is_err());let mut d=fixture();d.objects[0].road=d.objects[1].road.clone();assert!(d.validate("workshop_yard").is_err());}
}
