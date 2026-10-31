//! Socket transport only. Server owns social authorization/room admission;
//! WorldRuntime owns the room's physics. Inputs remain replaceable mailboxes.
use crate::{
    server::{Connection, Server},
    spawn::Team,
    state::{InputPacket, PhysicsFrame},
};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    net::TcpListener,
    sync::{mpsc, watch},
};
use tokio_tungstenite::{
    accept_async_with_config,
    tungstenite::{Message, protocol::WebSocketConfig},
};

struct RateLimit {
    received: VecDeque<Instant>,
    limit: usize,
    window: Duration,
}
impl RateLimit {
    fn new(limit: usize, seconds: u64) -> Self {
        Self {
            received: VecDeque::new(),
            limit,
            window: Duration::from_secs(seconds),
        }
    }
    fn allow(&mut self) -> bool {
        let now = Instant::now();
        while self
            .received
            .front()
            .is_some_and(|time| now.duration_since(*time) >= self.window)
        {
            self.received.pop_front();
        }
        if self.received.len() >= self.limit {
            return false;
        }
        self.received.push_back(now);
        true
    }
}

pub async fn start_websocket_server(server: Arc<Server>) {
    let address = std::env::var("AVENLAB_BIND").unwrap_or_else(|_| "0.0.0.0:9001".into());
    let listener = TcpListener::bind(&address)
        .await
        .expect("Failed to bind WebSocket listener");
    println!("WebSocket listening on {address}");
    while let Ok((stream, _peer)) = listener.accept().await {
        let server = Arc::clone(&server);
        tokio::spawn(async move {
            let config = WebSocketConfig {
                max_message_size: Some(16 * 1024),
                max_frame_size: Some(16 * 1024),
                ..Default::default()
            };
            let Ok(socket) = accept_async_with_config(stream, Some(config)).await else {
                return;
            };
            let (write, mut read) = socket.split();
            let (tx, mut rx) = mpsc::unbounded_channel::<String>();
            let (frame_tx, mut frame_rx) = watch::channel::<Option<Arc<PhysicsFrame>>>(None);
            let (social_tx, mut social_rx) = watch::channel::<Option<String>>(None);
            let (input_tx, input_rx) = watch::channel::<Option<InputPacket>>(None);
            // A stalled socket cannot hold any game lock. Five-second send
            // deadlines also terminate its reader and remove its world slot.
            let mut writer = tokio::spawn(async move {
                let mut write = write;
                loop {
                    let messages = tokio::select! {
                        biased;
                        message=rx.recv()=>{let Some(message)=message else{break};vec![message]}
                        changed=social_rx.changed()=>{
                            if changed.is_err(){break;}social_rx.borrow_and_update().clone().into_iter().collect()
                        }
                        changed=frame_rx.changed()=>{
                            if changed.is_err(){break;}let frame=frame_rx.borrow_and_update().clone();
                            let Some(frame)=frame else{continue};
                            if frame.debug.is_empty(){vec![frame.snapshot.clone()]}else{vec![frame.snapshot.clone(),frame.debug.clone()]}
                        }
                    };
                    for message in messages {
                        if !matches!(
                            tokio::time::timeout(
                                Duration::from_secs(5),
                                write.send(Message::Text(message))
                            )
                            .await,
                            Ok(Ok(()))
                        ) {
                            return;
                        }
                    }
                }
            });
            let player = uuid::Uuid::new_v4().to_string();
            let connection = Connection {
                tx: tx.clone(),
                frame: frame_tx,
                social: social_tx,
                input: input_rx,
                input_tx: input_tx.clone(),
                profile_id: None,
                world_id: None,
                team: Team::Blue,
            };
            if let Err(error) = server.register(player.clone(), connection).await {
                let _ = tx.send(json!({"type":"social_error","message":error}).to_string());
                writer.abort();
                return;
            }
            let server_id = server.data.lock().await.server_id.clone();
            let _=tx.send(json!({"type":"welcome","player_id":player,"room_id":0,"team":"blue","spawned":false,"social_version":1,"server_id":server_id}).to_string());
            let mut commands = RateLimit::new(12, 10);
            let mut passwords = RateLimit::new(4, 30);
            let mut pings = RateLimit::new(2, 1);
            loop {
                let next = tokio::select! {next=read.next()=>next,_=&mut writer=>break};
                let Some(Ok(Message::Text(text))) = next else {
                    if next.is_none()
                        || next.is_some_and(|message| {
                            message.is_err() || matches!(message, Ok(Message::Close(_)))
                        })
                    {
                        break;
                    }
                    continue;
                };
                if text.trim() == "ping" {
                    if pings.allow() {
                        let _ = tx.send(json!({"type":"pong"}).to_string());
                    }
                    continue;
                }
                let Ok(value) = serde_json::from_str::<Value>(&text) else {
                    continue;
                };
                let message_type = value
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if message_type == "ping" {
                    if pings.allow() {
                        let _ = tx.send(json!({"type":"pong"}).to_string());
                    }
                    continue;
                }
                if message_type == "input" {
                    if let Ok(packet) = serde_json::from_value::<InputPacket>(value) {
                        input_tx.send_replace(Some(packet));
                    }
                    continue;
                }
                let request_id = value
                    .get("request_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .chars()
                    .take(64)
                    .collect::<String>();
                if !commands.allow() {
                    let _=tx.send(json!({"type":"social_result","request_id":request_id,"ok":false,"message":"Too many requests. Wait a few seconds and try again."}).to_string());
                    continue;
                }
                match message_type {
                    "social_request" => {
                        let password_action = matches!(
                            value.get("action").and_then(Value::as_str),
                            Some("world_join" | "world_create")
                        );
                        let result = if password_action && !passwords.allow() {
                            Err("Too many world access attempts. Wait 30 seconds.".into())
                        } else {
                            server.handle(&player, value).await
                        };
                        let response = match result {
                            Ok(data) => {
                                json!({"type":"social_result","request_id":request_id,"ok":true,"data":data})
                            }
                            Err(message) => {
                                json!({"type":"social_result","request_id":request_id,"ok":false,"message":message})
                            }
                        };
                        let _ = tx.send(response.to_string());
                    }
                    "spawn_request" => {
                        let vehicle = value
                            .get("vehicle")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let map = value.get("map").and_then(Value::as_str).unwrap_or_default();
                        if let Err(message) = server.spawn(&player, map, vehicle).await {
                            let _ = tx.send(
                                json!({"type":"spawn_error","map":map,"message":message})
                                    .to_string(),
                            );
                        }
                    }
                    "change_vehicle_request" => {
                        let vehicle = value
                            .get("vehicle")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let result = match server.runtime(&player).await {
                            Ok(runtime) => {
                                let mut room = runtime.lock().await;
                                match room.physics.change_vehicle_for_player(&player, vehicle) {
                                    Ok(()) => {
                                        room.game.set_vehicle_id(&player, vehicle);
                                        if let Some(entity) = room.game.entities.get_mut(&player) {
                                            entity.last_packet = None;
                                        }
                                        input_tx.send_replace(None);
                                        let config = room
                                            .physics
                                            .vehicles
                                            .get(&player)
                                            .map(|vehicle| vehicle.config);
                                        if let Some(config) = config {
                                            let payload=json!({"type":"vehicle_config","data":crate::state::VehicleConfigPayload::new(&player,config)}).to_string();
                                            for sender in room.game.clients.values() {
                                                let _ = sender.send(payload.clone());
                                            }
                                        }
                                        Ok(())
                                    }
                                    Err(error) => Err(error.to_string()),
                                }
                            }
                            Err(error) => Err(error),
                        };
                        let response = match result {
                            Ok(()) => {
                                json!({"type":"vehicle_changed","request_id":request_id,"vehicle":vehicle,"player_id":player})
                            }
                            Err(message) => {
                                json!({"type":"vehicle_change_error","request_id":request_id,"message":message})
                            }
                        };
                        let _ = tx.send(response.to_string());
                    }
                    "service_vehicle_request" => {
                        let result = match server.runtime(&player).await {
                            Ok(runtime) => runtime
                                .lock()
                                .await
                                .physics
                                .service_vehicle_for_player(&player),
                            Err(error) => Err(error),
                        };
                        let response = match result {
                            Ok(()) => json!({"type":"vehicle_serviced","request_id":request_id}),
                            Err(message) => {
                                json!({"type":"vehicle_service_error","request_id":request_id,"message":message})
                            }
                        };
                        let _ = tx.send(response.to_string());
                    }
                    _ => {}
                }
            }
            server.disconnect(&player).await;
            writer.abort();
        });
    }
}
