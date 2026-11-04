//! The rescue SUV spends one pressure pulse per shot. A cone can reach several
//! enemies, but solid cover and the directed tank barrier still intercept fire.
use crate::physics::PhysicsWorld;
use rapier3d::prelude::*;

pub const RANGE:f32=16.0;
pub const DAMAGE:f32=8.0;
pub const CAPACITY:u32=10;
pub const RECHARGE:f32=2.5;

impl PhysicsWorld {
    pub(crate) fn fire_support_spray(&mut self,player:&str,origin:Point<Real>,direction:Vector<Real>) {
        let Some(source)=self.vehicles.get(player) else{return;};
        let mut hits=Vec::new();
        for (id,v) in &self.vehicles {
            if v.team==source.team || self.is_defeated(id) {continue;}
            let body=&self.bodies[v.body];
            if !body.is_enabled(){continue;}
            let center=body.position()*Point::from(v.config.chassis_com_offset);
            let delta=center-origin;
            let distance=delta.norm();
            if !(0.01..=RANGE).contains(&distance){continue;}
            let aim=delta/distance;
            if direction.dot(&aim)<0.92388 {continue;} // ±22.5° around the muzzle
            let ray=Ray::new(origin,aim);
            let hit=self.query_pipeline.cast_ray(&self.bodies,&self.colliders,&ray,distance+0.1,true,QueryFilter::default().exclude_rigid_body(source.body));
            if let Some((_,t))=hit.filter(|(h,_)| self.colliders[*h].parent()==Some(v.body)){
                hits.push((t,id.clone(),ray.point_at(t)));
            }
        }
        hits.sort_by(|a,b|a.0.total_cmp(&b.0).then_with(||a.1.cmp(&b.1)));
        let mut effect=None;
        for (_,id,hit) in hits {
            let mut damage=DAMAGE;
            let stopped=self.screen_segment(player,origin,hit,&mut damage);
            effect.get_or_insert(stopped.map_or(hit,|(point,_,_)|point));
            if damage>0.0 {self.damage_vehicle(&id,Some(player),damage,"support-spray");}
        }
        if let Some(pose)=self.combat_poses.get_mut(player){
            pose.impact=effect.map(|p|[p.x,p.y,p.z]);pose.impact_time=0.0;pose.impact_static=false;pose.impact_normal=None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::support::tests::{blank_world,place};
    use crate::physics::SIMULATION_DT;
    use crate::state::CombatPose;
    #[test]
    fn rescue_suv_hits_visible_cluster_respects_cover_and_recharges() {
        let mut w=blank_world();
        for (id,team,x,z) in [("suv","red",0.,0.),("left","blue",-2.,11.),("right","blue",2.,11.),("rear","blue",0.,-9.),("far","blue",0.,28.)] {
            w.spawn_vehicle_for_player(id.into(),[0.;3],if id=="suv" {"cx30"}else{"brz"},team).unwrap();
            place(&mut w,id,x,z);
            w.vehicle_health.get_mut(id).unwrap().spawn_protection_s=0.0;
        }
        w.set_assigned_hero("suv","cx30");
        let input=CombatPose{enabled:true,fire:true,hull_locked:true,..Default::default()};
        w.combat_tick("suv",1,Some(&input));
        assert_eq!(w.vehicle_health["left"].hp,500.-DAMAGE);assert_eq!(w.vehicle_health["right"].hp,500.-DAMAGE);
        assert_eq!(w.vehicle_health["rear"].hp,500.);assert_eq!(w.vehicle_health["far"].hp,500.);
        w.spawn_vehicle_for_player("cover".into(),[0.;3],"tank","red").unwrap();place(&mut w,"cover",-1.,5.5);
        let before=w.vehicle_health["left"].hp;
        for seq in 2..100 {w.combat_tick("suv",seq,Some(&input));if w.combat_poses["suv"].shot==CAPACITY {break;}}
        assert_eq!(w.combat_poses["suv"].ammo,0);assert!(w.combat_poses["suv"].reload>2.4);
        assert_eq!(w.vehicle_health["left"].hp,before);assert!(w.vehicle_health["right"].hp<before);
        for seq in 0..(1.0/SIMULATION_DT) as u32 {w.combat_tick("suv",101+seq,Some(&input));}
        assert_eq!(w.combat_poses["suv"].shot,CAPACITY);
    }
}
