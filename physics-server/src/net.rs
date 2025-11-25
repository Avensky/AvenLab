use std::sync::Arc;
use futures::{StreamExt, SinkExt};
use tokio::net::TcpListener;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tokio::sync::{Mutex, mpsc};

use crate::state::{SharedGameState, Axes, EntityType};
use crate::physics::PhysicsWorld;

#[derive(Debug)]
struct ClientMessage {
    msg_type: String,
    throttle: f32,
    steer: f32,
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

    loop {
        let (raw, _) = listener.accept().await.unwrap();
        let state_clone = Arc::clone(&state);
        let physics_clone = Arc::clone(&physics);

        tokio::spawn(async move {
            let ws = accept_async(raw).await.unwrap();
            let (mut write, mut read) = ws.split();

            // -------------------------------
            // 1) Create outgoing message channel
            // -------------------------------
            let (tx, mut rx) = mpsc::unbounded_channel::<String>();

            {
                let mut game = state_clone.lock().await;
                game.register_client(tx.clone());
            }

            // -------------------------------
            // 2) Spawn send-loop task
            // -------------------------------
            tokio::spawn(async move {
                while let Some(msg) = rx.recv().await {
                    let _ = write.send(Message::Text(msg)).await;
                }
            });

            // -------------------------------
            // 3) Create entity + physics body
            // -------------------------------
            let player_id = {
                let mut game = state_clone.lock().await;
                let id = game.add_entity(EntityType::Vehicle);

                let mut phys = physics_clone.lock().await;
                let body = phys.create_vehicle_body();
                game.attach_body(&id, body);

                id
            };

            println!("🟢 Player connected: {}", player_id);

            // Send welcome through the outgoing TX channel
            let welcome = format!(
                r#"{{"type":"welcome","player_id":"{}"}}"#,
                player_id
            );
            let _ = tx.send(welcome);

            // -------------------------------
            // 4) Main receive loop
            // -------------------------------
            while let Some(msg) = read.next().await {
                let msg = match msg {
                    Ok(m) => m,
                    Err(_) => break,
                };

                if !msg.is_text() {
                    continue;
                }
                let text = match msg.to_text() {
                    Ok(t) => t,
                    Err(_) => continue,
                };

                if text.contains("\"type\":\"ping\"") {
                    let _ = tx.send("{\"type\":\"pong\"}".into());
                    continue;
                }

                let parsed = match ClientMessage::from_json(text) {
                    Some(v) => v,
                    None => continue,
                };

                if parsed.msg_type == "input" {
                    let axes = Axes {
                        throttle: parsed.throttle,
                        steer: parsed.steer,
                        ascend: parsed.ascend,
                        yaw: parsed.yaw,
                        pitch: parsed.pitch,
                        roll: parsed.roll,
                    };

                    let tick = state_clone.lock().await.tick;

                    let mut game = state_clone.lock().await;
                    game.update_input(&player_id, axes, tick);
                }
            }

            println!("🔴 Player disconnected: {}", player_id);
            let mut game = state_clone.lock().await;
            game.remove_entity(&player_id);
        });
    }
}
