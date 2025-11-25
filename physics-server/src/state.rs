// src/state.rs

use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use tokio::sync::mpsc::UnboundedSender;
use rapier3d::prelude::{RigidBodyHandle, RigidBodySet};
use uuid::Uuid;
// use crate::state::ClientTx;


pub type ClientTx = UnboundedSender<String>;


#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntityType {
    Vehicle,
    Drone,
    Helicopter,
    Jet,
    Boat,
    Ship,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Axes {
    pub throttle: f32,
    pub steer: f32,
    pub ascend: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub roll: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityInput {
    pub tick: u64,
    pub axes: Axes,
}

pub struct Entity {
    pub id: String,
    pub kind: EntityType,
    pub body_handle: RigidBodyHandle,
    pub last_input: Option<EntityInput>,
}

#[derive(Serialize)]
pub struct PlayerSnapshot {
    pub id: String,
    pub kind: EntityType,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Serialize)]
pub struct Snapshot {
    pub tick: u64,
    pub players: Vec<PlayerSnapshot>,
}

pub struct SharedGameState {
    pub tick: u64,
    pub clients: Vec<ClientTx>,
    pub entities: HashMap<String, Entity>,
}

impl SharedGameState {

    pub fn register_client(&mut self, tx: ClientTx) {
        self.clients.push(tx);
    }


    pub fn new() -> Self {
        Self {
            tick: 0,
            clients: Vec::new(),
            entities: HashMap::new(),
        }
    }

    pub fn attach_body(&mut self, id: &str, handle: RigidBodyHandle) {
        if let Some(entity) = self.entities.get_mut(id) {
            entity.body_handle = handle;
        }
    }


    /// Create a new entity (vehicle / drone / jet / boat / etc.)
    pub fn add_entity(&mut self, kind: EntityType) -> String {
        let id = Uuid::new_v4().to_string();
        self.entities.insert(
            id.clone(),
            Entity {
                id: id.clone(),
                kind,
                body_handle: RigidBodyHandle::invalid(),
                last_input: None,
            },
        );
        id
    }

    pub fn update_input(&mut self, id: &str, axes: Axes, tick: u64) {
        if let Some(entity) = self.entities.get_mut(id) {
            entity.last_input = Some(EntityInput { tick, axes });
        }
    }

    pub fn remove_entity(&mut self, id: &str) {
        self.entities.remove(id);
    }

    /// Build and send a snapshot of all entities to all clients.
    pub fn broadcast_snapshot(&self, bodies: &RigidBodySet) {
        let mut players = Vec::with_capacity(self.entities.len());

        for entity in self.entities.values() {
            if let Some(body) = bodies.get(entity.body_handle) {
                let pos = body.translation();
                players.push(PlayerSnapshot {
                    id: entity.id.clone(),
                    kind: entity.kind,
                    x: pos.x,
                    y: pos.y,
                    z: pos.z,
                });
            }
        }

        if players.is_empty() {
            return;
        }

        let json = serde_json::to_string(&Snapshot {
            tick: self.tick,
            players,
        })
        .unwrap();

        for tx in &self.clients {
            let _ = tx.send(json.clone());
        }
    }
}
