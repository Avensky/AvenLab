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
// - net.rs publishes held input; main samples it once per simulation tick.
// - No gameplay logic lives here.
// - Everything sent over the wire must be deterministic and schema-stable.
//
// This file intentionally resembles a telemetry bus rather than a game engine.
// ============================================================================

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc::UnboundedSender, watch};
use serde::{Serialize, Deserialize};
use serde_json::json;
use rapier3d::prelude::*;

use crate::physics::{PhysicsWorld, SIMULATION_DT, SIMULATION_HZ};
use crate::spawn::{PlayerSpawnInfo, SpawnManager, Team};
use crate::vehicle_state::{Vehicle, VehicleConfig, PhysicsWheelSnapshot};
use crate::powertrain::HudCalibration;
// ============================================================================
// Network Payloads (What the Frontend Sees)
// ============================================================================

// ---------------------------------------------------------------------------
// Per-entity physics snapshot (sent every tick)
// This mirrors what your frontend's PhysicsData expects.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct VehicleColliderShape {
    // Stable import reference; never derived from moving suspension poses.
    pub nominal_wheel_center_y: f32,
    pub chassis_half_extents: [f32; 3],
    pub chassis_offset: [f32; 3],
    pub wheel_radius: f32,
    pub wheel_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct PhysicsEntitySnapshot {
    // Collider preview metadata is independent of expensive force diagnostics.
    pub collider: VehicleColliderShape,
    pub id: String,
    pub kind: String,
    /// Canonical model id selected at spawn (ae86, brz, camaro, supra, ...).
    pub vehicle_id: Option<String>,
    pub room_id: usize,
    pub team: String,

    // --- Pose ---
    pub position: [f32; 3],
    pub rotation: [f32; 4], // quaternion [x,y,z,w]

    // --- Telemetry (per tick) ---
    pub speed: f32,          // m/s (planar or full magnitude)
    pub rpm: f32,            // engine RPM, server-owned automatic driveline
    pub gear: i32,           // current gear
    pub fuel: f32,           // remaining fuel
    pub temp: f32,           // engine temperature
    pub engine_torque: f32,  // Nm or equivalent
    pub condition: f32,      // 0..1 mechanical/body condition; 1 = healthy
    pub ultimate_fraction: f32, // 0..1, earned by actual damage dealt to other vehicles
    pub boost_fraction: Option<f32>, // 0..1; None when no NOS is fitted
    pub resource_mask: u16,  // cranking/heat/fuel/damage status bits
    pub cockpit_mask: u32,
    pub parking_brake: f32, // confirmed cable fraction, excluding transmission P
    pub cabin_mask: u32,
    pub cruise_target_kph: Option<f32>,
    pub cluster_mask: u16,

    // --- Bitmasked state ---
    pub vehicle_mask: u16,
    pub player_mask: u16,
    /// Latest held input sampled for this completed simulation tick. This
    /// acknowledgement measures command delivery without changing physics dt.
    pub last_input_seq: Option<u32>,

    pub wheels: Option<Vec<PhysicsWheelSnapshot>>,
}

// ---------------------------------------------------------------------------
// Snapshot payload sent to all clients every tick.
// ---------------------------------------------------------------------------
#[derive(Debug, Default, Clone, Serialize)]
pub struct ServerTiming {
    pub lock_ms: f64,
    pub physics_ms: f64,
    // Tick work before serialization/socket send, measured on the server clock.
    pub work_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PhysicsSnapshot {
    pub server_timing: ServerTiming,
    pub tick: u64,
    // Simulation time is independent of socket arrival time. Clients may use
    // these additive fields, or tick / 60, for one shared interpolation clock.
    pub simulation_time_s: f64,
    pub tick_dt_s: f32,
    pub entities: Vec<PhysicsEntitySnapshot>,
}

/// An internal pair of existing wire messages, sampled from one completed tick.
/// watch keeps ONE unsent pair per client. Already written TCP bytes cannot be
/// recalled, but we no longer add every old physics tick to an application FIFO.
#[derive(Debug)]
pub struct PhysicsFrame {
    pub snapshot: String,
    pub debug: String,
}

// ---------------------------------------------------------------------------
// One-time vehicle configuration payload.
// Sent when a vehicle is selected / spawned.
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Serialize)]
pub struct VehicleConfigPayload {
    pub player_id: String,
    pub config: VehicleConfigWithHud,
}
#[derive(Debug, Clone, Serialize)]
pub struct VehicleConfigWithHud {
    #[serde(flatten)]
    pub physics: VehicleConfig,
    pub hud: HudCalibration,
}
impl VehicleConfigPayload {
    pub fn new(player_id: &str, config: VehicleConfig) -> Self {
        Self { player_id: player_id.to_string(), config: VehicleConfigWithHud { physics: config, hud: config.resources.hud() } }
    }
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
    /// Selected model id used by every client to render this entity.
    pub vehicle_id: Option<String>,
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
    pub dt: f32, // client timing metadata; never used as authoritative physics dt

    pub throttle: f32,
    pub steer: f32,
    pub brake: f32,
    pub handbrake: f32, // momentary rear-axle cable brake

    #[serde(default)]
    pub cockpit_mask: Option<u32>,
    #[serde(default)]
    pub parking_brake: Option<f32>, // v7 latched cable state; independent of the packed command
    #[serde(default)]
    pub cabin_mask: Option<u32>,

    pub vehicleMask: u16,
    pub playerMask: u16,

    #[serde(default)]
    pub debug_mask: Option<u32>,
}

// ============================================================================
// Shared Game State
// ============================================================================
pub struct SharedGameState {
    /// Authoritative simulation tick counter
    pub tick: u64,
    pub server_timing: ServerTiming,

    /// All connected entities keyed by player_id
    pub entities: HashMap<String, EntityState>,

    /// Spawn manager (rooms / teams / positions)
    pub spawns: SpawnManager,

    /// Reliable, infrequent setup/config/pong messages. Never queue physics here.
    pub clients: HashMap<String, UnboundedSender<String>>,
    /// Replaceable physics/debug pair. Slow clients consume the newest tick.
    frame_clients: HashMap<String, watch::Sender<Option<Arc<PhysicsFrame>>>>,
    /// One newest held-control packet per connection, not a FIFO of old intent.
    input_clients: HashMap<String, watch::Receiver<Option<InputPacket>>>,
}

impl SharedGameState {

    // ------------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------------
    pub fn new() -> Self {
        Self {
            tick: 0,
            server_timing: ServerTiming::default(),
            entities: HashMap::new(),
            spawns: SpawnManager::new(10),
            clients: HashMap::new(),
            frame_clients: HashMap::new(),
            input_clients: HashMap::new(),
        }
    }

    // ------------------------------------------------------------------------
    // Client Registration
    // Register a new client sender so we can push snapshots to it.
    // ------------------------------------------------------------------------
    pub fn register_client(
        &mut self,
        player_id: String,
        tx: UnboundedSender<String>,
        frame_tx: watch::Sender<Option<Arc<PhysicsFrame>>>,
        input_rx: watch::Receiver<Option<InputPacket>>,
    ) {
        self.input_clients.insert(player_id.clone(), input_rx);
        self.frame_clients.insert(player_id.clone(), frame_tx);
        self.clients.insert(player_id, tx);
    }

    pub fn unregister_client(&mut self, player_id: &str) {
        self.clients.remove(player_id);
        self.frame_clients.remove(player_id);
        self.input_clients.remove(player_id);
    }

    /// Sample each mailbox before applying controls. Drop the watch borrow
    /// after cloning so receiving input never waits on a physics step or send.
    pub fn collect_input_packets(&mut self) {
        for (id, receiver) in &mut self.input_clients {
            let packet = { receiver.borrow_and_update().clone() };
            if let (Some(entity), Some(packet)) = (self.entities.get_mut(id), packet) {
                entity.last_packet = Some(packet);
            }
        }
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
            vehicle_id: None,
            room_id: 0, // overwritten later
            team: Team::Red, // overwritten later
            body_handle: RigidBodyHandle::invalid(),
            last_packet: None,
        };
        self.entities.insert(id.to_string(), ent);
    }

    /// Apply spawn info from the SpawnManager (room, team, position).
    /// We only store room/team here. The map team_spawns and vehicle geometry
    /// own the physics position; the legacy SpawnManager position is unused.
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

    /// Store the authoritative vehicle model selected during spawning.
    pub fn set_vehicle_id(&mut self, id: &str, vehicle_id: &str) {
        if let Some(ent) = self.entities.get_mut(id) {
            ent.vehicle_id = Some(vehicle_id.trim().to_ascii_lowercase());
        } else {
            println!("⚠ set_vehicle_id called for unknown entity id={}", id);
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
            "data": VehicleConfigPayload::new(player_id, vehicle.config)
        });

        self.broadcast_json(payload);
    }


    // ------------------------------------------------------------------------
    // Completed physics/debug frame publication
    // ------------------------------------------------------------------------
    pub fn publish_physics_frame(&self, physics: &PhysicsWorld) -> usize {
        if self.frame_clients.is_empty() { return 0; }
        let wants_debug = |id: &String| self.entities.get(id)
            .and_then(|entity| entity.last_packet.as_ref())
            .and_then(|packet| packet.debug_mask).unwrap_or(0) != 0;
        let any_debug = self.frame_clients.keys().any(wants_debug);
        // Serialize diagnostics only when requested. Collider previews use normal
        // pose/shape snapshots and static map metadata instead of this stream.
        let frame = Arc::new(PhysicsFrame {
            snapshot: json!({ "type": "snapshot", "data": self.build_snapshot(physics) }).to_string(),
            debug: if any_debug {
                json!({ "type": "debug", "tick": self.tick, "data": &physics.debug_overlay }).to_string()
            } else { String::new() },
        });
        // One client's diagnostics must not add JSON/traffic to everybody else.
        // Share one quiet frame across all clients with diagnostics disabled.
        let quiet = if any_debug { Arc::new(PhysicsFrame {
            snapshot: frame.snapshot.clone(), debug: String::new(),
        }) } else { Arc::clone(&frame) };
        for (id, tx) in &self.frame_clients {
            let selected = if wants_debug(id) { &frame } else { &quiet };
            let _ = tx.send_replace(Some(Arc::clone(selected)));
        }
        frame.snapshot.len() + frame.debug.len()
    }

    // ------------------------------------------------------------------------
    // Per-Tick Snapshot
    // Build a snapshot from the completed PhysicsWorld (publication is above):
    // - Reads rigid body pose from Rapier
    // - Reads telemetry from Vehicle structs
    // - Packs bitmasks (vehicle + player)
    // - Returns data without altering physics or writing to sockets
    // ------------------------------------------------------------------------


    fn build_snapshot(&self, physics: &PhysicsWorld) -> PhysicsSnapshot {
        // PhysicsWorld owns the single wheel-ID mapping and final wheel poses.
        // This function reads them; it never steers, spins or raycasts again.
        let mut entities_out: Vec<PhysicsEntitySnapshot> = Vec::new();


        for ent in self.entities.values() {

            // Connected but still on the setup screen.
            if ent.body_handle == RigidBodyHandle::invalid() {
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

            let rpm            = vehicle.powertrain.rpm;
            let gear           = vehicle.powertrain.gear;
            let fuel           = vehicle.powertrain.fuel_liters;
            let temp           = vehicle.powertrain.temperature_c;
            let engine_torque  = vehicle.powertrain.engine_torque_nm;

            let wheels_snapshot = Some(
                physics.wheel_snapshots_for_body(ent.body_handle, vehicle.steer_angle)
            );

            entities_out.push(PhysicsEntitySnapshot {
                condition: vehicle.powertrain.condition,
                ultimate_fraction: vehicle.powertrain.ultimate_fraction,
                boost_fraction: vehicle.powertrain.boost_fraction(vehicle.config.resources),
                resource_mask: vehicle.powertrain.resource_mask(vehicle.config.resources),
                cockpit_mask: vehicle.cockpit.snapshot(),
                parking_brake: vehicle.cockpit.parking_fraction,
                cabin_mask: vehicle.cockpit.cabin_snapshot(vehicle.powertrain.running,vehicle.powertrain.engine_requested),
                cruise_target_kph: vehicle.cockpit.cruise_target_kph(),
                cluster_mask: vehicle.cockpit.cluster_mask(vehicle.handbrake),
                collider: VehicleColliderShape {
                    nominal_wheel_center_y: vehicle.config.nominal_wheel_center_y(),
                    chassis_half_extents: vehicle.config.chassis_half_extents,
                    chassis_offset: vehicle.config.chassis_com_offset,
                    wheel_radius: vehicle.config.wheel_radius,
                    wheel_count: vehicle.config.wheels,
                },

                id: ent.id.clone(),
                kind: ent.kind.as_str().to_string(),
                vehicle_id: ent.vehicle_id.clone(),
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
                last_input_seq: ent.last_packet.as_ref().map(|packet| packet.seq),

                wheels: wheels_snapshot,
            });
        }

        // Stable entity order prevents index-based renderers from changing order
        // just because a HashMap iteration order changed after a join/disconnect.
        entities_out.sort_by(|a, b| a.id.cmp(&b.id));
        PhysicsSnapshot {
            server_timing: self.server_timing.clone(),
            tick: self.tick,
            simulation_time_s: self.tick as f64 / SIMULATION_HZ,
            tick_dt_s: SIMULATION_DT,
            entities: entities_out,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_calibration_advertises_only_supported_resource_readings() {
        use crate::vehicle_setup::{BRZ, TANK};
        let config = serde_json::to_value(VehicleConfigPayload::new("driver", BRZ)).unwrap();
        assert_eq!(config["config"]["hud"]["telemetry_mask"], 127);
        assert_eq!(config["config"]["hud"]["cockpit_version"], 7);
        assert_eq!(config["config"]["hud"]["fuel_capacity_liters"], 50.0);
        assert_eq!(config["config"]["max_speed"], BRZ.max_speed);
        assert!(config["config"].get("resources").is_none(), "server tuning is not a repeated HUD payload");
        let tank = serde_json::to_value(VehicleConfigPayload::new("driver", TANK)).unwrap();
        assert_eq!(tank["config"]["hud"]["telemetry_mask"], 111);
    }

    #[test]
    fn a_stalled_client_gets_the_latest_complete_frame_and_keeps_setup_messages() {
        let mut game = SharedGameState::new();
        let physics = PhysicsWorld::new();
        let (reliable_tx, mut reliable_rx) = tokio::sync::mpsc::unbounded_channel();
        let (frame_tx, mut frame_rx) = watch::channel(None);
        let (_input_tx, input_rx) = watch::channel(None);
        reliable_tx.send("welcome".into()).unwrap();
        game.register_client("slow".into(), reliable_tx, frame_tx, input_rx);

        // Do not consume any physics until the producer has advanced 120 ticks.
        for tick in 1..=120 {
            game.tick = tick;
            game.publish_physics_frame(&physics);
        }
        let frame = frame_rx.borrow_and_update().clone().unwrap();
        let snapshot: serde_json::Value = serde_json::from_str(&frame.snapshot).unwrap();
        assert_eq!(snapshot["data"]["tick"], 120);
        assert!(frame.debug.is_empty());
        assert_eq!(snapshot["data"]["simulation_time_s"], 2.0);
        assert_eq!(reliable_rx.try_recv().unwrap(), "welcome");
        assert!(reliable_rx.try_recv().is_err());
        game.unregister_client("slow");
        assert!(game.frame_clients.is_empty());
        assert!(game.input_clients.is_empty());
    }

    #[test]
    fn diagnostics_are_opt_in_per_client_and_keep_the_completed_tick() {
        let mut game = SharedGameState::new();
        let physics = PhysicsWorld::new();
        let mut receivers = Vec::new();
        for (id, mask) in [("quiet", 0), ("debug", 1)] {
            let (reliable_tx, _reliable_rx) = tokio::sync::mpsc::unbounded_channel();
            let (frame_tx, frame_rx) = watch::channel(None);
            let (input_tx, input_rx) = watch::channel(None);
            game.register_client(id.into(), reliable_tx, frame_tx, input_rx);
            game.add_entity(id, EntityType::Vehicle);
            input_tx.send_replace(Some(InputPacket {
                r#type: "input".into(), seq: 1, dt: 1.0 / 60.0,
                throttle: 0.0, steer: 0.0, brake: 0.0, handbrake: 0.0, cockpit_mask: None,  parking_brake:None, cabin_mask: None,
                vehicleMask: 0, playerMask: 0, debug_mask: Some(mask),
            }));
            game.collect_input_packets();
            receivers.push(frame_rx);
        }
        game.tick = 7;
        game.publish_physics_frame(&physics);
        let quiet = receivers[0].borrow().clone().unwrap();
        let debug = receivers[1].borrow().clone().unwrap();
        assert!(quiet.debug.is_empty());
        assert_eq!(quiet.snapshot, debug.snapshot);
        let envelope: serde_json::Value = serde_json::from_str(&debug.debug).unwrap();
        assert_eq!(envelope["tick"], 7);
    }

    #[test]
    fn input_mailbox_samples_the_newest_controls_without_replaying_backlog() {
        let mut game = SharedGameState::new();
        let (reliable_tx, _reliable_rx) = tokio::sync::mpsc::unbounded_channel();
        let (frame_tx, _frame_rx) = watch::channel(None);
        let (input_tx, input_rx) = watch::channel(None);
        game.register_client("driver".into(), reliable_tx, frame_tx, input_rx);
        game.add_entity("driver", EntityType::Vehicle);
        for seq in 0..120 {
            input_tx.send_replace(Some(InputPacket {
                r#type: "input".into(), seq, dt: 1.0 / 60.0,
                throttle: if seq == 119 { 0.0 } else { 1.0 },
                steer: 0.0, brake: if seq == 119 { 1.0 } else { 0.0 },
                handbrake: 0.0, cockpit_mask: None,  parking_brake:None, cabin_mask: None, vehicleMask: 97, playerMask: 0, debug_mask: Some(0),
            }));
        }
        game.collect_input_packets();
        let packet = game.entities["driver"].last_packet.as_ref().unwrap();
        assert_eq!(packet.seq, 119);
        assert_eq!(packet.throttle, 0.0);
        assert_eq!(packet.brake, 1.0);
        game.collect_input_packets();
        assert_eq!(game.entities["driver"].last_packet.as_ref().unwrap().seq, 119);
        game.unregister_client("driver");
        assert!(game.input_clients.is_empty());
    }
}

