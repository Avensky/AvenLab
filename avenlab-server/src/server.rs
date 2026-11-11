//! Control plane and room registry. Infrequent mutations are serialized here;
//! input mailboxes and the physics scheduler never acquire `operations`.
use crate::{
    social::{actions::SocialAction, model::*, security},
    spawn::Team,
    state::{InputPacket},
    world_sessions::WorldRuntime,
};
use serde_json::{Value, json};
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::sync::{Mutex, watch};

pub type Runtime = Arc<Mutex<WorldRuntime>>;
#[derive(Clone)]
pub struct Connection {
    pub tx: crate::outbox::Sender,
    pub frame: crate::snapshot_wire::SnapshotSender,
    pub social: watch::Sender<Option<String>>,
    pub input: watch::Receiver<Option<InputPacket>>,
    pub input_tx: watch::Sender<Option<InputPacket>>,
    pub profile_id: Option<String>,
    pub world_id: Option<usize>,
    pub team: Team,
}
pub struct Server {
    operations: Mutex<()>,
    chat: Mutex<chat::ChatState>,
    matches: Mutex<matches::MatchBridge>,
    revivals: Mutex<revival::RevivalState>,
    pub alpha: Mutex<crate::alpha::AlphaState>,
    pub data: Mutex<SocialData>,
    pub connections: Mutex<HashMap<String, Connection>>,
    pub runtimes: Mutex<HashMap<usize, Runtime>>,
    path: PathBuf,
    pub max_active_worlds: usize,
    pub max_players: usize,
}
impl Server {
    pub fn load() -> anyhow::Result<Self> {
        let path = std::env::var_os("AVENLAB_SOCIAL_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime/social.json")
            });
        let mut data = SocialData::load(&path)?;
        matches::recover_archives(&path, &mut data)?;
        let managed_worlds = data
            .worlds
            .iter()
            .filter_map(|(id, w)| w.mode.map(|mode| (*id, crate::alpha::MatchFormat::for_world(mode,w.max_players))))
            .collect();
        let limit = |name: &str, default: usize, max: usize| {
            std::env::var(name)
                .ok()
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(default)
                .clamp(1, max)
        };
        Ok(Self {
            operations: Mutex::new(()),
            chat: Mutex::new(Default::default()),
            matches: Mutex::new(Default::default()),
            revivals: Mutex::new(Default::default()),
            alpha: Mutex::new(crate::alpha::AlphaState {
                worlds: managed_worlds,
                enforce_roles: std::env::var("AVENLAB_ROLE_LIMITS").as_deref() != Ok("0"),
                enabled: std::env::var("AVENLAB_ALPHA_LIMITS").as_deref() != Ok("0"),
                grace_seconds: std::env::var("AVENLAB_RECONNECT_GRACE_SECONDS")
                    .ok()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(30)
                    .clamp(1, 120),
                ..Default::default()
            }),
            data: Mutex::new(data),
            connections: Mutex::new(HashMap::new()),
            runtimes: Mutex::new(HashMap::new()),
            path,
            max_active_worlds: limit("AVENLAB_MAX_ACTIVE_WORLDS", 3, 16),
            max_players: limit("AVENLAB_MAX_PLAYERS", 24, 160),
        })
    }
    async fn save(&self) -> Result<(), String> {
        let bytes = serde_json::to_vec(&*self.data.lock().await)
            .map_err(|_| "Could not serialize social data.")?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err("The social data budget is full; archive player summaries before saving.".into());
        }
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|_| "Could not create the social data directory.")?;
        }
        let temp = self.path.with_extension("tmp");
        tokio::fs::write(&temp, bytes)
            .await
            .map_err(|_| "Could not save social data.")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600))
                .await
                .map_err(|_| "Could not protect the social data file.")?;
        }
        tokio::fs::rename(&temp, &self.path)
            .await
            .map_err(|_| "Could not commit social data.".to_string())
    }
    async fn commit(&self, previous: SocialData) -> Result<(), String> {
        if let Err(error) = self.save().await {
            *self.data.lock().await = previous;
            return Err(error);
        }
        Ok(())
    }
    pub async fn register(&self, id: String, connection: Connection) -> Result<(), String> {
        // Registration only changes this map. Waiting on control-plane disk
        // work would leave upgraded sockets outside the live-client cap.
        let mut clients = self.connections.lock().await;
        if clients.len() >= 96 {
            return Err("The server connection limit has been reached.".into());
        }
        clients.insert(id, connection);
        Ok(())
    }
    pub async fn runtime(&self, player: &str) -> Result<Runtime, String> {
        let world = self
            .connections
            .lock()
            .await
            .get(player)
            .and_then(|client| client.world_id)
            .ok_or("Join a world first.")?;
        self.runtimes
            .lock()
            .await
            .get(&world)
            .cloned()
            .ok_or_else(|| "This world is unavailable.".into())
    }
    async fn actor(&self, player: &str) -> Result<String, String> {
        self.connections
            .lock()
            .await
            .get(player)
            .and_then(|client| client.profile_id.clone())
            .ok_or_else(|| "Choose a player profile first.".into())
    }
    async fn leave_inner(&self, player: &str) {
        let connected_world = self.connections.lock().await.get(player).and_then(|client| client.world_id).is_some();
        if connected_world { self.clear_downed_reconnect(player).await; }
        self.checkpoint_departure(player, true).await;
        self.leave_transport(player).await;
    }
    async fn leave_transport(&self, player: &str) {
        self.alpha.lock().await.members.remove(player);
        let connection = self.connections.lock().await.get(player).cloned();
        let Some(client) = connection else { return };
        if let Some(world) = client.world_id {
            let runtime = self.runtimes.lock().await.get(&world).cloned();
            if let Some(runtime) = runtime {
                runtime.lock().await.leave(player);
            }
            if let Some(connection) = self.connections.lock().await.get_mut(player) {
                connection.world_id = None;
            }
            let occupied = self
                .connections
                .lock()
                .await
                .values()
                .any(|connection| connection.world_id == Some(world));
            let reserved = self
                .alpha
                .lock()
                .await
                .reservations
                .values()
                .any(|entry| entry.member.world == world && entry.expires > timestamp());
            if !occupied && !reserved {
                self.finish_empty_activity(world).await;
                self.runtimes.lock().await.remove(&world);
                self.chat.lock().await.clear_world(world);
            }
        }
        client.input_tx.send_replace(None);
        client.frame.send_replace(None);
        let _ = client
            .tx
            .send(json!({"type":"world_changed","world":null}).to_string());
    }
    pub async fn disconnect(&self, player: &str) {
        let _operation = self.operations.lock().await;
        {
            let mut clients = self.connections.lock().await;
            let Some(client) = clients.get(player) else { return; };
            if client.profile_id.is_none() && client.world_id.is_none() {
                // No identity, room or queue entry can refer to this socket.
                // Avoid rebuilding everyone's lobby when an anonymous probe leaves.
                clients.remove(player);
                return;
            }
        }
        self.checkpoint_departure(player, false).await;
        self.reserve_disconnect(player).await;
        let client=self.connections.lock().await.get(player).cloned();
        let retained={let a=self.alpha.lock().await;client.as_ref().and_then(|c|c.profile_id.as_ref()).and_then(|p|a.reservations.get(p)).is_some_and(|r|r.retained_player.as_deref()==Some(player))};
        if retained{
            if let Some(world)=client.and_then(|c|c.world_id){let runtime=self.runtimes.lock().await.get(&world).cloned();if let Some(runtime)=runtime{runtime.lock().await.detach(player);}}
            self.alpha.lock().await.members.remove(player);
        }else{
            // The reconnect lease, rather than transport loss, decides whether
            // a participant abandoned the round.
            self.leave_transport(player).await;
        }
        self.alpha
            .lock()
            .await
            .queue
            .retain(|ticket| ticket.player != player);
        self.connections.lock().await.remove(player);
        self.publish().await;
    }
    async fn join_inner(
        &self,
        player: &str,
        world_id: usize,
        code: &str,
        password: String,
    ) -> Result<Value, String> {
        let client = self
            .connections
            .lock()
            .await
            .get(player)
            .cloned()
            .ok_or("The connection closed.")?;
        let world = self
            .data
            .lock()
            .await
            .worlds
            .get(&world_id)
            .cloned()
            .ok_or("That world is unavailable.")?;
        if client.world_id == Some(world_id) {
            return Ok(json!({"world_id":world_id,"map":world.map}));
        }
        let owner = client.profile_id == world.owner_id && client.profile_id.is_some();
        let invited = self.data.lock().await.world_invites.iter().any(|invite| {
            Some(&invite.to) == client.profile_id.as_ref()
                && invite.world_id == world_id
                && invite.expires > timestamp()
        });
        let restoring = self.alpha.lock().await.restoring.contains(player);
        if !world.listed && !restoring && !owner && !invited && code != world.invite_code {
            return Err("A valid world invite or invite code is required.".into());
        }
        if !owner
            && !restoring
            && let Some(hash) = world.password_hash.clone()
        {
            let accepted =
                tokio::task::spawn_blocking(move || security::password_matches(&password, &hash))
                    .await
                    .map_err(|_| "Password verification failed.")?;
            if !accepted {
                return Err("The world password is incorrect.".into());
            }
        }
        let (held_world,held_total)={let alpha=self.alpha.lock().await;let now=timestamp();(alpha.reservations.values().filter(|r|r.expires>now&&r.member.world==world_id).count(),alpha.reservations.values().filter(|r|r.expires>now).count())};
        let clients = self.connections.lock().await;
        if clients
            .values()
            .filter(|member| member.world_id == Some(world_id))
            .count()+held_world
            >= world.max_players
        {
            return Err("This world is full.".into());
        }
        let total = clients
            .values()
            .filter(|member| member.world_id.is_some())
            .count();
        if client.world_id.is_none() && total+held_total >= self.max_players {
            return Err("This server's active-player limit has been reached.".into());
        }
        let replacing = client.world_id.is_some_and(|old| {
            clients
                .values()
                .filter(|member| member.world_id == Some(old))
                .count()
                == 1
        });
        let data = self.data.lock().await;
        let preferred = client.profile_id.as_ref().and_then(|profile| {
            data.groups_for(profile).find_map(|group| {
                clients
                    .values()
                    .find(|member| {
                        member.world_id == Some(world_id)
                            && member
                                .profile_id
                                .as_ref()
                                .is_some_and(|id| group.members.contains(id))
                    })
                    .map(|member| member.team)
            })
        });
        drop(data);
        drop(clients);
        self.check_alpha_admission(player, world_id).await?;
        let preferred = self
            .alpha
            .lock()
            .await
            .pending_team
            .get(player)
            .copied()
            .or(preferred);
        let existing = self.runtimes.lock().await.get(&world_id).cloned();
        let runtime = if let Some(runtime) = existing {
            runtime
        } else {
            if self.runtimes.lock().await.len() >= self.max_active_worlds && !replacing {
                return Err("The active-world limit has been reached. Join an active world or wait for one to empty.".into());
            }
            let map = world.map.clone();
            let saved_map=self.data.lock().await.saved_maps.get(&map).cloned();
            let mut loaded = tokio::task::spawn_blocking(move || {
                if let Some(saved) = saved_map {
                    let file: crate::world::block_colliders::BlockColliderFile = serde_json::from_value(saved)
                        .map_err(|_| "Saved editor map is invalid. Restore the previous revision.".to_string())?;
                    if file.map_id!=map {return Err("Saved editor map ID does not match its environment.".into());}
                    let physics=crate::physics::PhysicsWorld::from_editor_document(file).map_err(|e|e.to_string())?;
                    let mut game=crate::state::SharedGameState::new();game.room_id=world_id;
                    Ok(WorldRuntime::from_parts(game,physics))
                }else{WorldRuntime::new(world_id, &map)}
            })
                .await
                .map_err(|_| "Could not load the world.")??;
            loaded.physics.set_tire_thermals(world.tire_thermals);
            Arc::new(Mutex::new(loaded))
        };
        if let Some(mode) = world.mode {
            if mode.bucket() == 0 {
                let training = !self.alpha.lock().await.enforce_roles;
                let mut room = runtime.lock().await;
                if room.round.is_none() { room.configure_round_format(crate::alpha::MatchFormat::for_world(mode,world.max_players), training)?; }
            }
        }
        // Build/validate the destination before releasing the original room.
        // operations serializes admission; physics continues while a map loads.
        self.leave_inner(player).await;
        self.runtimes
            .lock()
            .await
            .insert(world_id, Arc::clone(&runtime));
        let mut room = runtime.lock().await;
        // Physics may finish the round between matchmaking and this lock.
        if !restoring && room.round.as_ref().is_some_and(|r| r.phase == crate::ctf::CtfPhase::Ended) {
            return Err("This match has ended.".into());
        }
        let team = room.join(
            player,
            client.tx.clone(),
            client.frame.clone(),
            client.input.clone(),
            preferred,
            world.max_players,
        );
        {
            let mut clients = self.connections.lock().await;
            let connection = clients.get_mut(player).ok_or("The connection closed.")?;
            connection.world_id = Some(world_id);
            connection.team = team;
        }
        let _=client.tx.send(json!({"type":"world_changed","world":{"id":world_id,"name":world.name,"map":world.map,"team":team.as_str()}}).to_string());
        if !client.frame.compact() {let _=client.tx.send(json!({"type":"welcome","player_id":player,"room_id":world_id,"team":team.as_str(),"spawned":false}).to_string());}
        room.send_existing_configs(player,&client.tx);
        let _=client.tx.send(room.physics.map_snapshot_packet(world_id));
        Ok(json!({"world_id":world_id,"map":world.map}))
    }
    pub async fn saved_appearance(&self, player: &str, vehicle: &str) -> crate::alpha::appearance::HeroAppearance {
        let profile = self.connections.lock().await.get(player).and_then(|c|c.profile_id.clone());
        let data = self.data.lock().await;
        profile.and_then(|id|data.profiles.get(&id)).and_then(|p|p.progression.hero_loadouts.get(vehicle)).cloned().unwrap_or_default()
    }
    pub async fn spawn(&self, player: &str, map: &str, vehicle: &str) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        let current = self
            .connections
            .lock()
            .await
            .get(player)
            .and_then(|client| client.world_id);
        if let Some(world_id) = current {
            let data=self.data.lock().await;
            let matches=data.worlds.get(&world_id).is_some_and(|world|world.map==map ||
                (map=="streaming_endless_city" && world.mode.is_some_and(|m|m.bucket()==0) &&
                 crate::harbor::VARIANTS.contains(&world.map.as_str())));
            if !matches {
                return Err("Your joined world uses a different map. Leave that world before selecting another.".into());
            }
        } else {
            if !map_available(map) {
                return Err("This map is unavailable.".into());
            }
            let mut data = self.data.lock().await;
            let world_id = if let Some(world) = data
                .worlds
                .values()
                .find(|world| world.owner_id.is_none() && world.map == map)
            {
                world.id
            } else {
                let world_id = data.next_world;
                data.next_world += 1;
                data.worlds.insert(
                    world_id,
                    World {
                        mode: None,
                        id: world_id,
                        tire_thermals: crate::tire_thermals::server_default(),
                        name: format!("Public {}", map.replace('_', " ")),
                        map: map.into(),
                        owner_id: None,
                        listed: true,
                        max_players: MAX_WORLD_PLAYERS,
                        password_hash: None,
                        invite_code: id(),
                    },
                );
                world_id
            };
            drop(data);
            self.join_inner(player, world_id, "", String::new()).await?;
        }
        self.validate_alpha_vehicle(player, vehicle).await?;
        let profile = self.actor(player).await.ok();
        let joined_world = self.connections.lock().await.get(player).and_then(|c| c.world_id);
        if let Some(world) = joined_world {
            if !self.participant_slot_available(world, profile.as_deref()).await {
                return Err("This round has reached its participant history limit. Wait for the next match.".into());
            }
        }
        let runtime = self.runtime(player).await?;
        let appearance = self.saved_appearance(player, vehicle).await;
        let revive_cooldown = self.revival_cooldown(player).await;
        let assigned = self.alpha.lock().await.members.get(player).filter(|m|Some(m.world)==joined_world).map(|m|m.hero.clone()).unwrap_or_default();
        let guard_ability=if assigned=="tank" || (assigned.is_empty() && vehicle=="tank") {"tank_barrier"}else{"guard_boost"};
        let [dive_cooldown,guard_cooldown,heal_cooldown]=if let Some(profile)=profile.as_deref() {
            self.revivals.lock().await.ability_cooldowns(profile,["dive_shield",guard_ability,"heal_pack"])
        } else {[0.0;3]};
        let server_default=self.data.lock().await.vehicle_defaults.get(vehicle).cloned();
        let mut room = runtime.lock().await;
        if room.round.as_ref().is_some_and(|r| r.phase == crate::ctf::CtfPhase::Ended) {
            return Err("This match has ended. Start another match to deploy.".into());
        }
        let initial=!room.physics.vehicles.contains_key(player);
        room.spawn(player, vehicle)?;
        if initial {
            if let Some(patch)=server_default {
                let factory=crate::vehicle_setup::config_for_vehicle(vehicle).ok_or("Unknown vehicle.")?;
                let config=crate::vehicle_tuning::validated_config(factory,&patch)?;
                room.physics.configure_vehicle_for_player(player,config)?;
                room.game.broadcast_vehicle_config_json(player,serde_json::json!({
                    "type":"vehicle_config","data":crate::state::VehicleConfigPayload::new(player,config)
                }));
            }
        }
        room.physics.set_assigned_hero(player,&assigned);
        let retained_guard_cooldown=room.physics.guard_view(player).cooldown_s.max(guard_cooldown);
        let guard=room.physics.guard_boosts.entry(player.into()).or_default();
        guard.cooldown=retained_guard_cooldown;
        guard.dive_cooldown=guard.dive_cooldown.max(dive_cooldown);
        room.physics.support.ensure_cooldown(player,heal_cooldown);
        let round_id = room.round.as_ref().map(|round| round.match_id.clone());
        if let Some(lease) = self.take_downed_reconnect(player, room.game.room_id, round_id.as_deref()).await {
            lease.restore(&mut room, player)?;
        }
        if let Some(health) = room.physics.vehicle_health.get_mut(player) {
            health.revive_cooldown_s = health.revive_cooldown_s.max(revive_cooldown);
        }
        if let Some(entity)=room.game.entities.get_mut(player) { entity.appearance=appearance; }
        self.checkpoint_spawn(&room).await;
        drop(room);
        self.maintain_matches_inner().await;
        self.publish().await;
        Ok(())
    }
    pub async fn handle(&self, player: &str, value: Value) -> Result<Value, String> {
        let _operation = self.operations.lock().await;
        let action = value
            .get("action")
            .and_then(Value::as_str)
            .ok_or("Choose a social action.")?;
        // Chat does not serialize profiles, republish social views or touch physics.
        if matches!(action, "chat_send" | "chat_history") {
            return self.handle_chat(player, &value).await;
        }
        let string = |key: &str| {
            value
                .get(key)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        let result = match action {
            "mode_join" | "mode_cancel" | "mode_leave" | "hero_select" | "skin_redeem" | "skin_equip"
            | "hero_loadout_save" | "character_equip" | "character_outfit_save" | "character_outfit_delete"
            | "editor_apply" => self.handle_alpha(player, &value).await?,

            // These handlers reply directly or publish their own config/gameplay packet.
            "editor_vehicle_get" | "editor_vehicle_apply" => return self.handle_alpha(player, &value).await,
            "career_history" | "career_match" => return self.handle_career(player, &value).await,
            "vehicle_revive" => return self.handle_vehicle_revive(player, &value).await,
            // Gameplay snapshots already carry these effects; recasting the social lobby for each shot stalls unrelated peers.
            "vehicle_heal_pack" => return self.handle_vehicle_heal_pack(player, &value).await,
            "dive_shield" | "dps_guard_boost" | "tank_barrier" => return self.handle_vehicle_shield(player, action).await,
            "bridge_control" => {
                let runtime=self.runtime(player).await?;
                let mut room=runtime.lock().await;
                if !room.game.clients.contains_key(player){return Err("Connect before using the bridge.".into());}
                let tick=room.game.tick as u64;
                room.physics.operate_bridge(player,value.get("command").and_then(|c|c.as_str()).unwrap_or(""),tick)?;
                return Ok(json!({"bridge_updated":true}));
            }
            "tank_barrage" | "barrage" => {
                let runtime=self.runtime(player).await?;
                let mut room=runtime.lock().await;
                if !room.game.clients.contains_key(player) || !room.game.entities.get(player).is_some_and(|e|e.vehicle_id.is_some()) {
                    return Err("Deploy a vehicle before using Barrage.".into());
                }
                if room.round.as_ref().is_some_and(|r|r.phase!=crate::ctf::CtfPhase::Running) { return Err("Barrage is available during a live round.".into()); }
                room.physics.start_barrage(player)?;
                return Ok(json!({"activated":true}));
            }

            "identify" => {
                let previous = self.data.lock().await.clone();
                let token = value.get("token").and_then(Value::as_str);
                let (profile_id, new_token) = self
                    .data
                    .lock()
                    .await
                    .authenticate(token, &string("name"))?;
                if self.connections.lock().await.iter().any(|(id, client)| {
                    id != player && client.profile_id.as_deref() == Some(&profile_id)
                }) {
                    *self.data.lock().await = previous;
                    return Err("This player profile is already connected in another tab.".into());
                }
                let connection = self.connections.lock().await.get(player).cloned();
                let queued = self
                    .alpha
                    .lock()
                    .await
                    .queue
                    .iter()
                    .any(|ticket| ticket.player == player);
                if connection.as_ref().is_some_and(|client| {
                    client
                        .profile_id
                        .as_ref()
                        .is_some_and(|id| id != &profile_id)
                        && (client.world_id.is_some() || queued)
                }) {
                    *self.data.lock().await = previous;
                    return Err("Leave your current session before switching profiles.".into());
                }
                self.commit(previous).await?;
                self.connections
                    .lock()
                    .await
                    .get_mut(player)
                    .ok_or("The connection closed.")?
                    .profile_id = Some(profile_id.clone());
                self.restore_reservation(player, &profile_id).await;
                json!({"profile_id":profile_id,"token":new_token})
            }
            "refresh" => {
                self.publish_for(Some(player)).await;
                return Ok(json!({}));
            }
            "world_create" => {
                let actor = self.actor(player).await?;
                let map = string("map");
                if !map_available(&map) {
                    return Err("Choose an available map.".into());
                }
                let name = valid_name(&string("name"), 40)?;
                let capacity = value
                    .get("max_players")
                    .and_then(Value::as_u64)
                    .unwrap_or(10) as usize;
                if !(2..=MAX_WORLD_PLAYERS).contains(&capacity) {
                    return Err("World capacity must be between 2 and 10.".into());
                }
                let password = string("password");
                let hash = tokio::task::spawn_blocking(move || security::password_hash(&password))
                    .await
                    .map_err(|_| "Could not protect the world password.")??;
                let previous = self.data.lock().await.clone();
                let mut data = self.data.lock().await;
                if data.worlds.len() >= 256
                    || data
                        .worlds
                        .values()
                        .filter(|world| world.owner_id.as_deref() == Some(&actor))
                        .count()
                        >= 8
                {
                    return Err("The saved-world limit has been reached.".into());
                }
                let world_id = data.next_world;
                data.next_world += 1;
                data.worlds.insert(
                    world_id,
                    World {
                        mode: None,
                        id: world_id,
                        tire_thermals: value.get("tire_thermals").and_then(Value::as_bool).unwrap_or(false),
                        name,
                        map,
                        owner_id: Some(actor),
                        listed: value
                            .get("listed")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                        max_players: capacity,
                        password_hash: hash,
                        invite_code: id(),
                    },
                );
                drop(data);
                self.commit(previous).await?;
                json!({"world_id":world_id})
            }
            "world_tire_thermals" => {
                let actor=self.actor(player).await?;
                let world_id=value.get("world_id").and_then(Value::as_u64).ok_or("Select a world.")? as usize;
                let enabled=value.get("enabled").and_then(Value::as_bool).ok_or("Choose on or off.")?;
                let mut data=self.data.lock().await;
                let world=data.worlds.get(&world_id).ok_or("Unknown world.")?;
                if world.owner_id.as_deref()!=Some(&actor) || world.mode.is_some() {return Err("Only the owner may change saved-world handling.".into());}
                if world.tire_thermals==enabled {return Ok(json!({"enabled":enabled}));}
                let previous=data.clone();
                data.worlds.get_mut(&world_id).unwrap().tire_thermals=enabled;
                drop(data);
                self.commit(previous).await?;
                let runtime=self.runtimes.lock().await.get(&world_id).cloned();
                if let Some(runtime)=runtime {runtime.lock().await.physics.set_tire_thermals(enabled);}
                json!({"enabled":enabled})
            }
            "world_join" => {
                let _actor = self.actor(player).await?;
                let code = string("code").trim().to_ascii_lowercase();
                let world_id = value
                    .get("world_id")
                    .and_then(Value::as_u64)
                    .map(|v| v as usize)
                    .or_else(|| None);
                let world_id = if let Some(id) = world_id {
                    id
                } else {
                    self.data
                        .lock()
                        .await
                        .worlds
                        .values()
                        .find(|world| world.invite_code == code)
                        .map(|world| world.id)
                        .ok_or("That invite code is unavailable.")?
                };
                self.join_inner(player, world_id, &code, string("password"))
                    .await?
            }
            "world_leave" => {
                self.leave_inner(player).await;
                json!({})
            }
            "world_invite_dismiss" => {
                let actor = self.actor(player).await?;
                let previous = self.data.lock().await.clone();
                self.data
                    .lock()
                    .await
                    .world_invites
                    .retain(|invite| invite.to != actor || invite.id != string("invite_id"));
                self.commit(previous).await?;
                json!({})
            }
            _ => {
                let actor = self.actor(player).await?;
                let clients = self.connections.lock().await;
                let current = clients.get(player).and_then(|client| client.world_id);
                let occupied: Vec<usize> = clients
                    .values()
                    .filter_map(|client| client.world_id)
                    .collect();
                drop(clients);
                let command: SocialAction =
                    serde_json::from_value(value).map_err(|_| "Invalid social action.")?;
                let previous = self.data.lock().await.clone();
                let result = self
                    .data
                    .lock()
                    .await
                    .apply_action(&actor, command, current, &occupied)?;
                self.commit(previous).await?;
                result
            }
        };
        self.publish().await;
        Ok(result)
    }
}

mod alpha_sessions;
mod matches;
mod revival;
mod guard;
mod support;
mod chat;
#[cfg(test)]
mod tests;
mod views;
