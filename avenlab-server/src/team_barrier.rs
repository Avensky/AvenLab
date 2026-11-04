//! A turret-directed, one-way screen just beyond the forward cannon muzzle.
//! Query only during weapon fire so the screen cannot snag vehicles or wheels.
use crate::physics::PhysicsWorld;
use rapier3d::prelude::*;

pub const PANEL: [f32; 4] = [5.4, 0.8, 10.0, 3.4]; // forward, center Y, width, height

impl PhysicsWorld {
    /// Returns the first fully stopped impact, or remaining damage after all
    /// penetrated screens. The segment is already clipped to the nearest solid.
    pub(crate) fn screen_segment(&mut self, shooter: &str, from: Point<Real>, to: Point<Real>,
        damage: &mut f32) -> Option<(Point<Real>, Vector<Real>, f32)> {
        let team = &self.vehicles.get(shooter)?.team;
        let mut crossings = Vec::new();
        for (id, guard) in &self.guard_boosts {
            if guard.kind != "tank_barrier" || !guard.active() || guard.shield_hp <= 0.0 { continue; }
            let Some(tank) = self.vehicles.get(id) else { continue };
            if tank.team.eq_ignore_ascii_case(team) { continue; }
            let body = &self.bodies[tank.body];
            let turret = body.position() * Isometry::from_parts(Translation::new(0.0,0.0,0.1),
                Rotation::from_axis_angle(&Vector::y_axis(),self.barrier_yaw(id)));
            let a = turret.inverse_transform_point(&from);
            let b = turret.inverse_transform_point(&to);
            let [z, y, width, height] = PANEL;
            if a.z <= z || b.z > z { continue; }
            let t = (a.z-z)/(a.z-b.z);
            let point = a + (b-a)*t;
            if point.x.abs() <= width*0.5 && (point.y-y).abs() <= height*0.5 {
                crossings.push((t, id.clone(), turret.rotation*Vector::z()));
            }
        }
        crossings.sort_by(|a,b| a.0.total_cmp(&b.0).then_with(||a.1.cmp(&b.1)));
        for (t, id, normal) in crossings {
            *damage = self.guard_boosts.get_mut(&id).unwrap().absorb(*damage);
            if *damage <= 0.0 { return Some((from+(to-from)*t, normal, t)); }
        }
        None
    }
}
