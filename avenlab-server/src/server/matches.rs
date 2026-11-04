//! Authoritative bridge between a physics round and durable player careers.
//! Profiles come only from authenticated connections; neither results nor
//! statistics are accepted from socket payloads.
use super::*;
use crate::alpha::{Mode, MatchFormat, career::{self, CareerEvent, CareerMatch, CareerParticipant, CareerStats, PlayOfGame}, policy};
use crate::ctf::CtfPhase;
use crate::vehicle_health::VehicleHealth;
use std::{collections::BTreeMap, path::Path, time::Instant};

#[derive(Default)]
pub(super) struct MatchBridge {
    journals: HashMap<usize, Journal>,
    pending: BTreeMap<String, CareerMatch>,
    pub(super) ended: HashMap<usize, u64>,
}
struct Journal {
    match_id: String,
    mode: Mode,
    team_size: usize,
    map: String,
    training: bool,
    progression_eligible: bool,
    created: Instant,
    elapsed: f64,
    people: BTreeMap<String, CareerParticipant>,
    sources: HashMap<String, Source>,
    aliases: HashMap<String, String>,
    moments: HashMap<String, PlayOfGame>,
}
struct Source {
    profile: String,
    stats: CareerStats,
    last_elapsed: f64,
    clock_offset: f64,
}
#[derive(Clone)]
struct Sample {
    player: String,
    source: String,
    profile: String,
    name: String,
    team: Team,
    hero: String,
    appearance: crate::alpha::appearance::HeroAppearance,
    health: VehicleHealth,
}
impl Journal {
    fn new(match_id: String, format: MatchFormat, map: String, training: bool, eligible: bool) -> Self {
        Self { match_id, mode:format.mode, team_size:format.team_size, map, training, progression_eligible: eligible,
            created: Instant::now(), elapsed: 0.0, people: BTreeMap::new(),
            sources: HashMap::new(), aliases: HashMap::new(), moments: HashMap::new() }
    }
    fn sample(&mut self, sample: Sample, elapsed: f64) {
        self.elapsed = self.elapsed.max(elapsed);
        let p = self.people.entry(sample.profile.clone()).or_insert_with(|| CareerParticipant {
            profile_id: sample.profile.clone(), name: sample.name, team: Some(sample.team.as_str().into()),
            hero: sample.hero.clone(), appearance: sample.appearance.clone(), ..Default::default()
        });
        p.hero = sample.hero;
        p.appearance = sample.appearance;
        // A reconnect during grace resumes the participant, not a second entry.
        p.abandoned = false;
        let was_bound = self.aliases.get(&sample.player) == Some(&sample.source);
        let offset = self.sources.get(&sample.source).map(|s| s.clock_offset).unwrap_or(elapsed - sample.health.combat_time_s());
        if let Some(moment) = sample.health.best_combat_moment() {
            let candidate = PlayOfGame { profile_id: sample.profile.clone(),
                start_s: (offset + moment.start_s).max(0.0), end_s: (offset + moment.end_s).clamp(0.0, elapsed),
                score: moment.score, kills: moment.kills, captures: 0, damage: moment.damage, replay_available: false };
            let current = self.moments.entry(sample.source.clone()).or_insert_with(|| candidate.clone());
            if candidate.score > current.score { *current = candidate; }
        }
        self.aliases.insert(sample.player, sample.source.clone());
        let stats = health_stats(&sample.health);
        let source = self.sources.entry(sample.source).or_insert_with(|| Source {
            profile: sample.profile, stats: CareerStats::default(), last_elapsed: elapsed, clock_offset: offset,
        });
        let play_time = source.stats.play_time_s + if was_bound { (elapsed - source.last_elapsed).max(0.0) } else { 0.0 };
        source.last_elapsed = elapsed;
        source.stats = stats;
        source.stats.play_time_s = play_time;
    }
    fn record(&self, world: usize, ended_at: u64) -> CareerMatch {
        let mut people = self.people.clone();
        for person in people.values_mut() { person.stats = CareerStats::default(); }
        for source in self.sources.values() {
            if let Some(person) = people.get_mut(&source.profile) { person.stats.add_assign(&source.stats); }
        }
        CareerMatch { match_id: self.match_id.clone(), world_id: world, mode: self.mode, team_size:Some(self.team_size),
            map: self.map.clone(), ended_at, duration_s: self.elapsed, training: self.training,
            progression_eligible: self.progression_eligible, participants: people.into_values().collect(),
            ..Default::default() }
    }
}
fn health_stats(h: &VehicleHealth) -> CareerStats {
    let finite = |n: f32| if n.is_finite() { n.max(0.0) as f64 } else { 0.0 };
    CareerStats { kills: h.kills as u64, deaths: h.deaths as u64,
        assists: h.stats.assists as u64, damage_dealt: finite(h.stats.damage_dealt),
        healing_done: finite(h.stats.healing_done), self_healing: finite(h.stats.self_healing),
        gas_burned_liters: finite(h.stats.gas_burned_liters), gas_gained_liters: finite(h.stats.gas_gained_liters),
        resurrections: h.stats.resurrections as u64, respawns: h.stats.respawns as u64,
        best_kill_streak: h.stats.best_kill_streak, ..Default::default() }
}
fn merge_max(target: &mut CareerStats, other: &CareerStats) {
    macro_rules! maximum { ($($field:ident),*) => { $(target.$field = target.$field.max(other.$field);)* }; }
    maximum!(kills,deaths,assists,damage_dealt,healing_done,self_healing,gas_burned_liters,
        gas_gained_liters,resurrections,respawns,best_kill_streak);
}
fn apply_record(data: &mut SocialData, record: &CareerMatch) -> Result<bool, String> {
    if data.completed_results.contains(&record.match_id) { return Ok(false); }
    if data.completed_results.len() >= 16384 { return Err("Result ledger needs archival before more matches can be recorded.".into()); }
    record.validate()?;
    for person in &record.participants {
        let profile = data.profiles.get_mut(&person.profile_id).ok_or("A match profile is unavailable.")?;
        profile.progression.career.record(record, &person.profile_id)?;
        if record.progression_eligible && !person.abandoned {
            let won = person.team.as_ref() == record.winner.as_ref() && record.winner.is_some();
            profile.progression.award(record.mode == Mode::Competitive, won);
        }
    }
    data.completed_results.insert(record.match_id.clone());
    Ok(true)
}
pub(super) fn recover_archives(path: &Path, data: &mut SocialData) -> anyhow::Result<()> {
    let pending = career::pending_archives(path, &data.completed_results).map_err(anyhow::Error::msg)?;
    if pending.is_empty() { return Ok(()); }
    let mut changed = false;
    for record in pending {
        let mut next = data.clone();
        if let Err(error) = apply_record(&mut next, &record) {
            if data.completed_results.len() >= 16384 {
                eprintln!("[career] Pending match {} retained until ledger capacity is available: {error}", record.match_id);
                break;
            }
            return Err(anyhow::Error::msg(error));
        }
        if serde_json::to_vec(&next)?.len() > 8 * 1024 * 1024 {
            eprintln!("[career] Pending match {} retained until social save capacity is available.", record.match_id);
            continue;
        }
        // Rebuild any per-player index interrupted after the immutable archive.
        if let Err(error) = career::write_match_archive(path, &record) {
            if error.contains("needs maintenance") {
                eprintln!("[career] Pending match {} retained until archive capacity is available: {error}", record.match_id);
                continue;
            }
            return Err(anyhow::Error::msg(error));
        }
        *data = next;
        changed = true;
    }
    if !changed { return Ok(()); }
    let bytes = serde_json::to_vec(data)?;
    anyhow::ensure!(bytes.len() <= 8 * 1024 * 1024, "Recovered social data exceeds its save budget");
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
    let temp = path.with_extension("recovery.tmp");
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&temp)?;
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; file.set_permissions(std::fs::Permissions::from_mode(0o600))?; }
        file.write_all(&bytes)?; file.sync_all()?;
    }
    std::fs::rename(temp, path)?;
    Ok(())
}

impl Server {
    pub(super) async fn participant_slot_available(&self, world: usize, actor: Option<&str>) -> bool {
        let mut remembered: std::collections::HashSet<String> = {
            let bridge = self.matches.lock().await;
            let Some(journal) = bridge.journals.get(&world) else { return true; };
            if journal.mode.bucket() != 0 { return true; }
            journal.people.keys().cloned().collect()
        };
        // Reserved or not-yet-deployed seats also reserve archive capacity.
        // They cannot collectively race the bounded terminal record.
        for client in self.connections.lock().await.values().filter(|c| c.world_id == Some(world)) {
            if let Some(profile) = &client.profile_id { remembered.insert(profile.clone()); }
        }
        for (profile, lease) in &self.alpha.lock().await.reservations {
            if lease.member.world == world && lease.expires > timestamp() { remembered.insert(profile.clone()); }
        }
        actor.is_some_and(|id| remembered.contains(id)) || remembered.len() < 32
    }
    pub(super) async fn replay_completed_result(&self, player: &str, world: usize) {
        let runtime = self.runtimes.lock().await.get(&world).cloned();
        let Some(runtime) = runtime else { return; };
        let match_id = runtime.lock().await.round.as_ref().filter(|r| r.phase == CtfPhase::Ended).map(|r| r.match_id.clone());
        let Some(match_id) = match_id else { return; };
        if !self.data.lock().await.completed_results.contains(&match_id) { return; }
        let path = self.path.clone();
        let record = tokio::task::spawn_blocking(move || career::read_match_archive(&path, &match_id)).await;
        if let Ok(Ok(record)) = record {
            if let Some(client) = self.connections.lock().await.get(player) {
                if client.profile_id.as_ref().is_some_and(|id| record.participants.iter().any(|p| &p.profile_id == id)) {
                    let _ = client.tx.send(json!({"type":"match_result","data":record}).to_string());
                }
            }
        }
    }
    pub(super) async fn match_phase(&self, world: usize) -> Option<CtfPhase> {
        let runtime = self.runtimes.lock().await.get(&world).cloned()?;
        runtime.lock().await.round.as_ref().map(|round| round.phase)
    }
    pub(super) async fn played_in_round(&self, world: usize, profile: Option<&String>) -> bool {
        self.matches.lock().await.journals.get(&world)
            .is_some_and(|journal| profile.is_some_and(|id| journal.people.contains_key(id)))
    }
    async fn samples(&self, world: usize, room: &WorldRuntime) -> Vec<Sample> {
        let clients = self.connections.lock().await.clone();
        let members = self.alpha.lock().await.members.clone();
        let data = self.data.lock().await;
        room.physics.vehicles.iter().filter_map(|(player, vehicle)| {
            let client = clients.get(player).filter(|c| c.world_id == Some(world))?;
            let profile = data.profiles.get(client.profile_id.as_ref()?)?;
            let entity = room.game.entities.get(player)?;
            let hero = members.get(player).map(|m| m.hero.as_str()).filter(|s| !s.is_empty())
                .or(entity.vehicle_id.as_deref()).unwrap_or("ae86");
            Some(Sample { player: player.clone(), source: format!("{:p}:{:?}", room, vehicle.body),
                profile: profile.id.clone(), name: profile.name.clone(), team: entity.team,
                hero: hero.into(), appearance: entity.appearance.clone(), health: room.physics.vehicle_health.get(player)?.clone() })
        }).collect()
    }
    /// Bind a newly deployed body while the caller still owns the room lock.
    /// A finishing physics tick therefore cannot outrun its authenticated journal.
    pub(super) async fn checkpoint_spawn(&self, room: &WorldRuntime) {
        if room.round.as_ref().is_some_and(|r| r.phase != CtfPhase::Running) { return; }
        let world = room.game.room_id;
        let info = self.data.lock().await.worlds.get(&world).cloned();
        let Some(info) = info else { return; };
        let mode = info.mode.unwrap_or(Mode::Sandbox);
        let samples = self.samples(world, room).await;
        let mut bridge = self.matches.lock().await;
        let journal = bridge.journals.entry(world).or_insert_with(|| Journal::new(
            room.round.as_ref().map(|r| r.match_id.clone()).unwrap_or_else(|| format!("activity:{}", id())),
            MatchFormat::for_world(mode,info.max_players), info.map, room.round.as_ref().is_some_and(|r| r.training), mode.bucket() == 0 && room.round.as_ref().is_some_and(|r| !r.training)));
        let elapsed = room.round.as_ref().map(|r| r.elapsed_s as f64).unwrap_or_else(|| journal.created.elapsed().as_secs_f64());
        for sample in samples { journal.sample(sample, elapsed); }
    }
    fn valid_start(format: MatchFormat, members: &[(&String, &crate::alpha::Member)], room: &WorldRuntime, strict: bool) -> bool {
        let deployed: Vec<_> = members.iter().filter(|(id, m)|
            room.game.clients.contains_key(*id) && room.physics.vehicles.contains_key(*id) && !m.hero.is_empty()).collect();
        if deployed.len() != format.capacity() || deployed.iter().any(|(_, member)| member.format() != format) { return false; }
        [Team::Red, Team::Blue].iter().all(|team| {
            let team_members = deployed.iter().filter(|(_, m)| m.team == *team);
            if !strict { return team_members.count() == format.team_size; }
            let heroes: Vec<_> = team_members
                .filter_map(|(_, m)| policy::hero(&m.hero).ok()).collect();
            policy::complete_team_format(format, &heroes.iter().map(|hero| hero.role).collect::<Vec<_>>())
        })
    }
    pub async fn maintain_matches(&self) {
        let Ok(_operation) = self.operations.try_lock() else { return; };
        self.maintain_matches_inner().await;
    }
    pub(super) async fn maintain_matches_inner(&self) {
        let runtimes = self.runtimes.lock().await.clone();
        let mut round_started=false;
        for (world, runtime) in &runtimes {
            let alpha = self.alpha.lock().await.clone();
            let info = self.data.lock().await.worlds.get(world).cloned();
            let Some(info) = info else { continue; };
            let mode = info.mode.unwrap_or(Mode::Sandbox);
            let format=MatchFormat::for_world(mode,info.max_players);
            let mut room = runtime.lock().await;
            if mode.bucket() == 0 && room.round.is_none() { let _ = room.configure_round_format(format, !alpha.enforce_roles); }
            if room.round.as_ref().is_some_and(|r| r.phase == CtfPhase::Waiting) {
                let members: Vec<_> = alpha.members.iter().filter(|(_, m)| m.world == *world).collect();
                if Self::valid_start(format, &members, &room, alpha.enforce_roles) {
                    if let Err(error) = room.start_round() { eprintln!("[career] Could not start round: {error}"); }
                    else { round_started=true;self.reset_revival_cooldowns(*world).await; }
                }
            }
            let running = room.round.as_ref().is_some_and(|r| r.phase == CtfPhase::Running);
            let practice = mode.bucket() != 0;
            if running || practice {
                let samples = self.samples(*world, &room).await;
                if !samples.is_empty() {
                    let mut bridge = self.matches.lock().await;
                    let journal = bridge.journals.entry(*world).or_insert_with(|| Journal::new(
                        room.round.as_ref().map(|r| r.match_id.clone()).unwrap_or_else(|| format!("activity:{}", id())),
                        format, info.map.clone(), mode.bucket() == 0 && !alpha.enforce_roles,
                        mode.bucket() == 0 && alpha.enforce_roles));
                    let elapsed = room.round.as_ref().map(|r| r.elapsed_s as f64).unwrap_or_else(|| journal.created.elapsed().as_secs_f64());
                    for sample in samples { journal.sample(sample, elapsed); }
                }
            }
            let completion = room.take_round_completion();
            drop(room);
            if let Some(event) = completion {
                if let Err(error) = self.finalize_round(*world, &event).await {
                    eprintln!("[career] Match persistence will retry: {error}");
                    runtime.lock().await.restore_round_completion(event);
                }
            }
            self.mark_expired_participants(*world).await;
            let clients = self.connections.lock().await.clone();
            let occupied = clients.values().any(|c| c.world_id == Some(*world));
            let reserved = alpha.reservations.values().any(|r| r.member.world == *world && r.expires > timestamp());
            if !occupied && !reserved { self.finish_empty_activity(*world).await; }
        }
        // The scheduler can be the owner that starts this round. Publish its
        // reveal immediately rather than waiting for a client refresh.
        if round_started { self.publish().await; }
        let pending: Vec<_> = self.matches.lock().await.pending.values().cloned().collect();
        for record in pending {
            if self.persist_record(&record).await.is_ok() { self.matches.lock().await.pending.remove(&record.match_id); }
        }
        let expired: Vec<_> = self.matches.lock().await.ended.iter()
            .filter(|(_, at)| timestamp().saturating_sub(**at) >= 45).map(|(world, _)| *world).collect();
        for world in expired {
            let players: Vec<_> = self.connections.lock().await.iter()
                .filter(|(_, c)| c.world_id == Some(world)).map(|(id, _)| id.clone()).collect();
            for player in players { self.leave_inner(&player).await; }
            self.alpha.lock().await.reservations.retain(|_, r| r.member.world != world);
            self.runtimes.lock().await.remove(&world);
            self.matches.lock().await.ended.remove(&world);
            self.matches.lock().await.journals.remove(&world);
            self.publish().await;
        }
    }
    pub(super) async fn mark_expired_participants(&self, world: usize) {
        let clients = self.connections.lock().await.clone();
        let alpha = self.alpha.lock().await.clone();
        let connected: std::collections::HashSet<_> = clients.values().filter(|c| c.world_id == Some(world))
            .filter_map(|c| c.profile_id.as_deref()).collect();
        let mut bridge = self.matches.lock().await;
        if bridge.ended.contains_key(&world) { return; }
        if let Some(journal) = bridge.journals.get_mut(&world) {
            for (id, person) in &mut journal.people {
                if !connected.contains(id.as_str()) && !alpha.reservations.get(id).is_some_and(|r| r.member.world == world && r.expires > timestamp()) {
                    person.abandoned = true;
                }
            }
        }
    }
    pub(super) async fn checkpoint_departure(&self, player: &str, explicit: bool) {
        let client = self.connections.lock().await.get(player).cloned();
        let Some(client) = client else { return; };
        let Some(world) = client.world_id else { return; };
        let runtime = self.runtimes.lock().await.get(&world).cloned();
        let Some(runtime) = runtime else { return; };
        let mut room = runtime.lock().await;
        let completion = room.take_round_completion();
        let ended = room.round.as_ref().is_some_and(|r| r.phase == CtfPhase::Ended);
        if !ended {
            let samples = self.samples(world, &room).await;
            let info = self.data.lock().await.worlds.get(&world).cloned();
            let mut bridge = self.matches.lock().await;
            if !samples.is_empty() && room.round.is_none() {
                if let Some(info) = info {
                    bridge.journals.entry(world).or_insert_with(|| Journal::new(format!("activity:{}", id()), MatchFormat::for_world(info.mode.unwrap_or(Mode::Sandbox),info.max_players), info.map, false, false));
                }
            }
            if let Some(journal) = bridge.journals.get_mut(&world) {
                let elapsed = room.round.as_ref().map(|r| r.elapsed_s as f64).unwrap_or_else(|| journal.created.elapsed().as_secs_f64());
                for sample in samples { journal.sample(sample, elapsed); }
                if explicit && journal.mode.bucket() == 0 {
                    if let Some(person) = client.profile_id.as_ref().and_then(|id| journal.people.get_mut(id)) { person.abandoned = true; }
                }
            }
        }
        drop(room);
        if let Some(event) = completion {
            if let Err(error) = self.finalize_round(world, &event).await {
                eprintln!("[career] Leaving result will retry: {error}");
                runtime.lock().await.restore_round_completion(event);
            }
        }
    }
    pub(super) async fn finish_empty_activity(&self, world: usize) {
        let record = {
            let mut bridge = self.matches.lock().await;
            if bridge.ended.remove(&world).is_some() { bridge.journals.remove(&world); return; }
            let Some(journal) = bridge.journals.remove(&world) else { return; };
            let mut record = journal.record(world, timestamp());
            record.progression_eligible = false;
            if record.mode.bucket() == 0 { for p in &mut record.participants { p.abandoned = true; } }
            record
        };
        if !record.participants.is_empty() && self.persist_record(&record).await.is_err() {
            self.matches.lock().await.pending.insert(record.match_id.clone(), record);
        }
    }
    async fn finalize_round(&self, world: usize, event: &crate::world_sessions::CompletedRound) -> Result<(), String> {
        self.mark_expired_participants(world).await;
        let clients = self.connections.lock().await.clone();
        let active: std::collections::HashSet<_> = clients.iter().filter(|(_, c)| c.world_id == Some(world)).map(|(id, _)| id.as_str()).collect();
        let record = {
            let mut bridge = self.matches.lock().await;
            let ended_at = *bridge.ended.entry(world).or_insert_with(timestamp);
            if let Some(record) = bridge.pending.get(&event.result.match_id) { record.clone() } else {
                let journal = bridge.journals.get_mut(&world).ok_or("No authenticated round journal exists.")?;
                if journal.match_id != event.result.match_id { return Err("The round journal does not match its completion.".into()); }
                journal.elapsed = event.result.duration_s as f64;
                let mut frozen: HashMap<String, CareerStats> = HashMap::new();
                let mut active_sources = std::collections::HashSet::new();
                for frame in &event.players {
                    if let Some(source_id) = journal.aliases.get(&frame.player_id).cloned() {
                        merge_max(frozen.entry(source_id.clone()).or_default(), &health_stats(&frame.health));
                        if active.contains(frame.player_id.as_str()) { active_sources.insert(source_id.clone()); }
                        if active.contains(frame.player_id.as_str()) {
                            if let Some(person) = journal.sources.get(&source_id).and_then(|source| journal.people.get_mut(&source.profile)) {
                                person.appearance = frame.appearance.clone();
                                person.team = Some(frame.team.as_str().into());
                            }
                        }
                        if let (Some(source), Some(moment)) = (journal.sources.get(&source_id), frame.health.best_combat_moment()) {
                            let offset = source.clock_offset;
                            let candidate = PlayOfGame { profile_id: source.profile.clone(), start_s: (offset + moment.start_s).max(0.0),
                                end_s: (offset + moment.end_s).clamp(0.0, journal.elapsed), score: moment.score,
                                kills: moment.kills, captures: 0, damage: moment.damage, replay_available: false };
                            let current = journal.moments.entry(source_id).or_insert_with(|| candidate.clone());
                            if candidate.score > current.score { *current = candidate; }
                        }
                    }
                }
                for (id, stats) in frozen {
                    if let Some(source) = journal.sources.get_mut(&id) {
                        if active_sources.contains(&id) { source.stats.play_time_s += (journal.elapsed - source.last_elapsed).max(0.0); }
                        merge_max(&mut source.stats, &stats);
                        source.last_elapsed = journal.elapsed;
                    }
                }
                let mut record = journal.record(world, ended_at);
                record.winner = event.result.winner.map(|team| team.as_str().into());
                record.score = [event.result.scores.red, event.result.scores.blue];
                let mut events: Vec<CareerEvent> = Vec::new();
                for (player, objectives) in &event.result.objectives {
                    if let Some(person) = journal.aliases.get(player).and_then(|s| journal.sources.get(s))
                        .and_then(|s| record.participants.iter_mut().find(|p| p.profile_id == s.profile)) {
                        person.stats.captures += objectives.captures as u64;
                        person.stats.flag_returns += objectives.flag_returns as u64;
                    }
                }
                for capture in &event.result.capture_events {
                    if let Some(source) = journal.aliases.get(&capture.player_id).and_then(|s| journal.sources.get(s)) {
                        events.push(CareerEvent { at_s: capture.elapsed_s as f64, profile_id: source.profile.clone(), kills: 0, captures: 1, damage: 0.0 });
                    }
                }
                career::award_match(&mut record, &events);
                for moment in journal.moments.values() {
                    if !record.participants.iter().any(|p| p.profile_id == moment.profile_id && !p.abandoned) { continue; }
                    let mut candidate = moment.clone();
                    candidate.captures = events.iter().filter(|e| e.profile_id == candidate.profile_id && e.at_s >= candidate.start_s && e.at_s <= candidate.end_s).map(|e| e.captures).sum();
                    candidate.score = candidate.kills as f64 * 100.0 + candidate.captures as f64 * 1000.0 + candidate.damage * 0.1;
                    if candidate.score > 0.0 && record.play_of_game.as_ref().is_none_or(|current| candidate.score > current.score || (candidate.score == current.score && candidate.end_s < current.end_s)) {
                        record.play_of_game = Some(candidate);
                    }
                }
                for p in &mut record.participants {
                    p.awards.retain(|a| *a != career::CareerAward::PlayOfTheGame);
                    if record.play_of_game.as_ref().is_some_and(|moment| moment.profile_id == p.profile_id) { p.awards.push(career::CareerAward::PlayOfTheGame); }
                }
                bridge.pending.insert(record.match_id.clone(), record.clone());
                record
            }
        };
        self.persist_record(&record).await?;
        self.matches.lock().await.pending.remove(&record.match_id);
        Ok(())
    }
    pub(super) async fn persist_record(&self, record: &CareerMatch) -> Result<(), String> {
        if self.data.lock().await.completed_results.contains(&record.match_id) { return Ok(()); }
        let previous = self.data.lock().await.clone();
        let mut next = previous.clone();
        apply_record(&mut next, record)?;
        if serde_json::to_vec(&next).map_err(|_| "Could not serialize career data.")?.len() > 8 * 1024 * 1024 {
            return Err("The social data budget is full; the match is retained for retry.".into());
        }
        let path = self.path.clone();
        let archive = record.clone();
        tokio::task::spawn_blocking(move || career::write_match_archive(&path, &archive)).await
            .map_err(|_| "The career archive worker stopped.".to_string())??;
        *self.data.lock().await = next;
        self.commit(previous).await?;
        if record.mode.bucket() == 0 && self.matches.lock().await.ended.contains_key(&record.world_id) {
            let runtime=self.runtimes.lock().await.get(&record.world_id).cloned();
            let current_round=if let Some(runtime)=runtime {runtime.lock().await.round.as_ref().is_some_and(|round|round.match_id==record.match_id&&round.phase==CtfPhase::Ended)}else{false};
            // A departed participant may already be playing another game. Old
            // archive retries and reused world IDs must never replace its HUD.
            if current_round {
                let payload = json!({"type":"match_result","data":record}).to_string();
                for client in self.connections.lock().await.values() {
                    if client.world_id==Some(record.world_id) && client.profile_id.as_ref().is_some_and(|id| record.participants.iter().any(|p| &p.profile_id == id)) {
                        let _ = client.tx.send(payload.clone());
                    }
                }
            }
        }
        self.publish().await;
        Ok(())
    }
    pub(super) async fn handle_career(&self, player: &str, value: &Value) -> Result<Value, String> {
        let profile = self.actor(player).await?;
        let path = self.path.clone();
        let committed = self.data.lock().await.completed_results.clone();
        if value["action"] == "career_history" {
            let cursor = value["cursor"].as_str().map(str::to_owned);
            let limit = value["limit"].as_u64().unwrap_or(20).clamp(1, 50) as usize;
            let mode = value["mode"].as_str().filter(|s| !s.is_empty() && *s != "all").map(str::to_owned);
            let hero = value["hero"].as_str().filter(|s| !s.is_empty() && *s != "all").map(str::to_owned);
            let page = tokio::task::spawn_blocking(move || career::read_history_filtered(&path, &profile, cursor.as_deref(), limit, mode.as_deref(), hero.as_deref(), &committed))
                .await.map_err(|_| "The career history worker stopped.")??;
            serde_json::to_value(page).map_err(|_| "Could not encode career history.".into())
        } else {
            let match_id = value["match_id"].as_str().ok_or("Choose a match record.")?.to_string();
            if !committed.contains(&match_id) { return Err("This completed match is unavailable.".into()); }
            let record = tokio::task::spawn_blocking(move || career::read_match_archive(&path, &match_id))
                .await.map_err(|_| "The career record worker stopped.")??;
            if !record.participants.iter().any(|p| p.profile_id == profile) { return Err("This match is not part of your career.".into()); }
            Ok(json!({"match":record}))
        }
    }
}
