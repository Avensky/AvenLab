//! Integration coverage for the authoritative combat-life loop, including real
//! weapon queries, simulation-owned timers and the public reset/swap paths.
use crate::{physics::{PhysicsWorld, SIMULATION_DT}, state::{CombatPose, InputPacket}, vehicle_state::VehicleStateFlags};
use rapier3d::prelude::*;

fn world() -> PhysicsWorld {
    let map=serde_json::from_value(serde_json::json!({
        "schema_version":2,"map_id":"health_range",
        "coordinate_system":{"units":"meters","up_axis":"y","forward_axis":"-z"},
        "cell":[200,200],"surface":{"road_y":0},"layout":{"kind":"fixed_grid","origin":[0,0],"size":[1,1]},
        "visuals":[{"id":"placeholder","asset":"/models/world/garage.glb","position":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1]}],
        "roads":[],"buildings":[],"team_spawns":{"red":[{"chunk":[0,0],"local":[0,0],"yaw":0}],"blue":[{"chunk":[0,0],"local":[0,30],"yaw":0}]},
        "authored_layout":{"format":"avenlab-world-layout","version":1,"map_id":"health_range","title":"Health range","base":"replace","ground":true,"repeat":false,"objects":[]}
    })).unwrap();
    let mut w=PhysicsWorld::from_editor_document(map).unwrap();
    w.spawn_vehicle_for_player("shooter".into(),[0.0;3],"tank","red").unwrap();
    w.spawn_vehicle_for_player("target".into(),[0.0;3],"brz","blue").unwrap();
    w
}

fn vulnerable(w:&mut PhysicsWorld){for health in w.vehicle_health.values_mut(){health.spawn_protection_s=0.0;}}
fn fire() -> CombatPose {CombatPose{enabled:true,fire:true,yaw:std::f32::consts::PI,..Default::default()}}

#[test]
fn actual_cannon_trace_deals_hp_reloads_and_awards_one_defeat() {
    let mut w=world();vulnerable(&mut w);
    // Put the target chassis directly across the factory cannon's trace. This
    // test uses combat_tick and Rapier's collider query, never damage_vehicle.
    let shooter=w.vehicles["shooter"].body;let target=w.vehicles["target"].body;
    w.combat_tick("shooter",0,Some(&CombatPose{fire:false,..fire()}));
    let gun=&w.combat_poses["shooter"];
    let y=w.bodies[shooter].translation().y+gun.y-w.vehicles["target"].config.chassis_com_offset[1];
    w.bodies[target].set_translation(vector![0.0,y,25.0],true);
    w.bodies.propagate_modified_body_positions_to_colliders(&mut w.colliders);
    w.combat_tick("shooter",1,Some(&fire()));
    assert_eq!(w.vehicle_health["target"].hp,250.0,"cannon's actual first hit");
    for seq in 2..180 {w.combat_tick("shooter",seq,Some(&fire()));}
    assert_eq!(w.vehicle_health["target"].hp,250.0,"reload rejects held repeat fire");
    for seq in 180..185 {w.combat_tick("shooter",seq,Some(&fire()));}
    assert!(w.vehicle_health["target"].defeated);
    assert_eq!(w.vehicle_health["target"].last_damage_kind,"cannon");
    assert_eq!(w.vehicle_health["shooter"].kills,1);
    assert_eq!(w.vehicle_health["target"].deaths,1);
    for seq in 185..400 {w.combat_tick("shooter",seq,Some(&fire()));}
    assert_eq!(w.vehicle_health["shooter"].kills,1,"dead collider cannot earn repeated kills");
}

#[test]
fn team_and_spawn_shield_policy_prevent_damage_but_firing_ends_own_shield() {
    let mut w=world();
    assert!(!w.damage_vehicle("target",Some("shooter"),100.0,"cannon"));
    assert_eq!(w.vehicle_health["target"].hp,500.0);
    vulnerable(&mut w);w.vehicles.get_mut("target").unwrap().team="RED".into();
    assert!(!w.damage_vehicle("target",Some("shooter"),100.0,"ram"));
    assert_eq!(w.vehicle_health["target"].hp,500.0);
    assert!(!w.damage_vehicle("shooter",Some("shooter"),100.0,"cannon"));
    assert_eq!(w.vehicle_health["shooter"].damage_seq,0);
    w.vehicle_health.get_mut("shooter").unwrap().spawn_protection_s=2.0;
    w.combat_tick("shooter",1,Some(&fire()));
    assert_eq!(w.vehicle_health["shooter"].spawn_protection_s,0.0);
}

#[test]
fn defeated_vehicle_is_nonblocking_and_public_actions_cannot_revive_it() {
    let mut w=world();vulnerable(&mut w);let handle=w.vehicles["target"].body;
    let config=w.vehicles["target"].config;
    w.combat_tick("target",0,Some(&fire()));
    assert!(w.damage_vehicle("target",Some("shooter"),9999.0,"cannon"));
    assert!(!w.bodies[handle].is_enabled());
    assert!(w.bodies[handle].colliders().iter().all(|h|!w.colliders[*h].is_enabled()));
    let packet=InputPacket{r#type:"input".into(),seq:1,dt:SIMULATION_DT,throttle:1.0,steer:1.0,brake:1.0,handbrake:1.0,
        cockpit_mask:None,parking_brake:None,cabin_mask:None,vehicleMask:VehicleStateFlags::BOOST.bits(),playerMask:1<<5,debug_mask:None,combat:Some(fire())};
    w.apply_player_input_packet("target",packet);w.combat_tick("target",1,Some(&fire()));
    assert_eq!(w.vehicles["target"].throttle,0.0);assert!(!w.combat_poses["target"].enabled);
    assert!(!w.vehicles["target"].ram.requested);
    assert!(w.recover_vehicle_for_player("target").is_err());
    assert!(w.service_vehicle_for_player("target").is_err());
    assert!(w.configure_vehicle_for_player("target",config).is_err());
    assert!(w.change_vehicle_for_player("target","tank").is_err());
    assert!(w.spawn_vehicle_for_player("target".into(),[0.0;3],"brz","blue").is_err());
    assert_eq!(w.vehicle_health["target"].hp,0.0);assert_eq!(w.vehicle_health["target"].deaths,1);
    assert!(!w.damage_vehicle("target",Some("shooter"),9999.0,"cannon"));
    assert_eq!(w.vehicle_health["shooter"].kills,1);
}

#[test]
fn timer_runs_without_packets_and_blocked_spawn_waits_until_safe() {
    let mut w=world();vulnerable(&mut w);let handle=w.vehicles["target"].body;
    let spawn=*w.bodies[handle].translation();
    w.vehicles.get_mut("target").unwrap().ram.cooldown=60.0;
    w.combat_cooldowns.insert("target:basket".into(),0.1);
    assert!(w.damage_vehicle("target",Some("shooter"),500.0,"cannon"));
    let blocker=w.bodies.insert(RigidBodyBuilder::fixed().translation(spawn).build());
    w.colliders.insert_with_parent(ColliderBuilder::cuboid(5.0,5.0,5.0).build(),blocker,&mut w.bodies);
    let center_blocker=w.bodies.insert(RigidBodyBuilder::fixed().translation(vector![0.0,spawn.y,15.0]).build());
    w.colliders.insert_with_parent(ColliderBuilder::cuboid(5.0,5.0,5.0).build(),center_blocker,&mut w.bodies);
    for _ in 0..750{w.step(SIMULATION_DT);}
    assert!(w.vehicle_health["target"].defeated);
    assert_eq!(w.vehicle_health["target"].hp,0.0);
    assert_eq!(w.vehicle_health["target"].respawn_remaining_s,0.0);
    w.bodies.remove(blocker,&mut w.island_manager,&mut w.colliders,&mut w.joints,&mut w.multibody_joints,true);
    w.bodies.remove(center_blocker,&mut w.island_manager,&mut w.colliders,&mut w.joints,&mut w.multibody_joints,true);
    w.step(SIMULATION_DT);
    let health=&w.vehicle_health["target"];
    assert!(!health.defeated);assert_eq!(health.hp,500.0);assert_eq!(health.spawn_protection_s,2.0);
    assert_eq!((health.kills,health.deaths),(0,1));assert_eq!(w.vehicle_health["shooter"].kills,1);
    assert!(!w.combat_cooldowns.contains_key("target:basket"),"respawn clears the third weapon timer");
    assert_eq!(w.vehicles["target"].body,handle);assert!(w.bodies[handle].is_enabled());
    assert!(w.bodies[handle].colliders().iter().all(|h|w.colliders[*h].is_enabled()));
    assert!(w.vehicles["target"].ram.cooldown>47.0 && w.vehicles["target"].ram.cooldown<48.0);
    assert!((w.bodies[handle].translation().z-spawn.z).abs()<0.1);
    assert!(!w.damage_vehicle("target",Some("shooter"),500.0,"cannon"),"fresh protection blocks spawn camping");
}

#[test]
fn swapping_and_manual_reset_preserve_health_fraction_and_do_not_grant_shield() {
    let mut w=world();vulnerable(&mut w);
    w.damage_vehicle("target",Some("shooter"),250.0,"cannon");
    w.change_vehicle_for_player("target","tank").unwrap();
    assert_eq!(w.vehicle_health["target"].hp,600.0);assert_eq!(w.vehicle_health["target"].max_hp,1200.0);
    assert_eq!(w.vehicle_health["target"].spawn_protection_s,0.0);
    w.recover_vehicle_for_player("target").unwrap();
    assert_eq!(w.vehicle_health["target"].hp,600.0);
    w.change_vehicle_for_player("target","brz").unwrap();assert_eq!(w.vehicle_health["target"].hp,250.0);
    assert_eq!(w.vehicle_health["target"].damage_seq,1);
}

#[test]
fn practice_reassignment_preserves_health_and_despawn_cleans_life_and_cooldowns() {
    let mut w=world();vulnerable(&mut w);let handle=w.vehicles["target"].body;
    w.damage_vehicle("target",Some("shooter"),200.0,"cannon");
    w.combat_cooldowns.insert("target".into(),1.5);w.combat_cooldowns.insert("target:coax".into(),0.08);w.combat_cooldowns.insert("target:basket".into(),0.04);
    assert!(w.reassign_player("target","returning"));assert!(!w.vehicle_health.contains_key("target"));
    assert_eq!(w.vehicle_health["returning"].hp,300.0);assert_eq!(w.vehicles["returning"].body,handle);
    assert_eq!(w.combat_cooldowns["returning"],1.5);assert_eq!(w.combat_cooldowns["returning:coax"],0.08);assert_eq!(w.combat_cooldowns["returning:basket"],0.04);
    assert!(!w.reassign_player("returning","shooter"),"cannot overwrite another player's state");
    w.despawn_vehicle_for_player("returning");
    assert!(!w.vehicle_health.contains_key("returning"));assert!(!w.bodies.contains(handle));
    assert!(!w.combat_cooldowns.contains_key("returning"));assert!(!w.combat_cooldowns.contains_key("returning:coax"));assert!(!w.combat_cooldowns.contains_key("returning:basket"));
    assert!(!w.body_to_player.contains_key(&handle));assert!(w.vehicle_health.contains_key("shooter"));
}

#[test]
fn worn_out_mechanics_still_accept_impact_damage_at_the_existing_cadence() {
    let mut powertrain=crate::powertrain::Powertrain::new(crate::powertrain::ROAD_RESOURCES);
    powertrain.condition=0.0;
    let damage=powertrain.impact(12.0,crate::powertrain::ROAD_RESOURCES);
    assert!(damage>0.0,"impact severity must not disappear when condition is already zero");
    assert_eq!(powertrain.condition,0.0);
    assert_eq!(powertrain.impact(12.0,crate::powertrain::ROAD_RESOURCES),0.0,"one collision cannot charge twice during its cooldown");
}

#[test]
fn real_head_on_contact_damages_hp_even_when_mechanical_condition_is_zero() {
    let mut w=world();w.change_vehicle_for_player("shooter","brz").unwrap();vulnerable(&mut w);
    for (id,z,speed) in [("shooter",-3.0,24.0),("target",3.0,-24.0)] {
        let vehicle=w.vehicles.get_mut(id).unwrap();vehicle.powertrain.condition=0.0;
        let body=w.bodies.get_mut(vehicle.body).unwrap();let y=body.translation().y;
        body.set_translation(vector![20.0,y,z],true);body.set_rotation(Rotation::identity(),true);
        body.set_linvel(vector![0.0,0.0,speed],true);
    }
    for _ in 0..12 {w.step(SIMULATION_DT);}
    for id in ["shooter","target"] {
        assert!(w.vehicle_health[id].hp<w.vehicle_health[id].max_hp,"{id} must lose HP from the actual contact");
        assert_eq!(w.vehicle_health[id].last_damage_kind,"impact");
    }
}

#[test]
fn reciprocal_lethal_impacts_resolve_both_hits_in_either_batch_order() {
    for reverse in [false,true] {
        let mut w=world();vulnerable(&mut w);
        for health in w.vehicle_health.values_mut(){health.hp=10.0;}
        let mut hits=vec![("shooter".into(),Some("target".into()),100.0),("target".into(),Some("shooter".into()),100.0)];
        if reverse {hits.reverse();}
        w.apply_queued_impact_damage(hits);
        for (id,attacker) in [("shooter","target"),("target","shooter")] {
            let health=&w.vehicle_health[id];
            assert!(health.defeated);assert_eq!((health.kills,health.deaths),(1,1));
            assert_eq!(health.last_attacker.as_deref(),Some(attacker));
            assert_eq!(health.last_damage,10.0);
        }
        // A source that was already defeated before a later batch is rejected.
        w.vehicle_health.get_mut("target").unwrap().respawn();
        w.vehicle_health.get_mut("target").unwrap().spawn_protection_s=0.0;
        let hp=w.vehicle_health["target"].hp;
        w.apply_queued_impact_damage(vec![("target".into(),Some("shooter".into()),100.0)]);
        assert_eq!(w.vehicle_health["target"].hp,hp);
        assert!(!w.damage_vehicle("target",Some("shooter"),100.0,"cannon"),"dead attackers remain unable to fire weapons");
        assert_eq!(w.vehicle_health["target"].hp,hp);
    }
}

#[test]
fn successful_tank_to_car_swap_removes_auxiliary_hitboxes_but_rejection_keeps_them() {
    let mut w=world();let body=w.vehicles["shooter"].body;
    w.combat_tick("shooter",1,Some(&CombatPose{fire:false,..fire()}));
    let original=w.bodies[body].colliders().to_vec();assert_eq!(original.len(),3);
    let blocker=w.bodies.insert(RigidBodyBuilder::fixed().translation(*w.bodies[body].translation()).build());
    w.colliders.insert_with_parent(ColliderBuilder::cuboid(5.0,5.0,5.0).build(),blocker,&mut w.bodies);
    assert!(w.change_vehicle_for_player("shooter","brz").is_err());
    assert_eq!(w.bodies[body].colliders(),original.as_slice());
    assert!(original.iter().all(|h|w.colliders.contains(*h)),"rejected swap retains the whole tank");
    w.bodies.remove(blocker,&mut w.island_manager,&mut w.colliders,&mut w.joints,&mut w.multibody_joints,true);
    w.change_vehicle_for_player("shooter","brz").unwrap();
    assert_eq!(w.bodies[body].colliders(),&original[..1]);
    assert!(original[1..].iter().all(|h|!w.colliders.contains(*h)),"car cannot retain invisible tank hitboxes");
    w.change_vehicle_for_player("shooter","tank").unwrap();
    w.combat_tick("shooter",2,Some(&CombatPose{fire:false,..fire()}));
    assert_eq!(w.bodies[body].colliders().len(),3,"returning to the tank recreates its hitboxes");
}

#[test]
fn client_mount_offsets_cannot_fire_a_car_weapon_from_the_far_side_of_cover() {
    let mut w=world();w.change_vehicle_for_player("shooter","brz").unwrap();vulnerable(&mut w);
    let shooter=w.vehicles["shooter"].body;let target=w.vehicles["target"].body;
    let config=w.vehicles["shooter"].config;
    let mount_y=config.chassis_com_offset[1]+config.chassis_half_extents[1]+0.05;
    let expected=w.bodies[shooter].position().transform_point(&point![0.0,mount_y,0.0]);
    let target_offset=w.vehicles["target"].config.chassis_com_offset[1];
    w.bodies[target].set_translation(vector![0.0,expected.y-target_offset,25.0],true);
    let wall=w.bodies.insert(RigidBodyBuilder::fixed().translation(vector![0.0,1.5,2.5]).build());
    w.colliders.insert_with_parent(ColliderBuilder::cuboid(4.0,1.5,0.1).build(),wall,&mut w.bodies);
    w.bodies.propagate_modified_body_positions_to_colliders(&mut w.colliders);
    w.combat_tick("shooter",1,Some(&CombatPose{x:3.0,y:3.0,z:3.0,..fire()}));
    let combat=&w.combat_poses["shooter"];
    assert_eq!([combat.x,combat.y,combat.z],[0.0,mount_y,0.0]);
    assert_eq!(combat.shot_origin,Some([expected.x,expected.y,expected.z]));
    let impact=combat.impact.expect("factory origin must hit the blocking wall");
    assert!((impact[2]-2.4).abs()<0.001);assert!(combat.impact_static);
    assert_eq!(w.vehicle_health["target"].hp,w.vehicle_health["target"].max_hp,"client offset cannot bypass cover to damage the target");
}

#[test]
fn session_damage_stats_count_actual_enemy_hp_and_recent_assists_once() {
    let mut w=world();let shooter=w.vehicles["shooter"].body;
    let y=w.bodies[shooter].translation().y;w.bodies[shooter].set_translation(vector![40.0,y,0.0],true);
    w.spawn_vehicle_for_player("assistant".into(),[0.0;3],"brz","red").unwrap();
    vulnerable(&mut w);
    assert!(!w.damage_vehicle("target",Some("assistant"),50.0,"machine-gun"));
    assert!(!w.damage_vehicle("target",Some("assistant"),20.0,"machine-gun"));
    w.vehicle_health.get_mut("target").unwrap().advance(7.9);
    assert!(w.damage_vehicle("target",Some("shooter"),9999.0,"cannon"));
    assert_eq!(w.vehicle_health["assistant"].stats.damage_dealt,70.0);
    assert_eq!(w.vehicle_health["assistant"].stats.assists,1);
    assert_eq!(w.vehicle_health["shooter"].stats.damage_dealt,430.0,"overkill never inflates score");
    assert_eq!(w.vehicle_health["shooter"].stats.assists,0,"killer is not its own assistant");
    assert!(!w.damage_vehicle("target",Some("shooter"),9999.0,"cannon"));
    assert_eq!((w.vehicle_health["shooter"].kills,w.vehicle_health["assistant"].stats.assists),(1,1));
    let snapshot=serde_json::to_value(&w.vehicle_health["target"]).unwrap();
    assert!(snapshot.get("contributors").is_none(),"private attribution never enters snapshots");
    assert!(snapshot["stats"]["damage_dealt"].is_number());

    w.advance_vehicle_lives(crate::vehicle_health::RESPAWN_SECONDS);w.vehicle_health.get_mut("target").unwrap().spawn_protection_s=0.0;
    assert_eq!(w.vehicle_health["target"].stats.respawns,1);
    assert_eq!(w.vehicle_health["target"].stats.resurrections,0,"ordinary recovery is not a teammate resurrection");
    w.damage_vehicle("target",Some("assistant"),10.0,"machine-gun");
    w.vehicle_health.get_mut("target").unwrap().advance(8.1);
    w.damage_vehicle("target",Some("shooter"),9999.0,"cannon");
    assert_eq!(w.vehicle_health["assistant"].stats.assists,1,"expired damage cannot earn another assist");
}

#[test]
fn session_assists_follow_retained_identity_and_remove_departed_contributors() {
    let mut w=world();let shooter=w.vehicles["shooter"].body;
    let y=w.bodies[shooter].translation().y;w.bodies[shooter].set_translation(vector![40.0,y,0.0],true);
    w.spawn_vehicle_for_player("assistant".into(),[0.0;3],"brz","red").unwrap();vulnerable(&mut w);
    w.damage_vehicle("target",Some("assistant"),10.0,"machine-gun");
    assert!(w.reassign_player("assistant","returning"));
    w.damage_vehicle("target",Some("shooter"),9999.0,"cannon");
    assert_eq!(w.vehicle_health["returning"].stats.assists,1);
    assert_eq!(w.vehicle_health["returning"].stats.damage_dealt,10.0);
    w.advance_vehicle_lives(crate::vehicle_health::RESPAWN_SECONDS);w.vehicle_health.get_mut("target").unwrap().spawn_protection_s=0.0;
    w.damage_vehicle("target",Some("returning"),10.0,"machine-gun");
    w.despawn_vehicle_for_player("returning");
    w.spawn_vehicle_for_player("returning".into(),[0.0;3],"brz","red").unwrap();
    w.damage_vehicle("target",Some("shooter"),9999.0,"cannon");
    assert_eq!(w.vehicle_health["returning"].stats.assists,0,"new body cannot inherit a departed session's pending assist");
    assert_eq!(w.vehicle_health["returning"].stats.damage_dealt,0.0);
}

#[test]
fn simultaneous_lethal_stats_credit_both_validated_hits_once() {
    let mut w=world();vulnerable(&mut w);
    for h in w.vehicle_health.values_mut(){h.hp=10.0;}
    w.apply_queued_impact_damage(vec![("shooter".into(),Some("target".into()),100.0),("target".into(),Some("shooter".into()),100.0)]);
    for id in ["shooter","target"] {
        assert_eq!(w.vehicle_health[id].stats.damage_dealt,10.0);
        assert_eq!(w.vehicle_health[id].kills,1);assert_eq!(w.vehicle_health[id].stats.assists,0);
    }
}

#[test]
fn fuel_stats_count_real_engine_and_ram_costs_but_not_chassis_or_respawn_refills() {
    let mut w=world();let tank=w.vehicles.get_mut("shooter").unwrap();
    tank.powertrain.engine_requested=true;tank.vehicle_flags.insert(VehicleStateFlags::ENGINE_ON);
    let initial_fuel=tank.powertrain.fuel_liters;
    for _ in 0..180 {w.step(SIMULATION_DT);}
    let before=w.vehicles["shooter"].powertrain.fuel_liters;
    let stats_before=w.vehicle_health["shooter"].stats.gas_burned_liters;
    assert!(stats_before>0.0);assert!((stats_before-(initial_fuel-before)).abs()<0.002);
    w.vehicles.get_mut("shooter").unwrap().ram.requested=true;w.step(SIMULATION_DT);
    let after=w.vehicles["shooter"].powertrain.fuel_liters;
    let spent=w.vehicle_health["shooter"].stats.gas_burned_liters-stats_before;
    assert!(spent>=crate::ram::FUEL_COST,"the real Ram fuel cost belongs to the session");
    assert!((spent-(before-after)).abs()<0.002);
    let previous=w.vehicle_health["shooter"].stats.gas_burned_liters;
    w.change_vehicle_for_player("shooter","brz").unwrap();
    assert_eq!(w.vehicle_health["shooter"].stats.gas_burned_liters,previous);
    assert_eq!(w.vehicle_health["shooter"].stats.gas_gained_liters,0.0);
    vulnerable(&mut w);w.damage_vehicle("target",None,9999.0,"impact");w.advance_vehicle_lives(crate::vehicle_health::RESPAWN_SECONDS);
    assert_eq!(w.vehicle_health["target"].stats.gas_gained_liters,0.0,"factory respawn fuel is not earned supply");
    assert_eq!(w.vehicle_health["target"].stats.respawns,1);
}

#[test]
fn basket_real_raycast_deals_eight_hp_and_records_only_actual_session_damage() {
    let mut w=world();vulnerable(&mut w);let target=w.vehicles["target"].body;
    let y=w.bodies[target].translation().y;w.bodies[target].set_translation(vector![50.0,y,30.0],true);
    w.bodies.propagate_modified_body_positions_to_colliders(&mut w.colliders);
    let mut intent=CombatPose{weapon:"basket".into(),..fire()};
    w.combat_tick("shooter",1,Some(&intent));
    let muzzle=w.combat_poses["shooter"].shot_origin.unwrap();
    let center_y=muzzle[1]-w.vehicles["target"].config.chassis_com_offset[1];
    w.bodies[target].set_translation(vector![muzzle[0],center_y,muzzle[2]+20.0],true);
    w.bodies.propagate_modified_body_positions_to_colliders(&mut w.colliders);
    intent.fire=false;for seq in 2..10 {w.combat_tick("shooter",seq,Some(&intent));}
    intent.fire=true;w.combat_tick("shooter",10,Some(&intent));
    assert_eq!(w.combat_poses["shooter"].shot_weapon,"basket");
    assert_eq!(w.vehicle_health["target"].hp,492.0);
    assert_eq!(w.vehicle_health["target"].last_damage_kind,"machine-gun");
    assert_eq!(w.vehicle_health["shooter"].stats.damage_dealt,8.0);
    w.combat_tick("shooter",11,Some(&intent));assert_eq!(w.vehicle_health["target"].hp,492.0,"reload cannot be spoofed by repeating a packet");
}

fn move_body(w:&mut PhysicsWorld,id:&str,x:f32,z:f32){
    let handle=w.vehicles[id].body;let y=w.bodies[handle].translation().y;
    w.bodies[handle].set_translation(vector![x,y,z],true);
    w.bodies.propagate_modified_body_positions_to_colliders(&mut w.colliders);w.query_pipeline.update(&w.colliders);
}
#[test]
fn fuel_empty_opens_rescue_window_without_damage_death_or_kill_credit(){
    let mut w=world();let body=w.vehicles["target"].body;
    w.vehicle_health.get_mut("target").unwrap().hp=300.0;
    w.vehicles.get_mut("target").unwrap().powertrain.fuel_liters=0.0;
    w.step(SIMULATION_DT);
    let health=&w.vehicle_health["target"];
    assert!(health.defeated);assert_eq!(health.disabled_reason,"fuel");assert_eq!(health.hp,300.0);
    assert_eq!(health.deaths,0);assert_eq!(health.damage_seq,0);assert_eq!(w.vehicle_health["shooter"].kills,0);
    assert!(health.respawn_remaining_s>11.9&&health.respawn_remaining_s<12.0);assert_eq!(health.recovery_window_s,12.0);
    assert!(!w.bodies[body].is_enabled());assert!(!w.vehicles["target"].powertrain.running);
    assert!(w.recover_vehicle_for_player("target").is_err());assert!(w.service_vehicle_for_player("target").is_err());
}
#[test]
fn timeout_chooses_nearest_supported_central_or_own_home_zone(){
    for (death_z,expected_z) in [(16.0,15.0),(27.0,30.0)]{
        let mut w=world();move_body(&mut w,"target",0.0,death_z);vulnerable(&mut w);
        w.damage_vehicle("target",None,9999.0,"impact");
        w.advance_vehicle_lives(crate::vehicle_health::RESPAWN_SECONDS);
        assert!(!w.vehicle_health["target"].defeated);
        let body=w.vehicles["target"].body;assert!((w.bodies[body].translation().z-expected_z).abs()<0.01);
        assert_eq!(w.vehicle_health["target"].stats.respawns,1);
    }
}
#[test]
fn in_place_combat_revive_is_once_only_with_actual_healing_and_ability_cooldown(){
    let mut w=world();move_body(&mut w,"target",0.0,7.5);w.vehicles.get_mut("shooter").unwrap().team="blue".into();vulnerable(&mut w);
    w.damage_vehicle("target",None,9999.0,"impact");let position=*w.bodies[w.vehicles["target"].body].translation();
    w.vehicles.get_mut("target").unwrap().powertrain.fuel_liters=0.0;
    w.revive_vehicle_at_current_location("shooter","target").unwrap();
    let target=&w.vehicle_health["target"];
    assert!(!target.defeated);assert_eq!(target.hp,150.0);assert_eq!(target.deaths,1);assert_eq!(target.stats.respawns,0);assert_eq!(target.spawn_protection_s,1.0);
    assert_eq!(*w.bodies[w.vehicles["target"].body].translation(),position);assert!(w.bodies[w.vehicles["target"].body].is_enabled());
    assert_eq!(w.vehicles["target"].powertrain.fuel_liters,5.0);assert_eq!(target.stats.gas_gained_liters,5.0);
    assert_eq!(w.vehicle_health["shooter"].stats.resurrections,1);assert_eq!(w.vehicle_health["shooter"].stats.healing_done,150.0);assert_eq!(w.vehicle_health["shooter"].stats.self_healing,0.0);
    assert_eq!(w.vehicle_health["shooter"].revive_cooldown_s,20.0);assert!(w.revive_vehicle_at_current_location("shooter","target").is_err());
    assert_eq!(w.vehicle_health["shooter"].stats.resurrections,1);
    w.advance_vehicle_lives(0.5);assert!((w.vehicle_health["shooter"].revive_cooldown_s-19.5).abs()<0.01);
}
#[test]
fn fuel_rescue_preserves_hull_hp_and_does_not_invent_a_resurrection(){
    let mut w=world();move_body(&mut w,"target",0.0,7.5);w.vehicles.get_mut("shooter").unwrap().team="blue".into();
    w.vehicle_health.get_mut("target").unwrap().hp=400.0;w.vehicles.get_mut("target").unwrap().powertrain.fuel_liters=0.0;
    w.advance_vehicle_lives(0.1);w.revive_vehicle_at_current_location("shooter","target").unwrap();
    assert_eq!(w.vehicle_health["target"].hp,400.0);assert_eq!(w.vehicle_health["target"].deaths,0);assert_eq!(w.vehicle_health["shooter"].stats.resurrections,0);assert_eq!(w.vehicle_health["shooter"].stats.healing_done,0.0);assert_eq!(w.vehicle_health["target"].stats.gas_gained_liters,5.0);
}
#[test]
fn revive_rejects_enemy_range_speed_expired_and_obstructed_placements_without_healing(){
    let mut w=world();vulnerable(&mut w);w.damage_vehicle("target",None,9999.0,"impact");
    assert!(w.revive_vehicle_at_current_location("shooter","target").is_err());
    w.vehicles.get_mut("shooter").unwrap().team="blue".into();assert!(w.revive_vehicle_at_current_location("shooter","target").is_err());
    move_body(&mut w,"target",0.0,7.5);let actor=w.vehicles["shooter"].body;w.bodies[actor].set_linvel(vector![4.0,0.0,0.0],true);assert!(w.revive_vehicle_at_current_location("shooter","target").is_err());w.bodies[actor].set_linvel(Vector::zeros(),true);
    let target=w.vehicles["target"].body;let pos=*w.bodies[target].translation();let wall=w.bodies.insert(RigidBodyBuilder::fixed().translation(pos).build());w.colliders.insert_with_parent(ColliderBuilder::cuboid(3.0,3.0,3.0).build(),wall,&mut w.bodies);
    assert!(w.revive_vehicle_at_current_location("shooter","target").is_err());assert_eq!(w.vehicle_health["target"].hp,0.0);assert_eq!(w.vehicle_health["shooter"].revive_cooldown_s,0.0);
    w.bodies.remove(wall,&mut w.island_manager,&mut w.colliders,&mut w.joints,&mut w.multibody_joints,true);w.vehicle_health.get_mut("target").unwrap().respawn_remaining_s=0.0;assert!(w.revive_vehicle_at_current_location("shooter","target").is_err());
}

#[test]
fn central_recovery_cannot_spawn_over_a_canal_or_a_too_small_support_piece(){
    let part=serde_json::json!({"shape":"box","position":[0,0.5,0],"size":[1,1,1]});
    let object=|id:&str,piece:&str,z:f32,width:f32|serde_json::json!({"id":id,"name":id,"piece":piece,"position":[0,-0.5,z],"size":[width,0.5,width],"yaw":0,"color":"#888888","locked":true,"solid":true,"parts":[part.clone()]});
    let map=serde_json::from_value(serde_json::json!({
        "schema_version":2,"map_id":"canal_recovery","coordinate_system":{"units":"meters","up_axis":"y","forward_axis":"-z"},"cell":[200,200],"surface":{"road_y":0},"layout":{"kind":"fixed_grid","origin":[0,0],"size":[1,1]},
        "visuals":[{"id":"placeholder","asset":"/models/world/garage.glb","position":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1]}],"roads":[],"buildings":[],
        "team_spawns":{"red":[{"chunk":[0,0],"local":[0,0],"yaw":0}],"blue":[{"chunk":[0,0],"local":[0,30],"yaw":0}]},
        "authored_layout":{"format":"avenlab-world-layout","version":1,"map_id":"canal_recovery","title":"Canal recovery","base":"replace","ground":false,"repeat":false,"objects":[object("red-pad","platform",0.0,10.0),object("blue-pad","platform",30.0,10.0),object("tiny-central-road","road",15.0,1.0)]}
    })).unwrap();
    let mut w=PhysicsWorld::from_editor_document(map).unwrap();w.spawn_vehicle_for_player("target".into(),[0.0;3],"brz","blue").unwrap();move_body(&mut w,"target",0.0,16.0);vulnerable(&mut w);w.damage_vehicle("target",None,9999.0,"impact");w.advance_vehicle_lives(crate::vehicle_health::RESPAWN_SECONDS);
    assert!(!w.vehicle_health["target"].defeated);assert!((w.bodies[w.vehicles["target"].body].translation().z-30.0).abs()<0.01,"the center's single supported point cannot carry the vehicle footprint");
}

#[test]
fn retained_downed_lifecycle_restores_window_position_but_never_repeats_old_stats(){
    let mut w=world();vulnerable(&mut w);move_body(&mut w,"target",0.0,17.0);w.damage_vehicle("target",Some("shooter"),9999.0,"cannon");w.advance_vehicle_lives(2.0);
    let mut lifecycle=w.vehicle_health["target"].downed_lifecycle().unwrap();lifecycle.remaining_s-=3.0;let point=lifecycle.position.unwrap();
    w.despawn_vehicle_for_player("target");w.spawn_vehicle_for_player("returning".into(),[0.0;3],"brz","blue").unwrap();w.restore_downed_lifecycle("returning",&lifecycle).unwrap();
    let health=&w.vehicle_health["returning"];assert!(health.defeated);assert_eq!(health.respawn_remaining_s,7.0);assert_eq!(health.spawn_protection_s,0.0);assert_eq!(health.deaths,0);assert_eq!(health.stats.damage_dealt,0.0);
    let body=w.vehicles["returning"].body;assert_eq!(*w.bodies[body].translation(),Vector::new(point[0],point[1],point[2]));assert!(!w.bodies[body].is_enabled());
    assert!(w.recover_vehicle_for_player("returning").is_err());assert!(w.restore_downed_lifecycle("returning",&lifecycle).is_err());
}

#[test]
fn retained_fuel_out_cannot_gain_factory_fuel_until_the_recovery_window_expires(){
    let mut w=world();w.vehicle_health.get_mut("target").unwrap().hp=400.0;w.vehicles.get_mut("target").unwrap().powertrain.fuel_liters=0.0;w.advance_vehicle_lives(1.0);
    let mut lifecycle=w.vehicle_health["target"].downed_lifecycle().unwrap();w.despawn_vehicle_for_player("target");w.spawn_vehicle_for_player("returning".into(),[0.0;3],"brz","blue").unwrap();
    lifecycle.remaining_s=0.0;w.restore_downed_lifecycle("returning",&lifecycle).unwrap();assert!(w.vehicle_health["returning"].defeated);assert_eq!(w.vehicle_health["returning"].hp,400.0);assert_eq!(w.vehicles["returning"].powertrain.fuel_liters,0.0);assert_eq!(w.vehicle_health["returning"].stats.gas_gained_liters,0.0);
    w.advance_vehicle_lives(0.1);assert!(!w.vehicle_health["returning"].defeated);assert_eq!(w.vehicle_health["returning"].stats.respawns,1);assert_eq!(w.vehicle_health["returning"].deaths,0);assert_eq!(w.vehicles["returning"].powertrain.fuel_liters,50.0);assert_eq!(w.vehicle_health["returning"].stats.gas_gained_liters,0.0);
}
