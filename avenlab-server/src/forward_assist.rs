//! BRZ hull-lock assists the forward gun. Manual turret and cannon paths use
//! the requested aim directly. Cover and vehicle bodies use the actual world query.
use crate::physics::PhysicsWorld;
use rapier3d::prelude::*;

impl PhysicsWorld {
    pub(crate) fn forward_target(&self, player:&str, previous:Option<&str>, origin:Point<Real>, forward:Vector<Real>) -> Option<(String,Vector<Real>)> {
        let source=self.vehicles.get(player)?;
        let mut best:Option<(f32,&String,Vector<Real>)>=None;
        for (id,vehicle) in &self.vehicles {
            if vehicle.team==source.team || self.is_defeated(id) { continue; }
            let Some(body)=self.bodies.get(vehicle.body).filter(|body|body.is_enabled()) else {continue};
            let target=body.position()*Point::from(vehicle.config.chassis_com_offset);
            let delta=target-origin;
            let distance=delta.norm();
            if !(0.1..=120.0).contains(&distance) {continue;}
            let direction=delta/distance;
            let dot=direction.dot(&forward);
            if dot < 0.9781 {continue;} // 12-degree half cone
            let rank=dot-0.008*distance/120.0+if previous==Some(id.as_str()){0.004}else{0.0};
            if best.as_ref().is_some_and(|(score,other,_)| *score>rank || (*score==rank && other<=&id)) {continue;}
            let hit=self.query_pipeline.cast_ray(&self.bodies,&self.colliders,&Ray::new(origin,direction),distance+0.15,true,QueryFilter::default().exclude_rigid_body(source.body));
            if hit.and_then(|(handle,_)|self.colliders[handle].parent())==Some(vehicle.body) {
                best=Some((rank,id,direction));
            }
        }
        best.map(|(_,id,direction)|(id.clone(),direction))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::support::tests::{blank_world,place};

    #[test]
    fn front_assist_requires_visible_enemy_in_cone_and_keeps_cannon_manual(){
        let mut w=blank_world();
        for (id,team,x,z) in [("brz","red",0.0,0.0),("enemy","blue",1.0,24.0),("friend","red",9.0,12.0)] {
            w.spawn_vehicle_for_player(id.into(),[0.0;3],"brz",team).unwrap();
            place(&mut w,id,x,z);
        }
        w.set_assigned_hero("brz","brz");
        let mut input=crate::state::CombatPose{enabled:true,hull_locked:true,..Default::default()};
        w.combat_tick("brz",1,Some(&input));
        assert_eq!(w.combat_poses["brz"].assisted_target.as_deref(),Some("enemy"));
        input.hull_locked=false;
        w.combat_tick("brz",2,Some(&input));
        assert!(w.combat_poses["brz"].assisted_target.is_none());
        input.hull_locked=true;
        place(&mut w,"friend",0.5,12.0);
        w.combat_tick("brz",3,Some(&input));
        assert!(w.combat_poses["brz"].assisted_target.is_none());
        place(&mut w,"enemy",1.0,-24.0);
        w.combat_tick("brz",4,Some(&input));
        assert!(w.combat_poses["brz"].assisted_target.is_none());
    }
}
