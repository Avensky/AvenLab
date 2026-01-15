// ============================================================================
// state.rs — Authoritative Game State + Network Snapshot Layer
// ============================================================================
//
// Responsibilities:
// -----------------
// 1) Owns authoritative metadata about connected players / entities.
// 2) Tracks which WebSocket clients exist and where to send messages.
// 3) Builds compact JSON snapshots for frontend visualization.
// 4) Mirrors bitmasked vehicle/player state (NOT physics logic).
// 5) Exposes hooks for sending:
//      - per-tick physics snapshots
//      - one-time vehicle configuration payloads
//      - debug overlays
//
// Design Rules:
// -------------
// - PhysicsWorld owns all simulation state.
// - state.rs only *reads* physics state to build snapshots.
// - Input is handled elsewhere (net.rs → physics).
// - No gameplay logic lives here.
// - Everything sent over the wire must be deterministic and schema-stable.
//
// This file intentionally resembles a telemetry bus rather than a game engine.
// ============================================================================

use std::collections::HashMap;
use tokio::sync::mpsc::UnboundedSender;
use serde::{Serialize, Deserialize};
use serde_json::json;
use rapier3d::prelude::*;

use crate::physics::{PhysicsWorld, DebugOverlay};
use crate::spawn::{PlayerSpawnInfo, SpawnManager, Team};
use crate::vehicle::{Vehicle, VehicleConfig};
use crate::vehicle::VehicleStateFlags;

// ============================================================================
// Network Payloads (What the Frontend Sees)
// ============================================================================

// ---------------------------------------------------------------------------
// Per-entity physics snapshot (sent every tick)
// This mirrors what your frontend's PhysicsData expects.
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize)]
pub struct PhysicsEntitySnapshot {
    pub id: String,
    pub kind: String,
    pub room_id: usize,
    pub team: String,

    // --- Pose ---
    pub position: [f32; 3],
    pub rotation: [f32; 4], // quaternion [x,y,z,w]

    // --- Telemetry (per tick) ---
    pub speed: f32,          // m/s (planar or full magnitude)
    pub rpm: f32,            // engine RPM (from drivetrain model later)
    pub gear: i32,           // current gear
    pub fuel: f32,           // remaining fuel
    pub temp: f32,           // engine temperature
    pub engine_torque: f32,  // Nm or equivalent

    // --- Bitmasked state ---
    pub vehicle_mask: u16,
    pub player_mask: u16,
}

// ---------------------------------------------------------------------------
// Snapshot payload sent to all clients every tick.
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize)]
pub struct PhysicsSnapshot {
    pub tick: u64,
    pub entities: Vec<PhysicsEntitySnapshot>,
}

// ---------------------------------------------------------------------------
// One-time vehicle configuration payload.
// Sent when a vehicle is selected / spawned.
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize)]
pub struct VehicleConfigPayload {
    pub player_id: String,
    pub config: VehicleConfig,
}

// ============================================================================
// Server-Side Entity Metadata
// ============================================================================

#[derive(Debug, Clone)]
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
            EntityType::Vehicle     => "vehicle",
            EntityType::Drone       => "drone",
            EntityType::Helicopter  => "helicopter",
            EntityType::Jet         => "jet",
            EntityType::Boat        => "boat",
            EntityType::Ship        => "ship",
        }
    }
}

// ---------------------------------------------------------------------------
// Per-player metadata stored outside physics.
// ---------------------------------------------------------------------------
#[derive(Debug, Clone)]
pub struct EntityState {
    pub id: String,
    pub kind: EntityType,
    pub room_id: usize,
    pub team: Team,
    pub body_handle: RigidBodyHandle,
    pub last_packet: Option<InputPacket>,
}
// ============================================================================
// Player Input
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
pub struct InputPacket {
    pub r#type: String,
    pub seq: u32,
    pub dt: f32,
    
    pub throttle: f32,
    pub steer: f32,
    pub brake: f32,
    pub handbrake: f32,
    
    pub vehicleMask: u16,
    pub playerMask: u16,
}

// ============================================================================
// Shared Game State
// ============================================================================
pub struct SharedGameState {
    /// Authoritative simulation tick counter
    pub tick: u64,

    /// All connected entities keyed by player_id
    pub entities: HashMap<String, EntityState>,

    /// Spawn manager (rooms / teams / positions)
    pub spawns: SpawnManager,

    /// All connected WebSocket clients
    pub clients: HashMap<String, UnboundedSender<String>>,
}

impl SharedGameState {
    
    // ------------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------------
    pub fn new() -> Self {
        Self {
            tick: 0,
            entities: HashMap::new(),
            spawns: SpawnManager::new(10),
            clients: HashMap::new(),
        }
    }

    // ------------------------------------------------------------------------
    // Client Registration
    // Register a new client sender so we can push snapshots to it.
    // ------------------------------------------------------------------------
    pub fn register_client(&mut self, player_id: String, tx: UnboundedSender<String>) {
        self.clients.insert(player_id, tx);
        // self.clients.push(tx);
    }

    pub fn unregister_client(&mut self, player_id: &str) {
        self.clients.remove(player_id);
    }

    // ------------------------------------------------------------------------
    // Entity Management
    // Create an entity entry. net.rs calls this right after it decides
    // which EntityType this connection will be (Vehicle / Drone / etc).
    // ------------------------------------------------------------------------
    pub fn add_entity(&mut self, id: &str, kind: EntityType) {
        let ent = EntityState {
            id: id.to_string(),
            kind,
            room_id: 0, // overwritten later
            team: Team::Red, // overwritten later
            body_handle: RigidBodyHandle::invalid(),
            last_packet: None,
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

    pub fn remove_entity(&mut self, id: &str) { self.entities.remove(id);}

    // ------------------------------------------------------------------------
    // Network Send Helpers
    // ------------------------------------------------------------------------

    fn broadcast_json(&self, payload: serde_json::Value) {
        if self.clients.is_empty() { return; }

        let msg = payload.to_string();
        for (_id, tx) in self.clients.iter() {
            let _ = tx.send(msg.clone());
        }
    }

    // ------------------------------------------------------------------------
    // One-Time Vehicle Config Sync
    // Send vehicle configuration once when a vehicle is spawned / selected.
    // Frontend can cache this for UI, telemetry scaling, ML labels, etc.
    // ------------------------------------------------------------------------
    pub fn broadcast_vehicle_config(
        &self,
        player_id: &str,
        vehicle: &Vehicle,
    ) {
        let payload = json!({
            "type": "vehicle_config",
            "data": VehicleConfigPayload {
                player_id: player_id.to_string(),
                config: vehicle.config.clone(),
            }
        });

        self.broadcast_json(payload);
    }


    // ------------------------------------------------------------------------
    // Debug Overlay
    // ------------------------------------------------------------------------
    pub fn broadcast_debug_overlay(&mut self, overlay: &DebugOverlay) {
        let payload = json!({ "type": "debug", "data": overlay});
        self.broadcast_json(payload);
    }

    // ------------------------------------------------------------------------
    // Per-Tick Snapshot
    // Build and broadcast a physics snapshot from the PhysicsWorld:
    // - Reads rigid body pose from Rapier
    // - Reads telemetry from Vehicle structs
    // - Packs bitmasks (vehicle + player)
    // - Sends a compact deterministic payload to all clients
    // ------------------------------------------------------------------------
    pub fn broadcast_snapshot(&mut self, physics: &PhysicsWorld) {
        // If no clients, do nothing (saves work when menu/server idle)
        if self.clients.is_empty() { return; }
        let mut entities_out: Vec<PhysicsEntitySnapshot> = Vec::new();

        // let mut players_json = Vec::new();

        for ent in self.entities.values() {

            // Skip entities that don’t yet have a physics body
            if ent.body_handle == RigidBodyHandle::invalid() {
                println!("↪ entity {} has invalid body_handle, skipping", ent.id );
                continue;
            }

            let Some(body) = physics.bodies.get(ent.body_handle) else {
                println!("↪ entity {} has invalid body_handle, skipping", ent.id );
                continue;
            };

            let Some(player_id) = physics.body_to_player.get(&ent.body_handle) else {
                println!("↪ player_id {} has invalid body_handle, skipping", ent.id );
                continue;
            };

            let Some(vehicle) = physics.vehicles.get(player_id) else {
                println!("↪ vehicle {} has invalid body_handle, skipping", ent.id );
                continue;
            };


            // -----------------------------
            // Pose
            // -----------------------------
            let pos = body.translation();
            let rot = body.rotation();

            // -----------------------------
            // Telemetry
            // -----------------------------
            let linvel = body.linvel();
            let speed = (linvel.x * linvel.x + linvel.z * linvel.z).sqrt();

            // NOTE:
            // These fields should eventually come from drivetrain / engine model.
            // For now they can be placeholders or derived estimates.
            let rpm            = vehicle.rpm;             // add field when ready
            let gear           = vehicle.gear;            // add field when ready
            let fuel           = vehicle.fuel;            // add field when ready
            let temp           = vehicle.engine_temp;     // add field when ready
            let engine_torque  = vehicle.engine_torque;   // add field when ready

            entities_out.push(PhysicsEntitySnapshot {
                id: ent.id.clone(),
                kind: ent.kind.as_str().to_string(),
                room_id: ent.room_id,
                team: ent.team.as_str().to_string(),

                position: [pos.x, pos.y, pos.z],
                rotation: [rot.i, rot.j, rot.k, rot.w],

                speed,
                rpm,
                gear,
                fuel,
                temp,
                engine_torque,

                vehicle_mask: vehicle.vehicle_flags.bits(),
                player_mask: vehicle.player_flags,
            });    
        }

        let snapshot = PhysicsSnapshot {
            tick: self.tick,
            entities: entities_out,
        };

        let payload = json!({
            "type": "snapshot",
            "data": snapshot,
        });

        self.broadcast_json(payload);
    }
}

