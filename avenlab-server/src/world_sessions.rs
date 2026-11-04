//! One immutable map and one isolated Rapier world per occupied game world.
//! The server's existing 60 Hz scheduler ticks all worlds; idle worlds are dropped.
use crate::{
    physics::{PhysicsWorld, SIMULATION_DT},
    spawn::Team,
    state::{EntityType, InputPacket, PhysicsFrame, SharedGameState, VehicleConfigPayload},
    vehicle_debug::DebugFlags,
};
use rapier3d::prelude::RigidBodyHandle;
use serde_json::json;
use std::{sync::Arc, collections::HashMap};
use tokio::sync::{mpsc::UnboundedSender, watch};

#[derive(Debug, Clone)]
pub struct RoundPlayerSnapshot {
    pub player_id: String,
    pub team: Team,
    pub vehicle_id: Option<String>,
    pub appearance: crate::alpha::appearance::HeroAppearance,
    pub health: crate::vehicle_health::VehicleHealth,
}
#[derive(Debug, Clone)]
pub struct CompletedRound {
    pub result: crate::ctf::CtfCompletion,
    pub players: Vec<RoundPlayerSnapshot>,
}
pub struct WorldRuntime {
    pub game: SharedGameState,
    pub physics: PhysicsWorld,
    pub round: Option<crate::ctf::CtfRound>,
    round_players: HashMap<String, RoundPlayerSnapshot>,
    round_completion: Option<CompletedRound>,
    completion_captured: bool,
}
impl WorldRuntime {
    pub fn new(id: usize, map: &str) -> Result<Self, String> {
        let mut physics = PhysicsWorld::new();
        physics.select_map(map).map_err(|error| error.to_string())?;
        let mut game = SharedGameState::new();
        game.room_id = id;
        Ok(Self::from_parts(game, physics))
    }
    pub fn from_parts(game: SharedGameState, physics: PhysicsWorld) -> Self {
        Self { game, physics, round: None, round_players: HashMap::new(), round_completion: None, completion_captured: false }
    }
    /// Server admission owns eligibility and calls start only after its roster gate.
    pub fn configure_round(&mut self, mode: crate::alpha::Mode, training: bool) -> Result<(),String> {
        self.configure_round_format(mode.into(),training)
    }
    pub fn configure_round_format(&mut self, format:crate::alpha::MatchFormat, training:bool)->Result<(),String>{
        if self.round.is_some(){return Ok(());}
        let mode=match format.mode {crate::alpha::Mode::Quickplay=>"quickplay",crate::alpha::Mode::Competitive=>"competitive",crate::alpha::Mode::Skirmish=>"skirmish",_=>return Err("Only matchmaking worlds run CTF rounds.".into())};
        self.round=Some(crate::ctf::CtfRound::new(mode,training,self.physics.ctf_bases()?)?);
        self.round.as_mut().unwrap().team_size=format.team_size;
        self.game.match_state=self.round_view();Ok(())
    }
    pub fn round_view(&self) -> Option<crate::ctf::CtfView> {self.round.as_ref().map(|r|r.view())}
    fn round_observations(&self) -> Vec<crate::ctf::CtfPlayer> {
        self.game.entities.values().filter_map(|entity|{
            let vehicle=self.physics.vehicles.get(&entity.id)?;let body=self.physics.bodies.get(vehicle.body)?;let p=body.translation();
            Some(crate::ctf::CtfPlayer{player_id:entity.id.clone(),team:entity.team,position:[p.x,p.y,p.z],alive:!self.physics.is_defeated(&entity.id)&&self.game.clients.contains_key(&entity.id),resetting:self.physics.ctf_reset_players.contains(&entity.id),grounded:self.physics.wheels.get(&vehicle.body).is_some_and(|wheels|wheels.iter().any(|wheel|wheel.grounded)),vehicle_id:entity.vehicle_id.clone()})
        }).collect()
    }
    pub fn start_round(&mut self) -> Result<(),String> {
        if self.round.as_ref().is_none_or(|r|r.phase!=crate::ctf::CtfPhase::Waiting){return Err("Prepare a waiting round first.".into());}
        let observations=self.round_observations();
        if ![Team::Red,Team::Blue].iter().all(|team|observations.iter().any(|p|p.team==*team&&p.alive)){return Err("Both teams need a spawned vehicle.".into());}
        self.physics.prepare_ctf_round()?;self.game.clear_round_inputs();
        let observations=self.round_observations();self.round.as_mut().unwrap().start(&observations)?;
        self.round_players.clear();self.round_completion=None;self.completion_captured=false;self.capture_round_players();self.game.match_state=self.round_view();Ok(())
    }
    fn capture_round_player(&mut self,id:&str) {
        let Some(entity)=self.game.entities.get(id)else{return;};let Some(health)=self.physics.vehicle_health.get(id)else{return;};
        self.round_players.insert(id.into(),RoundPlayerSnapshot{player_id:id.into(),team:entity.team,vehicle_id:entity.vehicle_id.clone(),appearance:entity.appearance.clone(),health:health.clone()});
    }
    fn capture_round_players(&mut self){let ids:Vec<_>=self.game.entities.keys().cloned().collect();for id in ids{self.capture_round_player(&id);}}
    fn advance_round(&mut self) {
        if self.round.as_ref().is_none_or(|r|r.phase==crate::ctf::CtfPhase::Ended){self.game.match_state=self.round_view();return;}
        let observations=self.round_observations();self.round.as_mut().unwrap().tick(SIMULATION_DT,&observations);self.physics.ctf_reset_players.clear();
        let carriers=self.round.as_ref().unwrap().carriers();
        for id in carriers.difference(&self.physics.ctf_carriers){if let Some(h)=self.physics.vehicle_health.get_mut(id){h.spawn_protection_s=0.0;}}
        self.physics.ctf_carriers=carriers;
        if self.round.as_ref().is_some_and(|r|r.phase==crate::ctf::CtfPhase::Running){self.capture_round_players();}
        if !self.completion_captured {if let Some(result)=self.round.as_ref().unwrap().completion(){
            let mut players:Vec<_>=self.round_players.values().cloned().collect();players.sort_by(|a,b|a.player_id.cmp(&b.player_id));
            self.round_completion=Some(CompletedRound{result:result.clone(),players});self.completion_captured=true;
        }}
        self.game.match_state=self.round_view();
    }
    pub fn take_round_completion(&mut self) -> Option<CompletedRound>{self.round_completion.take()}
    pub fn restore_round_completion(&mut self,event:CompletedRound){if self.round_completion.is_none(){self.round_completion=Some(event);}}
    pub fn join(
        &mut self,
        id: &str,
        tx: UnboundedSender<String>,
        frame: watch::Sender<Option<Arc<PhysicsFrame>>>,
        input: watch::Receiver<Option<InputPacket>>,
        preferred: Option<Team>,
        capacity: usize,
    ) -> Team {
        let side_limit = capacity.div_ceil(2);
        let preferred = preferred.filter(|team| {
            self.game
                .entities
                .values()
                .filter(|entity| entity.team == *team)
                .count()
                < side_limit
        });
        let spawn = self
            .game
            .spawns
            .allocate_in_room(id.into(), self.game.room_id, preferred);
        self.game.register_client(id.into(), tx, frame, input);
        self.game.add_entity(id, EntityType::Vehicle);
        self.game.apply_spawn_info(&spawn);
        spawn.team
    }
    /// No transport remains for a leased practice body. Clear all held intent.
    pub fn detach(&mut self,id:&str){
        self.game.unregister_client(id);
        self.physics.cancel_guard(id);
        if let Some(e)=self.game.entities.get_mut(id){e.last_packet=None;}
        if let Some(v)=self.physics.vehicles.get_mut(id){v.throttle=0.0;v.steer=0.0;v.brake=1.0;v.handbrake=0.0;v.ram.cancel();}
        if let Some(c)=self.physics.combat_poses.get_mut(id){c.fire=false;c.ram=false;}
    }
    pub fn resume(&mut self,old:&str,new:&str,connection:&crate::server::Connection)->bool{
        if !self.game.entities.contains_key(old)||!self.physics.vehicles.contains_key(old){return false;}
        self.leave(new); // Release the temporary admission entity, not the leased body.
        if !self.physics.reassign_player(old,new){return false;}
        let mut entity=self.game.entities.remove(old).unwrap();entity.id=new.into();entity.last_packet=None;
        self.game.entities.insert(new.into(),entity);
        self.game.register_client(new.into(),connection.tx.clone(),connection.frame.clone(),connection.input.clone());true
    }
    pub fn leave(&mut self, id: &str) {
        if self.round.as_ref().is_some_and(|r|r.phase==crate::ctf::CtfPhase::Running){self.capture_round_player(id);}
        if let Some(round)=&mut self.round{round.remove_player(id);}
        self.physics.despawn_vehicle_for_player(id);
        if let Some(entity) = self.game.entities.get(id) {
            self.game.spawns.release(self.game.room_id, entity.team);
        }
        self.game.unregister_client(id);
        self.game.remove_entity(id);
    }
    pub fn spawn(&mut self, id: &str, vehicle: &str) -> Result<(), String> {
        let entity = self
            .game
            .entities
            .get(id)
            .ok_or("Join a world before spawning.")?;
        let team = entity.team;
        let newly_spawned = !self.physics.vehicles.contains_key(id);
        let handle = if let Some(current) = self.physics.vehicles.get(id) {
            current.body
        } else {
            self.physics
                .spawn_vehicle_for_player(id.into(), [0.0; 3], vehicle, team.as_str())
                .map_err(|error| error.to_string())?
        };
        self.game.attach_body(id, handle);
        if newly_spawned {
            self.game.set_vehicle_id(id, vehicle);
        }
        if let Some(current) = self.physics.vehicles.get(id) {
            self.game.broadcast_vehicle_config(id, current);
        }
        let tx = self.game.clients.get(id).ok_or("The connection closed.")?;
        let _=tx.send(json!({"type":"map_snapshot","world_id":self.game.room_id,"data":self.physics.map_snapshot()}).to_string());
        let _=tx.send(json!({"type":"spawn_ready","player_id":id,"vehicle":vehicle,"map":self.physics.active_map_id(),"newly_spawned":newly_spawned}).to_string());
        Ok(())
    }
    pub fn send_existing_configs(&self, tx: &UnboundedSender<String>) {
        for (id, vehicle) in &self.physics.vehicles {
            let _=tx.send(json!({"type":"vehicle_config","data":VehicleConfigPayload::new(id,vehicle.config)}).to_string());
        }
    }
    pub fn tick(&mut self, lock_ms: f64) -> usize {
        if self.round.as_ref().is_some_and(|r|r.phase==crate::ctf::CtfPhase::Ended){
            self.game.clear_round_inputs();self.game.match_state=self.round_view();return self.game.publish_physics_frame(&self.physics);
        }
        if self.physics.vehicles.is_empty() || self.game.clients.is_empty() {
            self.advance_round();return 0;
        }
        let started = std::time::Instant::now();
        self.game.collect_input_packets();
        let mut debug = DebugFlags::NONE;
        for entity in self.game.entities.values_mut() {
            // Consume dead inputs without caching them across respawn. A held
            // packet from before defeat must never restart driving or firing.
            if self.physics.is_defeated(&entity.id) {entity.last_packet=None;continue;}
            if entity.body_handle == RigidBodyHandle::invalid() {
                continue;
            }
            if let Some(packet) = &entity.last_packet {
                debug |= DebugFlags::from_bits_truncate(packet.debug_mask.unwrap_or(0));
                self.physics
                    .apply_player_input_packet(&entity.id, packet.clone());
                self.physics.combat_tick(&entity.id,packet.seq,packet.combat.as_ref());
            }
        }
        self.physics.set_debug_flags(debug);
        let physics_started = std::time::Instant::now();
        self.physics.step(SIMULATION_DT);
        self.physics.advance_guard_boosts(SIMULATION_DT, self.game.clients.keys().map(String::as_str));
        self.physics.advance_health_packs(SIMULATION_DT, self.game.clients.keys().map(String::as_str));
        self.physics.advance_passive_ultimates(SIMULATION_DT, self.game.clients.keys().map(String::as_str));
        self.advance_round();
        self.game.server_timing = crate::state::ServerTiming {
            lock_ms,
            physics_ms: physics_started.elapsed().as_secs_f64() * 1000.0,
            work_ms: started.elapsed().as_secs_f64() * 1000.0,
        };
        self.game.tick += 1;
        self.game.publish_physics_frame(&self.physics)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn two_team_round() -> (WorldRuntime,watch::Sender<Option<InputPacket>>) {
        let mut world=WorldRuntime::new(1,"road_precision").unwrap();let mut control=None;
        for (id,team) in [("red",Team::Red),("blue",Team::Blue)]{
            let (tx,_rx)=tokio::sync::mpsc::unbounded_channel();let(frame,_frames)=watch::channel(None);let(input,inputs)=watch::channel(None);
            world.join(id,tx,frame,inputs,Some(team),10);world.spawn(id,"brz").unwrap();if id=="red"{control=Some(input);}
        }
        world.configure_round(crate::alpha::Mode::Quickplay,true).unwrap();(world,control.unwrap())
    }
    #[test]
    fn passive_ultimate_advances_only_connected_living_simulation_and_ignores_packet_claims() {
        let (mut world, input) = two_team_round();
        input.send_replace(Some(serde_json::from_value(json!({"type":"input","seq":1,"dt":1000000.0,"throttle":0,"steer":0,"brake":1,"handbrake":0,"vehicleMask":1,"playerMask":0,"ultimate_fraction":1.0,"ultimate":1.0,"health":{"ultimate_fraction":1.0}})).unwrap()));
        for _ in 0..60 { world.tick(0.0); }
        let charge = world.physics.vehicles["red"].powertrain.ultimate_fraction;
        assert!((charge - 1.0/crate::powertrain::PASSIVE_ULTIMATE_SECONDS).abs() < 0.000001);
        assert_eq!(world.physics.vehicles["red"].throttle, 0.0);
        world.detach("red");
        let blue = world.physics.vehicles["blue"].powertrain.ultimate_fraction;
        for _ in 0..60 { world.tick(0.0); }
        assert_eq!(world.physics.vehicles["red"].powertrain.ultimate_fraction, charge);
        assert!(world.physics.vehicles["blue"].powertrain.ultimate_fraction > blue);
        world.physics.vehicle_health.get_mut("blue").unwrap().spawn_protection_s=0.0;
        world.physics.damage_vehicle("blue", None, 9999.0, "impact");
        let downed = world.physics.vehicles["blue"].powertrain.ultimate_fraction;
        for _ in 0..60 { world.tick(0.0); }
        assert_eq!(world.physics.vehicles["blue"].powertrain.ultimate_fraction, downed);
        world.detach("blue");
        world.tick(999999.0);
        assert_eq!(world.physics.vehicles["red"].powertrain.ultimate_fraction, charge);
        assert_eq!(world.physics.vehicles["blue"].powertrain.ultimate_fraction, downed);
    }
    #[test]
    fn ctf_first_entrant_can_collect_during_waiting_without_producing_result() {
        let(mut world,_input)=two_team_round();world.leave("blue");
        let flag=world.round.as_ref().unwrap().flags[1].base;
        let body=world.physics.vehicles["red"].body;
        world.physics.bodies[body].set_translation(rapier3d::prelude::Vector::new(flag[0],flag[1]+0.3,flag[2]),true);
        world.tick(0.0);
        let view=world.game.match_state.as_ref().unwrap();
        assert_eq!(view.phase,crate::ctf::CtfPhase::Waiting);assert_eq!(view.flags[1].carrier.as_deref(),Some("red"));
        assert_eq!(view.elapsed_s,0.0);assert_eq!(view.scores.red,0);assert!(world.take_round_completion().is_none());
        world.leave("red");world.tick(0.0);assert_eq!(world.game.match_state.as_ref().unwrap().flags[1].status,crate::ctf::FlagStatus::Dropped);
    }
    #[test]
    fn ctf_empty_fuel_disables_actual_carrier_and_drops_flag_at_last_grounded_point() {
        for scored in [false,true] {
            let(mut world,_input)=two_team_round();
            if scored{world.start_round().unwrap();}else{world.leave("blue");}
            let flag=world.round.as_ref().unwrap().flags[1].base;
            let body=world.physics.vehicles["red"].body;
            if let Some(blue)=world.physics.vehicles.get("blue") {
                world.physics.bodies[blue.body].set_translation(rapier3d::prelude::Vector::new(flag[0],flag[1]+0.3,flag[2]+20.0),true);
            }
            world.physics.bodies[body].set_translation(rapier3d::prelude::Vector::new(flag[0],flag[1]+0.3,flag[2]),true);
            // Let the actual suspension settle at the objective; the first
            // teleport step is deliberately rejected by the scored rules.
            for _ in 0..90{world.tick(0.0);}
            assert_eq!(world.round.as_ref().unwrap().flags[1].carrier.as_deref(),Some("red"));
            assert!(world.physics.wheels[&body].iter().any(|wheel|wheel.grounded));
            let point=*world.physics.bodies[body].translation();
            world.physics.vehicles.get_mut("red").unwrap().powertrain.fuel_liters=0.0;
            world.tick(0.0);
            let health=&world.physics.vehicle_health["red"];
            assert!(health.defeated);assert_eq!(health.disabled_reason,"fuel");assert_eq!(health.deaths,0);
            assert!(health.respawn_remaining_s>0.0);
            let flag=&world.game.match_state.as_ref().unwrap().flags[1];
            assert_eq!(flag.status,crate::ctf::FlagStatus::Dropped);assert!(flag.carrier.is_none());
            assert!(!world.physics.ctf_carriers.contains("red"));
            let drop=rapier3d::prelude::Vector::new(flag.position[0],flag.position[1],flag.position[2]);
            assert!((drop-point).norm()<0.05,"fuel recovery drops at the last grounded point");
            assert!(world.take_round_completion().is_none());
        }
    }
    #[test]
    fn ctf_actual_start_clears_warmup_scores_resources_and_held_controls() {
        let(mut world,input)=two_team_round();
        world.physics.vehicle_health.get_mut("red").unwrap().kills=9;
        world.physics.vehicles.get_mut("red").unwrap().powertrain.fuel_liters=1.0;
        world.physics.vehicles.get_mut("red").unwrap().powertrain.ultimate_fraction=0.8;
        input.send_replace(Some(serde_json::from_value(json!({"type":"input","seq":1,"dt":1.0/60.0,"throttle":1,"steer":1,"brake":0,"handbrake":0,"vehicleMask":1,"playerMask":0})).unwrap()));
        world.game.collect_input_packets();assert!(world.game.entities["red"].last_packet.is_some());
        world.start_round().unwrap();assert_eq!(world.physics.vehicles["red"].powertrain.ultimate_fraction,0.0);world.tick(0.0);
        assert!((world.physics.vehicles["red"].powertrain.ultimate_fraction-SIMULATION_DT/crate::powertrain::PASSIVE_ULTIMATE_SECONDS).abs()<0.000001);
        assert_eq!(world.physics.vehicle_health["red"].kills,0);assert!(world.physics.vehicles["red"].powertrain.fuel_liters>10.0);
        assert!(world.game.entities["red"].last_packet.is_none());assert_eq!(world.physics.vehicles["red"].throttle,0.0);
        assert_eq!(world.game.match_state.as_ref().unwrap().phase,crate::ctf::CtfPhase::Running);
    }
    #[test]
    fn ctf_one_frozen_completion_keeps_departed_participants_and_can_retry() {
        let(mut world,_input)=two_team_round();world.start_round().unwrap();
        world.physics.vehicle_health.get_mut("red").unwrap().kills=2;world.leave("red");
        world.round.as_mut().unwrap().duration_s=SIMULATION_DT;world.tick(0.0);
        let event=world.take_round_completion().unwrap();assert_eq!(event.result.winner,None);assert_eq!(event.players.len(),2);
        assert_eq!(event.players.iter().find(|p|p.player_id=="red").unwrap().health.kills,2);
        assert!(world.take_round_completion().is_none());world.restore_round_completion(event.clone());
        assert_eq!(world.take_round_completion().unwrap().result.match_id,event.result.match_id);
        world.physics.vehicle_health.get_mut("blue").unwrap().kills=100;world.tick(0.0);assert!(world.take_round_completion().is_none());
    }
    #[test]
    fn ctf_carrier_penalty_uses_validated_actual_damage_once() {
        let(mut world,_input)=two_team_round();world.start_round().unwrap();
        world.physics.ctf_carriers.insert("blue".into());world.physics.vehicle_health.get_mut("blue").unwrap().spawn_protection_s=0.0;
        assert!(!world.physics.damage_vehicle("blue",Some("red"),100.0,"cannon"));
        assert!((world.physics.vehicle_health["blue"].hp-380.0).abs()<0.001);
        assert!((world.physics.vehicle_health["red"].stats.damage_dealt-120.0).abs()<0.001);
        assert!(!world.physics.damage_vehicle("red",Some("red"),100.0,"cannon"));assert_eq!(world.physics.vehicle_health["red"].hp,500.0);
    }
    #[test]
    fn defeated_cached_input_never_replays_after_respawn() {
        let mut world=WorldRuntime::new(1,"road_precision").unwrap();
        let (tx,_rx)=tokio::sync::mpsc::unbounded_channel();
        let (frame,_frames)=watch::channel(None);let (input,inputs)=watch::channel(None);
        world.join("driver",tx,frame,inputs,None,10);world.spawn("driver","tank").unwrap();
        input.send_replace(Some(serde_json::from_value(json!({"type":"input","seq":1,"dt":1.0/60.0,"throttle":1,"steer":1,"brake":0,"handbrake":0,"vehicleMask":1,"playerMask":0,"combat":{"enabled":true,"fire":true,"ram":true,"yaw":3.14159}})).unwrap()));
        world.physics.vehicle_health.get_mut("driver").unwrap().spawn_protection_s=0.0;
        assert!(world.physics.damage_vehicle("driver",None,9999.0,"impact"));
        for _ in 0..((crate::vehicle_health::RESPAWN_SECONDS / SIMULATION_DT).ceil() as usize + 30) {world.tick(0.0);}
        assert!(!world.physics.vehicle_health["driver"].defeated);
        assert!(world.game.entities["driver"].last_packet.is_none());
        assert_eq!(world.physics.vehicles["driver"].throttle,0.0);
        assert_eq!(world.physics.vehicles["driver"].steer,0.0);
        assert_eq!(world.physics.vehicles["driver"].ram.cooldown,0.0);
        assert!(!world.physics.combat_poses.get("driver").is_some_and(|c|c.fire||c.shot>0));
        input.send_replace(Some(serde_json::from_value(json!({"type":"input","seq":2,"dt":1.0/60.0,"throttle":1,"steer":0,"brake":0,"handbrake":0,"vehicleMask":1,"playerMask":0})).unwrap()));
        world.tick(0.0);assert_eq!(world.physics.vehicles["driver"].throttle,1.0);
    }
    #[test]
    fn ten_city_players_can_spawn_without_waiting_for_parked_cars_to_move() {
        let mut world = WorldRuntime::new(1, "streaming_endless_city").unwrap();
        for index in 0..10 {
            let id = format!("city-{index}");
            let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
            let (frame, _frames) = watch::channel(None);
            let (_input, inputs) = watch::channel(None);
            world.join(&id, tx, frame, inputs, None, 10);
            world.spawn(&id, "brz").unwrap();
        }
        assert_eq!(world.physics.vehicles.len(), 10);
    }
    #[test]
    fn each_world_has_independent_bodies_frames_and_cleanup() {
        let mut a = WorldRuntime::new(1, "road_precision").unwrap();
        let mut b = WorldRuntime::new(2, "road_jump_lab").unwrap();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let (fa, ra) = watch::channel(None);
        let (fb, rb) = watch::channel(None);
        let (_input, ri) = watch::channel(None);
        a.join("a", tx.clone(), fa, ri.clone(), None, 10);
        b.join("b", tx, fb, ri, None, 10);
        a.spawn("a", "brz").unwrap();
        b.spawn("b", "brz").unwrap();
        a.tick(0.0);
        b.tick(0.0);
        let one: serde_json::Value =
            serde_json::from_str(&ra.borrow().as_ref().unwrap().snapshot).unwrap();
        let two: serde_json::Value =
            serde_json::from_str(&rb.borrow().as_ref().unwrap().snapshot).unwrap();
        assert_eq!(one["world_id"], 1);
        assert_eq!(two["world_id"], 2);
        assert_eq!(one["data"]["entities"][0]["id"], "a");
        assert_eq!(two["data"]["entities"][0]["id"], "b");
        a.leave("a");
        assert!(a.physics.vehicles.is_empty());
        assert_eq!(b.physics.vehicles.len(), 1);
    }
}
