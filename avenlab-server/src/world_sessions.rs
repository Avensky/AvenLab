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
use std::sync::Arc;
use tokio::sync::{mpsc::UnboundedSender, watch};

pub struct WorldRuntime {
    pub game: SharedGameState,
    pub physics: PhysicsWorld,
}
impl WorldRuntime {
    pub fn new(id: usize, map: &str) -> Result<Self, String> {
        let mut physics = PhysicsWorld::new();
        physics.select_map(map).map_err(|error| error.to_string())?;
        let mut game = SharedGameState::new();
        game.room_id = id;
        Ok(Self { game, physics })
    }
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
    pub fn leave(&mut self, id: &str) {
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
        if self.physics.vehicles.is_empty() {
            return 0;
        }
        let started = std::time::Instant::now();
        self.game.collect_input_packets();
        let mut debug = DebugFlags::NONE;
        for entity in self.game.entities.values() {
            if entity.body_handle == RigidBodyHandle::invalid() {
                continue;
            }
            if let Some(packet) = &entity.last_packet {
                debug |= DebugFlags::from_bits_truncate(packet.debug_mask.unwrap_or(0));
                self.physics
                    .apply_player_input_packet(&entity.id, packet.clone());
            }
        }
        self.physics.set_debug_flags(debug);
        let physics_started = std::time::Instant::now();
        self.physics.step(SIMULATION_DT);
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
