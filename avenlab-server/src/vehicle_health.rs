//! Server-owned combat health. Physics owns placement and control gating; this
//! module owns damage, protection and the defeat/respawn state transition only.
use serde::Serialize;
use std::collections::{HashMap, VecDeque};

pub const CANNON_DAMAGE: f32 = 250.0;
pub const COAX_DAMAGE: f32 = 8.0;
pub const RAM_DAMAGE: f32 = 150.0;
pub const RESPAWN_SECONDS: f32 = 12.0;
pub const REVIVE_COOLDOWN_SECONDS: f32 = 20.0;
pub const REVIVE_PROTECTION_SECONDS: f32 = 1.0;
pub const REVIVE_RANGE_METERS: f32 = 8.0;
pub const SPAWN_PROTECTION_SECONDS: f32 = 2.0;
const ASSIST_WINDOW_SECONDS: f32 = 8.0;
const MAX_ASSIST_CONTRIBUTORS: usize = 16;
const HIGHLIGHT_WINDOW_SECONDS: f64 = 10.0;
const MAX_HIGHLIGHT_EVENTS: usize = 1024;

/// Combat-session totals, owned by the simulation and serialized for scoreboards.
/// Combat revivals and ordinary timeout returns are distinct server events.
#[derive(Clone, Debug, Default, Serialize)]
pub struct VehicleCombatStats {
    pub damage_dealt: f32,
    pub healing_done: f32,
    pub self_healing: f32,
    pub gas_burned_liters: f32,
    pub gas_gained_liters: f32,
    pub assists: u32,
    pub resurrections: u32,
    pub respawns: u32,
    pub current_kill_streak: u32,
    pub best_kill_streak: u32,
}

/// A real simulation-time contribution window, not a generated replay clip.
#[derive(Clone, Debug, Serialize)]
pub struct BestCombatMoment {
    pub start_s: f64,
    pub end_s: f64,
    pub kills: u32,
    pub damage: f64,
    pub score: f64,
}
#[derive(Clone, Debug)]
struct HighlightEvent { at_s: f64, kills: u32, damage: f64 }
impl VehicleCombatStats {
    fn add(total: &mut f32, amount: f32) {
        if amount.is_finite() && amount > 0.0 {*total=(*total+amount).min(f32::MAX);}
    }
    pub(crate) fn damage(&mut self, amount:f32){Self::add(&mut self.damage_dealt,amount);}
    pub(crate) fn burn_fuel(&mut self, amount:f32){Self::add(&mut self.gas_burned_liters,amount);}
    pub(crate) fn gain_fuel(&mut self, amount:f32){Self::add(&mut self.gas_gained_liters,amount);}
}

/// A reconnect carries only the disabled lifecycle, never cumulative combat
/// totals. The career journal already checkpointed the old body's statistics.
#[derive(Clone, Debug)]
pub struct DownedLifecycle {
    pub hp_fraction: f32,
    pub disabled_reason: String,
    pub remaining_s: f32,
    pub recovery_window_s: f32,
    pub position: Option<[f32; 3]>,
}

#[derive(Clone, Debug, Serialize)]
pub struct VehicleHealth {
    pub hp: f32,
    pub max_hp: f32,
    pub defeated: bool,
    pub respawn_remaining_s: f32,
    /// Empty while mobile, otherwise combat or fuel. Fuel recovery is not a kill.
    pub disabled_reason: String,
    pub recovery_window_s: f32,
    pub revive_cooldown_s: f32,
    #[serde(skip)]
    pub(crate) downed_position: Option<[f32; 3]>,
    #[serde(skip)]
    pub(crate) friendly_shove_s: f32,
    pub spawn_protection_s: f32,
    pub damage_seq: u32,
    pub last_attacker: Option<String>,
    pub last_damage: f32,
    pub last_damage_kind: String,
    pub kills: u32,
    pub deaths: u32,
    pub stats: VehicleCombatStats,
    // Contributions are world-local attribution, never a client-owned payload.
    #[serde(skip)]
    contributors: HashMap<String, f32>,
    #[serde(skip)]
    combat_clock_s: f64,
    #[serde(skip)]
    highlight_events: VecDeque<HighlightEvent>,
    #[serde(skip)]
    best_moment: Option<BestCombatMoment>,
}

impl VehicleHealth {
    pub fn new(max_hp: f32) -> Self {
        Self {
            hp: max_hp,
            max_hp,
            defeated: false,
            respawn_remaining_s: 0.0,
            disabled_reason: String::new(),
            recovery_window_s: RESPAWN_SECONDS,
            revive_cooldown_s: 0.0,
            downed_position: None,
            friendly_shove_s: 0.0,
            spawn_protection_s: SPAWN_PROTECTION_SECONDS,
            damage_seq: 0,
            last_attacker: None,
            last_damage: 0.0,
            last_damage_kind: String::new(),
            kills: 0,
            deaths: 0,
            stats: VehicleCombatStats::default(),
            contributors: HashMap::new(),
            combat_clock_s: 0.0,
            highlight_events: VecDeque::new(),
            best_moment: None,
        }
    }

    pub fn downed_lifecycle(&self) -> Option<DownedLifecycle> {
        self.defeated.then(|| DownedLifecycle {
            hp_fraction: if self.max_hp > 0.0 { (self.hp / self.max_hp).clamp(0.0, 1.0) } else { 0.0 },
            disabled_reason: self.disabled_reason.clone(), remaining_s: self.respawn_remaining_s,
            recovery_window_s: self.recovery_window_s, position: self.downed_position,
        })
    }

    pub(crate) fn credit_kill(&mut self) {
        self.kills = self.kills.saturating_add(1);
        self.stats.current_kill_streak = self.stats.current_kill_streak.saturating_add(1);
        self.stats.best_kill_streak = self.stats.best_kill_streak.max(self.stats.current_kill_streak);
        self.highlight(1, 0.0);
    }

    /// Only accepted HP damage from the authoritative damage path is credited.
    pub(crate) fn note_damage_dealt(&mut self, damage: f32) {
        if !damage.is_finite() || damage <= 0.0 { return; }
        self.stats.damage(damage);
        self.highlight(0, damage as f64);
    }

    pub(crate) fn combat_time_s(&self) -> f64 { self.combat_clock_s }
    pub(crate) fn best_combat_moment(&self) -> Option<&BestCombatMoment> { self.best_moment.as_ref() }

    fn highlight(&mut self, kills: u32, damage: f64) {
        let start_s = (self.combat_clock_s - HIGHLIGHT_WINDOW_SECONDS).max(0.0);
        while self.highlight_events.front().is_some_and(|event| event.at_s < start_s) {
            self.highlight_events.pop_front();
        }
        if self.highlight_events.len() >= MAX_HIGHLIGHT_EVENTS { self.highlight_events.pop_front(); }
        self.highlight_events.push_back(HighlightEvent { at_s: self.combat_clock_s, kills, damage });
        let mut moment = BestCombatMoment { start_s, end_s: self.combat_clock_s, kills: 0, damage: 0.0, score: 0.0 };
        for event in &self.highlight_events {
            moment.kills = moment.kills.saturating_add(event.kills);
            moment.damage += event.damage;
        }
        moment.score = moment.kills as f64 * 100.0 + moment.damage * 0.1;
        if self.best_moment.as_ref().is_none_or(|best| moment.score > best.score) { self.best_moment = Some(moment); }
    }

    pub(crate) fn note_contributor(&mut self,player:&str) {
        if let Some(remaining)=self.contributors.get_mut(player){*remaining=ASSIST_WINDOW_SECONDS;return;}
        if self.contributors.len()>=MAX_ASSIST_CONTRIBUTORS {
            if let Some(oldest)=self.contributors.iter().min_by(|a,b|a.1.total_cmp(b.1)).map(|(id,_)|id.clone()){self.contributors.remove(&oldest);}
        }
        self.contributors.insert(player.into(),ASSIST_WINDOW_SECONDS);
    }
    pub(crate) fn take_assist_candidates(&mut self,killer:Option<&str>)->Vec<String>{
        self.contributors.drain().filter_map(|(id,remaining)|(remaining>0.0&&Some(id.as_str())!=killer).then_some(id)).collect()
    }
    pub(crate) fn remove_contributor(&mut self,player:&str){self.contributors.remove(player);}
    pub(crate) fn reassign_contributor(&mut self,old:&str,new:&str){
        if let Some(remaining)=self.contributors.remove(old){self.contributors.entry(new.into()).and_modify(|current|*current=current.max(remaining)).or_insert(remaining);}
        if self.last_attacker.as_deref()==Some(old){self.last_attacker=Some(new.into());}
    }

    /// Returns true exactly once for a newly lethal hit. The world decides team
    /// policy and awards the attacker; ignored hits never change attribution.
    pub fn apply_damage(&mut self, amount: f32, attacker: Option<&str>, kind: &str) -> bool {
        if !amount.is_finite() || amount <= 0.0 || self.defeated || self.spawn_protection_s > 0.0 {
            return false;
        }
        let damage = amount.min(self.hp);
        self.hp = (self.hp - damage).max(0.0);
        self.last_damage = damage;
        self.last_damage_kind = kind.to_owned();
        self.last_attacker = attacker.map(str::to_owned);
        self.damage_seq = self.damage_seq.wrapping_add(1);
        if self.hp > 0.0 {
            return false;
        }
        self.defeated = true;
        self.disabled_reason = "combat".into();
        self.respawn_remaining_s = RESPAWN_SECONDS;
        self.spawn_protection_s = 0.0;
        self.deaths = self.deaths.saturating_add(1);
        self.stats.current_kill_streak = 0;
        true
    }

    /// Fuel depletion opens the same rescue window, without damage, death or
    /// killer credit. The world performs the engine shutdown and flag drop.
    pub(crate) fn disable_for_fuel(&mut self) -> bool {
        if self.defeated { return false; }
        self.defeated = true;
        self.disabled_reason = "fuel".into();
        self.respawn_remaining_s = RESPAWN_SECONDS;
        self.spawn_protection_s = 0.0;
        self.contributors.clear();
        true
    }

    /// Restore a rescue target in place. The physics owner verifies the rescue
    /// window and clear placement before committing this transition.
    pub(crate) fn revive(&mut self) -> (bool, f32) {
        let combat = self.disabled_reason == "combat";
        let before = self.hp;
        self.hp = self.hp.max(self.max_hp * 0.30);
        self.defeated = false;
        self.disabled_reason.clear();
        self.respawn_remaining_s = 0.0;
        self.downed_position = None;
        self.friendly_shove_s = 0.0;
        self.spawn_protection_s = REVIVE_PROTECTION_SECONDS;
        self.last_attacker = None;
        self.last_damage = 0.0;
        self.last_damage_kind.clear();
        self.contributors.clear();
        (combat, self.hp - before)
    }

    /// A mature respawn stays pending until the world successfully finds a safe
    /// spawn and calls respawn(). Occupied spawns must not revive in place.
    pub fn advance(&mut self, dt: f32) -> bool {
        if !dt.is_finite() || dt <= 0.0 {
            return false;
        }
        self.combat_clock_s = (self.combat_clock_s + dt as f64).min(f64::MAX);
        self.contributors.retain(|_,remaining|{*remaining-=dt;*remaining>0.0});
        self.spawn_protection_s = (self.spawn_protection_s - dt).max(0.0);
        self.revive_cooldown_s = (self.revive_cooldown_s - dt).max(0.0);
        if self.defeated {
            self.respawn_remaining_s = (self.respawn_remaining_s - dt).max(0.0);
            return self.respawn_remaining_s <= 0.0;
        }
        false
    }

    pub fn respawn(&mut self) {
        if self.defeated {self.stats.respawns=self.stats.respawns.saturating_add(1);}
        self.contributors.clear();
        self.stats.current_kill_streak = 0;
        self.hp = self.max_hp;
        self.defeated = false;
        self.disabled_reason.clear();
        self.downed_position = None;
        self.friendly_shove_s = 0.0;
        self.respawn_remaining_s = 0.0;
        self.spawn_protection_s = SPAWN_PROTECTION_SECONDS;
        self.last_attacker = None;
        self.last_damage = 0.0;
        self.last_damage_kind.clear();
    }

    /// Swapping chassis changes capacity, not the fraction lost to damage or
    /// any active defeat/protection timer. Score survives the selected vehicle.
    pub fn set_chassis(&mut self, maximum: f32) {
        let fraction = if self.max_hp.is_finite() && self.max_hp > 0.0 {
            (self.hp / self.max_hp).clamp(0.0, 1.0)
        } else {
            0.0
        };
        self.max_hp = maximum;
        self.hp = if self.defeated && self.disabled_reason != "fuel" { 0.0 } else { self.max_hp * fraction };
    }

    pub fn repair(&mut self, amount: f32) {
        if !amount.is_finite() || amount <= 0.0 || self.defeated {
            return;
        }
        let before=self.hp;
        self.hp = (self.hp + amount).min(self.max_hp);
        let healed=self.hp-before;
        VehicleCombatStats::add(&mut self.stats.healing_done,healed);
        VehicleCombatStats::add(&mut self.stats.self_healing,healed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vulnerable(tracked: bool) -> VehicleHealth {
        let mut health = VehicleHealth::new(if tracked { 1200.0 } else { 500.0 });
        health.advance(SPAWN_PROTECTION_SECONDS);
        health
    }

    #[test]
    fn capacity_and_initial_protection_follow_the_chassis() {
        use crate::vehicle_setup::{BRZ, SIERRA, TANK};
        for (config, maximum) in [(TANK, 1200.0), (BRZ, 500.0), (SIERRA, 900.0)] {
            let health = VehicleHealth::new(config.hull_hp);
            assert_eq!(health.hp, maximum);
            assert_eq!(health.max_hp, maximum);
            assert_eq!(health.spawn_protection_s, 2.0);
            assert!(!health.defeated);
            assert_eq!((health.kills, health.deaths, health.damage_seq), (0, 0, 0));
        }
    }

    #[test]
    fn protection_and_invalid_hits_cannot_change_health_or_attribution() {
        let mut health = VehicleHealth::new(500.0);
        assert!(!health.apply_damage(1000.0, Some("protected-hit"), "cannon"));
        health.advance(2.0);
        for damage in [0.0, -1.0, f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            assert!(!health.apply_damage(damage, Some("invalid"), "invalid"));
        }
        assert_eq!(health.hp, 500.0);
        assert_eq!(health.damage_seq, 0);
        assert!(health.last_attacker.is_none());
        assert!(health.last_damage_kind.is_empty());
    }

    #[test]
    fn lethal_damage_is_counted_once_and_overkill_records_actual_hp_lost() {
        let mut health = vulnerable(false);
        assert!(!health.apply_damage(100.0, Some("first"), "coax"));
        assert_eq!(health.hp, 400.0);
        assert_eq!(health.last_damage, 100.0);
        assert!(health.apply_damage(1000.0, Some("finisher"), "cannon"));
        assert_eq!(health.hp, 0.0);
        assert_eq!(health.last_damage, 400.0);
        assert_eq!(health.last_attacker.as_deref(), Some("finisher"));
        assert_eq!(health.deaths, 1);
        assert_eq!(health.damage_seq, 2);
        assert_eq!(health.respawn_remaining_s, RESPAWN_SECONDS);
        assert!(!health.apply_damage(100.0, Some("late"), "ram"));
        assert_eq!(health.last_attacker.as_deref(), Some("finisher"));
        assert_eq!((health.deaths, health.damage_seq), (1, 2));
    }

    #[test]
    fn respawn_retries_stay_defeated_and_success_restores_protection_not_score() {
        let mut health = vulnerable(false);
        health.kills = 3;
        assert!(health.apply_damage(500.0, None, "environment"));
        assert!(!health.advance(RESPAWN_SECONDS - 0.5));
        assert!(health.advance(0.5));
        assert!(health.advance(1.0), "a blocked spawn may be retried next tick");
        assert!(health.defeated);
        assert_eq!(health.hp, 0.0);
        health.respawn();
        assert!(!health.defeated);
        assert_eq!(health.hp, 500.0);
        assert_eq!(health.spawn_protection_s, 2.0);
        assert_eq!((health.kills, health.deaths, health.damage_seq), (3, 1, 1));
        assert!(health.last_attacker.is_none());
        assert_eq!(health.last_damage, 0.0);
        assert!(!health.apply_damage(250.0, Some("spawn-camper"), "cannon"));
        health.advance(2.0);
        assert!(!health.apply_damage(250.0, Some("opponent"), "cannon"));
        assert_eq!(health.hp, 250.0);
    }

    #[test]
    fn chassis_swaps_preserve_fraction_and_active_timers_instead_of_healing() {
        let mut health = vulnerable(false);
        health.apply_damage(125.0, Some("attacker"), "cannon");
        health.spawn_protection_s = 0.75;
        health.kills = 2;
        health.set_chassis(1200.0);
        assert_eq!(health.max_hp, 1200.0);
        assert_eq!(health.hp, 900.0);
        assert_eq!(health.spawn_protection_s, 0.75);
        assert_eq!(health.kills, 2);
        assert_eq!(health.damage_seq, 1);
        assert_eq!(health.last_attacker.as_deref(), Some("attacker"));
        health.set_chassis(500.0);
        assert_eq!(health.hp, 375.0);
    }

    #[test]
    fn switching_or_repairing_a_defeated_chassis_cannot_bypass_respawn() {
        let mut health = vulnerable(false);
        health.apply_damage(500.0, None, "fall");
        health.advance(1.5);
        health.set_chassis(1200.0);
        health.repair(10000.0);
        assert!(health.defeated);
        assert_eq!(health.hp, 0.0);
        assert_eq!(health.max_hp, 1200.0);
        assert_eq!(health.respawn_remaining_s, RESPAWN_SECONDS - 1.5);
        assert_eq!(health.deaths, 1);
    }

    #[test]
    fn repair_is_bounded_and_invalid_repairs_do_not_damage_a_live_vehicle() {
        let mut health = vulnerable(false);
        health.apply_damage(300.0, None, "impact");
        for amount in [0.0, -50.0, f32::NAN, f32::INFINITY] {
            health.repair(amount);
            assert_eq!(health.hp, 200.0);
        }
        health.repair(120.0);
        assert_eq!(health.hp, 320.0);
        health.repair(10000.0);
        assert_eq!(health.hp, health.max_hp);
        assert_eq!(health.damage_seq, 1);
    }

    #[test]
    fn invalid_time_does_not_expire_protection_or_respawn() {
        let mut health = VehicleHealth::new(1200.0);
        for dt in [0.0, -1.0, f32::NAN, f32::INFINITY] {
            assert!(!health.advance(dt));
            assert_eq!(health.spawn_protection_s, 2.0);
        }
        health.advance(2.0);
        health.apply_damage(1200.0, None, "environment");
        for dt in [0.0, -1.0, f32::NAN, f32::INFINITY] {
            assert!(!health.advance(dt));
            assert_eq!(health.respawn_remaining_s, RESPAWN_SECONDS);
        }
    }
}

#[cfg(test)]
mod combat_stats_tests {
    use super::*;
    #[test]
    fn repair_counts_only_actual_self_healing_and_invalid_values_never_change_stats() {
        let mut h=VehicleHealth::new(500.0);h.hp=490.0;
        h.repair(100.0);h.repair(100.0);h.repair(f32::NAN);
        assert_eq!(h.stats.healing_done,10.0);assert_eq!(h.stats.self_healing,10.0);
        h.defeated=true;h.hp=0.0;h.repair(100.0);assert_eq!(h.stats.healing_done,10.0);
        for amount in [f32::NAN,f32::INFINITY,-1.0,0.0] {h.stats.damage(amount);h.stats.burn_fuel(amount);h.stats.gain_fuel(amount);}
        assert_eq!((h.stats.damage_dealt,h.stats.gas_burned_liters,h.stats.gas_gained_liters),(0.0,0.0,0.0));
    }
    #[test]
    fn pending_assists_are_bounded_expire_in_simulation_time_and_clear_on_respawn() {
        let mut h=VehicleHealth::new(500.0);
        for i in 0..32 {h.note_contributor(&format!("source-{i}"));}
        assert_eq!(h.contributors.len(),MAX_ASSIST_CONTRIBUTORS);
        h.advance(8.1);assert!(h.take_assist_candidates(None).is_empty());
        h.note_contributor("source");h.defeated=true;h.respawn();
        assert!(h.take_assist_candidates(None).is_empty());assert_eq!(h.stats.respawns,1);assert_eq!(h.stats.resurrections,0);
    }
    #[test]
    fn kill_streak_resets_at_defeat_but_best_survives_respawn_and_chassis_changes() {
        let mut h=VehicleHealth::new(500.0);h.advance(2.0);h.credit_kill();h.credit_kill();
        assert_eq!((h.kills,h.stats.current_kill_streak,h.stats.best_kill_streak),(2,2,2));
        assert!(h.apply_damage(500.0,None,"fall"));assert_eq!(h.stats.current_kill_streak,0);
        h.respawn();h.set_chassis(1200.0);h.credit_kill();
        assert_eq!((h.kills,h.stats.current_kill_streak,h.stats.best_kill_streak),(3,1,2));
    }
    #[test]
    fn highlight_tracks_only_finite_actual_contributions_inside_ten_simulated_seconds() {
        let mut h=VehicleHealth::new(500.0);h.advance(1.0);h.note_damage_dealt(100.0);h.credit_kill();
        h.advance(4.0);h.note_damage_dealt(200.0);h.credit_kill();
        let best=h.best_combat_moment().unwrap();assert_eq!((best.start_s,best.end_s,best.kills,best.damage),(0.0,5.0,2,300.0));
        h.advance(11.0);h.note_damage_dealt(10.0);
        assert_eq!(h.best_combat_moment().unwrap().end_s,5.0);assert_eq!(h.highlight_events.len(),1);
        for damage in [f32::NAN,f32::INFINITY,0.0,-1.0] {h.note_damage_dealt(damage);}
        assert_eq!(h.stats.damage_dealt,310.0);assert_eq!(h.highlight_events.len(),1);assert_eq!(h.combat_time_s(),16.0);
    }
    #[test]
    fn highlight_storage_stays_bounded_at_high_fire_rates() {
        let mut h=VehicleHealth::new(500.0);
        for _ in 0..MAX_HIGHLIGHT_EVENTS+10 {h.note_damage_dealt(1.0);}
        assert_eq!(h.highlight_events.len(),MAX_HIGHLIGHT_EVENTS);
        assert_eq!(h.stats.damage_dealt,(MAX_HIGHLIGHT_EVENTS+10) as f32);
        assert_eq!(h.best_combat_moment().unwrap().damage,MAX_HIGHLIGHT_EVENTS as f64);
    }
}
