use std::sync::Arc;
use uuid::Uuid;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, mpsc}; 
use futures::{StreamExt, SinkExt};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use crate::state::{SharedGameState, EntityType};
use crate::physics::PhysicsWorld;
use crate::state::InputPacket;

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

            // ---------- 5) Create Rapier body in physics ----------
            let body_handle = {
                let mut phys = physics_clone.lock().await;
                phys.spawn_vehicle_for_player(player_id.clone(), spawn_info.position);
                phys.vehicles[&player_id].body
            };

            // ---------- 6) Attach body handle back to game state ----------
            {
                let mut game = state_clone.lock().await;
                game.attach_body(&player_id, body_handle);
            }

            let welcome = serde_json::json!({
                "type": "welcome",
                "player_id": player_id,
                "room_id": room_id_u32,
                "team": team.as_str(),
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

                    // --------------------------------------------------
                    // Input packet
                    // --------------------------------------------------
                    match serde_json::from_str::<InputPacket>(text) {
                        Ok(packet) => {
                            if packet.r#type == "input" {
                                let mut game = state_clone.lock().await;

                                if let Some(entity) = game.entities.get_mut(&player_id) {
                                    entity.last_packet = Some(packet);
                                }
                            }
                        }

                        Err(_) => {
                            // Ignore non-JSON noise silently (avoids spam)
                            // Uncomment for debugging if needed:
                            // eprintln!("⚠️ Bad JSON from client: {}", text);
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
