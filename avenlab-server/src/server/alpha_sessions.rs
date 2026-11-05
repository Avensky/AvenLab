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
        let mode = a.worlds.get(&world_id).copied().unwrap_or(Mode::Sandbox.into());
        if mode.bucket() == 0 && !a.pending_team.contains_key(player) {
            return Err("Join a match through its hero selection queue.".into());
        }
        let now = timestamp();
        let own = clients.get(player).and_then(|c| c.profile_id.as_ref());
        if mode.bucket() == 0 && !a.restoring.contains(player) {
            match self.match_phase(world_id).await {
                Some(crate::ctf::CtfPhase::Ended) => return Err("This match has ended.".into()),
                Some(crate::ctf::CtfPhase::Running) if self.played_in_round(world_id, own).await =>
                    return Err("Your previous seat in this match was released.".into()),
                _ => {}
            }
        }
        if mode.bucket() == 0 && !self.participant_slot_available(world_id, own.map(String::as_str)).await {
            return Err("This round has reached its participant history limit. Wait for the next match.".into());
        }
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
        if mode.bucket()!=0 && occupied.iter().any(|id| {
            *id != world_id
                && a.worlds.get(id).copied().unwrap_or(Mode::Sandbox.into()).bucket() == mode.bucket()
        }) {
            return Err(format!(
                "The {} world slot is busy. Join its queue.",
                mode.mode.label()
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
        let connection=self.connections.lock().await.get(player).cloned();
        let Some(client)=connection else{return};
        let (Some(profile),Some(world))=(client.profile_id,client.world_id) else{return};
        let format=self.data.lock().await.worlds.get(&world).map(|w|MatchFormat::for_world(w.mode.unwrap_or(Mode::Sandbox),w.max_players)).unwrap_or(Mode::Sandbox.into());
        let mode=format.mode;
        let practice=matches!(mode,Mode::Sandbox|Mode::Editor);
        let runtime=self.runtimes.lock().await.get(&world).cloned();
        let has_body=if let Some(runtime)=runtime{runtime.lock().await.physics.vehicles.contains_key(player)}else{false};
        let mut a=self.alpha.lock().await;
        if !a.enabled && !a.members.contains_key(player) && !(practice && has_body) { return; }
        let member=a.members.get(player).cloned().unwrap_or(Member{mode,team_size:format.team_size,world,hero:String::new(),team:client.team});
        let expires=timestamp()+if practice{600}else{a.grace_seconds};
        a.reservations.insert(profile,Reservation{member,expires,retained_player:(practice&&has_body).then(||player.into())});
        drop(a);
        if !practice { self.remember_downed_reconnect(player, world, expires).await; }
    }
    pub(super) async fn restore_reservation(&self, player: &str, profile: &str) {
        let lease=self.alpha.lock().await.reservations.remove(profile);
        let Some(lease)=lease else{self.recovery_result(player,false,"NO_RESERVATION").await;return};
        if lease.expires<=timestamp(){
            self.release_retained(&lease).await;self.recovery_result(player,false,"EXPIRED").await;return;
        }
        self.alpha.lock().await.restoring.insert(player.into());
        self.alpha.lock().await.pending_team.insert(player.into(),lease.member.team);
        let joined=self.join_inner(player,lease.member.world,"",String::new()).await;
        {let mut a=self.alpha.lock().await;a.pending_team.remove(player);a.restoring.remove(player);}
        if joined.is_ok(){
            let mut preserved=false;
            if let Some(old)=&lease.retained_player{
                let runtime=self.runtimes.lock().await.get(&lease.member.world).cloned();
                let client=self.connections.lock().await.get(player).cloned();
                if let (Some(runtime),Some(client))=(runtime,client){
                    let mut room=runtime.lock().await;preserved=room.resume(old,player,&client);
                    if preserved{let vehicle=room.game.entities[player].vehicle_id.clone().unwrap_or_else(||"ae86".into());let _=room.spawn(player,&vehicle);}
                    else{room.leave(old);}
                    drop(room);
                    if preserved{
                        if let Some(connection)=self.connections.lock().await.get_mut(player){connection.team=lease.member.team;}
                        let _=client.tx.send(json!({"type":"welcome","player_id":player,"room_id":lease.member.world,"team":lease.member.team.as_str(),"spawned":true}).to_string());
                    }
                }
            }
            if self.data.lock().await.worlds.get(&lease.member.world).is_some_and(|w|w.mode.is_some()){
                self.alpha.lock().await.members.insert(player.into(),lease.member.clone());
            }
            self.recovery_result(player,preserved,if preserved{"PRESERVED"}else{"REDEPLOY"}).await;
            self.replay_completed_result(player,lease.member.world).await;
        }else{
            self.alpha.lock().await.reservations.insert(profile.into(),lease);
            self.recovery_result(player,false,"WORLD_UNAVAILABLE").await;
        }
    }
    async fn recovery_result(&self,player:&str,preserved:bool,reason:&str){
        if let Some(c)=self.connections.lock().await.get(player){let _=c.tx.send(json!({"type":"session_restored","preserved":preserved,"reason":reason}).to_string());}
    }
    async fn release_retained(&self,lease:&Reservation){
        if let Some(old)=&lease.retained_player{
            let runtime=self.runtimes.lock().await.get(&lease.member.world).cloned();
            if let Some(runtime)=runtime{runtime.lock().await.leave(old);}
        }
    }
    async fn team_for_hero(
        &self,
        world: usize,
        hero: &str,
        except: Option<&str>,
    ) -> Result<Team, String> {
        let candidate = if hero.is_empty() { None } else { Some(policy::hero(hero)?) };
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
        let mode = a.worlds.get(&world).copied().unwrap_or(Mode::Quickplay.into());
        let mut options = Vec::new();
        for team in [Team::Red, Team::Blue] {
            // Unpicked seats count toward capacity but do not claim a role.
            // Reconnect reservations retain both their seat and any locked role.
            let seated: Vec<&Member> = a.members.iter()
                .filter(|(id, m)| Some(id.as_str()) != except && m.world == world
                    && m.team == team && clients.contains_key(*id))
                .map(|(_, m)| m)
                .chain(a.reservations.values()
                    .filter(|r| r.expires > now && r.member.world == world && r.member.team == team)
                    .map(|r| &r.member))
                .collect();
            let roles: Vec<Role> = seated.iter()
                .filter_map(|m| policy::hero(&m.hero).ok().map(|h| h.role)).collect();
            if seated.len() < mode.team_size && candidate.is_none_or(|hero|
                !a.enforce_roles || policy::role_fits_for_format(mode, &roles, hero.role)) {
                options.push((seated.len(), team));
            }
        }
        options.sort_by_key(|(count, team)| (usize::from(Some(*team) != preferred), *count));
        options
            .first()
            .map(|(_, team)| *team)
            .ok_or_else(|| "Both teams have filled the available slots for this role.".into())
    }
    /// Prefer a short-handed live match, then occupied lobbies, then idle worlds.
    async fn admit_mode(&self, ticket: &Ticket) -> Result<Value, String> {
        if !ticket.hero.is_empty() { policy::hero(&ticket.hero)?; }
        if !map_available(&ticket.map) { return Err("Choose an installed environment.".into()); }
        let format=ticket.format();
        // Admission only needs populations here. Do not clone every connection,
        // ticket and reservation for every waiting player on every queue sweep.
        let mut populations = HashMap::new();
        for world in self.connections.lock().await.values().filter_map(|c| c.world_id) {
            *populations.entry(world).or_insert(0usize) += 1;
        }
        let now = timestamp();
        let formats = {
            let alpha = self.alpha.lock().await;
            for lease in alpha.reservations.values().filter(|lease| lease.expires > now) {
                *populations.entry(lease.member.world).or_default() += 1;
            }
            if populations.values().sum::<usize>() >= self.max_players {
                return Err("The server active-player budget is full. Waiting for a seat.".into());
            }
            if format.bucket() != 0 && populations.keys().any(|world|
                alpha.worlds.get(world).is_some_and(|f| f.bucket() == format.bucket())) {
                return Err("The requested editor/practice world slot is busy.".into());
            }
            alpha.worlds.iter().filter_map(|(&id, &f)| (f == format).then_some(id)).collect::<Vec<_>>()
        };
        let worlds: Vec<_> = {
            let data = self.data.lock().await;
            formats.into_iter().filter(|world| data.worlds.get(world)
                .is_some_and(|w| w.map == ticket.map)).collect()
        };
        let mut candidates = Vec::new();
        for world in worlds {
            let seats = populations.get(&world).copied().unwrap_or(0);
            if seats >= format.capacity() { continue; }
            let priority = match self.match_phase(world).await {
                Some(crate::ctf::CtfPhase::Ended) => continue,
                Some(crate::ctf::CtfPhase::Running) => 0,
                _ if seats > 0 => 1,
                _ => 2,
            };
            candidates.push((priority, world));
        }
        candidates.sort_unstable();
        for (_, world) in candidates {
            if let Ok(result)=self.admit_ticket_to_world(ticket,world).await {return Ok(result);}
        }
        if self.runtimes.lock().await.len()>=self.max_active_worlds {return Err("The active-world budget is full. Waiting for a matching lobby or a free world.".into());}
        let previous=self.data.lock().await.clone();
        let mut data=self.data.lock().await;
        if data.worlds.len()>=256 {return Err("The saved-world budget is full.".into());}
        let world=data.next_world;data.next_world+=1;
        data.worlds.insert(world,World{tire_thermals:crate::tire_thermals::server_default(),mode:Some(ticket.mode),id:world,
            name:if format.bucket()==0 {format!("ALPHA {} {}V{}",ticket.mode.label(),format.team_size,format.team_size)}else{format!("ALPHA {}",ticket.mode.label())},
            map:ticket.map.clone(),owner_id:None,listed:true,max_players:format.capacity(),password_hash:None,invite_code:crate::social::model::id()});
        drop(data);self.commit(previous).await?;
        self.alpha.lock().await.worlds.insert(world,format);
        self.admit_ticket_to_world(ticket,world).await
    }
    async fn admit_ticket_to_world(&self,ticket:&Ticket,world:usize)->Result<Value,String>{
        let team=if ticket.mode.bucket()==0 {self.team_for_hero(world,&ticket.hero,Some(&ticket.player)).await?}else{Team::Red};
        self.alpha.lock().await.pending_team.insert(ticket.player.clone(),team);
        let result=self.join_inner(&ticket.player,world,"",String::new()).await;
        self.alpha.lock().await.pending_team.remove(&ticket.player);
        let result=result?;
        self.alpha.lock().await.members.insert(ticket.player.clone(),Member{mode:ticket.mode,team_size:ticket.team_size,world,hero:ticket.hero.clone(),team});
        Ok(json!({"status":"joined","mode":ticket.mode,"team_size":ticket.team_size,"capacity":ticket.format().capacity(),"world_id":world,"map":result["map"],"hero":ticket.hero}))
    }
    async fn join_mode(&self, player: &str, value: &Value) -> Result<Value, String> {
        let profile = self.actor(player).await?;
        let mode = Mode::parse(value["mode"].as_str().unwrap_or("sandbox"))?;
        let format=MatchFormat::requested(mode,value.get("team_size"))?;
        let hero = value["hero"].as_str().unwrap_or("").to_string();
        if !hero.is_empty() { policy::hero(&hero)?; }
        let map = if mode.bucket() == 0 {
            "streaming_endless_city".to_string()
        } else {
            value["map"]
                .as_str()
                .unwrap_or("streaming_endless_city")
                .to_string()
        };
        if !map_available(&map) {
            return Err("Choose an installed environment.".into());
        }
        let released={let mut a=self.alpha.lock().await;a.queue.retain(|ticket|ticket.profile!=profile);a.reservations.remove(&profile)};
        if let Some(lease)=released{self.release_retained(&lease).await;}
        self.leave_inner(player).await;
        let ticket = Ticket {
            player: player.into(),
            profile,
            mode,
            team_size:format.team_size,
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
            .any(|t| t.format() == format);
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
        Ok(json!({"status":"queued","mode":mode,"team_size":format.team_size,"capacity":format.capacity()}))
    }
    pub(super) async fn handle_alpha(&self, player: &str, value: &Value) -> Result<Value, String> {
        match value["action"].as_str().unwrap_or("") {
            "mode_join" => self.join_mode(player, value).await,
            "mode_cancel" | "mode_leave" => {
                let profile = self.actor(player).await?;
                let mut a = self.alpha.lock().await;
                a.queue.retain(|t| t.profile != profile);
                let released=a.reservations.remove(&profile);
                drop(a);
                if let Some(lease)=released{self.release_retained(&lease).await;}
                self.leave_inner(player).await;
                Ok(json!({}))
            }
            "hero_select" => {
                self.select_hero(player, value["hero"].as_str().unwrap_or(""))
                    .await
            }
            "editor_apply" => self.apply_editor_document(player, value).await,
            "editor_vehicle_get" | "editor_vehicle_apply" => self.edit_vehicle(player, value).await,
            "hero_loadout_save" => {
                let actor=self.actor(player).await?;
                let hero=value["hero"].as_str().ok_or("Choose a hero.")?;
                let selected=policy::hero(hero)?;
                let appearance: crate::alpha::appearance::HeroAppearance=serde_json::from_value(value["appearance"].clone()).map_err(|_|"Invalid appearance payload.")?;
                let previous=self.data.lock().await.clone();
                let mut data=self.data.lock().await;
                let p=&mut data.profiles.get_mut(&actor).ok_or("Profile unavailable.")?.progression;
                appearance.validate(&p.owned)?;
                p.hero_loadouts.insert(selected.vehicle.into(),appearance.clone());
                if value["make_default"].as_bool()==Some(true) { p.default_hero=hero.into(); }
                drop(data);self.commit(previous).await?;
                if let Ok(runtime)=self.runtime(player).await {
                    let mut room=runtime.lock().await;
                    if let Some(entity)=room.game.entities.get_mut(player) {
                        if entity.vehicle_id.as_deref()==Some(selected.vehicle) { entity.appearance=appearance; }
                    }
                }
                Ok(json!({}))
            }
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
            if member.hero.is_empty() { return Err("Choose a hero before deploying.".into()); }
            if policy::hero(&member.hero)?.vehicle != vehicle {
                return Err("Choose this vehicle's hero in the lobby first.".into());
            }
        }
        Ok(())
    }
    async fn select_hero(&self, player: &str, id: &str) -> Result<Value, String> {
        if let Ok(runtime) = self.runtime(player).await {
            let room = runtime.lock().await;
            if let Some(round) = &room.round {
                if round.phase == crate::ctf::CtfPhase::Ended {
                    return Err("This match has ended.".into());
                }
                if round.phase == crate::ctf::CtfPhase::Running {
                    let alpha = self.alpha.lock().await;
                    let member = alpha.members.get(player).ok_or("Join a mode before choosing a hero.")?;
                    // A replacement arrives without a pick. Its first selection goes
                    // through the same role checks as a waiting-room selection.
                    if !member.hero.is_empty() {
                        if member.hero != id {
                            return Err("Your hero is locked for this CTF round. Choose a different hero for the next match.".into());
                        }
                        return Ok(json!({"hero":id,"vehicle":policy::hero(id)?.vehicle}));
                    }
                }
            }
        }
        if id.is_empty() {
            // Back may clear a pre-deployment choice without releasing its
            // seat. A live vehicle must keep its validated role/loadout.
            let runtime = self.runtime(player).await?;
            if runtime.lock().await.physics.vehicles.contains_key(player) {
                return Err("A deployed hero cannot be cleared; use Change vehicle.".into());
            }
            let mut alpha = self.alpha.lock().await;
            let member = alpha.members.get_mut(player).ok_or("Join a mode before choosing a hero.")?;
            member.hero.clear();
            return Ok(json!({"hero":""}));
        }
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
            if !policy::role_fits_for_format(member.format(), &roles, selected.role) {
                return Err(format!("That role would leave an invalid {}-player team.", member.team_size));
            }
        }
        let runtime = self.runtime(player).await?;
        let appearance=self.saved_appearance(player,selected.vehicle).await;
        let mut room = runtime.lock().await;
        if room.physics.vehicles.contains_key(player) {
            room.physics
                .change_vehicle_for_player(player, selected.vehicle)?;
            room.game.set_vehicle_id(player, selected.vehicle);
            if let Some(entity)=room.game.entities.get_mut(player) { entity.appearance=appearance; }
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
                let packet=json!({"type":"vehicle_config","data":crate::state::VehicleConfigPayload::new(player,config)});
                room.game.broadcast_vehicle_config_json(player,packet);
            }
        }
        room.physics.set_assigned_hero(player,id);
        drop(room);
        if let Some(current) = self.alpha.lock().await.members.get_mut(player) {
            current.hero = id.into();
        }
        Ok(json!({"hero":id,"vehicle":selected.vehicle}))
    }
    async fn edit_vehicle(&self, player: &str, value: &Value) -> Result<Value, String> {
        let member = self.alpha.lock().await.members.get(player).cloned()
            .ok_or("Reserve the editor slot first.")?;
        if member.mode != Mode::Editor { return Err("Vehicle tuning is available only in World Editor.".into()); }
        let vehicle_id = policy::hero(&member.hero)?.vehicle;
        let factory = crate::vehicle_setup::config_for_vehicle(vehicle_id).ok_or("Unknown vehicle.")?;
        let runtime = self.runtime(player).await?;
        let mut room = runtime.lock().await;
        if value["action"] == "editor_vehicle_apply" {
            let patch = value["tuning"].as_object().ok_or("Supply a tuning object.")?;
            let config = crate::vehicle_tuning::validated_config(factory, patch)?;
            room.physics.configure_vehicle_for_player(player, config)?;
            if let Some(entity) = room.game.entities.get_mut(player) { entity.last_packet = None; }
            if let Some(connection) = self.connections.lock().await.get(player) {
                connection.input_tx.send_replace(None);
            }
            let packet = json!({"type":"vehicle_config","data":crate::state::VehicleConfigPayload::new(player,config)}).to_string();
            for tx in room.game.clients.values() { let _ = tx.send(packet.clone()); }
        }
        let current = room.physics.vehicles.get(player).ok_or("Deploy a test vehicle first.")?.config;
        Ok(json!({"vehicle":vehicle_id,"factory":factory,"current":current}))
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
        if !map_available(&file.map_id) { return Err("Unknown editor environment.".into()); }
        let mut world = world;
        world.map = file.map_id.clone();
        let old_runtime = self.runtime(player).await?;
        let previous_config = old_runtime.lock().await.physics.vehicles.get(player).map(|v|v.config);
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
        if let Some(config) = previous_config { physics.configure_vehicle_for_player(player, config)?; }
        physics.set_assigned_hero(player,&member.hero);
        let ability=if member.hero=="tank" {"tank_barrier"}else{"guard_boost"};
        let dive_cooldown=self.ability_cooldown(player,"dive_shield").await;
        let guard_cooldown=self.ability_cooldown(player,ability).await;
        let guard=physics.guard_boosts.entry(player.into()).or_default();
        guard.cooldown=guard_cooldown;guard.dive_cooldown=dive_cooldown;
        physics.support.ensure_cooldown(player,self.ability_cooldown(player,"heal_pack").await);
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
        if let Some(entity)=game.entities.get_mut(player) { entity.appearance=self.saved_appearance(player,vehicle).await; }
        physics.set_tire_thermals(world.tire_thermals);
        let room = WorldRuntime::from_parts(game, physics);
        let packet = room.physics.map_snapshot_packet(world.id);
        let runtime = Arc::new(Mutex::new(room));
        // Environment switches update this editor slot only, after successful validation.
        if let Some(record) = self.data.lock().await.worlds.get_mut(&member.world) { record.map = world.map.clone(); }
        // Only the editor slot is replaced, and only after the full build succeeded.
        self.runtimes
            .lock()
            .await
            .insert(member.world, Arc::clone(&runtime));
        connection.input_tx.send_replace(None);
        connection.frame.send_replace(None);
        let _=connection.tx.send(json!({"type":"world_changed","world":{"id":world.id,"name":world.name,"map":world.map,"team":member.team.as_str()}}).to_string());
        runtime.lock().await.send_existing_configs(player,&connection.tx);
        let _ = connection
            .tx
            .send(packet);
        Ok(json!({"world_id":world.id,"map":world.map,"applied":true}))
    }
    pub async fn maintain_alpha(&self) {
        let Ok(_operation) = self.operations.try_lock() else {
            return;
        };
        let now = timestamp();
        let expired:Vec<_>={let mut alpha=self.alpha.lock().await;let keys:Vec<_>=alpha.reservations.iter().filter(|(_,r)|r.expires<=now).map(|(id,_)|id.clone()).collect();keys.into_iter().filter_map(|id|alpha.reservations.remove(&id)).collect()};
        for lease in &expired{self.release_retained(lease).await;}
        let mut changed=!expired.is_empty();
        // Admission maintenance only needs socket IDs and occupied worlds, not
        // cloned frame/input channels, profile strings or outbox handles.
        let clients: HashMap<_, _> = self.connections.lock().await.iter()
            .map(|(id, client)| (id.clone(), client.world_id)).collect();
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
            let keep = reserved.contains(id) || clients.values().any(|world| *world == Some(*id));
            if !keep { unloaded.push(*id); }
            keep
        });
        for world in unloaded {
            self.mark_expired_participants(world).await;
            self.finish_empty_activity(world).await;
            self.chat.lock().await.clear_world(world);
        }
        let (tickets, held) = {
            let alpha = self.alpha.lock().await;
            (alpha.queue.iter().cloned().collect::<Vec<_>>(), alpha.reservations.len())
        };
        let mut free = self.max_players.saturating_sub(held + clients.values().filter(|world| world.is_some()).count());
        for ticket in tickets {
            if !clients.contains_key(&ticket.player) {
                self.alpha
                    .lock()
                    .await
                    .queue
                    .retain(|t| t.player != ticket.player);
                changed = true;
                continue;
            }
            if free == 0 { break; }
            if self.admit_mode(&ticket).await.is_ok() {
                free -= 1;
                self.alpha
                    .lock()
                    .await
                    .queue
                    .retain(|t| t.player != ticket.player);
                changed = true;
            }
        }
        if changed {
            self.publish().await;
        }
    }
    /// Compatibility adapter for trusted server integrations. Real CTF uses
    /// its frozen completion event; no socket action can invoke this adapter.
    #[allow(dead_code)]
    pub async fn record_completed_match(&self, world: usize, winner: Team, result_id: &str) -> Result<(), String> {
        let _operation = self.operations.lock().await;
        let a = self.alpha.lock().await.clone();
        let mode = a.worlds.get(&world).copied().ok_or("No managed match.")?;
        if !a.enforce_roles || mode.bucket() != 0 { return Err("Testing worlds do not grant match rewards.".into()); }
        let members: Vec<_> = a.members.iter().filter(|(_, m)| m.world == world).collect();
        if members.len() != mode.capacity() || [Team::Red, Team::Blue].iter().any(|team| {
            let roles: Vec<_> = members.iter().filter(|(_, m)| m.team == *team)
                .filter_map(|(_, m)| policy::hero(&m.hero).ok().map(|h| h.role)).collect();
            !policy::complete_team_format(mode, &roles)
        }) {
            return Err(format!("A complete verified {}v{} roster is required.", mode.team_size, mode.team_size));
        }
        let clients = self.connections.lock().await.clone();
        let data = self.data.lock().await;
        let mut participants = Vec::new();
        for (player, member) in members {
            let profile = clients.get(player).and_then(|c| c.profile_id.as_ref()).and_then(|id| data.profiles.get(id)).ok_or("An authenticated match profile is unavailable.")?;
            let vehicle = policy::hero(&member.hero)?.vehicle;
            participants.push(crate::alpha::career::CareerParticipant {
                profile_id: profile.id.clone(), name: profile.name.clone(), team: Some(member.team.as_str().into()),
                hero: member.hero.clone(), appearance: profile.progression.hero_loadouts.get(vehicle).cloned().unwrap_or_default(),
                ..Default::default()
            });
        }
        let map = data.worlds.get(&world).map(|w| w.map.clone()).ok_or("Match world unavailable.")?;
        drop(data);
        let record = crate::alpha::career::CareerMatch {
            match_id: result_id.into(), world_id: world, mode:mode.mode, team_size:Some(mode.team_size), map, ended_at: timestamp(),
            progression_eligible: true, winner: Some(winner.as_str().into()), participants, ..Default::default()
        };
        self.persist_record(&record).await
    }
    #[cfg(test)]
    pub(super) fn alpha_view(
        a: &AlphaState,
        actor: &str,
        player: &str,
        clients: &HashMap<String, Connection>,
        data: &SocialData,
        max_active_worlds:usize,
    ) -> Value {
        Self::alpha_view_for_phases(a,actor,player,clients,data,max_active_worlds,&HashMap::new())
    }
    pub(super) fn alpha_view_for_phases(
        a:&AlphaState,actor:&str,player:&str,clients:&HashMap<String,Connection>,data:&SocialData,
        max_active_worlds:usize,phases:&HashMap<usize,(String,crate::ctf::CtfPhase)>,
    )->Value {
        let ticket = a.queue.iter().find(|ticket| ticket.profile == actor);
        let queue=ticket.map(|ticket|json!({"mode":ticket.mode,"team_size":ticket.team_size,"capacity":ticket.format().capacity(),"position":a.queue.iter().take_while(|t|t.profile!=actor).filter(|t|t.format()==ticket.format()).count()+1,"joined":ticket.joined,"size":a.queue.iter().filter(|t|t.format()==ticket.format()).count(),"reason":"Waiting for this mode and match size, a compatible role, or server world/player capacity. Reconnect seats are held briefly."}));
        let active = a.members.get(player).map(
            |m| { let caps=m.format().role_caps(); let minimums=m.format().role_minimums(); json!({"mode":m.mode,"world_id":m.world,"hero":m.hero,"team":m.team.as_str(),"team_size":m.team_size,"capacity":m.format().capacity(),"role_caps":{"tank":caps[0],"dps":caps[1],"support":caps[2]},"role_minimums":{"tank":minimums[0],"dps":minimums[1],"support":minimums[2]}}) },
        );
        let mut active=active;
        if let Some(value)=active.as_mut() {
            let phase=a.members.get(player).and_then(|m|phases.get(&m.world));
            value["match_id"]=phase.map(|(id,_)|json!(id)).unwrap_or(Value::Null);
            value["match_phase"]=phase.map(|(_,phase)|json!(phase)).unwrap_or(Value::Null);
        }
        let viewer=a.members.get(player).or_else(||a.reservations.get(actor).filter(|r|r.expires>timestamp()).map(|r|&r.member));
        // Public cards expose only the equipped vehicle appearance, never the
        // profile's credentials, inventory or other vehicle loadouts.
        let card = |profile: &Profile, member: &Member, reconnecting: bool| {
            let teammate=viewer.is_some_and(|viewer|viewer.world==member.world&&viewer.team==member.team);
            let started=phases.get(&member.world).is_some_and(|(_,phase)|*phase!=crate::ctf::CtfPhase::Waiting);
            let hidden=profile.id!=actor&&!teammate&&!started;
            let showcase=if member.hero.is_empty(){profile.progression.showcase_hero()}else{member.hero.as_str()};
            let appearance = policy::hero(showcase).ok()
                .and_then(|hero| profile.progression.hero_loadouts.get(hero.vehicle))
                .cloned().unwrap_or_default();
            json!({"id":profile.id,"name":profile.name,"team":member.team.as_str(),
                "hero":if hidden{""}else{&member.hero},"showcase_hero":if hidden{""}else{showcase},"hero_hidden":hidden,"mode":member.mode,"team_size":member.team_size,"world_id":member.world,
                "reconnecting":reconnecting,"appearance":if hidden{Value::Null}else{json!(appearance)}})
        };
        let roster: Vec<_> = a.members.iter().filter(|(_, m)| m.mode.bucket() == 0)
            .filter_map(|(id, member)| clients.get(id)
                .and_then(|c| c.profile_id.as_ref())
                .and_then(|id| data.profiles.get(id))
                .map(|profile| card(profile, member, false)))
            .chain(a.reservations.iter()
                .filter(|(_, r)| r.expires > timestamp() && r.member.mode.bucket() == 0)
                .filter_map(|(id, r)| data.profiles.get(id)
                    .map(|profile| card(profile, &r.member, true))))
            .collect();
        json!({"enabled":a.enabled,"role_limits":a.enforce_roles,"queue":queue,"active":active,"roster":roster,"reconnect_grace_seconds":a.grace_seconds,"reserved_players":a.reservations.len(),"limits":{"match_worlds":max_active_worlds,"editor_worlds":1,"practice_worlds":1,"match_players":10,"skirmish_players":6,"editor_players":1,"practice_players":1},"skins":SKINS.iter().map(|s|json!({"id":s.0,"name":s.1,"cost":s.2,"color":s.3})).collect::<Vec<_>>()})
    }
}
