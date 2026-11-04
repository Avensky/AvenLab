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
pub const BARRIER_DURATION: f32 = 5.0;
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
}
#[derive(Default)]
pub struct GuardBoostState {
    pub kind: &'static str,
    pub remaining: f32,
    pub cooldown: f32,
    pub shield_hp: f32,
    pub break_seq: u32,
    pub hits: HashSet<RigidBodyHandle>,
}
impl GuardBoostState {
    pub fn view(&self) -> GuardView {
        GuardView { kind:self.kind, remaining_s: self.remaining, cooldown_s: self.cooldown,
            shield_hp: self.shield_hp, shield_max_hp: if self.kind=="tank_barrier" {BARRIER_HP}else{GUARD_HP}, break_seq: self.break_seq }
    }
    pub fn active(&self) -> bool { self.remaining > 0.0 }
    pub fn mobility_active(&self) -> bool {self.active()&&self.kind=="brz_guard"}
    fn cancel(&mut self) { self.remaining = 0.0; self.shield_hp = 0.0; }
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
        if self.assigned_hero(player)==Some("tank") {view.kind="tank_barrier";view.shield_max_hp=BARRIER_HP;}
        else if self.assigned_hero(player)==Some("brz") {view.kind="brz_guard";view.shield_max_hp=GUARD_HP;}
        view
    }
    pub fn cancel_guard(&mut self, player: &str) { if let Some(guard) = self.guard_boosts.get_mut(player) { guard.cancel(); } }
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
        guard.kind="brz_guard"; guard.remaining = GUARD_DURATION; guard.cooldown = GUARD_COOLDOWN; guard.shield_hp = GUARD_HP; guard.hits.clear();
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
        if self.guard_boosts.get(player).is_some_and(|g|g.cooldown>0.0) {return Err("The frontal barrier is cooling down.".into());}
        if !vehicle.powertrain.running || !self.bodies.get(vehicle.body).is_some_and(|b|b.is_enabled()) {return Err("Start the Tank engine before raising its barrier.".into());}
        if !vehicle.powertrain.fuel_liters.is_finite() || vehicle.powertrain.fuel_liters<BARRIER_FUEL_LITERS {return Err("The frontal barrier needs 1 litre of fuel.".into());}
        self.vehicles.get_mut(player).unwrap().powertrain.fuel_liters-=BARRIER_FUEL_LITERS;
        let guard=self.guard_boosts.entry(player.into()).or_default();
        guard.kind="tank_barrier";guard.remaining=BARRIER_DURATION;guard.cooldown=BARRIER_COOLDOWN;guard.shield_hp=BARRIER_HP;guard.hits.clear();
        let health=self.vehicle_health.get_mut(player).unwrap();health.spawn_protection_s=0.0;health.stats.burn_fuel(BARRIER_FUEL_LITERS);
        Ok(())
    }
    pub fn advance_guard_boosts<'a>(&mut self, dt: f32, active: impl Iterator<Item = &'a str>) {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 { return; }
        let connected: std::collections::HashSet<_> = active.collect();
        for (id, guard) in &mut self.guard_boosts {
            guard.cooldown = (guard.cooldown - dt).max(0.0);
            let living = self.vehicle_health.get(id).is_some_and(|h| !h.defeated && h.hp > 0.0);
            let enabled = self.vehicles.get(id).is_some_and(|v| v.powertrain.running && (guard.kind=="tank_barrier" || !v.powertrain.thermal_recovery) && self.bodies.get(v.body).is_some_and(|b| b.is_enabled()));
            if !living || !enabled || !connected.contains(id.as_str()) { guard.cancel(); }
            else { guard.remaining = (guard.remaining - dt).max(0.0); if !guard.active() { guard.shield_hp = 0.0; } }
        }
    }
    pub fn guard_covers_direction(&self, player: &str, toward: Vector<Real>) -> bool {
        let Some(guard) = self.guard_boosts.get(player).filter(|g| g.active() && g.shield_hp > 0.0) else { return false; };
        let _ = guard;
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
        let impact_direction = (kind == "impact").then(|| self.guard_impact_directions.get(victim).copied()).flatten();
        let direction = impact_direction.or_else(|| attacker.and_then(|id| self.vehicles.get(id).and_then(|v| self.bodies.get(v.body)))
            .zip(self.vehicles.get(victim).and_then(|v| self.bodies.get(v.body)))
            .map(|(source,target)| source.translation() - target.translation()));
        if !direction.is_some_and(|v| self.guard_covers_direction(victim, v)) { return amount; }
        let guard = self.guard_boosts.get_mut(victim).unwrap();
        let absorbed = amount.min(guard.shield_hp); guard.shield_hp = (guard.shield_hp - absorbed).max(0.0);
        if absorbed > 0.0 && guard.shield_hp == 0.0 { guard.break_seq = guard.break_seq.wrapping_add(1); }
        (amount - absorbed).max(0.0)
    }
}

impl PhysicsWorld {
    /// One modest offensive payoff for an actual frontal vehicle contact. No
    /// stun or artificial impulse: Rapier remains the owner of knockback.
    pub(crate) fn apply_guard_contact_bonus(&mut self, motion: &HashMap<RigidBodyHandle,(Vector<Real>,Vector<Real>)>) {
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
                if guard.hits.contains(&target) {continue;}
                let Some(victim)=self.body_to_player.get(&target) else {continue};
                if !self.vehicles.get(victim).is_some_and(|v|v.team!=source.team) || self.is_defeated(victim) {continue;}
                let Some((target_position,target_velocity))=motion.get(&target) else {continue};
                let mut toward=target_position-position; toward.y=0.0;
                if toward.norm_squared()<0.01 {continue;}
                let toward=toward.normalize();
                if toward.dot(&forward)>=GUARD_FRONT_DOT && (velocity-target_velocity).dot(&toward)>6.0 {hits.push((id.clone(),target,victim.clone()));}
            }}
        }
        for (source,target,victim) in hits {
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
    fn tank_barrier_is_personal_finite_and_never_boosts_or_drains_nitrous(){
        let mut w=range("tank","tank");let nos=w.vehicles["guard"].powertrain.nos_remaining_s;
        let fuel=w.vehicles["guard"].powertrain.fuel_liters;
        w.start_tank_barrier("guard").unwrap();
        assert_eq!(w.guard_view("guard").shield_max_hp,BARRIER_HP);assert!(!w.guard_boosts["guard"].mobility_active());
        assert_eq!(w.vehicles["guard"].powertrain.nos_remaining_s,nos);assert_eq!(w.vehicles["guard"].powertrain.fuel_liters,fuel-1.0);
        w.damage_vehicle("guard",Some("enemy"),550.0,"cannon");
        assert_eq!(w.guard_view("guard").shield_hp,0.0);assert_eq!(w.guard_view("guard").break_seq,1);
        assert_eq!(w.vehicle_health["guard"].hp,w.vehicle_health["guard"].max_hp-50.0);
        assert!(w.start_tank_barrier("guard").is_err());
        for _ in 0..301 {w.advance_guard_boosts(SIMULATION_DT,["guard","enemy"].into_iter());}
        assert_eq!(w.guard_view("guard").remaining_s,0.0);assert!(w.guard_view("guard").cooldown_s>9.0);
        w.set_assigned_hero("guard","brz");assert!(w.start_tank_barrier("guard").is_err());
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
            w.apply_guard_contact_bonus(&no_contact);assert_eq!(w.vehicle_health["enemy"].hp,initial_target,"proximity cannot cause guard contact damage");
            for _ in 0..50 {w.step(SIMULATION_DT);}
            let hits=w.guard_boosts.get("guard").map(|g|g.hits.len()).unwrap_or(0);
            let target_hp=w.vehicle_health["enemy"].hp;
            for _ in 0..4 {w.apply_guard_contact_bonus(&no_contact);}
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
