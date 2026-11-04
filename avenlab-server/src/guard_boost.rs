//! BRZ's finite frontal guard and controlled mobility burst. The server assigns
//! the hero; a BRZ chassis or client-written role alone never grants it.
use crate::physics::PhysicsWorld;
use rapier3d::prelude::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

pub const GUARD_DURATION: f32 = 4.0;
pub const GUARD_COOLDOWN: f32 = 20.0;
pub const GUARD_HP: f32 = 200.0;
pub const GUARD_NOS_SECONDS: f32 = 4.0;
pub const GUARD_FUEL_LITERS: f32 = 3.0;
pub const GUARD_SPEED_MULTIPLIER: f32 = 1.25;
pub const GUARD_FORCE_MULTIPLIER: f32 = 1.35;
pub const GUARD_FRONT_DOT: f32 = 0.5;
pub const GUARD_CONTACT_DAMAGE: f32 = 60.0;
pub const DIVE_DURATION: f32 = 2.0;
pub const DIVE_COOLDOWN: f32 = 18.0;
pub const BARRIER_COOLDOWN: f32 = 15.0;
pub const BARRIER_HP: f32 = 500.0;
pub const BARRIER_FUEL_LITERS: f32 = 1.0;
/// Guard braces the drivetrain but never cancels the physical collision.
pub fn guarded_impact_delta_v(delta_v: f32) -> f32 { (delta_v * 0.55).min(18.0) }

#[derive(Clone, Debug, Default, Serialize)]
pub struct GuardView {
    pub kind: &'static str,
    pub remaining_s: f32,
    pub cooldown_s: f32,
    pub shield_hp: f32,
    pub shield_max_hp: f32,
    pub break_seq: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub panel: Option<[f32; 4]>,
    pub panel_yaw: f32,
    pub dive_remaining_s: f32,
    pub dive_cooldown_s: f32,
}
#[derive(Default)]
pub struct GuardBoostState {
    pub kind: &'static str,
    pub remaining: f32,
    pub cooldown: f32,
    pub shield_hp: f32,
    pub break_seq: u32,
    pub hits: HashSet<RigidBodyHandle>,
    pub suspended: bool,
    pub dive_remaining: f32,
    pub dive_cooldown: f32,
}
impl GuardBoostState {
    pub fn view(&self) -> GuardView {
        GuardView { kind:self.kind, remaining_s: self.remaining, cooldown_s: self.cooldown,
            shield_hp: if self.suspended {0.0} else {self.shield_hp}, shield_max_hp: if self.kind=="tank_barrier" {BARRIER_HP}else{GUARD_HP}, break_seq: self.break_seq, panel_yaw:0.0, dive_remaining_s:self.dive_remaining, dive_cooldown_s:self.dive_cooldown, panel: (self.kind=="tank_barrier").then_some(crate::team_barrier::PANEL) }
    }
    pub fn active(&self) -> bool { if self.kind=="tank_barrier" {!self.suspended && self.shield_hp>0.0} else {self.remaining>0.0} }
    pub fn mobility_active(&self) -> bool {self.active()&&self.kind=="brz_guard"}
    pub(crate) fn absorb(&mut self, amount: f32) -> f32 {
        let spent = amount.min(self.shield_hp);
        self.shield_hp -= spent;
        if spent > 0.0 && self.shield_hp == 0.0 { self.break_seq = self.break_seq.wrapping_add(1); }
        amount - spent
    }
    fn suspend(&mut self) {
        if self.kind=="tank_barrier" {self.suspended=true;} else {self.cancel();}
    }
    fn cancel(&mut self) { self.suspended=false; self.dive_remaining=0.0; self.remaining = 0.0; self.shield_hp = 0.0; }
}

impl PhysicsWorld {
    pub fn assigned_hero(&self, player: &str) -> Option<&str> { self.trusted_heroes.get(player).map(String::as_str) }
    pub fn set_assigned_hero(&mut self, player: &str, hero: &str) {
        if self.assigned_hero(player) != Some(hero) { self.cancel_guard(player); self.support.clear_player(player); }
        if hero.is_empty() { self.trusted_heroes.remove(player); }
        else { self.trusted_heroes.insert(player.into(), hero.into()); }
    }
    pub fn guard_view(&self, player: &str) -> GuardView {
        let mut view=self.guard_boosts.get(player).map(GuardBoostState::view)
            .unwrap_or(GuardView { shield_max_hp: GUARD_HP, ..Default::default() });
        if self.assigned_hero(player)==Some("tank") {view.kind="tank_barrier";view.shield_max_hp=BARRIER_HP;view.panel_yaw=self.barrier_yaw(player);}
        else if self.assigned_hero(player)==Some("brz") {view.kind="brz_guard";view.shield_max_hp=GUARD_HP;}
        view
    }
    pub fn cancel_guard(&mut self, player: &str) { if let Some(guard) = self.guard_boosts.get_mut(player) { guard.cancel(); } }
    pub fn suspend_shields(&mut self,player:&str){if let Some(g)=self.guard_boosts.get_mut(player){g.suspend();}}
    pub fn start_guard_boost(&mut self, player: &str) -> Result<(), String> {
        if self.assigned_hero(player) != Some("brz") { return Err("Select the BRZ DPS hero to use Guard Boost.".into()); }
        if !self.vehicle_health.get(player).is_some_and(|h| !h.defeated && h.hp > 0.0) { return Err("A disabled vehicle cannot use Guard Boost.".into()); }
        let vehicle = self.vehicles.get(player).ok_or("Deploy your BRZ first.")?;
        if vehicle.config.tracked { return Err("Guard Boost belongs to the BRZ DPS hero.".into()); }
        if self.guard_boosts.get(player).is_some_and(|g| g.cooldown > 0.0) { return Err("Guard Boost is cooling down.".into()); }
        let power = &vehicle.powertrain;
        if !power.running || power.thermal_recovery { return Err("Start a healthy engine before Guard Boost.".into()); }
        if power.gear <= 0 || vehicle.brake >= 0.8 { return Err("Select a forward gear and release the brakes.".into()); }
        if !power.nos_remaining_s.is_finite() || power.nos_remaining_s < GUARD_NOS_SECONDS ||
            !power.fuel_liters.is_finite() || power.fuel_liters < GUARD_FUEL_LITERS { return Err("Guard Boost needs 4 seconds of nitrous and 3 litres of fuel.".into()); }
        if !self.bodies.get(vehicle.body).is_some_and(|b| b.is_enabled()) ||
            !self.wheels.get(&vehicle.body).is_some_and(|w| w.iter().filter(|w| w.grounded).count() >= 2) { return Err("Guard Boost needs grounded wheels.".into()); }
        let vehicle = self.vehicles.get_mut(player).unwrap();
        vehicle.powertrain.nos_remaining_s -= GUARD_NOS_SECONDS;
        vehicle.powertrain.fuel_liters -= GUARD_FUEL_LITERS;
        let guard = self.guard_boosts.entry(player.into()).or_default();
        guard.kind="brz_guard"; guard.suspended=false; guard.remaining = GUARD_DURATION; guard.cooldown = GUARD_COOLDOWN; guard.shield_hp = GUARD_HP; guard.hits.clear();
        // Aggressive mobility cannot refresh the ordinary spawn shield.
        let health=self.vehicle_health.get_mut(player).unwrap();
        health.spawn_protection_s = 0.0; health.stats.burn_fuel(GUARD_FUEL_LITERS);
        Ok(())
    }
    pub fn start_tank_barrier(&mut self, player:&str)->Result<(),String> {
        if self.assigned_hero(player)!=Some("tank") {return Err("Select the Tank hero to use its frontal barrier.".into());}
        if !self.vehicle_health.get(player).is_some_and(|h|!h.defeated&&h.hp>0.0) {return Err("A disabled vehicle cannot raise its barrier.".into());}
        let vehicle=self.vehicles.get(player).ok_or("Deploy your Tank first.")?;
        if !vehicle.config.tracked {return Err("The barrier belongs to the Tank hero.".into());}
        if self.guard_boosts.get(player).is_some_and(|g|g.kind=="tank_barrier" && g.shield_hp>0.0) {return Err("The barrier is already active.".into());}
        if self.guard_boosts.get(player).is_some_and(|g|g.cooldown>0.0) {return Err("The frontal barrier is cooling down.".into());}
        if !vehicle.powertrain.running || !self.bodies.get(vehicle.body).is_some_and(|b|b.is_enabled()) {return Err("Start the Tank engine before raising its barrier.".into());}
        if !vehicle.powertrain.fuel_liters.is_finite() || vehicle.powertrain.fuel_liters<BARRIER_FUEL_LITERS {return Err("The frontal barrier needs 1 litre of fuel.".into());}
        self.vehicles.get_mut(player).unwrap().powertrain.fuel_liters-=BARRIER_FUEL_LITERS;
        let guard=self.guard_boosts.entry(player.into()).or_default();
        guard.kind="tank_barrier";guard.suspended=false;guard.remaining=0.0;guard.cooldown=BARRIER_COOLDOWN;guard.shield_hp=BARRIER_HP;guard.hits.clear();
        let health=self.vehicle_health.get_mut(player).unwrap();health.spawn_protection_s=0.0;health.stats.burn_fuel(BARRIER_FUEL_LITERS);
        Ok(())
    }
    pub fn start_dive_shield(&mut self, player:&str)->Result<(),String> {
        if self.assigned_hero(player)!=Some("cx30") || self.is_defeated(player) {return Err("Deploy a living CX-30 Support SUV first.".into());}
        let car=self.vehicles.get(player).ok_or("Deploy your CX-30 first.")?;
        if !car.powertrain.running || !self.bodies[car.body].is_enabled() {return Err("Start the engine first.".into());}
        let guard=self.guard_boosts.entry(player.into()).or_default();
        if guard.dive_cooldown>0.0 {return Err("Dive Shield is cooling down.".into());}
        guard.dive_remaining=DIVE_DURATION;
        guard.dive_cooldown=DIVE_COOLDOWN;
        self.vehicle_health.get_mut(player).unwrap().spawn_protection_s=0.0;
        Ok(())
    }
    pub fn dive_protected(&self, player:&str)->bool {
        self.guard_boosts.get(player).is_some_and(|g|g.dive_remaining>0.0)
    }
    pub fn advance_guard_boosts<'a>(&mut self, dt: f32, active: impl Iterator<Item = &'a str>) {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 { return; }
        let connected: std::collections::HashSet<_> = active.collect();
        for (id, guard) in &mut self.guard_boosts {
            guard.cooldown = (guard.cooldown - dt).max(0.0);
            guard.dive_cooldown=(guard.dive_cooldown-dt).max(0.0);
            guard.dive_remaining=(guard.dive_remaining-dt).max(0.0);
            let living = self.vehicle_health.get(id).is_some_and(|h| !h.defeated && h.hp > 0.0);
            let enabled = self.vehicles.get(id).is_some_and(|v| (guard.kind=="tank_barrier" || (v.powertrain.running && !v.powertrain.thermal_recovery)) && self.bodies.get(v.body).is_some_and(|b| b.is_enabled()));
            if !living || !enabled || !connected.contains(id.as_str()) { guard.suspend(); }
            else if guard.kind=="tank_barrier" {guard.suspended=false;}
            else if guard.kind!="tank_barrier" { guard.remaining = (guard.remaining - dt).max(0.0); if !guard.active() { guard.shield_hp = 0.0; } }
        }
    }
    pub fn guard_covers_direction(&self, player: &str, toward: Vector<Real>) -> bool {
        let Some(guard) = self.guard_boosts.get(player).filter(|g| g.active() && g.shield_hp > 0.0) else { return false; };
        if guard.kind=="tank_barrier" {return false;}
        let Some(body) = self.vehicles.get(player).and_then(|v| self.bodies.get(v.body)) else { return false; };
        let mut direction = toward; direction.y = 0.0;
        let mut forward = body.rotation() * Vector::z(); forward.y = 0.0;
        direction.iter().all(|v| v.is_finite()) && direction.norm_squared() > 0.0001 && forward.norm_squared() > 0.0001 &&
            direction.normalize().dot(&forward.normalize()) >= GUARD_FRONT_DOT
    }
    /// Common HP damage calls this only after friendly fire/source validation.
    /// The finite pool blocks frontal hits, never side/rear damage or falling.
    pub fn absorb_guard_damage(&mut self, victim: &str, attacker: Option<&str>, amount: f32, kind: &str) -> f32 {
        if !amount.is_finite() || amount <= 0.0 { return amount; }
        // Tank projectiles cross the spatial screen during tracing. A hit from
        // inside or around that screen must not be absorbed again at the hull.
        if matches!(kind, "cannon" | "machine-gun") && self.guard_boosts.get(victim).is_some_and(|g|g.kind=="tank_barrier") {return amount;}
        let impact_direction = (kind == "impact").then(|| self.guard_impact_directions.get(victim).copied()).flatten();
        let direction = impact_direction.or_else(|| attacker.and_then(|id| self.vehicles.get(id).and_then(|v| self.bodies.get(v.body)))
            .zip(self.vehicles.get(victim).and_then(|v| self.bodies.get(v.body)))
            .map(|(source,target)| source.translation() - target.translation()));
        if !direction.is_some_and(|v| self.guard_covers_direction(victim, v)) { return amount; }
        let guard = self.guard_boosts.get_mut(victim).unwrap();
        guard.absorb(amount)
    }
}

impl PhysicsWorld {
    /// One modest offensive payoff for an actual frontal vehicle contact. No
    /// stun or artificial impulse: Rapier remains the owner of knockback.
    pub(crate) fn guard_contacts(&self, motion:&HashMap<RigidBodyHandle,(Vector<Real>,Vector<Real>)>) -> Vec<(String,RigidBodyHandle,String,bool)> {
        let mut hits=Vec::new();
        for (id,guard) in &self.guard_boosts {
            if !guard.mobility_active() || self.is_defeated(id) { continue; }
            let Some(source)=self.vehicles.get(id) else {continue};
            if !self.wheels.get(&source.body).is_some_and(|w|w.iter().filter(|w|w.grounded).count()>=2) {continue;}
            let Some(body)=self.bodies.get(source.body) else {continue};
            let Some((position,velocity))=motion.get(&source.body) else {continue};
            let forward=body.rotation()*Vector::z();
            for collider in body.colliders() {for pair in self.narrow_phase.contact_pairs_with(*collider) {
                if pair.total_impulse_magnitude()<500.0 {continue;}
                let other=if pair.collider1==*collider {pair.collider2}else{pair.collider1};
                let Some(target)=self.colliders.get(other).and_then(|c|c.parent()) else {continue};

                let Some(victim)=self.body_to_player.get(&target) else {continue};
                if !self.vehicles.get(victim).is_some_and(|v|v.team!=source.team) || self.is_defeated(victim) {continue;}
                let Some((target_position,target_velocity))=motion.get(&target) else {continue};
                let mut toward=target_position-position; toward.y=0.0;
                if toward.norm_squared()<0.01 {continue;}
                let toward=toward.normalize();
                if toward.dot(&forward)>=GUARD_FRONT_DOT && (velocity-target_velocity).dot(&toward)>6.0 {let cap=source.config.max_speed * if self.ctf_carriers.contains(id) {crate::ctf::CARRIER_SPEED_FACTOR} else {1.0};
                    let dislodge=guard.shield_hp>0.0 && velocity.dot(&forward)>=cap*0.90 && self.ctf_carriers.contains(victim);
                    hits.push((id.clone(),target,victim.clone(),dislodge));}
            }}
        }
        hits
    }
    pub(crate) fn resolve_guard_contacts(&mut self, hits:Vec<(String,RigidBodyHandle,String,bool)>) {
        for (source,target,victim,dislodge) in hits {
            if dislodge {self.dislodged_carriers.insert(victim.clone());}
            if self.is_defeated(&source) {continue;}
            if self.guard_boosts.get_mut(&source).is_some_and(|g|g.hits.insert(target)) {
                self.damage_vehicle(&victim,Some(&source),GUARD_CONTACT_DAMAGE,"guard-ram");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physics::SIMULATION_DT;
    fn range(vehicle:&str,hero:&str)->PhysicsWorld {
        let mut world=crate::support::tests::blank_world();
        world.spawn_vehicle_for_player("guard".into(),[0.0;3],vehicle,"red").unwrap();
        world.spawn_vehicle_for_player("enemy".into(),[0.0;3],"tank","blue").unwrap();
        // Explicitly arrange this scenario; support's shared floor fixture may
        // choose different safe authored spawn pads for its own tests.
        crate::support::tests::place(&mut world,"guard",0.0,0.0);
        crate::support::tests::place(&mut world,"enemy",0.0,12.0);
        for _ in 0..90 {world.step(SIMULATION_DT);}
        world.set_assigned_hero("guard",hero);
        for health in world.vehicle_health.values_mut(){health.spawn_protection_s=0.0;}
        let source=world.vehicles.get_mut("guard").unwrap();source.powertrain.gear=1;
        source.powertrain.running=true;source.powertrain.engine_requested=true;
        world
    }
    #[test]
    fn guard_boost_checks_actual_hero_resources_grounding_and_does_not_clone_weapons(){
        let mut w=range("brz","mechanic");let fuel=w.vehicles["guard"].powertrain.fuel_liters;
        assert!(w.start_guard_boost("guard").is_err());assert_eq!(w.vehicles["guard"].powertrain.fuel_liters,fuel);
        w.set_assigned_hero("guard","brz");
        let nos=w.vehicles["guard"].powertrain.nos_remaining_s;
        let burned=w.vehicle_health["guard"].stats.gas_burned_liters;
        w.start_guard_boost("guard").unwrap();
        assert_eq!(w.vehicles["guard"].powertrain.fuel_liters,fuel-GUARD_FUEL_LITERS);
        assert_eq!(w.vehicle_health["guard"].stats.gas_burned_liters,burned+GUARD_FUEL_LITERS);
        assert_eq!(w.vehicles["guard"].powertrain.nos_remaining_s,nos-GUARD_NOS_SECONDS);
        assert_eq!(w.guard_view("guard").kind,"brz_guard");assert!(w.start_guard_boost("guard").is_err());
        assert!(!w.vehicles["guard"].config.tracked);
        w.cancel_guard("guard");assert_eq!(w.guard_view("guard").remaining_s,0.0);assert_eq!(w.guard_view("guard").cooldown_s,GUARD_COOLDOWN);
        for _ in 0..1300 {w.advance_guard_boosts(SIMULATION_DT,["guard","enemy"].into_iter());}
        w.vehicles.get_mut("guard").unwrap().powertrain.nos_remaining_s=0.0;
        assert!(w.start_guard_boost("guard").unwrap_err().contains("nitrous"));
        w.vehicles.get_mut("guard").unwrap().powertrain.nos_remaining_s=GUARD_NOS_SECONDS;
        let body=w.vehicles["guard"].body;for wheel in w.wheels.get_mut(&body).unwrap(){wheel.grounded=false;}
        assert!(w.start_guard_boost("guard").unwrap_err().contains("grounded"));
    }
    #[test]
    fn guard_is_finite_frontal_and_breaks_once_not_side_or_rear_invulnerability(){
        let mut w=range("brz","brz");w.start_guard_boost("guard").unwrap();
        w.damage_vehicle("guard",Some("enemy"),250.0,"cannon");
        assert_eq!(w.vehicle_health["guard"].hp,450.0);assert_eq!(w.guard_view("guard").shield_hp,0.0);assert_eq!(w.guard_view("guard").break_seq,1);
        assert!(w.guard_boosts["guard"].mobility_active(),"shield break does not erase purchased mobility");
        w.damage_vehicle("guard",Some("enemy"),10.0,"machinegun");assert_eq!(w.guard_view("guard").break_seq,1);
        w.guard_boosts.get_mut("guard").unwrap().shield_hp=200.0;
        crate::support::tests::place(&mut w,"enemy",12.0,0.0);
        w.damage_vehicle("guard",Some("enemy"),25.0,"cannon");assert_eq!(w.guard_view("guard").shield_hp,200.0);
        crate::support::tests::place(&mut w,"enemy",0.0,-12.0);
        w.damage_vehicle("guard",Some("enemy"),25.0,"cannon");assert_eq!(w.guard_view("guard").shield_hp,200.0);
        let before=w.guard_view("guard").shield_hp;w.damage_vehicle("guard",None,f32::NAN,"cannon");assert_eq!(w.guard_view("guard").shield_hp,before);
        assert_eq!(w.vehicle_health["guard"].hp,390.0);
    }
    #[test]
    fn tank_barrier_is_directional_finite_and_never_boosts_or_drains_nitrous(){
        let mut w=range("tank","tank");let nos=w.vehicles["guard"].powertrain.nos_remaining_s;
        let fuel=w.vehicles["guard"].powertrain.fuel_liters;
        w.start_tank_barrier("guard").unwrap();
        assert_eq!(w.guard_view("guard").shield_max_hp,BARRIER_HP);assert!(!w.guard_boosts["guard"].mobility_active());
        assert_eq!(w.vehicles["guard"].powertrain.nos_remaining_s,nos);assert_eq!(w.vehicles["guard"].powertrain.fuel_liters,fuel-1.0);
        let mut damage=550.0;
        let pose=*w.bodies[w.vehicles["guard"].body].position();
        assert!(w.screen_segment("enemy",pose*point![3.8,0.8,12.0],pose*point![3.8,0.8,0.0],&mut damage).is_none());
        assert_eq!(damage,50.0);
        w.damage_vehicle("guard",Some("enemy"),damage,"cannon");
        assert_eq!(w.guard_view("guard").shield_hp,0.0);assert_eq!(w.guard_view("guard").break_seq,1);
        assert_eq!(w.vehicle_health["guard"].hp,w.vehicle_health["guard"].max_hp-50.0);
        assert!(w.start_tank_barrier("guard").is_err());
        for _ in 0..301 {w.advance_guard_boosts(SIMULATION_DT,["guard","enemy"].into_iter());}
        assert_eq!(w.guard_view("guard").remaining_s,0.0);assert!(w.guard_view("guard").cooldown_s>9.0);
        w.set_assigned_hero("guard","brz");assert!(w.start_tank_barrier("guard").is_err());
    }
    #[test]
    fn cannon_line_shields_a_teammate_beside_the_tank_but_not_beyond_the_edge() {
        let mut w=range("tank","tank");
        w.spawn_vehicle_for_player("ally".into(),[0.0;3],"brz","red").unwrap();
        crate::support::tests::place(&mut w,"ally",3.8,0.0);
        w.start_tank_barrier("guard").unwrap();
        let pose=*w.bodies[w.vehicles["guard"].body].position();
        for (shooter,x,front,back,blocked) in [("enemy",3.8,12.0,0.0,true),
            ("enemy",5.2,12.0,0.0,false),("enemy",3.8,0.0,12.0,false),
            ("ally",3.8,12.0,0.0,false),("enemy",3.8,12.0,6.0,false)] {
            let mut damage=50.0;
            let hit=w.screen_segment(shooter,pose*point![x,0.8,front],pose*point![x,0.8,back],&mut damage);
            assert_eq!(hit.is_some(),blocked);
            assert_eq!(damage,if blocked {0.0}else{50.0});
        }
        assert_eq!(w.guard_view("guard").shield_hp,BARRIER_HP-50.0);
    }
    #[test]
    fn fast_frontal_guard_dislodges_only_with_shield_and_real_enemy_contact() {
        for (speed,shield,should_drop) in [(65.0,GUARD_HP,true),(26.0,GUARD_HP,false),(65.0,0.0,false)] {
            let mut w=range("brz","brz");
            w.ctf_carriers.insert("enemy".into());
            w.start_guard_boost("guard").unwrap();w.guard_boosts.get_mut("guard").unwrap().shield_hp=shield;
            let car=w.vehicles["guard"].body;
            w.bodies[car].set_linvel(vector![0.0,0.0,speed],true);
            for _ in 0..50 {w.step(SIMULATION_DT);}
            assert_eq!(w.dislodged_carriers.contains("enemy"),should_drop,"speed {speed}, shield {shield}");
        }
    }
    #[test]
    fn broadside_screen_follows_cannon_and_only_damage_depletes_it() {
        let mut w=range("tank","tank");w.start_tank_barrier("guard").unwrap();
        let body=w.vehicles["guard"].body;
        let hull=*w.bodies[body].position();
        let aim=hull.rotation*Vector::x();
        let intent=crate::state::CombatPose{enabled:true,yaw:(-aim.x).atan2(-aim.z),pitch:aim.y.asin(),..Default::default()};
        for seq in 1..180 {w.combat_tick("guard",seq,Some(&intent));}
        assert!((w.guard_view("guard").panel_yaw-std::f32::consts::FRAC_PI_2).abs()<0.05);
        w.vehicles.get_mut("guard").unwrap().powertrain.running=false;
        for _ in 0..1800 {w.advance_guard_boosts(SIMULATION_DT,["guard","enemy"].into_iter());}
        assert_eq!(w.guard_view("guard").shield_hp,BARRIER_HP);
        assert!(w.start_tank_barrier("guard").is_err());
        let mut damage=75.0;
        assert!(w.screen_segment("enemy",hull*point![12.0,0.8,3.7],hull*point![0.0,0.8,3.7],&mut damage).is_some());
        assert_eq!(damage,0.0);assert_eq!(w.guard_view("guard").shield_hp,425.0);
        let mut bow=75.0;
        assert!(w.screen_segment("enemy",hull*point![0.0,0.8,12.0],hull*point![0.0,0.8,0.0],&mut bow).is_none());
        assert_eq!(bow,75.0);
    }
    #[test]
    fn rescue_suv_dive_shield_absorbs_all_angles_and_expires() {
        let mut w=range("cx30","cx30");assert!(w.start_guard_boost("guard").is_err());w.start_dive_shield("guard").unwrap();
        let hp=w.vehicle_health["guard"].hp;
        for kind in ["cannon","machine-gun","ram","guard-ram","impact"] {
            w.damage_vehicle("guard",Some("enemy"),5000.0,kind);
            assert_eq!(w.vehicle_health["guard"].hp,hp);
        }
        assert_eq!(w.guard_view("guard").shield_hp,0.0);
        assert!(w.start_dive_shield("guard").is_err());
        for _ in 0..130 {w.advance_guard_boosts(SIMULATION_DT,["guard","enemy"].into_iter());}
        assert!(!w.dive_protected("guard"));assert!(w.guard_view("guard").dive_cooldown_s>15.0);
        w.damage_vehicle("guard",Some("enemy"),250.0,"cannon");assert!(w.vehicle_health["guard"].hp<hp);
    }
    #[test]
    fn guard_expiration_and_disconnect_never_refund_cost_or_cooldown(){
        let mut w=range("brz","brz");w.start_guard_boost("guard").unwrap();
        for _ in 0..241 {w.advance_guard_boosts(SIMULATION_DT,["guard","enemy"].into_iter());}
        assert_eq!(w.guard_view("guard").remaining_s,0.0);assert_eq!(w.guard_view("guard").shield_hp,0.0);assert!(w.guard_view("guard").cooldown_s>15.9);
        w.guard_boosts.get_mut("guard").unwrap().remaining=4.0;
        w.advance_guard_boosts(SIMULATION_DT,["enemy"].into_iter());assert_eq!(w.guard_view("guard").remaining_s,0.0);
        w.reassign_player("guard","reconnected");assert_eq!(w.assigned_hero("reconnected"),Some("brz"));assert!(w.guard_view("reconnected").cooldown_s>15.0);
        assert!(w.start_guard_boost("reconnected").is_err());
    }
    #[test]
    fn guarded_boost_allows_turning_in_both_directions_and_controlled_ebrake(){
        for steering in [-0.75,0.75] {
            let mut w=range("brz","brz");w.start_guard_boost("guard").unwrap();let body=w.vehicles["guard"].body;
            w.bodies[body].set_linvel(vector![0.0,0.0,18.0],true);
            let v=w.vehicles.get_mut("guard").unwrap();v.throttle=0.75;v.steer=steering;v.handbrake=0.3;
            for _ in 0..20 {w.step(SIMULATION_DT);w.advance_guard_boosts(SIMULATION_DT,["guard","enemy"].into_iter());}
            let v=&w.vehicles["guard"];
            assert!(v.steer_angle.signum()==steering.signum()&&v.steer_angle.abs()>0.1);
            assert!(w.bodies[body].angvel().y*steering< -0.05,"guard drift must retain steering: {:?}",w.bodies[body].angvel());
            assert!(v.powertrain.running);assert!(!v.powertrain.thermal_recovery);
        }
    }
    #[test]
    fn actual_front_guard_survives_tank_contact_and_earns_one_real_rush_hit() {
        fn collide(guarded:bool,sideways:bool)->(f32,f32,f32,usize,f32) {
            let mut w=range("brz","brz");let car=w.vehicles["guard"].body;
            if guarded {w.start_guard_boost("guard").unwrap();}
            if sideways {w.bodies[car].set_rotation(Rotation::from_axis_angle(&Vector::y_axis(),std::f32::consts::FRAC_PI_2),true);}
            w.bodies[car].set_linvel(vector![0.0,0.0,26.0],true);
            let initial_target=w.vehicle_health["enemy"].hp;
            let before=w.vehicle_health["guard"].hp;
            let no_contact:HashMap<_,_>=w.vehicles.values().map(|v|(v.body,(*w.bodies[v.body].translation(),*w.bodies[v.body].linvel()))).collect();
            let contacts=w.guard_contacts(&no_contact);w.resolve_guard_contacts(contacts);assert_eq!(w.vehicle_health["enemy"].hp,initial_target,"proximity cannot cause guard contact damage");
            for _ in 0..50 {w.step(SIMULATION_DT);}
            let hits=w.guard_boosts.get("guard").map(|g|g.hits.len()).unwrap_or(0);
            let target_hp=w.vehicle_health["enemy"].hp;
            for _ in 0..4 {let contacts=w.guard_contacts(&no_contact);w.resolve_guard_contacts(contacts);}
            assert_eq!(w.vehicle_health["enemy"].hp,target_hp,"one target may not earn a second contact bonus");
            assert!(w.vehicle_health["guard"].hp<before||w.guard_view("guard").shield_hp<GUARD_HP,"actual collision must spend health or shield");
            (w.vehicle_health["guard"].hp,w.vehicles["guard"].powertrain.condition,initial_target-target_hp,hits,w.guard_view("guard").shield_hp)
        }
        let plain=collide(false,false);let front=collide(true,false);let side=collide(true,true);
        assert!(front.0>0.0&&front.1>0.0,"correctly guarded collision must leave a driveable car: {front:?}");
        assert!(front.0>plain.0&&front.1>plain.1,"guard should protect HP and mechanical condition: plain={plain:?}, front={front:?}");
        assert_eq!(front.3,1);assert!(front.2>=GUARD_CONTACT_DAMAGE,"physical rush payoff must reach Tank HP: {front:?}");
        assert_eq!(side.3,0,"sideways car cannot earn a frontal rush payoff");
        assert_eq!(side.4,GUARD_HP,"side contact must not spend the frontal shield");
    }
    #[test]
    fn mechanic_cannot_use_shared_chassis_gun_even_with_forged_combat_input(){
        let mut w=range("brz","mechanic");
        w.combat_tick("guard",1,Some(&crate::state::CombatPose{enabled:true,fire:true,ram:true,..Default::default()}));
        assert!(!w.combat_poses["guard"].fire);assert!(!w.vehicles["guard"].ram.requested);
        assert_eq!(w.vehicle_health["enemy"].hp,w.vehicle_health["enemy"].max_hp);
    }
}
