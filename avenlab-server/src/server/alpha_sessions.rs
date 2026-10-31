//! Serialized alpha admission, FIFO queues and reconnect grace. This module
//! never accepts client-authored results, XP, currency or player identities.
use super::*;
use crate::alpha::{
    policy::{self, Role},
    progression::SKINS,
    *,
};
use std::collections::HashSet;

impl Server {
    pub(super) async fn check_alpha_admission(
        &self,
        player: &str,
        world_id: usize,
    ) -> Result<(), String> {
        let a = self.alpha.lock().await.clone();
        if !a.enabled {
            return Ok(());
        }
        let clients = self.connections.lock().await.clone();
        let mode = a.worlds.get(&world_id).copied().unwrap_or(Mode::Sandbox);
        if mode.bucket() == 0 && !a.pending_team.contains_key(player) {
            return Err("Join Quickplay or Competitive through its hero selection queue.".into());
        }
        let now = timestamp();
        let own = clients.get(player).and_then(|c| c.profile_id.as_ref());
        let reserved: Vec<_> = a
            .reservations
            .iter()
            .filter(|(id, r)| Some(*id) != own && r.expires > now)
            .collect();
        let occupied: HashSet<_> = clients
            .iter()
            .filter(|(id, _)| id.as_str() != player)
            .filter_map(|(_, c)| c.world_id)
            .chain(reserved.iter().map(|(_, r)| r.member.world))
            .collect();
        if occupied.iter().any(|id| {
            *id != world_id
                && a.worlds.get(id).copied().unwrap_or(Mode::Sandbox).bucket() == mode.bucket()
        }) {
            return Err(format!(
                "The {} world slot is busy. Join its queue.",
                mode.label()
            ));
        }
        let population = clients
            .iter()
            .filter(|(id, c)| id.as_str() != player && c.world_id == Some(world_id))
            .count()
            + reserved
                .iter()
                .filter(|(_, r)| r.member.world == world_id)
                .count();
        if population >= mode.capacity() {
            return Err("This alpha world is full or has a reconnect reservation.".into());
        }
        let total = clients
            .iter()
            .filter(|(id, c)| id.as_str() != player && c.world_id.is_some())
            .count()
            + reserved.len();
        if total >= self.max_players {
            return Err("The alpha active-player limit is full.".into());
        }
        Ok(())
    }
    pub(super) async fn reserve_disconnect(&self, player: &str) {
        let connection = self.connections.lock().await.get(player).cloned();
        let Some(client) = connection else { return };
        let (Some(profile), Some(world)) = (client.profile_id, client.world_id) else {
            return;
        };
        let mut a = self.alpha.lock().await;
        if !a.enabled {
            return;
        }
        let member = a.members.get(player).cloned().unwrap_or(Member {
            mode: Mode::Sandbox,
            world,
            hero: "ae86".into(),
            team: client.team,
        });
        let expires = timestamp() + a.grace_seconds;
        a.reservations
            .insert(profile, Reservation { member, expires });
    }
    pub(super) async fn restore_reservation(&self, player: &str, profile: &str) {
        let lease = self.alpha.lock().await.reservations.remove(profile);
        let Some(lease) = lease else { return };
        if lease.expires <= timestamp() {
            return;
        }
        self.alpha.lock().await.restoring.insert(player.into());
        self.alpha
            .lock()
            .await
            .pending_team
            .insert(player.into(), lease.member.team);
        let joined = self
            .join_inner(player, lease.member.world, "", String::new())
            .await;
        let mut a = self.alpha.lock().await;
        a.pending_team.remove(player);
        a.restoring.remove(player);
        if joined.is_ok() {
            a.members.insert(player.into(), lease.member);
        } else {
            a.reservations.insert(profile.into(), lease);
        }
    }
    async fn team_for_hero(
        &self,
        world: usize,
        hero: &str,
        except: Option<&str>,
    ) -> Result<Team, String> {
        let candidate = policy::hero(hero)?;
        let a = self.alpha.lock().await.clone();
        let clients = self.connections.lock().await.clone();
        let now = timestamp();
        let data = self.data.lock().await;
        let preferred = except
            .and_then(|player| clients.get(player))
            .and_then(|c| c.profile_id.as_ref())
            .and_then(|id| {
                data.groups_for(id).find_map(|group| {
                    clients
                        .values()
                        .find(|peer| {
                            peer.world_id == Some(world)
                                && peer
                                    .profile_id
                                    .as_ref()
                                    .is_some_and(|id| group.members.contains(id))
                        })
                        .map(|peer| peer.team)
                })
            });
        drop(data);
        let mut options = Vec::new();
        for team in [Team::Red, Team::Blue] {
            let roles: Vec<Role> = a
                .members
                .iter()
                .filter(|(id, m)| {
                    Some(id.as_str()) != except
                        && m.world == world
                        && m.team == team
                        && clients.contains_key(*id)
                })
                .filter_map(|(_, m)| policy::hero(&m.hero).ok().map(|h| h.role))
                .chain(
                    a.reservations
                        .values()
                        .filter(|r| {
                            r.expires > now && r.member.world == world && r.member.team == team
                        })
                        .filter_map(|r| policy::hero(&r.member.hero).ok().map(|h| h.role)),
                )
                .collect();
            if (a.enforce_roles && policy::role_fits(&roles, candidate.role))
                || (!a.enforce_roles && roles.len() < 5)
            {
                options.push((roles.len(), team));
            }
        }
        options.sort_by_key(|(count, team)| (usize::from(Some(*team) != preferred), *count));
        options
            .first()
            .map(|(_, team)| *team)
            .ok_or_else(|| "Both teams have filled the available slots for this role.".into())
    }
    async fn admit_mode(&self, ticket: &Ticket) -> Result<Value, String> {
        policy::hero(&ticket.hero)?;
        if !MAP_IDS.contains(&ticket.map.as_str()) {
            return Err("Choose an installed environment.".into());
        }
        let a = self.alpha.lock().await.clone();
        let clients = self.connections.lock().await.clone();
        let occupied: HashSet<usize> = clients
            .values()
            .filter_map(|c| c.world_id)
            .chain(
                a.reservations
                    .values()
                    .filter(|r| r.expires > timestamp())
                    .map(|r| r.member.world),
            )
            .collect();
        let busy = occupied
            .iter()
            .find(|id| {
                a.worlds.get(id).copied().unwrap_or(Mode::Sandbox).bucket() == ticket.mode.bucket()
            })
            .copied();
        let world = if let Some(world) = busy {
            let mode = a.worlds.get(&world).copied().unwrap_or(Mode::Sandbox);
            if ticket.mode.bucket() != 0 || mode != ticket.mode {
                return Err("The requested world slot is busy.".into());
            }
            world
        } else {
            let existing = {
                let data = self.data.lock().await;
                a.worlds
                    .iter()
                    .find(|(id, mode)| {
                        **mode == ticket.mode
                            && data.worlds.get(id).is_some_and(|w| w.map == ticket.map)
                    })
                    .map(|(id, _)| *id)
            };
            if let Some(id) = existing {
                id
            } else {
                let previous = self.data.lock().await.clone();
                let mut data = self.data.lock().await;
                if data.worlds.len() >= 256 {
                    return Err("The saved-world budget is full.".into());
                }
                let id = data.next_world;
                data.next_world += 1;
                data.worlds.insert(
                    id,
                    World {
                        mode: Some(ticket.mode),
                        id,
                        name: format!("ALPHA {}", ticket.mode.label()),
                        map: ticket.map.clone(),
                        owner_id: None,
                        listed: true,
                        max_players: ticket.mode.capacity(),
                        password_hash: None,
                        invite_code: crate::social::model::id(),
                    },
                );
                drop(data);
                self.commit(previous).await?;
                self.alpha.lock().await.worlds.insert(id, ticket.mode);
                id
            }
        };
        let team = if ticket.mode.bucket() == 0 {
            self.team_for_hero(world, &ticket.hero, Some(&ticket.player))
                .await?
        } else {
            Team::Red
        };
        self.alpha
            .lock()
            .await
            .pending_team
            .insert(ticket.player.clone(), team);
        let result = self
            .join_inner(&ticket.player, world, "", String::new())
            .await;
        self.alpha.lock().await.pending_team.remove(&ticket.player);
        let result = result?;
        self.alpha.lock().await.members.insert(
            ticket.player.clone(),
            Member {
                mode: ticket.mode,
                world,
                hero: ticket.hero.clone(),
                team,
            },
        );
        Ok(
            json!({"status":"joined","mode":ticket.mode,"world_id":world,"map":result["map"],"hero":ticket.hero}),
        )
    }
    async fn join_mode(&self, player: &str, value: &Value) -> Result<Value, String> {
        let profile = self.actor(player).await?;
        let mode = Mode::parse(value["mode"].as_str().unwrap_or("sandbox"))?;
        let hero = value["hero"].as_str().unwrap_or("ae86").to_string();
        policy::hero(&hero)?;
        let map = if mode.bucket() == 0 {
            "streaming_endless_city".to_string()
        } else {
            value["map"]
                .as_str()
                .unwrap_or("streaming_endless_city")
                .to_string()
        };
        if !MAP_IDS.contains(&map.as_str()) {
            return Err("Choose an installed environment.".into());
        }
        {
            let mut a = self.alpha.lock().await;
            a.queue.retain(|ticket| ticket.profile != profile);
            a.reservations.remove(&profile);
        }
        self.leave_inner(player).await;
        let ticket = Ticket {
            player: player.into(),
            profile,
            mode,
            map,
            hero,
            joined: timestamp(),
        };
        // New arrivals never bypass an older ticket in the same capacity bucket.
        let waiting = self
            .alpha
            .lock()
            .await
            .queue
            .iter()
            .any(|t| t.mode.bucket() == mode.bucket());
        if !waiting {
            if let Ok(result) = self.admit_mode(&ticket).await {
                return Ok(result);
            }
        }
        let mut a = self.alpha.lock().await;
        if a.queue.len() >= 64 {
            return Err("The alpha waiting line is full. Try again shortly.".into());
        }
        a.queue.push_back(ticket);
        Ok(json!({"status":"queued","mode":mode}))
    }
    pub(super) async fn handle_alpha(&self, player: &str, value: &Value) -> Result<Value, String> {
        match value["action"].as_str().unwrap_or("") {
            "mode_join" => self.join_mode(player, value).await,
            "mode_cancel" => {
                let profile = self.actor(player).await?;
                let mut a = self.alpha.lock().await;
                a.queue.retain(|t| t.profile != profile);
                a.reservations.remove(&profile);
                drop(a);
                self.leave_inner(player).await;
                Ok(json!({}))
            }
            "hero_select" => {
                self.select_hero(player, value["hero"].as_str().unwrap_or(""))
                    .await
            }
            "editor_apply" => self.apply_editor_document(player, value).await,
            "skin_redeem" | "skin_equip" => {
                let actor = self.actor(player).await?;
                let previous = self.data.lock().await.clone();
                let mut data = self.data.lock().await;
                let p = &mut data
                    .profiles
                    .get_mut(&actor)
                    .ok_or("Profile unavailable.")?
                    .progression;
                let id = value["skin"].as_str().unwrap_or("");
                if value["action"] == "skin_redeem" {
                    p.redeem(id)?
                } else {
                    p.equip(id)?
                }
                drop(data);
                self.commit(previous).await?;
                Ok(json!({}))
            }
            _ => Err("Unknown alpha action.".into()),
        }
    }
    pub async fn validate_alpha_vehicle(&self, player: &str, vehicle: &str) -> Result<(), String> {
        let a = self.alpha.lock().await;
        if let Some(member) = a.members.get(player) {
            if policy::hero(&member.hero)?.vehicle != vehicle {
                return Err("Choose this vehicle's hero in the lobby first.".into());
            }
        }
        Ok(())
    }
    async fn select_hero(&self, player: &str, id: &str) -> Result<Value, String> {
        let selected = policy::hero(id)?;
        let member = self
            .alpha
            .lock()
            .await
            .members
            .get(player)
            .cloned()
            .ok_or("Join a mode before locking a hero.")?;
        if member.mode.bucket() == 0 && self.alpha.lock().await.enforce_roles {
            let a = self.alpha.lock().await.clone();
            let roles: Vec<_> = a
                .members
                .iter()
                .filter(|(key, m)| {
                    key.as_str() != player && m.world == member.world && m.team == member.team
                })
                .filter_map(|(_, m)| policy::hero(&m.hero).ok().map(|h| h.role))
                .chain(
                    a.reservations
                        .values()
                        .filter(|r| {
                            r.expires > timestamp()
                                && r.member.world == member.world
                                && r.member.team == member.team
                        })
                        .filter_map(|r| policy::hero(&r.member.hero).ok().map(|h| h.role)),
                )
                .collect();
            if !policy::role_fits(&roles, selected.role) {
                return Err("That role would leave an invalid five-player team.".into());
            }
        }
        let runtime = self.runtime(player).await?;
        let mut room = runtime.lock().await;
        if room.physics.vehicles.contains_key(player) {
            room.physics
                .change_vehicle_for_player(player, selected.vehicle)?;
            room.game.set_vehicle_id(player, selected.vehicle);
            if let Some(entity) = room.game.entities.get_mut(player) {
                entity.last_packet = None;
            }
            let connection = self
                .connections
                .lock()
                .await
                .get(player)
                .cloned()
                .ok_or("Connection closed.")?;
            connection.input_tx.send_replace(None);
            let config = room.physics.vehicles.get(player).map(|v| v.config);
            if let Some(config) = config {
                let packet=json!({"type":"vehicle_config","data":crate::state::VehicleConfigPayload::new(player,config)}).to_string();
                for tx in room.game.clients.values() {
                    let _ = tx.send(packet.clone());
                }
            }
        }
        drop(room);
        if let Some(current) = self.alpha.lock().await.members.get_mut(player) {
            current.hero = id.into();
        }
        Ok(json!({"hero":id,"vehicle":selected.vehicle}))
    }
    async fn apply_editor_document(&self, player: &str, value: &Value) -> Result<Value, String> {
        let member = self
            .alpha
            .lock()
            .await
            .members
            .get(player)
            .cloned()
            .ok_or("Reserve the editor testing slot first.")?;
        if member.mode != Mode::Editor {
            return Err("Live physics edits require the dedicated editor world.".into());
        }
        let document = value
            .get("document")
            .ok_or("Export a valid editor document.")?;
        if serde_json::to_vec(document)
            .map_err(|_| "Invalid document.")?
            .len()
            > 768 * 1024
        {
            return Err("Editor document exceeds the alpha budget.".into());
        }
        let file: crate::world::block_colliders::BlockColliderFile =
            serde_json::from_value(document.clone()).map_err(|_| "Invalid editor map schema.")?;
        if file.schema_version != 2
            || file.visuals.len() > 32
            || file.roads.len() + file.buildings.len() > 512
            || file
                .cell
                .iter()
                .any(|v| !v.is_finite() || *v <= 0.0 || *v > 5000.0)
            || !file.surface.road_y.is_finite()
        {
            return Err("Editor map exceeds the alpha geometry budget.".into());
        }
        match file.layout {
            crate::world::block_colliders::MapLayout::FixedGrid { size, .. }
                if size.iter().any(|v| *v == 0 || *v > 3) =>
            {
                return Err("Test at most a 3 by 3 map grid.".into());
            }
            crate::world::block_colliders::MapLayout::Streamed { radius }
                if !(0..=1).contains(&radius) =>
            {
                return Err("Test at most a one-chunk streaming radius.".into());
            }
            _ => {}
        }
        if file.visuals.iter().any(|v| {
            !v.asset.starts_with("/models/")
                || !v.asset.ends_with(".glb")
                || v.asset.contains("..")
                || !v
                    .asset
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "_.,/ -".contains(c))
                || v.transform
                    .position
                    .iter()
                    .chain(v.transform.scale.iter())
                    .chain(v.transform.rotation.iter())
                    .any(|n| !n.is_finite())
        }) {
            return Err("Use installed model assets with finite transforms.".into());
        }
        if file
            .authored_layout
            .as_ref()
            .is_some_and(|layout| layout.objects.len() > 256)
        {
            return Err("Live editor tests allow up to 256 authored pieces.".into());
        }
        if file.roads.iter().chain(file.buildings.iter()).any(|b| {
            b.pos
                .iter()
                .chain(b.rot.iter())
                .chain(b.half_extents.iter())
                .any(|v| !v.is_finite())
                || b.pos.iter().any(|v| v.abs() > 100000.0)
                || b.rot.iter().map(|v| v * v).sum::<f32>() < 0.0001
                || b.half_extents.iter().any(|v| *v <= 0.0 || *v > 5000.0)
        }) {
            return Err("Invalid collider transform.".into());
        }
        let world = self
            .data
            .lock()
            .await
            .worlds
            .get(&member.world)
            .cloned()
            .ok_or("Editor world closed.")?;
        if file.map_id != world.map {
            return Err(
                "Choose the matching editor environment before applying this draft.".into(),
            );
        }
        let connection = self
            .connections
            .lock()
            .await
            .get(player)
            .cloned()
            .ok_or("Connection closed.")?;
        let vehicle = policy::hero(&member.hero)?.vehicle;
        let mut physics = tokio::task::spawn_blocking(move || {
            crate::physics::PhysicsWorld::from_editor_document(file)
        })
        .await
        .map_err(|_| "Editor physics build failed.")?
        .map_err(|e| e.to_string())?;
        let handle = physics.spawn_vehicle_for_player(
            player.into(),
            [0.0; 3],
            vehicle,
            member.team.as_str(),
        )?;
        let mut game = crate::state::SharedGameState::new();
        game.room_id = member.world;
        let spawn = game
            .spawns
            .allocate_in_room(player.into(), member.world, Some(member.team));
        game.register_client(
            player.into(),
            connection.tx.clone(),
            connection.frame.clone(),
            connection.input.clone(),
        );
        game.add_entity(player, crate::state::EntityType::Vehicle);
        game.apply_spawn_info(&spawn);
        game.attach_body(player, handle);
        game.set_vehicle_id(player, vehicle);
        let room = WorldRuntime { game, physics };
        let map = room.physics.map_snapshot();
        let runtime = Arc::new(Mutex::new(room));
        // Only the editor slot is replaced, and only after the full build succeeded.
        self.runtimes
            .lock()
            .await
            .insert(member.world, Arc::clone(&runtime));
        connection.input_tx.send_replace(None);
        connection.frame.send_replace(None);
        let _=connection.tx.send(json!({"type":"world_changed","world":{"id":world.id,"name":world.name,"map":world.map,"team":member.team.as_str()}}).to_string());
        runtime.lock().await.send_existing_configs(&connection.tx);
        let _ = connection
            .tx
            .send(json!({"type":"map_snapshot","world_id":world.id,"data":map}).to_string());
        Ok(json!({"world_id":world.id,"map":world.map,"applied":true}))
    }
    pub async fn maintain_alpha(&self) {
        let Ok(_operation) = self.operations.try_lock() else {
            return;
        };
        let now = timestamp();
        let before = self.alpha.lock().await.reservations.len();
        self.alpha
            .lock()
            .await
            .reservations
            .retain(|_, r| r.expires > now);
        let mut changed = before != self.alpha.lock().await.reservations.len();
        let clients = self.connections.lock().await.clone();
        let reserved: HashSet<_> = self
            .alpha
            .lock()
            .await
            .reservations
            .values()
            .map(|r| r.member.world)
            .collect();
        let mut unloaded = Vec::new();
        self.runtimes.lock().await.retain(|id, _| {
            let keep = reserved.contains(id) || clients.values().any(|c| c.world_id == Some(*id));
            if !keep { unloaded.push(*id); }
            keep
        });
        for world in unloaded { self.chat.lock().await.clear_world(world); }
        let tickets: Vec<_> = self.alpha.lock().await.queue.iter().cloned().collect();
        let mut blocked = HashSet::new();
        for ticket in tickets {
            if blocked.contains(&ticket.mode.bucket()) {
                continue;
            }
            if !clients.contains_key(&ticket.player) {
                self.alpha
                    .lock()
                    .await
                    .queue
                    .retain(|t| t.player != ticket.player);
                changed = true;
                continue;
            }
            if self.admit_mode(&ticket).await.is_ok() {
                self.alpha
                    .lock()
                    .await
                    .queue
                    .retain(|t| t.player != ticket.player);
                changed = true;
            } else {
                blocked.insert(ticket.mode.bucket());
            }
        }
        if changed {
            self.publish().await;
        }
    }
    /// Future match-rule code calls this after a verified result. Not exposed on
    /// the socket. One result ID can award a roster only once, even after reload.
    #[allow(dead_code)]
    pub async fn record_completed_match(
        &self,
        world: usize,
        winner: Team,
        result_id: &str,
    ) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        let a = self.alpha.lock().await.clone();
        let mode = a.worlds.get(&world).copied().ok_or("No managed match.")?;
        if !a.enforce_roles {
            return Err("Flex testing does not grant progression.".into());
        }
        if mode.bucket() != 0 {
            return Err("Testing worlds do not grant match rewards.".into());
        }
        let members: Vec<_> = a.members.iter().filter(|(_, m)| m.world == world).collect();
        if members.len() != 10
            || [Team::Red, Team::Blue]
                .iter()
                .any(|team| members.iter().filter(|(_, m)| m.team == *team).count() != 5)
        {
            return Err("A complete verified 5v5 roster is required.".into());
        }
        let previous = self.data.lock().await.clone();
        let mut data = self.data.lock().await;
        if result_id.is_empty() || result_id.len() > 128 {
            return Err("Invalid trusted result identifier.".into());
        }
        if data.completed_results.contains(result_id) {
            return Ok(());
        }
        if data.completed_results.len() >= 16384 {
            return Err("Result ledger needs archival before more rewards can be granted.".into());
        }
        let clients = self.connections.lock().await;
        for (player, member) in members {
            if let Some(profile) = clients
                .get(player)
                .and_then(|c| c.profile_id.as_ref())
                .and_then(|id| data.profiles.get_mut(id))
            {
                profile
                    .progression
                    .award(mode == Mode::Competitive, member.team == winner);
            }
        }
        data.completed_results.insert(result_id.into());
        drop(clients);
        drop(data);
        self.commit(previous).await?;
        self.publish().await;
        Ok(())
    }
    pub(super) fn alpha_view(
        a: &AlphaState,
        actor: &str,
        player: &str,
        clients: &HashMap<String, Connection>,
        data: &SocialData,
    ) -> Value {
        let ticket = a.queue.iter().find(|ticket| ticket.profile == actor);
        let queue=ticket.map(|ticket|json!({"mode":ticket.mode,"position":a.queue.iter().take_while(|t|t.profile!=actor).filter(|t|t.mode.bucket()==ticket.mode.bucket()).count()+1,"joined":ticket.joined,"size":a.queue.iter().filter(|t|t.mode.bucket()==ticket.mode.bucket()).count(),"reason":"Waiting for a free seat, compatible team role, or the current mode to empty. Reconnect seats are held briefly."}));
        let active = a.members.get(player).map(
            |m| json!({"mode":m.mode,"world_id":m.world,"hero":m.hero,"team":m.team.as_str()}),
        );
        let roster:Vec<_>=a.members.iter().filter(|(_,m)|m.mode.bucket()==0).filter_map(|(id,m)|clients.get(id).and_then(|c|c.profile_id.as_ref()).and_then(|id|data.profiles.get(id)).map(|p|json!({"id":p.id,"name":p.name,"team":m.team.as_str(),"hero":m.hero,"mode":m.mode,"reconnecting":false}))).chain(a.reservations.iter().filter(|(_,r)|r.expires>timestamp()&&r.member.mode.bucket()==0).filter_map(|(id,r)|data.profiles.get(id).map(|p|json!({"id":p.id,"name":p.name,"team":r.member.team.as_str(),"hero":r.member.hero,"mode":r.member.mode,"reconnecting":true})))).collect();
        json!({"enabled":a.enabled,"role_limits":a.enforce_roles,"queue":queue,"active":active,"roster":roster,"reconnect_grace_seconds":a.grace_seconds,"reserved_players":a.reservations.len(),"limits":{"match_worlds":1,"editor_worlds":1,"practice_worlds":1,"match_players":10,"editor_players":1,"practice_players":1},"skins":SKINS.iter().map(|s|json!({"id":s.0,"name":s.1,"cost":s.2,"color":s.3})).collect::<Vec<_>>()})
    }
}
