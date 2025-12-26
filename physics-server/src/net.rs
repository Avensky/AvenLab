use std::sync::Arc;
use uuid::Uuid;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, mpsc}; 
use futures::{StreamExt, SinkExt};
use tokio_tungstenite::{accept_async, tungstenite::Message};

use crate::state::{SharedGameState, EntityType};
use crate::physics::PhysicsWorld;
// use serde::Serialize;
// use crate::physics::DebugOverlay;

#[derive(Debug)]
struct ClientMessage {
    msg_type: String,
    throttle: f32,
    steer: f32,
    brake: f32,
    ascend: f32,
    pitch: f32,
    yaw: f32,
    roll: f32,
}

impl ClientMessage {
    fn from_json(txt: &str) -> Option<Self> {
        let v = serde_json::from_str::<serde_json::Value>(txt).ok()?;

        Some(ClientMessage {
            msg_type: v.get("type")?.as_str()?.to_string(),
            throttle: v.get("throttle").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
            steer: v.get("steer").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
            ascend: v.get("ascend").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
            pitch: v.get("pitch").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
            yaw: v.get("yaw").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
            roll: v.get("roll").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
            brake: v.get("brake").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,

        })
    }
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
        let state_clone = Arc::clone(&state);
        let physics_clone = Arc::clone(&physics);

        tokio::spawn(async move {

            let ws_stream = accept_async(raw_stream).await.unwrap();
            let (write, mut read) = ws_stream.split();

            // Create channel for sending snapshots TO THIS CLIENT
            let (tx, mut rx) = mpsc::unbounded_channel::<String>();
            // let tx_for_game = tx.clone();     // clone kept by game
            // let tx_for_ping = tx.clone();     // clone kept locally for ping replies
            // let tx_for_writer = tx.clone();   // used for snapshot writer task
            
            // Spawn writer task that owns the write half
            tokio::spawn(async move {
                let mut ws_write = write;
                while let Some(msg) = rx.recv().await {
                    if ws_write.send(Message::Text(msg)).await.is_err() {
                        break; // client disconnected
                    }
                }
            });

            // ---------- 1) Register client for snapshots ----------
            {
                let mut game = state_clone.lock().await;
                game.register_client(tx.clone());
            }
            
            // ---------- 2) Create player_id ----------
            let player_id = Uuid::new_v4().to_string();

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

            // ---------- 5) Create Rapier body in physics ----------
            let body_handle = {
                let mut phys = physics_clone.lock().await;
                // phys.create_vehicle_body_at(spawn_info.position)
                phys.spawn_vehicle_for_player(player_id.clone(), spawn_info.position);
                phys.vehicles[&player_id].body
            };

            // ---------- 6) Attach body handle back to game state ----------
            {
                let mut game = state_clone.lock().await;
                game.attach_body(&player_id, body_handle);
            }

            // ---------- 7) Send welcome message ----------
            // let welcome = ServerMessage::Welcome {
            //     player_id: player_id.clone(),
            //     room_id_u32,
            //     team: team.as_str().to_string(),
            // };

            let welcome = serde_json::json!({
                "type": "welcome",
                "player_id": player_id,
                "room_id": room_id_u32,
                "team": team.as_str()
            }).to_string();

            let _ = tx.send(welcome);

            

            // ---------- 8) Read loop: pings + input ----------
            while let Some(Ok(msg)) = read.next().await {
                if let Message::Text(text) = msg {
                    if text == "ping" {
                        let _ = tx.send("{\"type\":\"pong\"}".to_string());
                        continue;
                    }

                    // Parse JSON into ClientMessage
                    if let Some(cmsg) = ClientMessage::from_json(&text) {
                        if cmsg.msg_type == "input" {
                            // Debug: see inputs arriving
                            // println!("Input from {}: throttle={} steer={}", player_id, cmsg.throttle, cmsg.steer);

                            // Apply directly to physics vehicle
                            let mut phys = physics_clone.lock().await;
                            phys.apply_player_input(
                                &player_id,
                                cmsg.throttle,
                                cmsg.steer,
                                cmsg.brake,
                                cmsg.ascend,
                                cmsg.pitch,
                                cmsg.yaw,
                                cmsg.roll,
                            );
                        }
                    } else {
                        eprintln!("⚠️ Bad JSON from client: {}", text);
                    }
                }

            }

            // ---------- 9) Cleanup on disconnect ----------
            {
                let mut game = state_clone.lock().await;
                game.remove_entity(&player_id);
                // (optional) also remove from clients if you track per-player
            }

            println!("🔴 Player disconnected: {}", player_id);
        });
    }
}
