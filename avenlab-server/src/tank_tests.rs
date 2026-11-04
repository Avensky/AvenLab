use crate::{physics::{PhysicsWorld,SIMULATION_DT},state::CombatPose,vehicle_state::VehicleStateFlags};
fn range()->PhysicsWorld {range_size(200.0)}
fn range_size(side:f32)->PhysicsWorld {
 let map=serde_json::from_value(serde_json::json!({"schema_version":2,"map_id":"tank_test","coordinate_system":{"units":"meters","up_axis":"y","forward_axis":"-z"},"cell":[side,side],"surface":{"road_y":0},"layout":{"kind":"fixed_grid","origin":[0,0],"size":[1,1]},"visuals":[{"id":"placeholder","asset":"/models/world/garage.glb","position":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1]}],"roads":[],"buildings":[],"team_spawns":{"red":[{"chunk":[0,0],"local":[0,0],"yaw":0}],"blue":[]},"authored_layout":{"format":"avenlab-world-layout","version":1,"map_id":"tank_test","title":"Tank physics range","base":"replace","ground":true,"repeat":false,"objects":[]}})).unwrap();
 let mut world=PhysicsWorld::from_editor_document(map).unwrap();world.spawn_vehicle_for_player("tank".into(),[0.0;3],"tank","red").unwrap();
 let tank=world.vehicles.get_mut("tank").unwrap();tank.powertrain.engine_requested=true;tank.vehicle_flags.insert(VehicleStateFlags::ENGINE_ON);
 for _ in 0..180 {world.step(SIMULATION_DT);}world
}
#[test] fn tank_pivots_through_ground_contacts_and_can_drive_reverse(){
 let mut world=range();let h=world.vehicles["tank"].body;let start=*world.bodies[h].translation();
 world.vehicles.get_mut("tank").unwrap().steer=1.0;
 let mut yaw=0.0;
 for _ in 0..180 {world.step(SIMULATION_DT);yaw+=world.bodies[h].angvel().y*SIMULATION_DT;}
 let p=*world.bodies[h].translation();
 assert!(yaw.abs()>2.5,"tank should pivot: {yaw}, displacement {:?}",p-start);
 assert!((p-start).norm()<4.0,"pivot must not propel the tank down the road");
 let mut world=range();let h=world.vehicles["tank"].body;let start=*world.bodies[h].translation();world.vehicles.get_mut("tank").unwrap().throttle=-1.0;
 for _ in 0..240{world.step(SIMULATION_DT);}
 assert!(world.bodies[h].translation().z<start.z-1.0,"tank should reverse");
}
#[test] fn airborne_tracks_cannot_steer_and_brakes_hold_a_pivot(){
 let mut world=range();let h=world.vehicles["tank"].body;world.bodies[h].set_translation(rapier3d::math::Vector::new(0.0,30.0,0.0),true);world.bodies[h].set_angvel(rapier3d::math::Vector::new(0.0,0.0,0.0),true);world.vehicles.get_mut("tank").unwrap().steer=1.0;
 for _ in 0..30{world.step(SIMULATION_DT);}assert!(world.bodies[h].angvel().y.abs()<0.01);
 let mut world=range();let h=world.vehicles["tank"].body;{let t=world.vehicles.get_mut("tank").unwrap();t.steer=1.0;t.brake=1.0;}
 for _ in 0..120{world.step(SIMULATION_DT);}assert!(world.bodies[h].angvel().y.abs()<0.08);
}
#[test] fn cannon_uses_factory_mount_reload_recoil_and_bounded_elevation(){
 let mut world=range();let h=world.vehicles["tank"].body;
 let intent=CombatPose{enabled:true,fire:true,yaw:std::f32::consts::PI,pitch:0.0,x:99.0,y:99.0,z:99.0,role:"assault".into(),..Default::default()};
 world.combat_tick("tank",1,Some(&intent));let pose=&world.combat_poses["tank"];assert_eq!(pose.role,"tank");assert_eq!(pose.ammo,0);assert_eq!(pose.shot,1);assert!(pose.reload>2.9);assert_eq!(pose.x,0.0);assert!(world.bodies[h].linvel().z< -0.2,"cannon recoil opposes forward shot");
 for seq in 2..180{world.combat_tick("tank",seq,Some(&intent));}assert_eq!(world.combat_poses["tank"].shot,1);
 for seq in 180..185{world.combat_tick("tank",seq,Some(&intent));}assert_eq!(world.combat_poses["tank"].shot,2);
 let aim=CombatPose{pitch:1.0,fire:false,..intent};for seq in 185..300{world.combat_tick("tank",seq,Some(&aim));}assert!(world.combat_poses["tank"].pitch<0.36);
}

#[test] fn tank_moves_forward_stops_under_brakes_and_cannot_pivot_with_engine_off(){
 let mut world=range();let h=world.vehicles["tank"].body;
 world.vehicles.get_mut("tank").unwrap().throttle=1.0;
 for _ in 0..240{world.step(SIMULATION_DT);}assert!(world.bodies[h].translation().z>3.0);
 {let t=world.vehicles.get_mut("tank").unwrap();t.throttle=0.0;t.brake=1.0;}
 for _ in 0..180{world.step(SIMULATION_DT);}assert!(world.bodies[h].linvel().norm()<0.2);
 let mut world=range();let h=world.vehicles["tank"].body;
 {let t=world.vehicles.get_mut("tank").unwrap();t.powertrain.engine_requested=false;t.steer=1.0;}
 for _ in 0..180{world.step(SIMULATION_DT);}assert!(world.bodies[h].angvel().y.abs()<0.02);
}

#[test] fn tank_turns_responsively_while_pivoting_driving_and_reversing(){
 for throttle in [0.0,1.0,-1.0] {for steer in [-1.0,1.0] {
  let mut world=range();let h=world.vehicles["tank"].body;
  if throttle!=0.0 {world.vehicles.get_mut("tank").unwrap().throttle=throttle;for _ in 0..180 {world.step(SIMULATION_DT);}}
  let start=*world.bodies[h].translation();world.vehicles.get_mut("tank").unwrap().steer=steer;
  for _ in 0..60 {world.step(SIMULATION_DT);}
  let body=&world.bodies[h];let yaw=body.angvel().y;
  assert!(yaw*steer< -0.5,"one-second steering response must exceed 29 deg/s: throttle={throttle}, steer={steer}, yaw={yaw}");
  assert!(yaw.abs()<5.0,"turning must stay bounded");
  assert!((body.rotation()*rapier3d::math::Vector::y()).y>0.94,"flat-ground turn must stay upright");
  if throttle==0.0 {assert!((body.translation()-start).norm()<0.25,"pivot should not translate the hull");}
  else {assert!(body.linvel().norm()>1.0,"steering should preserve useful travel speed");}
 }}
}

#[test] fn switching_tank_weapons_preserves_cannon_reload_and_is_server_validated(){
 let mut world=range();let h=world.vehicles["tank"].body;
 let mut intent=CombatPose{enabled:true,fire:true,yaw:std::f32::consts::PI,..Default::default()};
 world.combat_tick("tank",1,Some(&intent));assert_eq!(world.combat_poses["tank"].cannon_shot,1);
 world.bodies[h].set_linvel(rapier3d::math::Vector::zeros(),true);
 intent.weapon="coax".into();world.combat_tick("tank",2,Some(&intent));
 let c=&world.combat_poses["tank"];assert!(c.cannon_reload>2.9);assert!(c.coax_reload>0.0&&c.coax_reload<=0.11);assert_eq!(c.weapon,"coax");assert_eq!(c.shot,2);assert_eq!(c.cannon_shot,1);assert!(c.reload<=0.11);
 assert!(world.bodies[h].linvel().norm()<0.001,"MG must not kick like a cannon");
 for seq in 3..30 {world.combat_tick("tank",seq,Some(&intent));}
 let shots=world.combat_poses["tank"].shot;assert!(shots>2 && shots<8,"coax uses a bounded automatic cadence");
 intent.weapon="cannon".into();world.combat_tick("tank",30,Some(&intent));
 let c=&world.combat_poses["tank"];assert_eq!(c.shot,shots);assert!(c.reload>2.4);assert_eq!(c.ammo,0);
 intent.fire=false;intent.weapon="unlimited-bombs".into();world.combat_tick("tank",31,Some(&intent));assert_eq!(world.combat_poses["tank"].weapon,"cannon");
 intent.weapon="coax".into();for seq in 32..190 {world.combat_tick("tank",seq,Some(&intent));}
 intent.weapon="cannon".into();intent.fire=true;world.combat_tick("tank",190,Some(&intent));assert_eq!(world.combat_poses["tank"].cannon_shot,2,"holstered cannon reload continues");
}

#[test] fn fictional_tank_calibration_matches_six_gears_and_actual_speed(){
 let mut world=range_size(20000.0);let h=world.vehicles["tank"].body;
 let cfg=world.vehicles["tank"].config;let hud=cfg.resources.hud();
 assert_eq!(hud.forward_gears,6);assert_eq!(hud.max_rpm,4200.0);assert_eq!(hud.redline_rpm,3800.0);assert_eq!(cfg.max_speed,30.0);
 world.vehicles.get_mut("tank").unwrap().throttle=1.0;
 for _ in 0..3600{world.step(SIMULATION_DT);}
 let tank=&world.vehicles["tank"];
 assert_eq!(tank.powertrain.gear,6,"tank must reach its advertised top gear");
 assert!(world.bodies[h].linvel().norm()>25.0,"fictional tank must reach over 90 km/h in the actual contact solver");
 assert!(tank.powertrain.rpm<=hud.max_rpm);
}

#[test]fn tank_angle_lock_preserves_sideways_bearing_and_elevation_through_hull_turns(){
 let mut world=range();let h=world.vehicles["tank"].body;
 let mut intent=CombatPose{enabled:true,yaw:std::f32::consts::FRAC_PI_2,pitch:0.15,..Default::default()};
 for seq in 0..120{world.combat_tick("tank",seq,Some(&intent));}
 intent.hull_locked=true;world.combat_tick("tank",121,Some(&intent));
 let before=world.combat_poses["tank"].clone();
 world.bodies[h].set_rotation(rapier3d::math::Rotation::from_axis_angle(&rapier3d::math::Vector::y_axis(),1.0),true);
 intent.yaw=0.0;intent.pitch=-0.1;
 for seq in 122..180{world.combat_tick("tank",seq,Some(&intent));}
 let c=&world.combat_poses["tank"];let dir=rapier3d::math::Vector::new(-c.yaw.sin()*c.pitch.cos(),c.pitch.sin(),-c.yaw.cos()*c.pitch.cos());
 let local=world.bodies[h].rotation().inverse()*dir;
 assert!((local.x.atan2(local.z)-before.lock_yaw).abs()<0.001);
 assert!((local.y.asin()-before.lock_pitch).abs()<0.001);
 assert!(local.x.abs()>0.9,"lock must not reset sideways turret to forward");
}

#[test]fn ram_is_a_contact_driven_burst_with_brake_cancel_and_persistent_cooldown(){
 let mut world=range_size(20000.0);let h=world.vehicles["tank"].body;
 world.vehicles.get_mut("tank").unwrap().throttle=1.0;
 for _ in 0..120{world.step(SIMULATION_DT);}
 let start=world.bodies[h].linvel().norm();world.vehicles.get_mut("tank").unwrap().ram.requested=true;
 world.step(SIMULATION_DT);assert!(world.vehicles["tank"].ram.active());assert_eq!(world.vehicles["tank"].ram.cooldown,crate::ram::COOLDOWN);
 world.vehicles.get_mut("tank").unwrap().ram.requested=false;
 for _ in 0..120{world.step(SIMULATION_DT);}
 assert!(world.bodies[h].linvel().norm()>start+5.0,"ram must feel substantially faster within two seconds");
 world.vehicles.get_mut("tank").unwrap().brake=1.0;world.step(SIMULATION_DT);
 assert!(!world.vehicles["tank"].ram.active());assert!(world.vehicles["tank"].ram.cooldown>13.0);
 let cooldown=world.vehicles["tank"].ram.cooldown;world.change_vehicle_for_player("tank","brz").unwrap();assert!(!world.vehicles["tank"].ram.active());assert_eq!(world.vehicles["tank"].ram.cooldown,cooldown);
}

#[test]fn ram_bonus_hits_enemy_once_and_does_not_bonus_friendly_contact(){
 fn hit(team:&str,ram:bool)->(f32,usize,f32,f32){
  let mut w=range();let h=w.vehicles["tank"].body;let y=w.bodies[h].translation().y;
  w.bodies[h].set_translation(rapier3d::math::Vector::new(0.0,y,-15.0),true);
  let target=w.spawn_vehicle_for_player("target".into(),[0.0;3],"tank","red").unwrap();w.vehicles.get_mut("target").unwrap().team=team.into();
  // This fixture exercises post-spawn Ram effects. Spawn-shield behavior has
  // separate coverage and must not suppress the ability being compared here.
  for health in w.vehicle_health.values_mut(){health.advance(crate::vehicle_health::SPAWN_PROTECTION_SECONDS);}
  w.bodies[h].set_translation(rapier3d::math::Vector::new(0.0,y,-8.0),true);w.bodies[h].set_linvel(rapier3d::math::Vector::new(0.0,0.0,12.0),true);
  {let t=w.vehicles.get_mut("tank").unwrap();t.powertrain.gear=1;t.throttle=1.0;if ram{t.ram.remaining=crate::ram::DURATION;t.ram.cooldown=crate::ram::COOLDOWN;}}
  let mut peak=0.0_f32;let mut stun=0.0_f32;for _ in 0..90{w.step(SIMULATION_DT);peak=peak.max(w.bodies[target].linvel().norm());stun=stun.max(w.vehicles["target"].ram.stun_remaining);}
  (w.vehicles["target"].powertrain.condition,usize::from(w.vehicles["tank"].ram.hits.contains(&target)),peak,stun)
 }
 let (ordinary,_,normal_peak,normal_stun)=hit("blue",false);let (enemy,hits,enemy_peak,enemy_stun)=hit("blue",true);let (friendly,_,friendly_peak,friendly_stun)=hit("red",true);assert_eq!(normal_stun,0.0);assert_eq!(friendly_stun,0.0);assert_eq!(enemy_stun,1.0);
 assert!(enemy_peak>normal_peak+2.0 && friendly_peak>normal_peak+2.0,"Ram physically knocks both teams back: normal={normal_peak}, enemy={enemy_peak}, friendly={friendly_peak}");
 assert!(enemy<ordinary-0.02,"charge adds damage beyond a normal impact: enemy={enemy}, normal={ordinary}");assert_eq!(hits,1);assert!(friendly>enemy+0.02,"friendly contacts receive no ability bonus");
}

#[test] fn pivot_is_an_arcade_turn_and_ram_launches_from_rest(){
 let mut world=range();let h=world.vehicles["tank"].body;
 world.vehicles.get_mut("tank").unwrap().steer=1.0;
 let mut angle=0.0;for _ in 0..75{world.step(SIMULATION_DT);angle+=world.bodies[h].angvel().y*SIMULATION_DT;}
 assert!(angle.abs()>1.3,"pivot should turn over 75 degrees in 1.25 seconds: {angle}");
 let mut world=range();let h=world.vehicles["tank"].body;
 world.vehicles.get_mut("tank").unwrap().ram.requested=true;world.step(SIMULATION_DT);
 assert!(world.bodies[h].linvel().z>11.0,"Ram needs an immediate visible launch from rest");
 assert_eq!(world.vehicles["tank"].ram.cooldown,crate::ram::COOLDOWN);
}

#[test] fn ballistic_cannon_records_ground_hit_and_cannot_shoot_through_a_near_wall(){
 let mut world=range_size(2000.0);
 let intent=CombatPose{enabled:true,fire:true,yaw:std::f32::consts::PI,..Default::default()};
 world.combat_tick("tank",1,Some(&intent));
 let c=&world.combat_poses["tank"];assert!(c.impact.is_some());let p=c.impact.unwrap();assert!(p[2]>40.0&&p[2]<220.0,"level cannon must fall onto the ground, not use a horizontal hitscan: {:?}",p);assert!(c.impact_time>0.1);
 let mut world=range();let wall=world.bodies.insert(rapier3d::prelude::RigidBodyBuilder::fixed().translation(rapier3d::math::Vector::new(0.0,2.0,3.0)).build());
 world.colliders.insert_with_parent(rapier3d::prelude::ColliderBuilder::cuboid(5.0,3.0,0.1).build(),wall,&mut world.bodies);
 world.combat_tick("tank",1,Some(&intent));let c=&world.combat_poses["tank"];assert!(c.impact.unwrap()[2]<3.1);assert_eq!(c.impact_time,0.0);
}

#[test]fn full_throttle_turn_changes_the_driving_path_and_sheds_speed(){
 for steer in [-1.0,1.0]{
  let mut world=range_size(2000.0);let h=world.vehicles["tank"].body;
  world.vehicles.get_mut("tank").unwrap().throttle=1.0;
  for _ in 0..240{world.step(SIMULATION_DT);}
  let start=*world.bodies[h].translation();let speed=world.bodies[h].linvel().norm();
  world.vehicles.get_mut("tank").unwrap().steer=steer;
  for _ in 0..150{world.step(SIMULATION_DT);}
  let body=&world.bodies[h];let delta=body.translation()-start;
  println!("turn {steer}: speed {speed} -> {}, displacement {:?}",body.linvel().norm(),delta);
  assert!(delta.x*steer< -3.0,"steering must curve the travel path, not merely rotate the model: {:?}",delta);
  assert!(body.linvel().norm()<speed*0.85,"full steering should slow forward travel into a tighter turn");
  assert!((body.rotation()*rapier3d::math::Vector::y()).y>0.90);
 }
}

#[test]fn reverse_request_brakes_then_backs_up_and_cancels_ram(){
 let mut world=range_size(2000.0);let h=world.vehicles["tank"].body;
 world.vehicles.get_mut("tank").unwrap().throttle=1.0;
 for _ in 0..180{world.step(SIMULATION_DT);}
 world.vehicles.get_mut("tank").unwrap().throttle=-1.0;
 world.step(SIMULATION_DT);assert!(world.vehicles["tank"].powertrain.direction_brake>0.9);
 assert!(world.bodies[h].linvel().z>0.0,"direction cannot reverse instantly");
 for _ in 0..480{world.step(SIMULATION_DT);}
 assert!(world.bodies[h].linvel().z< -1.0);assert_eq!(world.vehicles["tank"].powertrain.gear,-1);
 {let v=world.vehicles.get_mut("tank").unwrap();v.ram.remaining=crate::ram::DURATION;v.ram.cooldown=crate::ram::COOLDOWN;}
 world.step(SIMULATION_DT);assert!(!world.vehicles["tank"].ram.active());
}

#[test]fn ram_finishes_without_disabling_engine_or_steering_and_pays_its_cost_once(){
 let mut world=range_size(20000.0);let h=world.vehicles["tank"].body;
 let fuel=world.vehicles["tank"].powertrain.fuel_liters;
 let condition=world.vehicles["tank"].powertrain.condition;
 {let t=world.vehicles.get_mut("tank").unwrap();t.ram.requested=true;t.throttle=1.0;t.steer=0.15;}
 world.step(SIMULATION_DT);
 assert!(world.vehicles["tank"].ram.charging());
 assert!(world.vehicles["tank"].powertrain.fuel_liters<fuel-9.9);
 for _ in 0..185{world.step(SIMULATION_DT);}
 assert!(world.vehicles["tank"].ram.active()&&!world.vehicles["tank"].ram.charging());
 for _ in 0..245{world.step(SIMULATION_DT);}
 let tank=&world.vehicles["tank"];
 assert!(!tank.ram.active());assert!(tank.ram.cooldown>52.0);
 assert!(tank.powertrain.condition<=condition-crate::ram::CONDITION_COST+0.001);
 assert!(tank.vehicle_flags.contains(VehicleStateFlags::ENGINE_ON),"Ram must not shut down a healthy engine: {:?}",tank.powertrain);
 assert!(!tank.ram.cost_due);
 {let t=world.vehicles.get_mut("tank").unwrap();t.throttle=0.0;t.steer=1.0;}
 for _ in 0..60{world.step(SIMULATION_DT);}
 assert!(world.bodies[h].angvel().y.abs()>0.5,"post-Ram steering remains available");
}
#[test]fn stunned_tank_cannot_fire_and_recovers_after_one_second(){
 let mut world=range();world.vehicles.get_mut("tank").unwrap().ram.stun_remaining=crate::ram::STUN_SECONDS;
 let intent=CombatPose{enabled:true,fire:true,..Default::default()};
 world.combat_tick("tank",1,Some(&intent));assert_eq!(world.combat_poses["tank"].shot,0);
 for _ in 0..61{world.step(SIMULATION_DT);}
 assert_eq!(world.vehicles["tank"].ram.stun_remaining,0.0);
 world.combat_tick("tank",2,Some(&intent));assert_eq!(world.combat_poses["tank"].shot,1);
}

#[test]fn ram_heats_progressively_consumes_nitrous_and_requires_a_refill(){
 let mut w=range_size(20000.0);let fuel=w.vehicles["tank"].powertrain.fuel_liters;let heat=w.vehicles["tank"].powertrain.temperature_c;
 {let v=w.vehicles.get_mut("tank").unwrap();v.throttle=1.0;v.ram.requested=true;v.powertrain.boost_requested=true;}
 for tick in 0..420{
  let before=w.vehicles["tank"].powertrain.temperature_c;w.step(SIMULATION_DT);
  let after=w.vehicles["tank"].powertrain.temperature_c;
  if tick<419{assert!(after>before,"active Ram must visibly heat, never cool, the running engine");assert!(after-before<=crate::ram::MAX_HEAT_RISE_C_S*SIMULATION_DT+0.001);}
 }
 let v=&w.vehicles["tank"];assert!(v.powertrain.nos_remaining_s>13.9&&v.powertrain.nos_remaining_s<14.1);assert!(v.powertrain.temperature_c>=heat+4.1&&v.powertrain.temperature_c<=heat+7.7,"Ram heat must be noticeable but bounded: {} -> {}",heat,v.powertrain.temperature_c);assert!(v.powertrain.fuel_liters<fuel-9.9);assert!(v.powertrain.running);
 {let v=w.vehicles.get_mut("tank").unwrap();v.ram.cancel();v.ram.cooldown=0.0;v.ram.requested=false;v.powertrain.nos_remaining_s=6.9;}
 w.step(SIMULATION_DT);w.vehicles.get_mut("tank").unwrap().ram.requested=true;w.step(SIMULATION_DT);assert!(!w.vehicles["tank"].ram.active());assert_eq!(w.vehicles["tank"].ram.blocked,"REFILL NOS");
}

#[test]fn an_overheated_tank_can_physically_crawl_and_turn_toward_a_service_bay(){
 let mut w=range_size(20000.0);let h=w.vehicles["tank"].body;let start=*w.bodies[h].translation();
 {let v=w.vehicles.get_mut("tank").unwrap();v.powertrain.temperature_c=145.0;v.throttle=1.0;v.steer=0.15;}
 for _ in 0..240{w.step(SIMULATION_DT);assert!(w.vehicles["tank"].powertrain.running,"heat must not stall the tank");}
 let tank=&w.vehicles["tank"];assert!(tank.powertrain.thermal_recovery);assert!(tank.powertrain.temperature_c<145.0);assert!((w.bodies[h].translation()-start).norm()>0.5);assert!(w.bodies[h].linvel().norm()>0.2);assert!(w.bodies[h].angvel().y.abs()>0.01);assert_eq!(tank.ram.blocked,"COOL ENGINE");
}

#[test]fn confirmed_weapon_hits_publish_surface_normals_and_fired_weapon(){
 let mut world=range_size(2000.0);
 let intent=CombatPose{enabled:true,fire:true,yaw:std::f32::consts::PI,..Default::default()};
 world.combat_tick("tank",1,Some(&intent));
 let c=&world.combat_poses["tank"];
 assert!(c.impact_static);assert!(c.impact_normal.unwrap()[1]>0.99);assert_eq!(c.shot_weapon,"cannon");
 let mut world=range();
 let wall=world.bodies.insert(rapier3d::prelude::RigidBodyBuilder::fixed().translation(rapier3d::math::Vector::new(0.0,2.0,20.0)).build());
 world.colliders.insert_with_parent(rapier3d::prelude::ColliderBuilder::cuboid(5.0,3.0,0.1).build(),wall,&mut world.bodies);
 let mg=CombatPose{weapon:"coax".into(),..intent};world.combat_tick("tank",1,Some(&mg));
 let c=&world.combat_poses["tank"];assert_eq!(c.shot_weapon,"coax");assert!(c.impact_static);
 assert!(c.impact_normal.unwrap()[2]< -0.99);assert!((c.impact.unwrap()[2]-19.9).abs()<0.01);
 let off=CombatPose{fire:false,weapon:"cannon".into(),..mg};world.combat_tick("tank",2,Some(&off));
 assert_eq!(world.combat_poses["tank"].shot_weapon,"coax","selection must not relabel a confirmed shot");
}

#[test]fn ram_can_overheat_a_hot_engine_but_cannot_stall_or_trap_it(){
 let mut w=range_size(20000.0);
 {let v=w.vehicles.get_mut("tank").unwrap();v.powertrain.temperature_c=109.5;v.throttle=1.0;v.steer=0.1;v.ram.requested=true;}
 let mut reached_limp=false;
 for _ in 0..240{w.step(SIMULATION_DT);let v=&w.vehicles["tank"];assert!(v.powertrain.running);reached_limp|=v.powertrain.thermal_recovery;}
 let v=&w.vehicles["tank"];assert!(reached_limp,"Ram must retain the risk of overheating");assert!(!v.ram.active());assert!(v.ram.cooldown>50.0);assert!(v.powertrain.power_multiplier>0.0);assert!(v.powertrain.temperature_c<112.5,"limp mode must still cool toward recovery");
}

#[test]fn roof_machine_gun_fires_from_right_mount_and_client_cannot_override_origin(){
 let mut world=range();
 let wall=world.bodies.insert(rapier3d::prelude::RigidBodyBuilder::fixed().translation(rapier3d::math::Vector::new(-0.505,2.0,20.0)).build());
 world.colliders.insert_with_parent(rapier3d::prelude::ColliderBuilder::cuboid(0.12,3.0,0.1).build(),wall,&mut world.bodies);
 let intent=CombatPose{enabled:true,fire:true,yaw:std::f32::consts::PI,weapon:"coax".into(),shot_origin:Some([99.0;3]),..Default::default()};
 assert!(intent.bounded().shot_origin.is_none());world.combat_tick("tank",1,Some(&intent));
 let c=&world.combat_poses["tank"];let origin=c.shot_origin.unwrap();
 assert!(origin[0]< -0.4&&origin[0]> -0.6,"MG must use the hatch's opposite/right side");
 assert!(origin[2]>1.3&&origin[2]<1.6,"origin belongs to the existing roof gun, not the longer placeholder");
 assert!((c.impact.unwrap()[2]-19.9).abs()<0.01,"right-side MG should hit the narrow right-side target");
}

#[test]
fn three_tank_weapons_have_independent_holstered_reload_timers_and_bounded_ids() {
 let mut w=range();let mut intent=CombatPose{enabled:true,fire:true,yaw:std::f32::consts::PI,..Default::default()};
 w.combat_tick("tank",1,Some(&intent));
 intent.weapon="coax".into();w.combat_tick("tank",2,Some(&intent));
 intent.weapon="basket".into();intent.basket_reload=0.0;w.combat_tick("tank",3,Some(&intent));
 let c=&w.combat_poses["tank"];assert_eq!((c.shot,c.cannon_shot),(3,1));assert_eq!(c.shot_weapon,"basket");
 assert!(c.cannon_reload>2.9&&c.coax_reload>0.07&&c.basket_reload>0.09);
 for (seq,weapon) in [(4,"cannon"),(5,"coax"),(6,"basket")] {intent.weapon=weapon.into();w.combat_tick("tank",seq,Some(&intent));}
 assert_eq!(w.combat_poses["tank"].shot,3,"switching cannot skip any weapon cadence");
 intent.fire=false;intent.weapon="basket".into();for seq in 7..188 {w.combat_tick("tank",seq,Some(&intent));}
 assert_eq!(w.combat_poses["tank"].cannon_reload,0.0,"holstered cannon keeps reloading");
 assert_eq!(w.combat_poses["tank"].coax_reload,0.0);assert_eq!(w.combat_poses["tank"].basket_reload,0.0);
 intent.weapon="cannon".into();intent.fire=true;w.combat_tick("tank",188,Some(&intent));assert_eq!(w.combat_poses["tank"].cannon_shot,2);
 let spoof=CombatPose{weapon:"unlimited-bombs".into(),basket_reload:-999.0,coax_reload:-999.0,cannon_reload:-999.0,..Default::default()}.bounded();
 assert_eq!(spoof.weapon,"cannon");assert_eq!((spoof.basket_reload,spoof.coax_reload,spoof.cannon_reload),(0.0,0.0,0.0));
}

#[test]
fn basket_gun_fires_from_its_measured_pitched_external_port_and_has_no_cannon_recoil() {
 let mut w=range_size(2000.0);let body=w.vehicles["tank"].body;
 w.bodies[body].set_position(rapier3d::math::Isometry::translation(10.0,2.0,-10.0),true);
 let mut intent=CombatPose{enabled:true,fire:false,yaw:std::f32::consts::FRAC_PI_2,pitch:0.2,weapon:"basket".into(),shot_origin:Some([99.0;3]),x:99.0,y:99.0,z:99.0,..Default::default()};
 for seq in 0..180 {w.combat_tick("tank",seq,Some(&intent));}
 w.bodies[body].set_linvel(rapier3d::math::Vector::zeros(),true);
 intent.fire=true;w.combat_tick("tank",180,Some(&intent));
 let c=&w.combat_poses["tank"];let actual=c.shot_origin.unwrap();
 // Independent measured reference: identity hull at (10,2,-10), 90-degree
 // left yaw, +0.2 elevation. This is the asset-space muzzle after that pose.
 let cfg=w.vehicles["tank"].config;let visual_y=cfg.nominal_wheel_center_y()-cfg.wheel_radius-0.0130596;
 let expected=[10.0+(-1.2694973090_f32),2.0+visual_y+1.5040733846_f32,-10.0-0.2396];
 assert!(actual.iter().zip(expected).all(|(a,b)|(a-b).abs()<0.00001),"server muzzle must use the actual yaw/pitched port: {actual:?}, {expected:?}");
 assert_eq!(c.shot_weapon,"basket");assert_eq!(c.cannon_shot,0);assert_eq!(c.shot,1);
 assert!(c.basket_reload>0.09&&c.coax_reload==0.0&&c.cannon_reload==0.0);
 assert!(w.bodies[body].linvel().norm()<0.001,"small arms cannot create cannon kick");
}

#[test]
fn basket_range_is_two_hundred_meters_while_roof_gun_keeps_eight_hundred() {
 use rapier3d::prelude::*;
 let mut w=range_size(2000.0);
 let far_wall=w.bodies.insert(RigidBodyBuilder::fixed().translation(vector![0.0,3.0,250.0]).build());
 w.colliders.insert_with_parent(ColliderBuilder::cuboid(10.0,5.0,0.1).build(),far_wall,&mut w.bodies);
 let mut intent=CombatPose{enabled:true,fire:true,yaw:std::f32::consts::PI,weapon:"basket".into(),..Default::default()};
 w.combat_tick("tank",1,Some(&intent));assert!(w.combat_poses["tank"].impact.is_none(),"basket cannot hit a wall 250m away");
 intent.weapon="coax".into();w.combat_tick("tank",2,Some(&intent));
 assert!(w.combat_poses["tank"].impact.is_some_and(|p|p[2]>249.0&&p[2]<251.0),"roof MG retains its longer range");
 let near_wall=w.bodies.insert(RigidBodyBuilder::fixed().translation(vector![0.0,3.0,100.0]).build());
 w.colliders.insert_with_parent(ColliderBuilder::cuboid(10.0,5.0,0.1).build(),near_wall,&mut w.bodies);
 intent.weapon="basket".into();intent.fire=false;for seq in 3..12 {w.combat_tick("tank",seq,Some(&intent));}
 intent.fire=true;w.combat_tick("tank",12,Some(&intent));
 assert!(w.combat_poses["tank"].impact.is_some_and(|p|p[2]>99.0&&p[2]<101.0),"same basket gun hits cover in its real range");
 assert_eq!(w.combat_poses["tank"].shot_weapon,"basket");
}

#[test]
fn manual_aim_slews_under_lock_and_holds_the_new_angle_through_a_hull_turn() {
    use rapier3d::prelude::{Rotation,Vector};
    for (chassis,hero) in [("tank","tank"),("mini","mini"),("cx30","cx30"),("brz","brz"),("fortuner","mechanic")] {
        let mut w=range();
        w.despawn_vehicle_for_player("tank");
        let h=w.spawn_vehicle_for_player("driver".into(),[0.0;3],chassis,"red").unwrap();
        w.set_assigned_hero("driver",hero);
        let aim=CombatPose{enabled:true,hull_locked:true,lock_target:Some([1.25,0.18]),..Default::default()};
        w.combat_tick("driver",1,Some(&aim));
        let first=&w.combat_poses["driver"];
        assert!(first.hull_locked && first.lock_yaw>0.0 && first.lock_yaw<0.06,"{chassis} must slew");
        for seq in 2..100 {w.combat_tick("driver",seq,Some(&aim));}
        let yaw=w.combat_poses["driver"].yaw;
        w.bodies[h].set_rotation(Rotation::from_axis_angle(&Vector::y_axis(),0.8),true);
        w.combat_tick("driver",101,Some(&aim));
        let c=&w.combat_poses["driver"];
        assert!((c.lock_yaw-1.25).abs()<0.001 && (c.lock_pitch-0.18).abs()<0.001);
        assert!(((c.yaw-yaw).sin()-0.8_f32.sin()).abs()<0.001,"{chassis} must turn with the hull");
        assert!(c.assisted_target.is_none());
        assert_eq!(c.shot,0);
    }
}
