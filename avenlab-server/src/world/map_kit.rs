//! Physics uses only the indexed collision GLBs baked into this catalog.
//! The inlet pivot and scale match all three visual levels.
use super::{
    authored_layout::LayoutObject,
    road_colliders::{RoadAsset, prepared_shapes},
};
use rapier3d::prelude::*;
use serde::Deserialize;
use std::{collections::HashMap, sync::OnceLock};

#[derive(Deserialize)]
pub struct KitPiece {
    #[serde(flatten)]
    asset: RoadAsset,
    pub permanent: bool,
}

pub fn piece(id: &str) -> Option<&'static KitPiece> {
    if !id.starts_with("kit-") {
        return None;
    }
    #[derive(Deserialize)]
    struct Catalog { assets: Vec<KitPiece> }
    static PIECES: OnceLock<HashMap<String, KitPiece>> = OnceLock::new();
    PIECES.get_or_init(|| {
        let data: Catalog = serde_json::from_str(include_str!("../assets/roads/map-kit-colliders.json"))
            .expect("valid generated map kit colliders");
        data.assets.into_iter().map(|p| (p.asset.id.clone(), p)).collect()
    }).get(id)
}

impl KitPiece {
    pub fn spawn(&self, o: &LayoutObject, index: usize, bodies: &mut RigidBodySet, colliders: &mut ColliderSet,
                 origin: [f32; 3], groups: InteractionGroups) -> Option<RigidBodyHandle> {
        if !o.solid { return None; }
        let position = vector![origin[0]+o.position[0], origin[1]+o.position[1], origin[2]+o.position[2]];
        let handle = bodies.insert(RigidBodyBuilder::fixed().user_data((index+1) as u128)
            .translation(position).rotation(vector![0., o.yaw.to_radians(), 0.]).build());
        for (_, shape) in prepared_shapes(&self.asset, o.size) {
            colliders.insert_with_parent(ColliderBuilder::new(shape).collision_groups(groups)
                .friction(1.2).restitution(0.).build(), handle, bodies);
        }
        Some(handle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::authored_layout::AuthoredLayout;

    #[test]
    fn rotated_resized_stone_span_keeps_its_inlet_and_rejects_damage() {
        let mut doc: AuthoredLayout = serde_json::from_value(serde_json::json!({
            "map_id":"test","format":"avenlab-world-layout","version":1,"title":"Stone test","base":"replace",
            "objects":[{"id":"span","name":"Stone middle","piece":"kit-stone_middle","yaw":-90,
                "position":[10,3,5],"size":piece("kit-stone_middle").unwrap().asset.size,
                "parts":[],"solid":true,"locked":false,"color":"#777777"}]
        })).unwrap();
        doc.objects[0].size[2] *= 1.5;
        doc.validate("test").unwrap();
        let mut bodies=RigidBodySet::new();
        let mut colliders=ColliderSet::new();
        doc.spawn(&mut bodies,&mut colliders,[100.,0.,0.],InteractionGroups::all());
        let shape=colliders.iter().next().unwrap().1;
        let height=|x| {
            let ray=Ray::new(point![x,10.,5.],-Vector::y());
            shape.shape().cast_ray(shape.position(),&ray,30.,true).map(|t|10.-t)
        };
        for x in [110.01,130.,154.99] {assert!((height(x).unwrap()-3.).abs()<0.001);}
        assert!(height(156.).is_none());
        doc.objects[0].destruction=Some(serde_json::from_value(serde_json::json!({
            "enabled":true,"hp":100,"smallArms":1,"cannon":1,"bomb":1,"rubble":"clear"
        })).unwrap());
        assert!(doc.validate("test").is_err());
    }
}
