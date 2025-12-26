use std::collections::HashMap;

use rapier3d::prelude::*;
// use serde::Serialize;
use serde_json::json;
use crate::physics::DebugOverlay;
use crate::spawn::{PlayerSpawnInfo, SpawnManager, Team};

/// =======================
/// Player Input (from net)
/// =======================
#[derive(Debug, Clone)]
pub struct Axes {
    pub throttle: f32,
    pub steer: f32,
    pub brake: f32,
    pub ascend: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub roll: f32,
}

#[derive(Debug, Clone)]
pub struct EntityInput {
    pub axes: Axes,
}

/// =========================
/// Entity Type (server-side)
/// =========================
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum EntityType {
    Vehicle,
    Drone,
    Helicopter,
    Jet,
    Boat,
    Ship,
}

impl EntityType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EntityType::Vehicle => "vehicle",
            EntityType::Drone => "drone",
            EntityType::Helicopter => "helicopter",
            EntityType::Jet => "jet",
            EntityType::Boat => "boat",
            EntityType::Ship => "ship",
        }
    }
}

/// =========================
/// Entity State (Per-Player)
/// =========================
#[derive(Debug, Clone)]
pub struct EntityState {
    pub id: String,
    pub kind: EntityType,
    pub room_id: usize,
    pub team: Team,
    pub body_handle: RigidBodyHandle,
    pub last_input: Option<EntityInput>,
}




/// ================================
/// Shared Game State
/// ================================
pub struct SharedGameState {
    pub tick: u64,

    /// All active entities keyed by player_id
    pub entities: HashMap<String, EntityState>,

    /// Spawn manager (rooms / teams / positions)
    pub spawns: crate::spawn::SpawnManager,

    /// All connected WebSocket clients for this process
    pub clients: Vec<tokio::sync::mpsc::UnboundedSender<String>>,
    
}

impl SharedGameState {
    pub fn new() -> Self {
        Self {
            tick: 0,
            entities: HashMap::new(),
            spawns: SpawnManager::new(10),
            clients: Vec::new(),
        }
    }

    /// Register a new client sender so we can push snapshots to it.
    pub fn register_client(&mut self, tx: tokio::sync::mpsc::UnboundedSender<String>) {
        self.clients.push(tx);
    }

    /// Create an entity entry. net.rs calls this right after it decides
    /// which EntityType this connection will be (Vehicle / Drone / etc).
    pub fn add_entity(&mut self, id: &str, kind: EntityType) {
        let ent = EntityState {
            id: id.to_string(),
            kind,
            room_id: 0, // overwritten later
            team: Team::Red, // overwritten later
            body_handle: RigidBodyHandle::invalid(),
            last_input: None,
        };
        self.entities.insert(id.to_string(), ent);
    }

    /// Apply spawn info from the SpawnManager (room, team, position).
    /// We only store room/team here; the actual physics position was
    /// used when creating the Rapier body in physics.
    pub fn apply_spawn_info(&mut self, spawn: &PlayerSpawnInfo) {
        if let Some(ent) = self.entities.get_mut(&spawn.player_id) {
            ent.room_id = spawn.room_id;
            ent.team = spawn.team;
        } else {
            println!(
                "⚠ apply_spawn_info called for unknown player_id={}",
                spawn.player_id
            );
        }
    }

    /// Attach Rapier body handle once physics has created the rigid body.
    pub fn attach_body(&mut self, id: &str, handle: RigidBodyHandle) {
        if let Some(ent) = self.entities.get_mut(id) {
            ent.body_handle = handle;
            println!(
                "✅ Attached body {:?} to entity {} (team: {:?}, room: {})",
                handle, ent.id, ent.team, ent.room_id
            );
        } else {
            println!("⚠ attach_body called for unknown entity id={}", id);
        }
    }


    /// Store the latest input from a player. Physics loop will read this
    /// every tick in main.rs and apply forces.
    // pub fn update_input(&mut self, id: &str, axes: Axes) {
    //     if let Some(ent) = self.entities.get_mut(id) {
    //         ent.last_input = Some(EntityInput { axes });
    //     }
    // }

    /// Remove an entity when the player disconnects.
    pub fn remove_entity(&mut self, id: &str) {
        self.entities.remove(id);
    }


    pub fn broadcast_debug_overlay(&mut self, overlay: &DebugOverlay) {
        if self.clients.is_empty() {
            return;
        }

        let payload = json!({
            "type": "debug",
            "data": overlay
        });

        let msg = payload.to_string();

        // for tx in self.clients.iter() {
        //     let _ = tx.send(msg.clone());
        // }
        
        for tx in &self.clients {
            let _ = tx.send(msg.clone());
        }
    }

    pub fn broadcast_snapshot(&mut self, bodies: &RigidBodySet) {
        // If no clients, do nothing (saves work when menu/server idle)
        if self.clients.is_empty() {
            return;
        }
        // println!("📤 Broadcasting snapshot for tick {}", self.tick);
        // println!(
        //     "   clients: {}, entities: {}",
        //     self.clients.len(),
        //     self.entities.len()
        // );
        
                // Build the players array for this snapshot
        let mut players_json = Vec::new();

        for ent in self.entities.values() {
            // Skip entities that don’t yet have a physics body
            if ent.body_handle == RigidBodyHandle::invalid() {
                println!(
                    "   ↪ entity {} has invalid body_handle, skipping",
                    ent.id
                );
                continue;
            }

            // Look up the Rapier body
            if let Some(body) = bodies.get(ent.body_handle) {
                let pos = body.translation();
                // println!(
                //     "   ↪ entity {} @ ({:.2}, {:.2}, {:.2})",
                //     ent.id, pos.x, pos.y, pos.z
                // );

                players_json.push(json!({
                    "id": ent.id,
                    "kind": ent.kind.as_str(),
                    "room_id": ent.room_id,
                    "team": ent.team.as_str(),
                    "x": pos.x,
                    "y": pos.y,
                    "z": pos.z,
                }));
            } else {
                println!(
                    "   ⚠ body not found in RigidBodySet for entity {} handle {:?}",
                    ent.id, ent.body_handle
                );
            }
        }

        // Build final payload with a top-level "type"
        let payload = json!({
            "type": "snapshot",
            "data": {
                "tick": self.tick,
                "players": players_json,
            }
        });

        let json = payload.to_string();
        // println!("   Snapshot payload: {}", json);

        // Send to all registered clients
        for (_i, tx) in self.clients.iter().enumerate() {
            match tx.send(json.clone()) {
                Ok(_) => {
                    // println!(
                    //     "   ✅ sent snapshot for tick {} to client #{}",
                    //     self.tick, i
                    // );
                }
                Err(_e) => {
                    // println!(
                    //     "   ❌ failed to send snapshot to client #{}: {}",
                    //     i, e
                    // );
                }
            }
        }
    }
}

