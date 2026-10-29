//! Explicit runtime-space shapes authored by World workshop. Positions are Y-up
//! metres, yaw is degrees around +Y, and object origins are at their base.
use std::collections::HashSet;
use rapier3d::prelude::*;
use serde::{Deserialize, Serialize};
use super::road_colliders::RoadPlacement;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AuthoredLayout {
    pub format: String,
    pub version: u32,
    pub map_id: String,
    pub title: String,
    pub base: LayoutBase,
    pub objects: Vec<LayoutObject>,
    #[serde(default = "default_solid")]
    pub ground: bool,
    #[serde(default = "default_solid")]
    pub repeat: bool,
}
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LayoutBase { Replace, Overlay }
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LayoutObject {
    pub id: String,
    pub name: String,
    pub piece: String,
    pub position: [f32; 3],
    pub size: [f32; 3],
    pub yaw: f32,
    pub color: String,
    pub locked: bool,
    pub solid: bool,
    pub parts: Vec<LayoutPart>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub road: Option<RoadPlacement>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LayoutPart {
    pub shape: PartShape,
    pub position: [f32; 3],
    pub size: [f32; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default = "default_solid")]
    pub solid: bool,
}
fn default_solid() -> bool { true }
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PartShape { Box, Wedge }
fn vector_ok(value: &[f32; 3], min: f32, max: f32) -> bool {
    value.iter().all(|v| v.is_finite() && *v >= min && *v <= max)
}
fn identifier(value: &str, max: usize) -> bool {
    !value.is_empty() && value.len() <= max && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn color_ok(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
}
impl AuthoredLayout {
    pub fn replaces_base(&self) -> bool { self.base == LayoutBase::Replace }
    pub fn validate(&self, map_id: &str) -> anyhow::Result<()> {
        anyhow::ensure!(self.format == "avenlab-world-layout" && self.version == 1, "Unsupported authored layout format");
        anyhow::ensure!(self.map_id == map_id && identifier(&self.map_id, 96), "Authored layout map ID mismatch");
        anyhow::ensure!(!self.title.trim().is_empty() && self.title.chars().count() <= 80, "Invalid layout title");
        anyhow::ensure!(self.objects.len() <= 512, "Authored layout exceeds 512 pieces");
        let mut ids = HashSet::new();
        let mut count = 0;
        for object in &self.objects {
            anyhow::ensure!(identifier(&object.id, 96) && ids.insert(object.id.clone()), "Invalid or duplicate authored piece ID");
            anyhow::ensure!(identifier(&object.piece, 64) && !object.name.trim().is_empty() && object.name.chars().count() <= 80, "Invalid piece name");
            anyhow::ensure!(vector_ok(&object.position, -100000.0, 100000.0) && vector_ok(&object.size, 0.02, 512.0) && object.yaw.is_finite() && object.yaw.abs() <= 36000.0, "Invalid authored piece transform");
            anyhow::ensure!(color_ok(&object.color), "Invalid authored piece color");
            if let Some(road) = &object.road {
                road.validate()?;
                anyhow::ensure!(object.piece == format!("glb-{}",road.asset) && object.parts.is_empty(), "Road must use its measured catalog, without extra guessed shapes");
                count += road.shape_count();
                continue;
            }
            anyhow::ensure!(!object.parts.is_empty() && object.parts.len() <= 32, "Piece must have 1-32 shapes");
            count += object.parts.len();
            for part in &object.parts {
                anyhow::ensure!(vector_ok(&part.position, -2.0, 2.0) && vector_ok(&part.size, 0.001, 4.0), "Invalid authored shape transform");
                anyhow::ensure!(part.color.as_ref().is_none_or(|c| color_ok(c)), "Invalid authored shape color");
                anyhow::ensure!(part.collider(object).is_some(), "Degenerate authored collision shape");
            }
        }
        anyhow::ensure!(count <= 4096, "Authored layout exceeds 4096 shapes");
        Ok(())
    }
    pub fn spawn(&self, bodies: &mut RigidBodySet, colliders: &mut ColliderSet, origin: [f32; 3], groups: InteractionGroups) -> Vec<RigidBodyHandle> {
        let mut handles = Vec::new();
        for object in &self.objects {
            if let Some(road) = &object.road {
                if let Some(handle) = road.spawn(object,bodies,colliders,origin,groups) { handles.push(handle); }
                continue;
            }
            if !object.solid || !object.parts.iter().any(|p| p.solid) { continue; }
            let root = RigidBodyBuilder::fixed()
                .translation(vector![origin[0] + object.position[0], origin[1] + object.position[1], origin[2] + object.position[2]])
                .rotation(vector![0.0, object.yaw.to_radians(), 0.0]).build();
            let handle = bodies.insert(root);
            for part in object.parts.iter().filter(|p| p.solid) {
                let shape = part.collider(object).expect("authored layout validated before spawning")
                    .translation(vector![part.position[0] * object.size[0], part.position[1] * object.size[1], part.position[2] * object.size[2]])
                    .collision_groups(groups).friction(1.2).restitution(0.0).build();
                colliders.insert_with_parent(shape, handle, bodies);
            }
            handles.push(handle);
        }
        handles
    }
}
impl LayoutPart {
    fn collider(&self, object: &LayoutObject) -> Option<ColliderBuilder> {
        let h = [self.size[0] * object.size[0] / 2.0, self.size[1] * object.size[1] / 2.0, self.size[2] * object.size[2] / 2.0];
        match self.shape {
            PartShape::Box => Some(ColliderBuilder::cuboid(h[0], h[1], h[2])),
            PartShape::Wedge => ColliderBuilder::convex_hull(&[
                point![-h[0], -h[1], h[2]], point![h[0], -h[1], h[2]],
                point![-h[0], -h[1], -h[2]], point![h[0], -h[1], -h[2]],
                point![-h[0], h[1], -h[2]], point![h[0], h[1], -h[2]],
            ]),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> AuthoredLayout {
        serde_json::from_value(serde_json::json!({"format":"avenlab-world-layout","version":1,"map_id":"test","title":"Test","base":"replace","objects":[
            {"id":"ramp-1","name":"Ramp","piece":"ramp","position":[10,2,20],"size":[8,4,16],"yaw":90,"color":"#c2a879","solid":true,"locked":false,"parts":[{"shape":"wedge","position":[0,0.5,0],"size":[1,1,1]}]}
        ]})).unwrap()
    }
    #[test]
    fn wedge_raycast_matches_slope_and_rotates_once() {
        let doc = sample(); doc.validate("test").unwrap();
        let mut bodies = RigidBodySet::new(); let mut colliders = ColliderSet::new();
        let handles = doc.spawn(&mut bodies, &mut colliders, [100.0, 0.0, -100.0], InteractionGroups::all());
        assert_eq!(handles.len(), 1); assert_eq!(colliders.len(), 1);
        let collider = colliders.iter().next().unwrap().1;
        // A 90-degree yaw sends the high -Z end to -X. Sample both ends.
        for (x, expected_y) in [(104.0, 5.5), (116.0, 2.5)] {
            let ray = Ray::new(point![x, 20.0, -80.0], vector![0.0, -1.0, 0.0]);
            let hit = collider.shape().cast_ray(collider.position(), &ray, 30.0, true).unwrap();
            assert!((20.0 - hit - expected_y).abs() < 0.001);
        }
    }
    #[test]
    fn rejects_bad_ids_dimensions_and_maps_before_spawning() {
        let mut doc = sample(); assert!(doc.validate("another").is_err());
        doc.objects.push(doc.objects[0].clone()); assert!(doc.validate("test").is_err());
        doc.objects.pop(); doc.objects[0].size[0] = f32::NAN; assert!(doc.validate("test").is_err());
    }
    #[test]
    fn decorative_parts_never_create_physics() {
        let mut doc = sample(); doc.objects[0].parts[0].solid = false;
        let mut bodies = RigidBodySet::new(); let mut colliders = ColliderSet::new();
        assert!(doc.spawn(&mut bodies, &mut colliders, [0.0; 3], InteractionGroups::all()).is_empty());
        assert!(colliders.is_empty());
    }
    #[test]
    fn frontend_garage_fixture_keeps_its_drive_through_opening() {
        let mut doc: AuthoredLayout = serde_json::from_str(include_str!("../../../docs/examples/world-builder.layout.json")).unwrap();
        doc.validate("streaming_endless_city").unwrap();
        let garage = doc.objects.iter().find(|o| o.piece == "garage").unwrap().clone();
        doc.objects = vec![garage.clone()];
        let mut bodies = RigidBodySet::new(); let mut colliders = ColliderSet::new();
        doc.spawn(&mut bodies, &mut colliders, [0.0; 3], InteractionGroups::all());
        assert_eq!(colliders.len(), 7);
        let pose = Isometry::new(vector![garage.position[0], garage.position[1], garage.position[2]], vector![0.0, garage.yaw.to_radians(), 0.0]);
        for (x, should_hit) in [(0.0, false), (5.76, true)] {
            let ray = Ray::new(pose * point![x, 2.0, 15.0], pose.rotation * vector![0.0, 0.0, -1.0]);
            let hit = colliders.iter().any(|(_, c)| c.shape().cast_ray(c.position(), &ray, 20.0, true).is_some());
            assert_eq!(hit, should_hit, "garage entrance at local x={x}");
        }
    }
}
