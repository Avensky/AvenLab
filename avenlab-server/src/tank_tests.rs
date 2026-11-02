use crate::{physics::{PhysicsWorld,SIMULATION_DT},state::CombatPose,vehicle_state::VehicleStateFlags};
fn range()->PhysicsWorld {
 let map=serde_json::from_value(serde_json::json!({"schema_version":2,"map_id":"tank_test","coordinate_system":{"units":"meters","up_axis":"y","forward_axis":"-z"},"cell":[200,200],"surface":{"road_y":0},"layout":{"kind":"fixed_grid","origin":[0,0],"size":[1,1]},"visuals":[{"id":"placeholder","asset":"/models/world/garage.glb","position":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1]}],"roads":[],"buildings":[],"team_spawns":{"red":[{"chunk":[0,0],"local":[0,0],"yaw":0}],"blue":[]},"authored_layout":{"format":"avenlab-world-layout","version":1,"map_id":"tank_test","title":"Tank physics range","base":"replace","ground":true,"repeat":false,"objects":[]}})).unwrap();
 let mut world=PhysicsWorld::from_editor_document(map).unwrap();world.spawn_vehicle_for_player("tank".into(),[0.0;3],"tank","red").unwrap();
 let tank=world.vehicles.get_mut("tank").unwrap();tank.powertrain.engine_requested=true;tank.vehicle_flags.insert(VehicleStateFlags::ENGINE_ON);
 for _ in 0..180 {world.step(SIMULATION_DT);}world
}
#[test] fn tank_pivots_through_ground_contacts_and_can_drive_reverse(){
 let mut world=range();let h=world.vehicles["tank"].body;let start=*world.bodies[h].translation();
 world.vehicles.get_mut("tank").unwrap().steer=1.0;
 for _ in 0..180 {world.step(SIMULATION_DT);}
 let yaw=world.bodies[h].rotation().euler_angles().1;
 let p=*world.bodies[h].translation();
 assert!(yaw.abs()>0.2,"tank should pivot: {yaw}, displacement {:?}",p-start);
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
