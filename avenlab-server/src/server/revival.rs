//! Mechanic ability authority. Client packets nominate a nearby vehicle only;
//! profiles, chosen heroes, teams, cooldowns and recovery state come from server data.
use super::*;
use std::time::{Duration, Instant};

pub(super) const REVIVE_RANGE_METRES: f32 = 8.0;
pub(super) const REVIVE_HEIGHT_METRES: f32 = 4.0;
pub(super) const REVIVE_MAX_SPEED_MPS: f32 = 3.0;

/// A profile deadline supplements the body's simulation timer. A disconnected
/// Quickplay player receives a new body, so body state alone could reset this
/// ability during the reconnect grace period. Expired entries are pruned on use.
#[derive(Default)]
pub(super) struct RevivalState {
    deadlines: HashMap<String, Instant>,
    ability_deadlines: HashMap<(String, &'static str), Instant>,
    downed: HashMap<String, DownedLease>,
}
#[derive(Clone)]
pub(super) struct DownedLease {
    world: usize,
    match_id: Option<String>,
    saved_at: Instant,
    expires: Instant,
    life: crate::vehicle_health::DownedLifecycle,
    fuel_fraction: f32,
    nos_fraction: f32,
    temperature_c: f32,
    condition: f32,
    ultimate_fraction: f32,
}
impl RevivalState {
    pub(super) fn ability_remaining(&mut self, profile: &str, ability: &'static str) -> f32 {
        self.ability_cooldowns(profile,[ability])[0]
    }
    pub(super) fn ability_cooldowns<const N:usize>(&mut self, profile:&str, keys:[&'static str;N])->[f32;N] {
        let now=Instant::now();
        self.ability_deadlines.retain(|_,ready|*ready>now);
        keys.map(|key|self.ability_deadlines.get(&(profile.into(),key))
            .map(|ready|ready.duration_since(now).as_secs_f32()).unwrap_or(0.0))
    }
    pub(super) fn ability_used(&mut self, profile: String, ability: &'static str, cooldown:f32) {
        if cooldown.is_finite()&&cooldown>0.0&&cooldown<=300.0 {self.ability_deadlines.insert((profile,ability),Instant::now()+Duration::from_secs_f32(cooldown));}
    }
    fn remaining(&mut self, profile: &str) -> f32 {
        let now = Instant::now();
        self.deadlines.retain(|_, ready| *ready > now);
        self.deadlines.get(profile).map(|ready| ready.duration_since(now).as_secs_f32()).unwrap_or(0.0)
    }
    fn used(&mut self, profile: String, cooldown: f32) {
        if cooldown.is_finite() && cooldown > 0.0 {
            self.deadlines.insert(profile, Instant::now() + Duration::from_secs_f32(cooldown));
        }
    }
}

impl DownedLease {
    pub(super) fn restore(self, room: &mut WorldRuntime, player: &str) -> Result<(), String> {
        room.physics.restore_downed_lifecycle(player, &self.life)?;
        if let Some(vehicle) = room.physics.vehicles.get_mut(player) {
            vehicle.powertrain.fuel_liters = self.fuel_fraction * vehicle.config.resources.fuel_capacity_liters;
            vehicle.powertrain.nos_remaining_s = self.nos_fraction * vehicle.config.resources.nos_seconds;
            if self.temperature_c.is_finite() { vehicle.powertrain.temperature_c = self.temperature_c; }
            if self.condition.is_finite() { vehicle.powertrain.condition = self.condition.clamp(0.0,1.0); }
            if self.ultimate_fraction.is_finite() { vehicle.powertrain.ultimate_fraction = self.ultimate_fraction.clamp(0.0,1.0); }
        }
        Ok(())
    }
}

impl Server {
    pub(super) async fn revival_cooldown(&self, player: &str) -> f32 {
        let profile = self.connections.lock().await.get(player).and_then(|client| client.profile_id.clone());
        let Some(profile) = profile else { return 0.0; };
        self.revivals.lock().await.remaining(&profile)
    }

    pub(super) async fn reset_revival_cooldowns(&self, world: usize) {
        let mut profiles: Vec<_> = self.connections.lock().await.values()
            .filter(|client| client.world_id == Some(world))
            .filter_map(|client| client.profile_id.clone()).collect();
        profiles.extend(self.alpha.lock().await.reservations.iter()
            .filter(|(_, lease)| lease.member.world == world).map(|(profile, _)| profile.clone()));
        let mut revivals = self.revivals.lock().await;
        for profile in profiles { revivals.deadlines.remove(&profile); revivals.ability_deadlines.retain(|(owner,_),_|owner!=&profile); }
        revivals.downed.retain(|_, lease| lease.world != world);
    }

    /// A reconnect may replace the rigid body, but never the active recovery
    /// window. Keep only lifecycle/resources: career journals already captured
    /// the departed body's totals, so copying its statistics would double them.
    pub(super) async fn remember_downed_reconnect(&self, player: &str, world: usize, expires: u64) {
        let profile = self.connections.lock().await.get(player).and_then(|client| client.profile_id.clone());
        let Some(profile) = profile else { return; };
        let runtime = self.runtimes.lock().await.get(&world).cloned();
        let state = if let Some(runtime) = runtime {
            let room = runtime.lock().await;
            room.physics.vehicle_health.get(player).and_then(|health| health.downed_lifecycle())
                .zip(room.physics.vehicles.get(player)).map(|(life, vehicle)| {
                    let fraction = |value:f32, capacity:f32| if value.is_finite() && capacity.is_finite() && capacity > 0.0 {(value / capacity).clamp(0.0,1.0)}else{0.0};
                    let now = Instant::now();
                    DownedLease { world, match_id: room.round.as_ref().map(|round| round.match_id.clone()),
                        saved_at: now, expires: now + Duration::from_secs(expires.saturating_sub(timestamp())), life,
                        fuel_fraction: fraction(vehicle.powertrain.fuel_liters, vehicle.config.resources.fuel_capacity_liters),
                        nos_fraction: fraction(vehicle.powertrain.nos_remaining_s, vehicle.config.resources.nos_seconds),
                        temperature_c: vehicle.powertrain.temperature_c,
                        condition: vehicle.powertrain.condition, ultimate_fraction: vehicle.powertrain.ultimate_fraction }
                })
        } else { None };
        let mut revivals = self.revivals.lock().await;
        let now = Instant::now();
        revivals.downed.retain(|_, lease| lease.expires > now);
        if let Some(state) = state { revivals.downed.insert(profile, state); }
        else { revivals.downed.remove(&profile); }
    }

    pub(super) async fn take_downed_reconnect(&self, player: &str, world: usize, match_id: Option<&str>) -> Option<DownedLease> {
        let profile = self.connections.lock().await.get(player).and_then(|client| client.profile_id.clone())?;
        let mut lease = self.revivals.lock().await.downed.remove(&profile)?;
        if lease.world != world || lease.match_id.as_deref() != match_id || lease.expires <= Instant::now() { return None; }
        lease.life.remaining_s = (lease.life.remaining_s - lease.saved_at.elapsed().as_secs_f32()).max(0.0);
        Some(lease)
    }

    pub(super) async fn clear_downed_reconnect(&self, player: &str) {
        if let Some(profile) = self.connections.lock().await.get(player).and_then(|client| client.profile_id.clone()) {
            self.revivals.lock().await.downed.remove(&profile);
        }
    }

    pub(super) async fn handle_vehicle_revive(&self, player: &str, value: &Value) -> Result<Value, String> {
        let profile = self.actor(player).await?;
        let target = value["target"].as_str().filter(|target| !target.is_empty() && target.len() <= 128 && !target.chars().any(char::is_control))
            .ok_or("Choose a disabled teammate.")?;
        if target == player { return Err("A mechanic cannot revive their own vehicle.".into()); }
        let clients = self.connections.lock().await;
        let actor = clients.get(player).ok_or("The connection closed.")?;
        let world = actor.world_id.ok_or("Join a world before reviving a teammate.")?;
        let target_client = clients.get(target).filter(|client| client.profile_id.is_some() && client.world_id == Some(world))
            .ok_or("That teammate is not connected to your world.")?;
        if actor.team != target_client.team { return Err("Mechanic recovery can only help your own team.".into()); }
        let target_input = target_client.input_tx.clone();
        drop(clients);

        let member = self.alpha.lock().await.members.get(player).cloned()
            .filter(|member| member.world == world && member.hero == "mechanic")
            .ok_or("Select the Mechanic hero to revive teammates.")?;
        let remaining = self.revivals.lock().await.remaining(&profile);
        if remaining > 0.0 { return Err(format!("Mechanic recovery is cooling down ({remaining:.1}s).")); }
        let runtime = self.runtime(player).await?;
        let mut room = runtime.lock().await;
        if room.round.as_ref().is_some_and(|round| round.phase == crate::ctf::CtfPhase::Ended) {
            return Err("This match has ended. Start another match to use abilities.".into());
        }
        let source = room.game.entities.get(player).filter(|entity| entity.team == member.team && entity.room_id == world)
            .ok_or("Your mechanic vehicle is unavailable.")?;
        if room.physics.assigned_hero(player) != Some("mechanic") || source.vehicle_id.as_deref() != Some(crate::alpha::policy::hero("mechanic")?.vehicle) { return Err("Deploy the Mechanic's assigned vehicle before reviving.".into()); }
        let vehicle = room.physics.vehicles.get(player).ok_or("Your mechanic vehicle is unavailable.")?;
        if vehicle.config.resources.fuel_capacity_liters > 0.0 &&
            (!vehicle.powertrain.fuel_liters.is_finite() || vehicle.powertrain.fuel_liters <= 0.0) {
            return Err("A fuel-empty mechanic cannot revive another vehicle.".into());
        }
        let target_entity = room.game.entities.get(target).filter(|entity| entity.room_id == world && entity.team == source.team)
            .ok_or("That teammate is not part of this team.")?;
        let source_health = room.physics.vehicle_health.get(player).filter(|health| !health.defeated && health.hp.is_finite() && health.hp > 0.0)
            .ok_or("A disabled mechanic cannot revive another vehicle.")?;
        if source_health.revive_cooldown_s > 0.0 { return Err("Mechanic recovery is cooling down.".into()); }
        room.physics.vehicle_health.get(target).filter(|health| health.defeated && health.respawn_remaining_s.is_finite() && health.respawn_remaining_s > 0.0)
            .ok_or("That teammate is not awaiting a mechanic recovery.")?;
        let source_body = room.physics.bodies.get(source.body_handle).filter(|body| body.is_enabled())
            .ok_or("Your mechanic body is unavailable.")?;
        let target_body = room.physics.bodies.get(target_entity.body_handle).ok_or("That teammate's body is unavailable.")?;
        if !source_body.linvel().iter().all(|n| n.is_finite()) || source_body.linvel().norm() > REVIVE_MAX_SPEED_MPS {
            return Err("Slow to a stop before reviving a teammate.".into());
        }
        let from = source_body.translation();
        let to = target_body.translation();
        if !from.iter().chain(to.iter()).all(|n| n.is_finite()) ||
            (from.x-to.x).powi(2)+(from.z-to.z).powi(2) > REVIVE_RANGE_METRES.powi(2) ||
            (from.y-to.y).abs() > REVIVE_HEIGHT_METRES {
            return Err("Move within 8 metres of your disabled teammate.".into());
        }
        // The physics primitive repeats recovery/cooldown/team checks and only
        // enables a body after validating safe placement at the wreck position.
        room.physics.revive_vehicle_at_current_location(player, target)?;
        if let Some(entity) = room.game.entities.get_mut(target) { entity.last_packet = None; }
        target_input.send_replace(None);
        let cooldown = room.physics.vehicle_health.get(player).map(|health| health.revive_cooldown_s).unwrap_or(0.0);
        drop(room);
        self.revivals.lock().await.used(profile, cooldown);
        Ok(json!({"revived":true,"target":target,"cooldown_s":cooldown}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::alpha::{Member, Mode};
    use rapier3d::prelude::*;
    const WORLD: usize = 77;

    fn server() -> Server {
        Server {
            operations: Mutex::new(()), chat: Mutex::new(Default::default()),
            matches: Mutex::new(Default::default()), revivals: Mutex::new(Default::default()),
            alpha: Mutex::new(crate::alpha::AlphaState::disabled()), data: Mutex::new(SocialData::default()),
            connections: Mutex::new(HashMap::new()), runtimes: Mutex::new(HashMap::new()),
            path: std::env::temp_dir().join(format!("avenlab-revival-test-{}", id())).join("social.json"),
            max_active_worlds: 3, max_players: 16,
        }
    }
    async fn connect(s: &Server) -> String {
        let player = id();
        let (tx, _rx) = crate::outbox::channel();
        let (frame, _frame) = watch::channel(None);
        let (social, _social) = watch::channel(None);
        let (input_tx, input) = watch::channel(None);
        s.register(player.clone(), Connection { tx, frame:frame.into(), social, input, input_tx, profile_id: None, world_id: None, team: Team::Red }).await.unwrap();
        player
    }
    async fn identified(s: &Server, name: &str) -> (String, Value) {
        let player = connect(s).await;
        let identity = s.handle(&player, json!({"action":"identify","name":name})).await.unwrap();
        (player, identity)
    }
    fn move_body(room: &mut WorldRuntime, player: &str, dx: f32, dy: f32, dz: f32) {
        let body = room.physics.vehicles[player].body;
        let old = *room.physics.bodies[body].translation();
        room.physics.bodies[body].set_translation(old + vector![dx,dy,dz], true);
        room.physics.bodies[body].set_linvel(Vector::zeros(), true);
        room.physics.bodies.propagate_modified_body_positions_to_colliders(&mut room.physics.colliders);
        room.physics.query_pipeline.update(&room.physics.colliders);
    }
    async fn fixture() -> (Server, String, String, Value, Value) {
        let s = server();
        let (mechanic, identity) = identified(&s, "Mechanic").await;
        let (target, target_identity) = identified(&s, "Teammate").await;
        s.data.lock().await.worlds.insert(WORLD, World {
            tire_thermals:false,
            mode: Some(Mode::Quickplay), id: WORLD, name: "Recovery test".into(), map: "road_precision".into(),
            owner_id: None, listed: true, max_players: 10, password_hash: None, invite_code: id(),
        });
        {
            let mut alpha = s.alpha.lock().await;
            alpha.enabled = true; alpha.enforce_roles = false; alpha.worlds.insert(WORLD, Mode::Quickplay.into());
            alpha.members.insert(mechanic.clone(), Member { mode: Mode::Quickplay, team_size:5, world: WORLD, hero: "mechanic".into(), team: Team::Red });
            alpha.members.insert(target.clone(), Member { mode: Mode::Quickplay, team_size:5, world: WORLD, hero: "brz".into(), team: Team::Red });
        }
        let mut room = WorldRuntime::new(WORLD, "road_precision").unwrap();
        for player in [&mechanic, &target] {
            let client = s.connections.lock().await[player].clone();
            room.join(player, client.tx, client.frame, client.input, Some(Team::Red), 10);
            s.connections.lock().await.get_mut(player).unwrap().world_id = Some(WORLD);
            room.spawn(player, if player == &mechanic { "fortuner" } else { "brz" }).unwrap();
            if player == &mechanic { room.physics.set_assigned_hero(player,"mechanic"); move_body(&mut room, player, 0.0, 0.0, 20.0); }
        }
        move_body(&mut room, &mechanic, 0.0, 0.0, -14.0);
        for health in room.physics.vehicle_health.values_mut() { health.spawn_protection_s = 0.0; }
        assert!(room.physics.damage_vehicle(&target, None, 10000.0, "test"));
        s.runtimes.lock().await.insert(WORLD, Arc::new(Mutex::new(room)));
        (s, mechanic, target, identity, target_identity)
    }
    async fn revive(s: &Server, actor: &str, target: &str) -> Result<Value, String> {
        s.handle(actor, json!({"action":"vehicle_revive","target":target,"role":"medic","hero":"mechanic"})).await
    }
    async fn cleanup(s: Server) { let _ = tokio::fs::remove_dir_all(s.path.parent().unwrap()).await; }

    #[tokio::test]
    async fn recovery_validates_authenticated_hero_world_team_range_speed_and_remaining_window() {
        let (s, mechanic, target, _, _) = fixture().await;
        let guest = connect(&s).await;
        assert!(revive(&s, &guest, &target).await.unwrap_err().contains("profile"));
        s.alpha.lock().await.members.get_mut(&mechanic).unwrap().hero = "brz".into();
        assert!(revive(&s, &mechanic, &target).await.unwrap_err().contains("Mechanic hero"));
        s.alpha.lock().await.members.get_mut(&mechanic).unwrap().hero = "mechanic".into();
        s.connections.lock().await.get_mut(&target).unwrap().team = Team::Blue;
        assert!(revive(&s, &mechanic, &target).await.unwrap_err().contains("own team"));
        s.connections.lock().await.get_mut(&target).unwrap().team = Team::Red;
        s.connections.lock().await.get_mut(&target).unwrap().world_id = Some(88);
        assert!(revive(&s, &mechanic, &target).await.unwrap_err().contains("your world"));
        s.connections.lock().await.get_mut(&target).unwrap().world_id = Some(WORLD);
        let runtime = s.runtimes.lock().await[&WORLD].clone();
        { let mut room = runtime.lock().await; move_body(&mut room, &mechanic, 0.0, 0.0, 20.0); }
        assert!(revive(&s, &mechanic, &target).await.unwrap_err().contains("8 metres"));
        { let mut room = runtime.lock().await; move_body(&mut room, &mechanic, 0.0, 0.0, -20.0); let handle = room.physics.vehicles[&mechanic].body; room.physics.bodies[handle].set_linvel(vector![0.0,0.0,4.0], true); }
        assert!(revive(&s, &mechanic, &target).await.unwrap_err().contains("stop"));
        { let mut room = runtime.lock().await; let handle = room.physics.vehicles[&mechanic].body; room.physics.bodies[handle].set_linvel(Vector::zeros(), true); room.physics.vehicle_health.get_mut(&target).unwrap().respawn_remaining_s = 0.0; }
        assert!(revive(&s, &mechanic, &target).await.unwrap_err().contains("awaiting"));
        assert_eq!(runtime.lock().await.physics.vehicle_health[&mechanic].stats.resurrections, 0);
        assert_eq!(s.revivals.lock().await.remaining(s.connections.lock().await[&mechanic].profile_id.as_ref().unwrap()), 0.0);
        cleanup(s).await;
    }

    #[tokio::test]
    async fn successful_recovery_is_once_only_and_clears_old_controls() {
        let (s, mechanic, target, _, _) = fixture().await;
        let runtime = s.runtimes.lock().await[&WORLD].clone();
        let packet: InputPacket = serde_json::from_value(json!({"type":"input","seq":5,"dt":0.016,"throttle":1.0,"steer":1.0,"brake":0.0,"handbrake":0.0,"vehicleMask":1,"playerMask":0})).unwrap();
        s.connections.lock().await[&target].input_tx.send_replace(Some(packet.clone()));
        runtime.lock().await.game.entities.get_mut(&target).unwrap().last_packet = Some(packet);
        let result = revive(&s, &mechanic, &target).await.unwrap();
        assert_eq!(result["revived"], true); assert_eq!(result["target"], target);
        {
            let room = runtime.lock().await;
            assert!(!room.physics.vehicle_health[&target].defeated);
            assert!(room.physics.vehicle_health[&target].hp >= 150.0);
            assert_eq!(room.physics.vehicle_health[&mechanic].stats.resurrections, 1);
            assert!(room.physics.vehicle_health[&mechanic].revive_cooldown_s > 19.0);
            assert_eq!(room.physics.vehicle_health[&target].stats.respawns, 0);
            assert!(room.game.entities[&target].last_packet.is_none());
        }
        assert!(s.connections.lock().await[&target].input.borrow().is_none());
        assert!(revive(&s, &mechanic, &target).await.is_err());
        assert_eq!(runtime.lock().await.physics.vehicle_health[&mechanic].stats.resurrections, 1);
        cleanup(s).await;
    }

    #[tokio::test]
    async fn profile_deadline_survives_fresh_quickplay_reconnect_and_resets_with_a_new_round() {
        let (s, mechanic, target, identity, _) = fixture().await;
        revive(&s, &mechanic, &target).await.unwrap();
        { let runtime = s.runtimes.lock().await[&WORLD].clone(); let mut room = runtime.lock().await; move_body(&mut room, &target, 0.0, 0.0, 20.0); }
        s.disconnect(&mechanic).await;
        let next = connect(&s).await;
        s.handle(&next, json!({"action":"identify","name":"Returned mechanic","token":identity["token"]})).await.unwrap();
        assert_eq!(s.connections.lock().await[&next].world_id, Some(WORLD));
        assert!(s.spawn(&next, "road_precision", "brz").await.is_err());
        s.spawn(&next, "road_precision", "fortuner").await.unwrap();
        let runtime = s.runtimes.lock().await[&WORLD].clone();
        assert!(runtime.lock().await.physics.vehicle_health[&next].revive_cooldown_s > 0.0);
        assert!(revive(&s, &next, &target).await.unwrap_err().contains("cooling down"));
        s.reset_revival_cooldowns(WORLD).await;
        assert_eq!(s.revival_cooldown(&next).await, 0.0);
        cleanup(s).await;
    }

    #[tokio::test]
    async fn downed_quickplay_reconnect_keeps_elapsed_window_and_resources_without_copying_career_totals() {
        let (s, mechanic, target, _, identity) = fixture().await;
        let runtime = s.runtimes.lock().await[&WORLD].clone();
        let profile = s.connections.lock().await[&target].profile_id.clone().unwrap();
        let original_position;
        {
            let mut room = runtime.lock().await;
            room.configure_round(Mode::Quickplay, true).unwrap();
            move_body(&mut room, &mechanic, 0.0, 0.0, 40.0);
            let body = room.physics.vehicles[&target].body;
            original_position = *room.physics.bodies[body].translation();
            let health = room.physics.vehicle_health.get_mut(&target).unwrap();
            health.kills = 2;
            health.stats.damage_dealt = 123.0;
            assert_eq!(health.deaths, 1);
            let vehicle = room.physics.vehicles.get_mut(&target).unwrap();
            vehicle.powertrain.fuel_liters = 0.0;
            vehicle.powertrain.nos_remaining_s = vehicle.config.resources.nos_seconds * 0.25;
            vehicle.powertrain.temperature_c = 113.0;
            vehicle.powertrain.condition = 0.4;
            vehicle.powertrain.ultimate_fraction = 0.7;
        }
        s.disconnect(&target).await;
        assert!(!runtime.lock().await.physics.vehicles.contains_key(&target));
        let (saved_at, window, cause) = {
            let mut state = s.revivals.lock().await;
            let lease = state.downed.get_mut(&profile).expect("A disabled reconnect retains its recovery lease");
            lease.saved_at -= Duration::from_secs(3);
            (lease.saved_at, lease.life.remaining_s, lease.life.last_damage_kind.clone())
        };
        let latest_remaining = (window - saved_at.elapsed().as_secs_f32()).max(0.0);
        let next = connect(&s).await;
        s.handle(&next, json!({"action":"identify","name":"Returned teammate","token":identity["token"]})).await.unwrap();
        assert_eq!(s.connections.lock().await[&next].world_id, Some(WORLD));
        s.spawn(&next, "road_precision", "brz").await.unwrap();
        {
            let room = runtime.lock().await;
            let health = &room.physics.vehicle_health[&next];
            assert!(health.defeated);
            assert_eq!(health.disabled_reason, "combat");
            // The reconnect spends real time too. Bound the value by the measured
            // reconnect interval instead of assuming a new body loads in under 1 s.
            let earliest_remaining = (window - saved_at.elapsed().as_secs_f32()).max(0.0);
            assert!((earliest_remaining..=latest_remaining).contains(&health.respawn_remaining_s));
            assert!(health.respawn_remaining_s <= 9.0);
            assert_eq!(health.last_damage_kind, cause);
            assert_eq!(health.hp, 0.0);
            assert_eq!(health.spawn_protection_s, 0.0);
            assert_eq!((health.kills, health.deaths, health.stats.respawns, health.stats.resurrections), (0, 0, 0, 0));
            assert_eq!(health.stats.damage_dealt, 0.0);
            let vehicle = &room.physics.vehicles[&next];
            assert_eq!(vehicle.powertrain.fuel_liters, 0.0);
            assert!((vehicle.powertrain.nos_remaining_s - vehicle.config.resources.nos_seconds * 0.25).abs() < 0.001);
            assert_eq!(vehicle.powertrain.temperature_c, 113.0);
            assert_eq!(vehicle.powertrain.condition, 0.4);
            assert_eq!(vehicle.powertrain.ultimate_fraction, 0.7);
            assert_eq!(*room.physics.bodies[vehicle.body].translation(), original_position);
            assert!(room.physics.bodies[vehicle.body].is_enabled());
            assert_eq!(room.physics.vehicle_health[&mechanic].stats.resurrections, 0);
        }
        assert!(!s.revivals.lock().await.downed.contains_key(&profile));
        // A second transport loss still spends elapsed wall time; it never
        // opens another twelve-second rescue window or awards a free revive.
        s.disconnect(&next).await;
        s.revivals.lock().await.downed.get_mut(&profile).unwrap().saved_at -= Duration::from_secs(15);
        let final_connection = connect(&s).await;
        s.handle(&final_connection, json!({"action":"identify","name":"Returned again","token":identity["token"]})).await.unwrap();
        s.spawn(&final_connection, "road_precision", "brz").await.unwrap();
        {
            let mut room = runtime.lock().await;
            let health = &room.physics.vehicle_health[&final_connection];
            assert!(health.defeated);
            assert_eq!(health.respawn_remaining_s, 0.0);
            assert_eq!(room.physics.vehicles[&final_connection].powertrain.fuel_liters, 0.0);
            room.physics.advance_vehicle_lives(0.1);
            let health = &room.physics.vehicle_health[&final_connection];
            assert!(!health.defeated);
            assert_eq!((health.deaths, health.stats.respawns, health.stats.resurrections), (0, 1, 0));
        }
        cleanup(s).await;
    }

    #[tokio::test]
    async fn ended_round_cannot_be_changed_by_a_late_recovery_request() {
        let (s, mechanic, target, _, _) = fixture().await;
        let runtime = s.runtimes.lock().await[&WORLD].clone();
        { let mut room = runtime.lock().await; room.configure_round(Mode::Quickplay, true).unwrap(); room.round.as_mut().unwrap().phase = crate::ctf::CtfPhase::Ended; }
        assert!(revive(&s, &mechanic, &target).await.unwrap_err().contains("match has ended"));
        assert!(runtime.lock().await.physics.vehicle_health[&target].defeated);
        cleanup(s).await;
    }
}
