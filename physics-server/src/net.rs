use crate::state::{SharedGameState, Entity, EntityType, EntityInput, Axes};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::{
    net::TcpListener,
    sync::{Mutex, mpsc},
};
use tokio_tungstenite::accept_async;
use tungstenite::Message;
use uuid::Uuid;
use serde::Deserialize;
use rapier3d::prelude::RigidBodyHandle;
use serde_json::json;

#[derive(Debug, Deserialize)]
struct InputMessage {
    #[serde(rename = "playerId")]
    pub player_id: String,
    pub tick: u64,
    #[serde(rename = "entityType")]
    pub entity_type: String,
    pub axes: Axes,
}

pub async fn start_websocket_server(state: Arc<Mutex<SharedGameState>>) {
    let listener = TcpListener::bind("127.0.0.1:9001").await.unwrap();
    println!("🌐 WebSocket listening on ws://localhost:9001");

    while let Ok((stream, _)) = listener.accept().await {
        let ws_stream = accept_async(stream).await.unwrap();

        // Outgoing channel for this client
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        // Assign a player/entity ID
        let id = Uuid::new_v4().to_string();
        println!("Player connected: {}", id);

        {
            let mut s = state.lock().await;
            s.clients.push(tx.clone());
            s.entities.insert(
                id.clone(),
                Entity {
                    id: id.clone(),
                    kind: EntityType::Vehicle, // default mode on connect
                    body_handle: RigidBodyHandle::invalid(),
                    last_input: None,
                },
            );
        }

        // Tell the client what ID they should use in their input messages
        let welcome = json!({
            "type": "welcome",
            "playerId": id,
        });
        let _ = tx.send(welcome.to_string());

        let (mut write, mut read) = ws_stream.split();

        // READ LOOP: handle client input
        let state_for_read = state.clone();
        tokio::spawn(async move {
            while let Some(Ok(msg)) = read.next().await {
                if let Message::Text(text) = msg {
                    // println!("Raw input: {}", text);
                    match serde_json::from_str::<InputMessage>(&text) {
                        Ok(input) => {
                            let mut s = state_for_read.lock().await;
                            if let Some(entity) = s.entities.get_mut(&input.player_id) {
                                // Update type (vehicle / drone)
                                entity.kind = match input.entity_type.as_str() {
                                    "drone" => EntityType::Drone,
                                    "vehicle" => EntityType::Vehicle,
                                    _ => entity.kind,
                                };
                                // Store latest input
                                entity.last_input = Some(EntityInput {
                                    tick: input.tick,
                                    axes: input.axes,
                                });
                            } else {
                                eprintln!(
                                    "Received input for unknown playerId {}",
                                    input.player_id
                                );
                            }
                        }
                        Err(err) => {
                            eprintln!("Failed to parse input JSON: {err}, text={text}");
                        }
                    }
                }
            }
        });

        // WRITE LOOP: snapshots and messages to client
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                let _ = write.send(Message::Text(msg)).await;
            }
        });
    }
}
