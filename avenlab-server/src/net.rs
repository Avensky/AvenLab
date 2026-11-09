//! Socket transport only. Server owns social authorization/room admission;
//! WorldRuntime owns the room's physics. Inputs remain replaceable mailboxes.
mod ingress;
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
    sync::{Semaphore, watch},
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
    let handshakes = Arc::new(Semaphore::new(32));
    while let Ok((stream, _peer)) = listener.accept().await {
        // This limit applies before register() can enforce the live-client cap.
        let Ok(permit) = handshakes.clone().try_acquire_owned() else { continue; };
        let server = Arc::clone(&server);
        tokio::spawn(async move {
            let config = WebSocketConfig {
                max_message_size: Some(1024 * 1024),
                max_frame_size: Some(1024 * 1024),
                ..Default::default()
            };
            let Ok(Ok(socket)) = tokio::time::timeout(Duration::from_secs(5),
                accept_async_with_config(stream, Some(config))).await else {
                return;
            };
            drop(permit);
            let (write, mut read) = socket.split();
            let (tx, mut rx) = crate::outbox::channel();
            let mut overflow = tx.failure();
            let (frame_tx, mut frame_rx) = watch::channel::<Option<Arc<PhysicsFrame>>>(None);
            let (social_tx, mut social_rx) = watch::channel::<Option<String>>(None);
            let (input_tx, input_rx) = watch::channel::<Option<InputPacket>>(None);
            let frame_tx = crate::snapshot_wire::SnapshotSender::from(frame_tx);
            let snapshot_format = frame_tx.format.clone();
            let snapshot_reset=frame_tx.revision.clone();
            let writer_reset=snapshot_reset.clone();
            // A stalled socket cannot hold any game lock. Five-second send
            // deadlines also terminate its reader and remove its world slot.
            let mut writer = tokio::spawn(async move {
                let mut write = write;
                let mut sent_base=None;
                let mut sent_driver:Option<crate::snapshot_wire::DriverLane>=None;
                let mut driver_window=0;
                let mut reset_seen=0;
                // Browsers answer protocol pings even when background JS timers are throttled.
                let mut heartbeat = tokio::time::interval(Duration::from_secs(8));
                heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                loop {
                    let messages = tokio::select! {
                        biased;
                        _ = heartbeat.tick() => {
                            if !matches!(tokio::time::timeout(Duration::from_secs(5),
                                write.send(Message::Ping(Vec::new()))).await, Ok(Ok(()))) { return; }
                            continue;
                        }
                        message=rx.recv()=>{let Some(message)=message else{break};vec![message]}
                        changed=social_rx.changed()=>{
                            if changed.is_err(){break;}social_rx.borrow_and_update().clone().into_iter().collect()
                        }
                        changed=frame_rx.changed()=>{
                            if changed.is_err(){break;}let frame=frame_rx.borrow_and_update().clone();
                            let Some(frame)=frame else{continue};
                            let reset=writer_reset.load(std::sync::atomic::Ordering::Relaxed);
                            if reset!=reset_seen {sent_base=None;sent_driver=None;reset_seen=reset;}
                            let mut messages=Vec::with_capacity(3);
                            if let Some(driver)=frame.driver {
                                let window=frame.tick/crate::snapshot_wire::AUX_DIVISOR;
                                if sent_driver!=Some(driver) && (sent_driver.is_none_or(|old|driver.edge(old)) || window!=driver_window) {
                                    messages.push(driver.encode());sent_driver=Some(driver);driver_window=window;
                                }
                            } else {sent_driver=None;}
                            if let Some(base)=&frame.keyframe {
                                if sent_base!=Some(base.id) {
                                    messages.push(base.packet.clone());
                                    sent_base=Some(base.id);
                                    if frame.snapshot.as_ref()!=base.packet {messages.push(frame.snapshot.to_string());}
                                } else {messages.push(frame.snapshot.to_string());}
                            } else {sent_base=None;messages.push(frame.snapshot.to_string());}
                            if !frame.debug.is_empty(){messages.push(frame.debug.to_string());}
                            messages
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
            let _=tx.send(json!({"type":"welcome","player_id":player,"room_id":0,"team":"blue","spawned":false,"social_version":1,"packed_input_version":1,"compact_snapshot_version":crate::snapshot_wire::VERSION,"snapshot_hz":30,"server_id":server_id}).to_string());
            let mut commands = RateLimit::new(12, 10);
            let mut passwords = RateLimit::new(4, 30);
            let mut pings = RateLimit::new(2, 1);
            let mut ingress = ingress::IngressBudget::new(Instant::now());
            // Protocol pongs keep idle menus alive, but must not reserve an
            // unidentified connection forever. No per-packet registry lookup.
            let identify_deadline = tokio::time::Instant::now() + Duration::from_secs(30);
            let mut identified = false;
            loop {
                if *overflow.borrow() { break; }
                let next = tokio::select! {
                    biased;
                    _=overflow.changed()=>break,
                    _=&mut writer=>break,
                    _=tokio::time::sleep_until(identify_deadline), if !identified=>break,
                    next=tokio::time::timeout(Duration::from_secs(20),read.next())=>match next{Ok(value)=>value,Err(_)=>break},
                };
                let Some(Ok(message)) = next else { break; };
                // Includes malformed input and control frames: rejected JSON
                // cannot bypass the byte/packet budget by failing to decode.
                if !ingress.allow(message.len(), Instant::now()) { break; }
                let text = match message {
                    Message::Text(text) => text,
                    Message::Binary(bytes) => {
                        if let Some(packet) = crate::packed_input::decode(&bytes) {
                            input_tx.send_replace(Some(packet));
                        }
                        continue;
                    }
                    Message::Close(_) => break,
                    _ => continue,
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
                if text.len() > 16 * 1024
                    && !(message_type == "social_request"
                        && value.get("action").and_then(Value::as_str) == Some("editor_apply"))
                {
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
                    "snapshot_format" => {
                        // Version zero remains a supported fallback. Invalid
                        // negotiations never change the current wire format.
                        if let Some(version) = value.get("version").and_then(Value::as_u64) {
                            if version == 0 || version == u64::from(crate::snapshot_wire::VERSION) {
                                snapshot_format.store(version as u8, std::sync::atomic::Ordering::Relaxed);
                                snapshot_reset.fetch_add(1,std::sync::atomic::Ordering::Relaxed);
                            }
                        }
                    }
                    "social_request" => {
                        let identifying = value.get("action").and_then(Value::as_str) == Some("identify");
                        let password_action = matches!(
                            value.get("action").and_then(Value::as_str),
                            Some("world_join" | "world_create")
                        );
                        let result = if password_action && !passwords.allow() {
                            Err("Too many world access attempts. Wait 30 seconds.".into())
                        } else {
                            server.handle(&player, value).await
                        };
                        if identifying && result.is_ok() { identified = true; }
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
                        let appearance=server.saved_appearance(&player,vehicle).await;
                        let result = match server.runtime(&player).await {
                            Ok(runtime) => {
                                let mut room = runtime.lock().await;
                                let allowed = server.validate_alpha_vehicle(&player, vehicle).await;
                                match allowed.and_then(|_| {
                                    room.validate_hero_change_location(&player)?;
                                    room.physics.change_vehicle_for_player(&player, vehicle)
                                }) {
                                    Ok(()) => {
                                        room.game.set_vehicle_id(&player, vehicle);
                                        if let Some(entity)=room.game.entities.get_mut(&player) { entity.appearance=appearance; }
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
                                            let payload=json!({"type":"vehicle_config","data":crate::state::VehicleConfigPayload::new(&player,config)});
                                            room.game.broadcast_vehicle_config_json(&player,payload);
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
            // Stop transport immediately, even if world cleanup is waiting
            // behind another control-plane operation.
            writer.abort();
            drop(read);
            server.disconnect(&player).await;
        });
    }
}
