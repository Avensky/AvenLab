//! Server-clocked shared Ultimate. Targets and hit segments never come from input.
use crate::physics::{vehicle_collision_groups, PhysicsWorld};
use rapier3d::prelude::*;
use serde::Serialize;

const TICKS: u16 = 300;
const PULSE_TICKS: u16 = 15;
pub const RANGE: f32 = 45.0;

#[derive(Debug, Clone, Serialize)]
pub struct BarrageTrace { pub from: [f32;3], pub to: [f32;3], pub cannon: bool }
#[derive(Debug, Clone, Serialize)]
pub struct Barrage {
    pub ticks_left: u16,
    pub pulse: u16,
    pub traces: Vec<BarrageTrace>,
    #[serde(skip)] cursor: usize,
    #[serde(skip)] sweeping: bool,
}

impl PhysicsWorld {
    pub fn start_barrage(&mut self, player: &str) -> Result<(),String> {
        let vehicle=self.vehicles.get_mut(player).ok_or("Deploy a vehicle first.")?;
        let health=self.vehicle_health.get_mut(player).ok_or("Deploy a vehicle first.")?;
        if health.defeated || health.hp <= 0.0 || !self.bodies.get(vehicle.body).is_some_and(|body|body.is_enabled()) {
            return Err("Barrage requires a living vehicle.".into());
        }
        if self.barrages.contains_key(player) || vehicle.powertrain.ultimate_fraction != 1.0 {
            return Err("Barrage requires full Ultimate charge.".into());
        }
        vehicle.powertrain.ultimate_fraction=0.0;
        health.spawn_protection_s=0.0;
        self.barrages.insert(player.to_owned(),Barrage{ticks_left:TICKS,pulse:0,traces:Vec::with_capacity(3),cursor:0,sweeping:false});
        Ok(())
    }

    pub fn advance_barrages(&mut self, online: impl Fn(&str)->bool) {
        if self.barrages.is_empty(){return}
        let mut active=std::mem::take(&mut self.barrages);
        active.retain(|player,barrage| {
            if !online(player) || self.is_defeated(player) ||
                !self.vehicles.get(player).is_some_and(|v|self.bodies[v.body].is_enabled()) {return false}
            let elapsed=TICKS-barrage.ticks_left;
            if elapsed%PULSE_TICKS==0 {self.barrage_pulse(player,barrage,&online);}
            if barrage.sweeping && elapsed%PULSE_TICKS!=0 {
                let body=self.vehicles[player].body;
                let yaw=(elapsed as f32)*std::f32::consts::TAU/150.0;
                let dir=self.bodies[body].rotation()*vector![yaw.sin(),0.,yaw.cos()];
                if let Some(pose)=self.combat_poses.get_mut(player){
                    pose.yaw=(-dir.x).atan2(-dir.z);pose.pitch=dir.y.clamp(-1.,1.).asin();
                }
            }
            barrage.ticks_left-=1;
            barrage.ticks_left>0
        });
        self.barrages=active;
    }

    fn barrage_pulse(&mut self,player:&str,b:&mut Barrage,online:impl Fn(&str)->bool) {
        let tank=&self.vehicles[player];
        let hull=*self.bodies[tank.body].position();
        let chassis=tank.body;
        let tracked=tank.config.tracked;
        let height=if tracked {tank.config.nominal_wheel_center_y()-tank.config.wheel_radius+1.65}
            else {tank.config.chassis_com_offset[1]+tank.config.chassis_half_extents[1]+0.05};
        let origin=hull*point![0.0,height,0.10];
        let filter=QueryFilter::default().groups(vehicle_collision_groups(false)).exclude_rigid_body(chassis);
        let visible=|world:&PhysicsWorld,start:Point<Real>,end:Point<Real>,target:RigidBodyHandle|{
            let delta=end-start;let distance=delta.norm();
            distance>0.01 && world.query_pipeline.cast_ray(&world.bodies,&world.colliders,
                &Ray::new(start,delta/distance),distance+0.1,true,filter)
                .and_then(|(hit,_)|world.colliders[hit].parent())==Some(target)
        };
        let mut targets:Vec<_>=self.vehicles.iter().filter_map(|(id,v)|{
            if v.team.eq_ignore_ascii_case(&tank.team) || !online(id) || self.is_defeated(id) ||
                self.vehicle_health.get(id).is_some_and(|h|h.spawn_protection_s>0.0) {return None}
            let body=self.bodies.get(v.body).filter(|body|body.is_enabled())?;
            let center=body.position()*Point::from(v.config.chassis_com_offset);
            let distance=(center-origin).norm();
            (distance<=RANGE && visible(self,origin,center,v.body)).then(||(id.clone(),v.body,center,distance))
        }).collect();
        targets.sort_by(|a,b|a.0.cmp(&b.0));
        b.traces.clear();
        let cannon_ready=b.pulse%4==0;
        b.pulse+=1;
        let mut aim=None;
        b.sweeping=targets.is_empty();
        if b.sweeping {
            // Three mounts cover the ring. Across consecutive pulses the pattern
            // sweeps clockwise. Each ray stops at its first physical obstruction.
            let yaw=(b.pulse-1) as f32 * std::f32::consts::TAU/10.0;
            for mount in 0..3 {
                let angle=yaw+mount as f32*std::f32::consts::TAU/3.0;
                let dir=hull.rotation*vector![angle.sin(),0.,angle.cos()];
                if mount==0 {aim=Some(dir);}
                let cannon=mount==0 && cannon_ready;
                let ray=Ray::new(origin,dir);
                let hit=self.query_pipeline.cast_ray(&self.bodies,&self.colliders,&ray,RANGE,true,filter);
                let mut end=ray.point_at(hit.map_or(RANGE,|(_,t)|t));
                let mut damage=if cannon {100.0}else{19.0};
                if let Some((block,_,_))=self.screen_segment(player,origin,end,&mut damage){end=block;}
                if damage>0.0 {
                    if let Some(parent)=hit.and_then(|(handle,_)|self.colliders[handle].parent()) {
                        if let Some(victim)=self.body_to_player.get(&parent).cloned() {
                            if online(&victim) && self.vehicles[&victim].team!=self.vehicles[player].team {
                                self.damage_vehicle(&victim,Some(player),damage,"barrage-sweep");
                            }
                        } else {self.damage_authored_surface(parent,cannon,damage);}
                    }
                }
                b.traces.push(BarrageTrace{from:origin.into(),to:end.into(),cannon});
            }
        }
        // Cannon, roof MG and forward MG share a fixed damage budget. A single
        // exposed opponent draws every mount; multiple opponents take turns.
        for (offset,cannon) in [(0.0,true),(-0.38,false),(0.32,false)] {
            if targets.is_empty(){break;}
            if cannon && !cannon_ready {continue}
            let (id,handle,center,distance)=&targets[b.cursor%targets.len()];b.cursor=b.cursor.wrapping_add(1);
            let start=hull*point![offset,height+if offset<0.0{0.22}else{0.0},0.10];
            // The centered cannon uses the same ray already accepted during acquisition.
            if self.is_defeated(id) || (!cannon && !visible(self,start,*center,*handle)){continue}
            let direction=(*center-start).normalize();
            let mut damage=(if cannon {100.0}else{19.0})*(1.0+0.25*(1.0-distance/RANGE));
            let end=if let Some((hit,_,_))=self.screen_segment(player,start,*center,&mut damage){hit}else{*center};
            if damage>0.0 { self.damage_vehicle(id,Some(player),damage,if cannon{"barrage-cannon"}else{"barrage-mg"}); }
            let reach:f32=if cannon && tracked{4.0}else{0.8};
            let muzzle=start+direction*reach.min((end-start).norm()*0.8);
            b.traces.push(BarrageTrace{from:muzzle.into(),to:end.into(),cannon});
            if aim.is_none(){aim=Some(direction);}
        }
        if let Some(dir)=aim{
            let pose=self.combat_poses.entry(player.to_owned()).or_default();
            pose.enabled=true;
            if tracked {pose.role="tank".into();}
            pose.hull_locked=false;
            pose.yaw=(-dir.x).atan2(-dir.z);pose.pitch=dir.y.clamp(-1.0,1.0).asin();
            if b.traces.iter().any(|trace|trace.cannon){pose.cannon_shot=pose.cannon_shot.wrapping_add(1);}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::support::tests::{blank_world,place};
    fn world() -> PhysicsWorld {
        let mut w=blank_world();
        for (id,x,z,team) in [("source",0.,0.,"red"),("a",0.,20.,"blue"),("ally",12.,-5.,"red")]{
            w.spawn_vehicle_for_player(id.into(),[0.;3],"tank",team).unwrap();
            place(&mut w,id,x,z);w.vehicle_health.get_mut(id).unwrap().spawn_protection_s=0.;
        }
        w.vehicles.get_mut("source").unwrap().powertrain.ultimate_fraction=1.;
        w
    }
    #[test]
    fn full_charge_is_spent_once_and_exposed_lone_tank_dies_within_five_seconds() {
        let mut w=world();w.start_barrage("source").unwrap();assert!(w.start_barrage("source").is_err());
        for _ in 0..299 {w.advance_barrages(|_|true);}
        assert_eq!(w.barrages["source"].pulse,20);assert!(w.is_defeated("a"));
        assert_eq!(w.vehicle_health["ally"].hp,w.vehicle_health["ally"].max_hp);
        assert_eq!(w.vehicles["source"].powertrain.ultimate_fraction,0.);
        w.advance_barrages(|_|true);assert!(w.barrages.is_empty());
    }
    #[test]
    fn reacquires_visible_enemies_and_never_penetrates_cover_or_exceeds_range(){
        let mut w=world();
        w.spawn_vehicle_for_player("b".into(),[0.;3],"tank","blue").unwrap();place(&mut w,"b",15.,0.);
        w.vehicle_health.get_mut("b").unwrap().spawn_protection_s=0.;
        w.start_barrage("source").unwrap();w.advance_barrages(|_|true);
        assert!(w.vehicle_health["a"].hp<w.vehicle_health["a"].max_hp && w.vehicle_health["b"].hp<w.vehicle_health["b"].max_hp);
        let hp=w.vehicle_health["a"].hp;
        let wall=w.bodies.insert(RigidBodyBuilder::fixed().translation(vector![0.,2.,10.]).build());
        w.colliders.insert_with_parent(ColliderBuilder::cuboid(4.,5.,1.).build(),wall,&mut w.bodies);
        place(&mut w,"b",90.,0.);let far=w.vehicle_health["b"].hp;
        for _ in 0..30{w.advance_barrages(|_|true);}
        assert_eq!(w.vehicle_health["a"].hp,hp);assert_eq!(w.vehicle_health["b"].hp,far);
        w.colliders[w.bodies[wall].colliders()[0]].set_enabled(false);w.query_pipeline.update(&w.colliders);
        for _ in 0..15{w.advance_barrages(|_|true);}assert!(w.vehicle_health["a"].hp<hp);
    }
    #[test]
    fn closer_hits_are_stronger_and_a_frontal_tank_barrier_can_save_a_lone_opponent(){
        let first_hit=|distance|{
            let mut w=world();place(&mut w,"a",0.,distance);
            w.start_barrage("source").unwrap();w.advance_barrages(|_|true);
            w.vehicle_health["a"].max_hp-w.vehicle_health["a"].hp
        };
        assert!(first_hit(10.)>first_hit(40.));
        let mut w=world();place(&mut w,"a",0.,-20.);
        w.set_assigned_hero("a","tank");
        w.vehicles.get_mut("a").unwrap().powertrain.running=true;
        w.start_tank_barrier("a").unwrap();w.start_barrage("source").unwrap();w.advance_barrages(|_|true);
        assert_eq!(w.vehicle_health["a"].hp,w.vehicle_health["a"].max_hp);
        assert!(w.guard_view("a").shield_hp<crate::guard_boost::BARRIER_HP);
        for _ in 1..TICKS {w.advance_barrages(|_|true);}
        assert!(w.vehicle_health["a"].hp>0. && w.vehicle_health["a"].hp<w.vehicle_health["a"].max_hp);
    }
    #[test]
    fn every_deployable_vehicle_can_spend_charge_and_fire_without_targets() {
        for hero in crate::alpha::policy::HEROES {
            let mut w=blank_world();
            w.spawn_vehicle_for_player("solo".into(),[0.;3],hero.vehicle,"blue").unwrap();
            w.set_assigned_hero("solo",hero.id);
            w.vehicles.get_mut("solo").unwrap().powertrain.ultimate_fraction=1.;
            w.start_barrage("solo").unwrap();w.advance_barrages(|_|true);
            assert_eq!(w.barrages["solo"].traces.len(),3,"{}",hero.id);
            assert_eq!(w.vehicles["solo"].powertrain.ultimate_fraction,0.);
        }
    }
    #[test]
    fn empty_barrage_sweeps_from_a_road_vehicle_and_reacquires(){
        let mut w=world();
        w.spawn_vehicle_for_player("coupe".into(),[0.;3],"brz","red").unwrap();
        place(&mut w,"coupe",12.,7.);place(&mut w,"a",110.,110.);
        w.vehicles.get_mut("coupe").unwrap().powertrain.ultimate_fraction=1.;
        w.start_barrage("coupe").unwrap();w.advance_barrages(|_|true);
        let first=w.barrages["coupe"].traces.clone();assert_eq!(first.len(),3);
        let yaw=w.combat_poses["coupe"].yaw;
        for _ in 0..15{w.advance_barrages(|_|true);}
        assert_ne!(w.combat_poses["coupe"].yaw,yaw);assert_ne!(w.barrages["coupe"].traces[0].to,first[0].to);
        place(&mut w,"a",12.,22.);
        let hp=w.vehicle_health["a"].hp;
        for _ in 0..15{w.advance_barrages(|_|true);}
        assert!(w.vehicle_health["a"].hp<hp);
    }
    #[test]
    fn shields_block_damage_and_disconnect_cancels_the_action(){
        let mut w=world();w.guard_boosts.entry("a".into()).or_default().dive_remaining=2.;
        w.start_barrage("source").unwrap();w.advance_barrages(|_|true);
        assert_eq!(w.vehicle_health["a"].hp,w.vehicle_health["a"].max_hp);
        w.advance_barrages(|id|id!="source");assert!(w.barrages.is_empty());
    }
}
