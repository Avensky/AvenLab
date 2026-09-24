use std::sync::Arc;
use uuid::Uuid;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, mpsc}; 
use futures::{StreamExt, SinkExt};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use serde::Deserialize;
use serde_json::Value;
use crate::state::{SharedGameState, EntityType, InputPacket};
use crate::physics::PhysicsWorld;
use crate::vehicle_debug::DebugFlags;

// The sandbox has ten verified spawn slots: five red and five blue.
// Enforce the limit on the authoritative server, not in the renderer.
const MAX_SANDBOX_PLAYERS: usize = 10;

#[derive(Debug, Deserialize)]
struct SpawnRequest {
    vehicle: String,
    map: String,
}

pub async fn start_websocket_server(
    state: Arc<Mutex<SharedGameState>>,
    physics: Arc<Mutex<PhysicsWorld>>,
) {
    let listener = TcpListener::bind("0.0.0.0:9001")
        .await
        .expect("Failed to bind WebSocket port");

    println!("🌐 WebSocket listening on ws://localhost:9001");

    while let Ok((raw_stream, _addr)) = listener.accept().await {

        // let (raw_stream, _) = listener.accept().await.unwrap();
        let state_clone: Arc<Mutex<SharedGameState>> = Arc::clone(&state);
        let physics_clone: Arc<Mutex<PhysicsWorld>> = Arc::clone(&physics);

        tokio::spawn(async move {

            let ws_stream = accept_async(raw_stream).await.unwrap();
            let (write, mut read) = ws_stream.split();

            // Create channel for sending snapshots TO THIS CLIENT
            let (tx, mut rx) = mpsc::unbounded_channel::<String>();

            // Spawn writer task that owns the write half
            tokio::spawn(async move {
                let mut ws_write = write;
                while let Some(msg) = rx.recv().await {
                    if ws_write.send(Message::Text(msg)).await.is_err() {
                        break; // client disconnected
                    }
                }
            });
            
            // ---------- 1) Create player_id ----------
            let player_id = Uuid::new_v4().to_string();

            // ---------- 2) Register client for snapshots ----------
            {
                let mut game = state_clone.lock().await;
                game.register_client(player_id.clone(), tx.clone());
            }

            // ---------- 3) Ask SpawnManager for spawn info ----------
            let spawn_info = {
                let mut game = state_clone.lock().await;
                game.spawns.allocate_spawn(player_id.clone())
            };

            let room_id = spawn_info.room_id;
            let room_id_u32: u32 = room_id.try_into().unwrap_or(u32::MAX);
            let team = spawn_info.team;

            // ---------- 4) Add entity in game state ----------
            {
                let mut game = state_clone.lock().await;
                game.add_entity(&player_id, EntityType::Vehicle);
                game.apply_spawn_info(&spawn_info);
                
            }

            let welcome = serde_json::json!({
                "type": "welcome",
                "player_id": player_id,
                "room_id": room_id_u32,
                "team": team.as_str(),
                "spawned": false,
            }).to_string();

            let _ = tx.send(welcome);

            // ---------- Send vehicle configs to frontned ----------
//             {
//                 let mut game = state_clone.lock().await;
//                 let Some(vehicle) = physics.vehicles.get(player_id) else {
//                     println!("↪ vehicle {} has invalid body_handle, skipping", ent.id );
//                     continue;
//                 };
//                 game.broadcast_vehicle_config(&player_id, &vehicle);
//             }

            // ---------- 8) Read loop: pings + input ----------
            while let Some(Ok(msg)) = read.next().await {
                if let Message::Text(text) = msg {
                    let text = text.trim();

                    // --------------------------------------------------
                    // Heartbeat (plain text or JSON-safe)
                    // --------------------------------------------------
                    if text == "ping" {
                        let _ = tx.send(r#"{"type":"pong"}"#.to_string());
                        continue;
                    }

                    let value: Value = match serde_json::from_str(text) {
                        Ok(value) => value,
                        Err(error) => {
                            eprintln!("⚠️ Bad JSON from client: {error}");
                            continue;
                        }
                    };

                    let message_type = value
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or_default();

                    // --------------------------------------------------
                    // Map-selected spawn request
                    // --------------------------------------------------
                    if message_type == "spawn_request" {
                        let request: SpawnRequest = match serde_json::from_value(value) {
                            Ok(request) => request,
                            Err(error) => {
                                let _ = tx.send(serde_json::json!({
                                    "type": "spawn_error",
                                    "message": format!("Invalid spawn request: {error}"),
                                }).to_string());
                                continue;
                            }
                        };

                        let spawn_result = {
                            let mut phys = physics_clone.lock().await;

                            match phys.select_map(&request.map) {
                                Err(error) => Err(error.to_string()),
                                Ok(()) => {
                                    if let Some(map_snapshot) = phys.map_snapshot() {
                                        if let Some(vehicle) = phys.vehicles.get(&player_id) {
                                            Ok((
                                                vehicle.body,
                                                false,
                                                map_snapshot,
                                            ))
                                        } else if phys.vehicles.len() >= MAX_SANDBOX_PLAYERS {
                                            Err(format!(
                                                "Sandbox is full ({MAX_SANDBOX_PLAYERS}/{MAX_SANDBOX_PLAYERS} players)"
                                            ))
                                        } else {
                                            phys.spawn_vehicle_for_player(
                                                player_id.clone(),
                                                spawn_info.position,
                                                &request.vehicle,
                                            )
                                            .map(|body_handle| {
                                                (
                                                    body_handle,
                                                    true,
                                                    map_snapshot,
                                                )
                                            })
                                            .map_err(|error| {
                                                format!("Vehicle spawn failed: {error}")
                                            })
                                        }
                                    } else {
                                        Err(
                                            "Map selected but no authoritative map snapshot exists"
                                                .to_string()
                                        )
                                    }
                                }
                            }
                        };

                        match spawn_result {
                            Ok((body_handle, newly_spawned, map_snapshot)) => {
                                let mut game = state_clone.lock().await;
                                game.attach_body(&player_id, body_handle);
                                // Only a newly created physics vehicle may set its
                                // visual model id. A duplicate spawn request must
                                // not change the model without changing physics.
                                if newly_spawned {
                                    game.set_vehicle_id(&player_id, &request.vehicle);
                                }
                                drop(game);

                                println!(
                                    "✅ Spawn ready: player={} vehicle={} map={}",
                                    player_id,
                                    request.vehicle,
                                    request.map,
                                );

                                let _ = tx.send(
                                    serde_json::json!({
                                        "type": "map_snapshot",
                                        "data": map_snapshot,
                                    })
                                    .to_string()
                                );

                                let _ = tx.send(serde_json::json!({
                                    "type": "spawn_ready",
                                    "player_id": player_id,
                                    "vehicle": request.vehicle,
                                    "map": request.map,
                                    "newly_spawned": newly_spawned,
                                }).to_string());
                            }
                            Err(message) => {
                                eprintln!(
                                    "⚠️ Spawn rejected for player {}: {}",
                                    player_id,
                                    message,
                                );

                                let _ = tx.send(serde_json::json!({
                                    "type": "spawn_error",
                                    "map": request.map,
                                    "message": message,
                                }).to_string());
                            }
                        }

                        continue;
                    }

                    // --------------------------------------------------
                    // Input packets are accepted before spawning, but main.rs
                    // skips entities whose body handle is still invalid.
                    // --------------------------------------------------
                    if message_type == "input" {
                        let packet: InputPacket = match serde_json::from_value(value) {
                            Ok(packet) => packet,
                            Err(error) => {
                                eprintln!("⚠️ Invalid input packet: {error}");
                                continue;
                            }
                        };

                        if let Some(mask) = packet.debug_mask {
                            let mut phys = physics_clone.lock().await;
                            phys.set_debug_flags(DebugFlags::from_bits_truncate(mask));
                        }

                        let mut game = state_clone.lock().await;
                        if let Some(entity) = game.entities.get_mut(&player_id) {
                            entity.last_packet = Some(packet);
                        }
                    }
                }
            }

            // ---------- 9) Cleanup on disconnect ----------
            
            {
                // 1) Remove physics FIRST
                let mut phys = physics_clone.lock().await;
                phys.despawn_vehicle_for_player(&player_id);
            }
            
            
            {
                // 2) Remove game entity
                let mut game = state_clone.lock().await;
                game.unregister_client(&player_id);
                game.remove_entity(&player_id);
                // (optional) also remove from clients if you track per-player
            }

            println!("🔴 Player disconnected: {}", player_id);
        });
    }
}
