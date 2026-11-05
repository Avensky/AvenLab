//! Harbor variants are selected once per new lobby. Discovery belongs to its runtime.
use crate::{physics::PhysicsWorld, state::SharedGameState, spawn::Team};
use std::collections::HashMap;

use rapier3d::prelude::{RigidBody, Vector};

pub const SEA_LEVEL: f32 = -8.0;
pub(crate) struct WaterTile { center: [f32;2], half: [f32;2], pub bottom: f32 }
impl WaterTile {
    pub fn from_bed(o:&crate::world::authored_layout::LayoutObject)->Self {
        Self{center:[o.position[0],o.position[2]],half:[o.size[0]/2.,o.size[2]/2.],bottom:o.position[1]+o.size[1]}
    }
    pub fn contains(&self,p:&Vector<f32>)->bool {
        (p.x-self.center[0]).abs()<=self.half[0] && (p.z-self.center[1]).abs()<=self.half[1]
    }
    pub fn damp_submerged(&self,body:&mut RigidBody,dt:f32) {
        let y=body.translation().y;
        if y>=SEA_LEVEL || y<self.bottom-2.0 {return;}
        let terminal=(0.65+0.20*(SEA_LEVEL-y)).min(3.0);
        let drag=(-0.55*dt).exp();
        let v=body.linvel();let next=Vector::new(v.x*drag,v.y.max(-terminal),v.z*drag);
        body.set_linvel(next,false);
    }
}

pub const VARIANTS: [&str; 3] = ["harbor_canal_red","harbor_canal_blue","harbor_canal_fleet"];
pub fn queue_map(world:usize)->&'static str { match world%4 {0=>"streaming_endless_city",slot=>VARIANTS[slot-1]} }
/// Assign four reserved service lots per bank from the world seed. All peers,
/// including replacements, receive the same resulting authored map.
pub fn place_services(world:usize,file:&mut crate::world::block_colliders::BlockColliderFile){
    let Some(layout)=file.authored_layout.as_mut() else{return};
    let mut state=(world as u32).wrapping_mul(2654435761);
    for side in [-1.0_f32,1.0]{
        let mut lots=[-145.,-40.,40.,145.];
        for i in (1..lots.len()).rev(){
            state=state.wrapping_mul(1664525).wrapping_add(1013904223);
            lots.swap(i,((u64::from(state)*(i as u64+1))>>32) as usize);
        }
        for (site,z) in layout.objects.iter_mut().filter(|o|
            o.position[0].signum()==side && !o.id.starts_with("home-gas-") && matches!(o.piece.as_str(),"fuel-station"|"repair-shop")).zip(lots){
            site.position[2]=z;
        }
    }
}
pub fn lift_angle(tick:u64)->f32 {
    (std::f32::consts::TAU * (tick%1200) as f32/1200.).sin().max(0.).powi(2)*std::f32::consts::PI/6.
}
fn cell(x:f32,z:f32)->u64 {
    let col=((x+400.)/100.).floor() as i32;
    let row=((z+400.)/100.).floor() as i32;
    if (0..8).contains(&col) && (0..8).contains(&row) {1u64 << (row*8+col)} else {0}
}
fn team_index(team:Team)->usize { if team==Team::Red {0} else {1} }
#[derive(Default)]
pub struct HarborIntel { seen:[u64;2], delivered:HashMap<String,(usize,u64)> }
impl HarborIntel {
    pub fn forget_connection(&mut self,id:&str){self.delivered.remove(id);}
    pub fn tick(&mut self,game:&SharedGameState,physics:&PhysicsWorld) {
        let Some(map)=physics.active_map_id() else{return};
        if !VARIANTS.contains(&map) || game.tick%15!=0 { return; }
        for (id,vehicle) in &physics.vehicles {
            let Some(entity)=game.entities.get(id) else{continue};
            if !game.clients.contains_key(id) || physics.is_defeated(id){continue;}
            let p=physics.bodies[vehicle.body].translation();
            if p.y > -5. {self.seen[team_index(entity.team)]|=cell(p.x,p.z);}
        }
        self.delivered.retain(|id,_|game.clients.contains_key(id));
        for (id,tx) in &game.clients {
            let Some(entity)=game.entities.get(id) else{continue};
            let index=team_index(entity.team);let mask=self.seen[index];
            if self.delivered.get(id)==Some(&(index,mask)){continue;}
            let packet=serde_json::json!({"type":"sector_chart","world_id":game.room_id,"map":map,
                "team":entity.team.as_str(),"sectors":format!("{mask:016x}")});
            if tx.send(packet.to_string()).is_ok(){self.delivered.insert(id.clone(),(index,mask));}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world_sessions::WorldRuntime;
    use rapier3d::prelude::*;
    fn support(w:&PhysicsWorld,x:f32,z:f32)->Option<f32>{
        let ray=Ray::new(point![x,50.,z],-Vector::y());
        w.colliders.iter().filter(|(_,c)|c.is_enabled()).filter_map(|(_,c)|
            c.shape().cast_ray(c.position(),&ray,100.,true)).min_by(f32::total_cmp).map(|t|50.-t)
    }
    #[test]
    fn deck_support_moving_jump_and_collapsed_bridge_agree_with_world_geometry(){
        let mut w=PhysicsWorld::for_harbor_room(2,VARIANTS[2]).unwrap();
        let m=w.map_snapshot().unwrap();let o=&m.authored_layout.unwrap().objects;
        for x in [-256.,256.]{
            for z in [-78.,-70.,-62.,-54.,-46.]{assert!((support(&w,x,z).unwrap()-6.).abs()<0.02);}
        }
        assert!((support(&w,0.,60.).unwrap()+24.).abs()<0.02);
        for x in [-14.,14.] {
            let ray=Ray::new(point![x,-4.,-202.],Vector::z());
            assert!(!w.colliders.iter().any(|(_,c)| c.shape().cast_ray(c.position(),&ray,48.,true).is_some()),
                    "the stone arch at {x} must leave a passage below the deck");
        }
        assert!((support(&w,0.,-178.).unwrap()-0.08).abs()<0.02);
        assert!((support(&w,0.,178.).unwrap()-0.08).abs()<0.02);
        w.move_drawbridges(300);w.step(crate::physics::SIMULATION_DT);
        assert!(support(&w,-6.,0.).unwrap()>8.);
        assert!((support(&w,0.,0.).unwrap()+24.).abs()<0.02);
        w.move_drawbridges(900);w.step(crate::physics::SIMULATION_DT);
        assert!(support(&w,-6.,0.).unwrap().abs()<0.02);
        let index=o.iter().position(|o|o.piece=="canal-breakable").unwrap();
        let id=w.bodies.iter().find(|(_,b)|b.user_data==index as u128+1).unwrap().0;
        w.damage_authored_surface(id,true,300.);
        assert!((support(&w,0.,178.).unwrap()+24.).abs()<0.02);
        assert!(support(&w,0.,-178.).is_some());
    }
    #[test]
    fn car_crosses_both_highway_approaches_and_the_masonry_seam() {
        let mut world=PhysicsWorld::for_harbor_room(2,VARIANTS[2]).unwrap();
        let handle=world.spawn_vehicle_for_player("bridge-driver".into(),[0.;3],"brz","red").unwrap();
        let body=&mut world.bodies[handle];
        body.set_translation(vector![-135.,1.,-178.],true);
        body.set_rotation(Rotation::from_euler_angles(0.,std::f32::consts::FRAC_PI_2,0.),true);
        body.set_linvel(Vector::zeros(),true);
        world.bodies.propagate_modified_body_positions_to_colliders(&mut world.colliders);
        world.query_pipeline.update(&world.colliders);
        world.vehicles.get_mut("bridge-driver").unwrap().powertrain.engine_requested=true;
        for _ in 0..150 {world.step(crate::physics::SIMULATION_DT);}
        world.vehicles.get_mut("bridge-driver").unwrap().throttle=0.65;
        for _ in 0..3000 {
            world.step(crate::physics::SIMULATION_DT);
            let position=world.bodies[handle].translation();
            assert!(position.y > 0. && position.y < 2. && (position.z+178.).abs()<5.,
                    "vehicle lost the crossing at {position:?}");
            if position.x>135. {return;}
        }
        panic!("vehicle did not reach the far approach: {:?}",world.bodies[handle].translation());
    }

    #[test]
    fn water_slows_entry_allows_bottom_contact_and_resets_to_the_deck() {
        let mut world=PhysicsWorld::for_harbor_room(2,VARIANTS[2]).unwrap();
        let handle=world.spawn_vehicle_for_player("diver".into(),[0.;3],"brz","red").unwrap();
        let spawn=*world.bodies[handle].translation();
        world.bodies[handle].set_translation(vector![0.,SEA_LEVEL-0.2,65.],true);
        world.bodies[handle].set_linvel(vector![0.,-14.,0.],true);
        for _ in 0..60 {world.step(crate::physics::SIMULATION_DT);}
        assert!(world.bodies[handle].translation().y>SEA_LEVEL-2.);
        for _ in 0..1200 {world.step(crate::physics::SIMULATION_DT);}
        let y=world.bodies[handle].translation().y;
        assert!((-24.2..-21.5).contains(&y),"seabed contact at {y}");
        world.recover_vehicle_for_player("diver").unwrap();
        assert!((*world.bodies[handle].translation()-spawn).norm()<0.01);
    }

    #[test]
    fn discovery_is_team_private_persistent_and_idle_silent(){
        let mut room=WorldRuntime::new(11,VARIANTS[2]).unwrap();
        let mut receivers=Vec::new();
        for(id,team,x)in [("scout",Team::Red,-75.),("ally",Team::Red,-75.),("rival",Team::Blue,150.)]{
            let(tx,rx)=crate::outbox::channel();let(frame,_)=tokio::sync::watch::channel(None);
            let(_,inputs)=tokio::sync::watch::channel(None);
            room.join(id,tx,frame,inputs,Some(team),10);room.spawn(id,"brz").unwrap();
            crate::support::tests::place(&mut room.physics,id,x,45.);
            receivers.push(rx);
        }
        let mut intel=HarborIntel::default();
        let read=|rx:&mut crate::outbox::Receiver|{
            let mut result=None;while let Ok(text)=rx.try_recv(){let value:serde_json::Value=serde_json::from_str(&text).unwrap();
                if value["type"]=="sector_chart"{result=Some(u64::from_str_radix(value["sectors"].as_str().unwrap(),16).unwrap());}}
            result
        };
        intel.tick(&room.game,&room.physics);
        assert_eq!(read(&mut receivers[0]),Some(cell(-75.,45.)));
        assert_eq!(read(&mut receivers[1]),Some(cell(-75.,45.)));
        assert_eq!(read(&mut receivers[2]),Some(cell(150.,45.)));
        intel.tick(&room.game,&room.physics);assert!(receivers.iter_mut().all(|r|read(r).is_none()));
        crate::support::tests::place(&mut room.physics,"scout",30.,45.);
        intel.tick(&room.game,&room.physics);
        assert_eq!(read(&mut receivers[1]),Some(cell(-75.,45.)|cell(30.,45.)));
        assert!(read(&mut receivers[2]).is_none());
        intel.forget_connection("ally");intel.tick(&room.game,&room.physics);
        assert_eq!(read(&mut receivers[1]),Some(cell(-75.,45.)|cell(30.,45.)));
    }
}
