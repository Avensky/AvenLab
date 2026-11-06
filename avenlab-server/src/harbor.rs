//! Harbor variants are selected once per new lobby. Discovery belongs to its runtime.
use crate::{physics::PhysicsWorld, state::SharedGameState, spawn::Team};
use std::collections::HashMap;

use crate::world::block_colliders::{BlockColliderFile, MapLayout};
use rapier3d::prelude::Vector;

struct WaterTile {
    center: [f32; 2],
    half: [f32; 2],
    sin: f32,
    cos: f32,
    surface: f32,
}

pub(crate) struct Coast {
    tiles: Vec<WaterTile>,
    min: [f32; 2],
    max: [f32; 2],
    low_level: f32,
}

impl Coast {
    /// Return the actual painted-water level; an inland road or missing
    /// water tile must never magically support a naval hull.
    pub fn water_surface_at(&self, x:f32,z:f32)->Option<f32> {
        self.tiles.iter().find_map(|tile|{
            let dx=x-tile.center[0];let dz=z-tile.center[1];
            let local_x=tile.cos*dx-tile.sin*dz;
            let local_z=tile.sin*dx+tile.cos*dz;
            (local_x.abs()<=tile.half[0] && local_z.abs()<=tile.half[1]).then_some(tile.surface)
        })
    }

    pub fn from_map(map: &BlockColliderFile) -> Option<Self> {
        let layout = map.authored_layout.as_ref().filter(|layout| !layout.repeat)?;
        let MapLayout::FixedGrid { origin, size } = map.layout else { return None };
        let mut coast = Self {
            tiles: Vec::new(), min: [0.; 2], max: [0.; 2], low_level: f32::INFINITY,
        };
        for axis in 0..2 {
            coast.min[axis] = (origin[axis] as f32 - 0.5) * map.cell[axis];
            coast.max[axis] = (origin[axis] as f32 + size[axis] as f32 - 0.5) * map.cell[axis];
        }
        for object in &layout.objects {
            let x = origin[0] as f32 * map.cell[0] + object.position[0];
            let z = origin[1] as f32 * map.cell[1] + object.position[2];
            let (sin, cos) = object.yaw.to_radians().sin_cos();
            let hx = object.size[0] * 0.5;
            let hz = object.size[2] * 0.5;
            // Outboard docks and carriers can lie beyond the original city grid.
            let extent = [hx * cos.abs() + hz * sin.abs(), hx * sin.abs() + hz * cos.abs()];
            for (axis, center) in [x, z].into_iter().enumerate() {
                coast.min[axis] = coast.min[axis].min(center - extent[axis]);
                coast.max[axis] = coast.max[axis].max(center + extent[axis]);
            }
            if object.piece == "coastal-water-visual" {
                let surface = object.position[1] + object.size[1];
                coast.low_level = coast.low_level.min(surface);
                coast.tiles.push(WaterTile { center: [x, z], half: [hx, hz], sin, cos, surface });
            }
        }
        (!coast.tiles.is_empty()).then_some(coast)
    }

    pub fn hazard(&self, position: &Vector<f32>, chassis_bottom: f32) -> Option<&'static str> {
        if position.x < self.min[0] || position.x > self.max[0]
            || position.z < self.min[1] || position.z > self.max[1] {
            return Some("out_of_bounds");
        }
        for water in &self.tiles {
            if chassis_bottom > water.surface { continue; }
            let dx = position.x - water.center[0];
            let dz = position.z - water.center[1];
            let local_x = water.cos * dx - water.sin * dz;
            let local_z = water.sin * dx + water.cos * dz;
            if local_x.abs() <= water.half[0] && local_z.abs() <= water.half[1] {
                return Some("water");
            }
        }
        // A fall through a gap without a painted water tile is also fatal.
        (position.y < self.low_level - 2.).then_some("out_of_bounds")
    }
}
pub const VARIANTS: [&str; 3] = ["harbor_canal_red","harbor_canal_blue","harbor_canal_fleet"];
/// Only explicitly installed, server-validated CTF environments enter the
/// Quickplay rotation. A deleted map disappears without editing this list.
pub fn quickplay_maps()->Vec<String> {
    let directory=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/assets/blocks");
    crate::social::model::available_maps().into_iter().filter(|id|{
        let path=directory.join(format!("{id}_colliders.json"));
        crate::world::block_colliders::load_block_collider_file(path.to_string_lossy().into_owned())
            .ok().and_then(|map|map.quickplay).is_some_and(|entry|entry.objective=="ctf")
    }).collect()
}
pub fn queue_map(world:usize)->Option<String> {
    let choices=quickplay_maps();
    (!choices.is_empty()).then(||choices[world%choices.len()].clone())
}
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
// Raised leaves clear ship masts instead of hovering only 30 degrees above water.
pub const RAMP_ANGLE: f32 = 70.0 * std::f32::consts::PI / 180.0;
pub const TRAVEL_TICKS: u64 = 240; // four seconds at 60 Hz
pub const BRIDGE_HOLD_TICKS: u64 = 360; // six more seconds for ship passage

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct BridgeMotion {
    pub start_tick: u64,
    pub start_angle: f32,
    pub target_angle: f32,
    pub next_available_tick: u64,
    pub broken: Option<String>,
}
impl BridgeMotion {
    pub fn angle(&self,tick:u64)->f32 {
        let travel=tick.saturating_sub(self.start_tick) as f32 * RAMP_ANGLE / TRAVEL_TICKS as f32;
        self.start_angle + (self.target_angle-self.start_angle).clamp(-travel,travel)
    }
    pub fn select(&mut self,tick:u64,target:f32) {
        if self.target_angle==target {return;}
        self.start_angle=self.angle(tick);self.start_tick=tick;self.target_angle=target;
    }
    pub fn request(&mut self,tick:u64,target:f32)->Result<(),String>{
        if self.target_angle==target{return Ok(());}
        if tick<self.next_available_tick {
            return Err(format!("Bridge locked for {} more seconds while ships pass.",
                (self.next_available_tick-tick).div_ceil(60)));
        }
        self.select(tick,target);
        self.next_available_tick=tick+TRAVEL_TICKS+BRIDGE_HOLD_TICKS;
        Ok(())
    }
}
pub fn lift_angle(tick:u64)->f32 {
    (std::f32::consts::TAU * (tick%1200) as f32/1200.).sin().max(0.).powi(2)*RAMP_ANGLE
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
    #[test]
    fn bridge_lever_requires_a_safe_ship_passage_window(){
        let mut bridge=BridgeMotion::default();
        bridge.request(0,RAMP_ANGLE).unwrap();
        assert_eq!(bridge.next_available_tick,600);
        assert!(bridge.request(500,0.).is_err());
        bridge.request(600,0.).unwrap();
        assert_eq!(bridge.next_available_tick,1200);
    }
    fn support(w:&PhysicsWorld,x:f32,z:f32)->Option<f32>{
        let ray=Ray::new(point![x,50.,z],-Vector::y());
        w.colliders.iter().filter(|(_,c)|c.is_enabled()).filter_map(|(_,c)|
            c.shape().cast_ray(c.position(),&ray,200.,true)).min_by(f32::total_cmp).map(|t|50.-t)
    }
    #[test]
    fn viaduct_deck_carries_load_above_the_open_canal(){
        let w=PhysicsWorld::for_harbor_room(2,VARIANTS[2]).unwrap();
        let map=w.map_snapshot().unwrap();
        let objects=&map.authored_layout.as_ref().unwrap().objects;
        let span=objects.iter().find(|o|o.id=="viaduct-span").unwrap();
        let [x,y,z]=span.position;
        // Probe both sides of the two GLB seams; the middle span retains its
        // measured collision surface and never inserts a box across the channel.
        for dx in [-0.18,0.18,30.,71.82,72.18] {
            let height=support(&w,x+dx,z).unwrap();
            assert!((height-y).abs()<0.18,"deck at {dx}: {height}");
        }
        let hull=Ray::new(point![-2.,0.,z-5.],Vector::z());
        assert!(!w.colliders.iter().any(|(_,c)|c.shape().cast_ray(c.position(),&hull,10.,true).is_some()));
    }

    #[test]
    fn bridge_lever_holds_repairs_and_never_removes_both_leaves(){
        let mut w=PhysicsWorld::for_harbor_room(2,VARIANTS[2]).unwrap();
        let car=w.spawn_vehicle_for_player("driver".into(),[0.;3],"brz","blue").unwrap();
        assert!(w.operate_bridge("driver","raise",0).is_err());
        w.bodies[car].set_translation(vector![33.,1.,10.],true);
        w.operate_bridge("driver","raise",0).unwrap();
        w.move_drawbridges(1000);w.step(crate::physics::SIMULATION_DT);
        assert!(support(&w,-26.,0.).unwrap()>8.);
        w.operate_bridge("driver","lower",1000).unwrap();
        w.move_drawbridges(1300);w.step(crate::physics::SIMULATION_DT);
        assert!(support(&w,-6.,0.).unwrap().abs()<0.02);
        let map=w.map_snapshot().unwrap();
        let leaves:Vec<_>=map.authored_layout.unwrap().objects.into_iter().enumerate()
            .filter(|(_,o)|o.piece=="canal-lift")
            .map(|(i,o)|(o.id,w.bodies.iter().find(|(_,b)|b.user_data==(i+1) as u128).unwrap().0)).collect();
        w.damage_authored_surface(leaves[0].1,true,500.);
        assert_eq!(w.bridge_motion.as_ref().unwrap().broken.as_ref(),Some(&leaves[0].0));
        let fixture=w.bridge_motion.as_ref().unwrap().clone();
        assert_eq!(fixture.angle(1600),RAMP_ANGLE);
        w.damage_authored_surface(leaves[1].1,true,500.);
        assert!(w.asset_health.get(&leaves[1].0).is_none());
        assert!(w.operate_bridge("driver","lower",1600).is_err());
        assert!(w.bodies[leaves[0].1].colliders().iter().all(|h|!w.colliders[*h].is_enabled()));
        w.operate_bridge("driver","repair",1600).unwrap();
        assert!(w.bodies[leaves[0].1].colliders().iter().all(|h|w.colliders[*h].is_enabled()));
        assert!(w.bridge_motion.as_ref().unwrap().broken.is_none());
        w.operate_bridge("driver","lower",1600).unwrap();w.move_drawbridges(1900);w.step(crate::physics::SIMULATION_DT);
        assert!(support(&w,0.,0.).unwrap().abs()<0.02);
    }

    #[test]
    fn deck_support_moving_jump_and_collapsed_bridge_agree_with_world_geometry(){
        let mut w=PhysicsWorld::for_harbor_room(2,VARIANTS[2]).unwrap();
        let m=w.map_snapshot().unwrap();let o=&m.authored_layout.unwrap().objects;
        for x in [-256.,256.]{
            for z in [-78.,-70.,-62.,-54.,-46.]{assert!((support(&w,x,z).unwrap()-6.).abs()<0.02);}
        }
        assert!((support(&w,0.,60.).unwrap()+60.).abs()<0.02);
        for x in [-14.,14.] {
            let ray=Ray::new(point![x,-4.,-218.],Vector::z());
            assert!(!w.colliders.iter().any(|(_,c)| c.shape().cast_ray(c.position(),&ray,48.,true).is_some()),
                    "the stone arch at {x} must leave a passage below the deck");
        }
        assert!((support(&w,0.,-194.).unwrap()-0.08).abs()<0.02);
        assert!((support(&w,0.,194.).unwrap()-0.08).abs()<0.02);
        w.bridge_motion.as_mut().unwrap().select(0,RAMP_ANGLE);
        w.move_drawbridges(300);w.step(crate::physics::SIMULATION_DT);
        assert!(support(&w,-26.,0.).unwrap()>8.);
        assert!((support(&w,0.,0.).unwrap()+60.).abs()<0.02);
        w.bridge_motion.as_mut().unwrap().select(300,0.0);
        w.move_drawbridges(900);w.step(crate::physics::SIMULATION_DT);
        assert!(support(&w,-6.,0.).unwrap().abs()<0.02);
        let index=o.iter().position(|o|o.piece=="canal-breakable").unwrap();
        let id=w.bodies.iter().find(|(_,b)|b.user_data==index as u128+1).unwrap().0;
        w.damage_authored_surface(id,true,300.);
        assert!((support(&w,0.,194.).unwrap()+60.).abs()<0.02);
        assert!(support(&w,0.,-194.).is_some());
    }
    #[test]
    fn car_crosses_both_highway_approaches_and_the_masonry_seam() {
        let mut world=PhysicsWorld::for_harbor_room(2,VARIANTS[2]).unwrap();
        let handle=world.spawn_vehicle_for_player("bridge-driver".into(),[0.;3],"brz","red").unwrap();
        let body=&mut world.bodies[handle];
        body.set_translation(vector![-135.,1.,-194.],true);
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
            assert!(position.y > 0. && position.y < 2. && (position.z+194.).abs()<5.,
                    "vehicle lost the crossing at {position:?}");
            if position.x>135. {return;}
        }
        panic!("vehicle did not reach the far approach: {:?}",world.bodies[handle].translation());
    }

    #[test]
    fn coastal_water_and_map_edges_trigger_one_defeat_and_safe_respawn(){
        for map_id in ["harbor_canal_fleet","coastal_district","streaming_endless_city"] {
            let mut world=PhysicsWorld::new();world.select_map(map_id).unwrap();
            let map=world.map_snapshot().unwrap();
            let objects=&map.authored_layout.as_ref().unwrap().objects;
            let water=objects.iter().find(|o|o.piece=="coastal-water-visual").unwrap();
            let handle=world.spawn_vehicle_for_player("diver".into(),[0.;3],"brz","blue").unwrap();
            let x=if map_id.starts_with("harbor_canal") {0.} else {water.position[0]};
            let z=if map_id.starts_with("harbor_canal") {65.} else {water.position[2]};
            let top=water.position[1]+water.size[1];
            world.bodies[handle].set_translation(vector![x,top+3.,z],true);
            world.step(crate::physics::SIMULATION_DT);assert!(!world.is_defeated("diver"),"an airborne jump is safe");
            world.vehicle_health.get_mut("diver").unwrap().spawn_protection_s=3.;
            world.bodies[handle].set_translation(vector![x,top-0.2,z],true);
            for _ in 0..3 {world.step(crate::physics::SIMULATION_DT);}
            let health=&world.vehicle_health["diver"];
            assert!(health.defeated && health.hp==0.);
            assert_eq!(health.deaths,1);assert_eq!(health.last_damage_kind,"water");
            assert!(health.respawn_remaining_s>0.);
            world.vehicle_health.get_mut("diver").unwrap().respawn_remaining_s=0.;
            world.advance_vehicle_lives(crate::physics::SIMULATION_DT);
            assert!(!world.is_defeated("diver"));
            let recovered = world.bodies[handle].translation();
            assert!(recovered.y > top, "{map_id} must recover on dry ground or deck");
            world.step(crate::physics::SIMULATION_DT);
            assert_eq!(world.vehicle_health["diver"].deaths,1);
            world.bodies[handle].set_translation(vector![20000.,45.,0.],true);
            world.step(crate::physics::SIMULATION_DT);
            assert_eq!(world.vehicle_health["diver"].deaths,2);
            assert_eq!(world.vehicle_health["diver"].last_damage_kind,"out_of_bounds");
        }
    }

    #[test]
    fn dock_teams_spawn_and_recover_on_deck_but_capture_at_the_shore() {
        for id in ["streaming_endless_city", "harbor_canal_red", "harbor_canal_blue", "harbor_canal_fleet"] {
            let mut world = PhysicsWorld::new();
            world.select_map(id).unwrap();
            let map = world.map_snapshot().unwrap();
            let objects = &map.authored_layout.as_ref().unwrap().objects;
            let bases = world.ctf_bases().unwrap();
            let mut homes = 0;
            for (index, team) in ["red", "blue"].iter().enumerate() {
                let Some(flag) = objects.iter().find(|o| o.id == format!("home-flag-{team}")) else { continue };
                homes += 1;
                assert_eq!(bases[index], [flag.position[0], flag.position[1]+1., flag.position[2]]);
                let bay = objects.iter().find(|o| o.id == if index == 0 {"home-gas-west"} else {"home-gas-east"}).unwrap();
                assert_eq!(bay.piece, "service-center");
                let car = world.spawn_vehicle_for_player(team.to_string(), [0.;3], "brz", team).unwrap();
                let spawn = *world.bodies[car].translation();
                assert!(spawn.y > flag.position[1]+2.);
                world.bodies[car].set_translation(vector![flag.position[0],2.,flag.position[2]],true);
                world.place_vehicle_after_recovery(team).unwrap();
                let recovered = world.bodies[car].translation();
                assert!(recovered.y > flag.position[1]+2. && (recovered.x-spawn.x).abs()<1.);
                world.bodies[car].set_translation(vector![bay.position[0],bay.position[1]+1.,bay.position[2]],true);
                world.change_vehicle_for_player(team, "ae86").unwrap();
                assert!((world.bodies[car].translation().z-bay.position[2]-bay.size[2]*0.24).abs()<0.05);
            }
            assert!(homes >= 1);
            assert_eq!(homes, objects.iter().filter(|o| o.piece == "big-e-docked").count());
        }
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
