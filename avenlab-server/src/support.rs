//! Small server-simulated assisted health packs. The control plane authenticates
//! the Mechanic; this module repeats body/team/health/range and obstruction
//! checks, owns flight/cooldown state, and never accepts client-authored HP.
use crate::physics::PhysicsWorld;
use rapier3d::prelude::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

pub const HEAL_PACK_RANGE: f32 = 30.0;
pub const HEAL_PACK_HEIGHT: f32 = 6.0;
pub const HEAL_PACK_HP: f32 = 75.0;
pub const HEAL_PACK_COOLDOWN: f32 = 1.25;
pub const HEAL_PACK_FUEL_LITRES: f32 = 0.25;
pub const HEAL_PACK_SPEED: f32 = 35.0;
pub const HEAL_PACK_LIFETIME: f32 = 1.1;
const FINAL_EVENT_SECONDS: f32 = 0.8;

#[derive(Clone, Debug, Serialize)]
pub struct HealthPackView {
    pub seq: u32,
    pub target: String,
    pub origin: [f32; 3],
    pub position: [f32; 3],
    pub target_position: [f32; 3],
    pub remaining_s: f32,
    pub duration_s: f32,
    pub state: String,
    pub healed_hp: f32,
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::physics::SIMULATION_DT;
    pub(crate) fn blank_world() -> PhysicsWorld {
        let document=serde_json::from_value(serde_json::json!({
            "schema_version":2,"map_id":"support_range","coordinate_system":{"units":"meters","up_axis":"y","forward_axis":"-z"},
            "cell":[200,200],"surface":{"road_y":0},"layout":{"kind":"fixed_grid","origin":[0,0],"size":[1,1]},
            "visuals":[{"id":"placeholder","asset":"/models/world/garage.glb","position":[0,0,0],"rotation":[0,0,0,1],"scale":[1,1,1]}],
            "roads":[],"buildings":[],"team_spawns":{"red":[{"chunk":[0,0],"local":[-60,0],"yaw":0}],"blue":[{"chunk":[0,0],"local":[0,30],"yaw":0}]},
            "authored_layout":{"format":"avenlab-world-layout","version":1,"map_id":"support_range","title":"Support range","base":"replace","ground":true,"repeat":false,"objects":[]}
        })).unwrap();
        PhysicsWorld::from_editor_document(document).unwrap()
    }
    pub(crate) fn place(world:&mut PhysicsWorld,id:&str,x:f32,z:f32){
        let body=world.vehicles[id].body;
        let y=world.bodies[body].translation().y;
        world.bodies[body].set_translation(vector![x,y,z],true);
        world.bodies[body].set_linvel(Vector::zeros(),true);
        world.bodies.propagate_modified_body_positions_to_colliders(&mut world.colliders);
        world.query_pipeline.update(&world.colliders);
    }
    fn range() -> (PhysicsWorld,HashSet<String>) {
        let mut world=blank_world();
        for (id,team,x,z) in [("mechanic","red",0.0,0.0),("ally","red",0.0,12.0),("enemy","blue",15.0,12.0)] {
            world.spawn_vehicle_for_player(id.into(),[0.0;3],"brz",team).unwrap();place(&mut world,id,x,z);
            world.vehicle_health.get_mut(id).unwrap().spawn_protection_s=0.0;
        }
        world.set_assigned_hero("mechanic","mechanic");
        world.vehicle_health.get_mut("ally").unwrap().hp=300.0;
        world.vehicle_health.get_mut("enemy").unwrap().hp=100.0;
        (world,["mechanic","ally","enemy"].into_iter().map(String::from).collect())
    }
    fn advance(world:&mut PhysicsWorld,active:&HashSet<String>,frames:usize){for _ in 0..frames{world.advance_health_packs(SIMULATION_DT,active.iter().map(String::as_str));}}

    #[test]
    fn health_pack_targets_only_living_allies_then_heals_on_real_arrival_once(){
        let (mut world,active)=range();let before_fuel=world.vehicles["mechanic"].powertrain.fuel_liters;
        world.vehicle_health.get_mut("mechanic").unwrap().hp=50.0;
        let pack=world.launch_health_pack("mechanic",&active).unwrap();
        assert_eq!(pack.target,"ally");assert_eq!(pack.state,"flying");assert_eq!(world.vehicle_health["ally"].hp,300.0);
        assert!((before_fuel-world.vehicles["mechanic"].powertrain.fuel_liters-HEAL_PACK_FUEL_LITRES).abs()<0.0001);
        advance(&mut world,&active,1);assert_eq!(world.vehicle_health["ally"].hp,300.0);
        advance(&mut world,&active,30);
        assert_eq!(world.vehicle_health["ally"].hp,375.0);assert_eq!(world.vehicle_health["enemy"].hp,100.0);assert_eq!(world.vehicle_health["mechanic"].hp,50.0);
        assert_eq!(world.support.view("mechanic").pack.unwrap().state,"hit");
        assert_eq!(world.vehicle_health["mechanic"].stats.healing_done,75.0);
        assert_eq!(world.vehicle_health["ally"].stats.healing_done,0.0);assert_eq!(world.vehicle_health["ally"].stats.self_healing,0.0);
        assert!((world.vehicles["mechanic"].powertrain.ultimate_fraction-0.15).abs()<0.00001);
        advance(&mut world,&active,90);assert_eq!(world.vehicle_health["ally"].hp,375.0);assert_eq!(world.vehicle_health["mechanic"].stats.healing_done,75.0);
    }
    #[test]
    fn health_pack_obstruction_range_role_resources_and_cooldown_do_not_grant_free_heals(){
        let (mut world,active)=range();let initial=world.vehicles["mechanic"].powertrain.fuel_liters;
        world.set_assigned_hero("mechanic","brz");assert!(world.launch_health_pack("mechanic",&active).is_err());world.set_assigned_hero("mechanic","mechanic");
        place(&mut world,"ally",0.0,31.0);assert!(world.launch_health_pack("mechanic",&active).is_err());place(&mut world,"ally",0.0,12.0);
        let wall=world.colliders.insert(ColliderBuilder::cuboid(2.0,2.0,0.3).translation(vector![0.0,1.5,6.0]).build());
        world.query_pipeline.update(&world.colliders);assert!(world.launch_health_pack("mechanic",&active).is_err());
        world.colliders.get_mut(wall).unwrap().set_enabled(false);
        world.query_pipeline.update(&world.colliders);world.vehicles.get_mut("mechanic").unwrap().powertrain.fuel_liters=0.1;assert!(world.launch_health_pack("mechanic",&active).is_err());
        world.vehicles.get_mut("mechanic").unwrap().powertrain.fuel_liters=initial;world.launch_health_pack("mechanic",&active).unwrap();
        assert!(world.launch_health_pack("mechanic",&active).is_err());
        assert_eq!(world.support.view("mechanic").sequence,1);assert_eq!(world.vehicle_health["mechanic"].stats.healing_done,0.0);
        assert!((world.vehicle_health["mechanic"].stats.gas_burned_liters-HEAL_PACK_FUEL_LITRES).abs()<0.00001);
    }
    #[test]
    fn health_pack_misses_after_wall_death_or_disconnect_and_invalid_dt_cannot_advance_it(){
        for failure in ["wall","death","disconnect"] {
            let (mut world,mut active)=range();world.launch_health_pack("mechanic",&active).unwrap();
            let before=world.support.view("mechanic");
            for dt in [f32::NAN,f32::INFINITY,-1.0,0.0,10000.0] {world.advance_health_packs(dt,active.iter().map(String::as_str));}
            assert_eq!(world.support.view("mechanic").cooldown_s,before.cooldown_s);
            assert_eq!(world.support.view("mechanic").pack.unwrap().position,before.pack.unwrap().position);
            if failure=="wall" {world.colliders.insert(ColliderBuilder::cuboid(2.0,2.0,0.3).translation(vector![0.0,1.5,6.0]).build());}
            if failure=="death" {world.vehicle_health.get_mut("ally").unwrap().defeated=true;world.vehicle_health.get_mut("ally").unwrap().hp=0.0;}
            if failure=="disconnect" {active.remove("ally");}
            advance(&mut world,&active,35);assert_eq!(world.support.view("mechanic").pack.unwrap().state,"missed");
            assert_eq!(world.vehicle_health["mechanic"].stats.healing_done,0.0);assert_eq!(world.vehicles["mechanic"].powertrain.ultimate_fraction,0.0);
        }
    }
    #[test]
    fn health_pack_overheal_and_zero_gain_never_duplicate_stats_or_charge(){
        let (mut world,active)=range();world.vehicle_health.get_mut("ally").unwrap().hp=480.0;
        world.launch_health_pack("mechanic",&active).unwrap();advance(&mut world,&active,35);
        assert_eq!(world.vehicle_health["ally"].hp,500.0);assert_eq!(world.vehicle_health["mechanic"].stats.healing_done,20.0);
        assert!((world.vehicles["mechanic"].powertrain.ultimate_fraction-0.04).abs()<0.00001);
        advance(&mut world,&active,90);assert!(world.launch_health_pack("mechanic",&active).is_err());
        assert_eq!(world.vehicle_health["mechanic"].stats.healing_done,20.0);assert!(world.heal_living_ally("mechanic","enemy",75.0).is_err());assert!(world.heal_living_ally("mechanic","mechanic",75.0).is_err());
    }
    #[test]
    fn health_pack_selects_nearest_eligible_ally_without_redirecting_to_another_after_launch(){
        let (mut world,mut active)=range();
        for (id,x,z,hp) in [("farther",10.0,16.0,200.0),("healthy",8.0,0.0,500.0),("downed",5.0,2.0,0.0)] {
            world.spawn_vehicle_for_player(id.into(),[0.0;3],"brz","red").unwrap();
            place(&mut world,id,x,z);let health=world.vehicle_health.get_mut(id).unwrap();health.hp=hp;health.defeated=hp==0.0;active.insert(id.into());
        }
        let fuel=world.vehicles["mechanic"].powertrain.fuel_liters;
        active.remove("mechanic");assert!(world.launch_health_pack("mechanic",&active).is_err());
        assert_eq!(world.vehicles["mechanic"].powertrain.fuel_liters,fuel);
        active.insert("mechanic".into());
        assert_eq!(world.launch_health_pack("mechanic",&active).unwrap().target,"ally");
        place(&mut world,"ally",0.0,45.0);advance(&mut world,&active,35);
        let event=world.support.view("mechanic").pack.unwrap();assert_eq!(event.target,"ally");assert_eq!(event.state,"missed");
        assert_eq!(world.vehicle_health["farther"].hp,200.0);assert_eq!(world.vehicle_health["downed"].hp,0.0);
        assert_eq!(world.vehicle_health["mechanic"].stats.healing_done,0.0);assert_eq!(world.vehicles["mechanic"].powertrain.ultimate_fraction,0.0);
    }
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct SupportView {
    pub cooldown_s: f32,
    pub sequence: u32,
    pub pack: Option<HealthPackView>,
}
#[derive(Clone, Debug)]
struct Pack { view: HealthPackView, hold_s: f32 }

#[derive(Default)]
pub struct SupportState {
    pub(crate) service_elapsed: f32,
    cooldowns: HashMap<String, f32>,
    sequences: HashMap<String, u32>,
    packs: HashMap<String, Pack>,
}
impl SupportState {
    pub fn view(&self, actor: &str) -> SupportView {
        SupportView { cooldown_s: self.cooldowns.get(actor).copied().unwrap_or(0.0),
            sequence: self.sequences.get(actor).copied().unwrap_or(0),
            pack: self.packs.get(actor).map(|pack| pack.view.clone()) }
    }
    pub fn ensure_cooldown(&mut self, actor: &str, seconds: f32) {
        if seconds.is_finite() && seconds > 0.0 {
            let current = self.cooldowns.entry(actor.into()).or_default();
            *current = current.max(seconds.min(HEAL_PACK_COOLDOWN));
        }
    }
    pub fn clear_player(&mut self, actor: &str) {
        self.cooldowns.remove(actor); self.sequences.remove(actor); self.packs.remove(actor);
        for pack in self.packs.values_mut().filter(|pack| pack.view.target == actor && pack.view.state == "flying") {
            pack.view.state = "missed".into(); pack.view.remaining_s = 0.0; pack.hold_s = FINAL_EVENT_SECONDS;
        }
    }
    pub fn reassign(&mut self, old: &str, new: &str) {
        if old == new { return; }
        if let Some(value) = self.cooldowns.remove(old) { self.cooldowns.insert(new.into(), value); }
        if let Some(value) = self.sequences.remove(old) { self.sequences.insert(new.into(), value); }
        if let Some(value) = self.packs.remove(old) { self.packs.insert(new.into(), value); }
        for pack in self.packs.values_mut() { if pack.view.target == old { pack.view.target = new.into(); } }
    }
    pub fn reset(&mut self) { self.cooldowns.clear(); self.sequences.clear(); self.packs.clear(); }
}

impl PhysicsWorld {
    fn health_pack_body_position(&self, player: &str) -> Option<[f32; 3]> {
        let vehicle = self.vehicles.get(player)?;
        let body = self.bodies.get(vehicle.body).filter(|body| body.is_enabled())?;
        let offset = Vector::from(vehicle.config.chassis_com_offset);
        let point = body.translation() + body.rotation() * offset;
        point.iter().all(|value| value.is_finite()).then_some([point.x, point.y, point.z])
    }
    pub(crate) fn health_pack_pair_valid(&self, actor: &str, target: &str, range: f32, height: f32) -> bool {
        if actor == target || self.assigned_hero(actor) != Some("mechanic") { return false; }
        let Some(source) = self.vehicles.get(actor) else { return false; };
        let Some(victim) = self.vehicles.get(target) else { return false; };
        if !source.team.eq_ignore_ascii_case(&victim.team) { return false; }
        for id in [actor, target] {
            if !self.vehicle_health.get(id).is_some_and(|h| !h.defeated && h.hp.is_finite() && h.hp > 0.0 && h.max_hp.is_finite() && h.max_hp > 0.0) { return false; }
        }
        let (Some(a), Some(b)) = (self.health_pack_body_position(actor), self.health_pack_body_position(target)) else { return false; };
        (a[0]-b[0]).powi(2) + (a[2]-b[2]).powi(2) <= range.powi(2) && (a[1]-b[1]).abs() <= height
    }
    fn health_pack_trace(&self, actor: &str, target: &str, from: [f32;3], to: [f32;3]) -> bool {
        let (Some(source), Some(victim)) = (self.vehicles.get(actor), self.vehicles.get(target)) else { return false; };
        let delta = Vector::new(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
        let distance = delta.norm();
        if !distance.is_finite() { return false; }
        if distance < 0.001 { return true; }
        self.query_pipeline.cast_ray(&self.bodies, &self.colliders,
            &Ray::new(Point::new(from[0],from[1],from[2]), delta/distance), distance, true,
            QueryFilter::default().groups(crate::physics::vehicle_collision_groups(false)).exclude_rigid_body(source.body).exclude_sensors())
            .is_none_or(|(collider,_)| self.colliders[collider].parent() == Some(victim.body))
    }
    pub(crate) fn health_pack_line_of_sight(&self, actor: &str, target: &str) -> bool {
        let (Some(mut a), Some(b)) = (self.health_pack_body_position(actor), self.health_pack_body_position(target)) else { return false; };
        a[1] += 0.45;
        self.health_pack_trace(actor,target,a,b)
    }
    /// The caller supplies authenticated, connected IDs from this world. Target
    /// choice uses only accepted bodies; a nominated client target is ignored.
    pub fn launch_health_pack(&mut self, actor: &str, connected: &HashSet<String>) -> Result<HealthPackView, String> {
        if !connected.contains(actor) || self.assigned_hero(actor) != Some("mechanic") { return Err("Select and deploy the Mechanic hero to fire health packs.".into()); }
        if self.support.view(actor).cooldown_s > 0.0 { return Err("Health pack is reloading.".into()); }
        let source = self.vehicles.get(actor).filter(|vehicle| !vehicle.config.tracked);
        if source.is_none() { return Err("Deploy the Mechanic's assigned vehicle.".into()); }
        let source = source.unwrap();
        if !source.powertrain.fuel_liters.is_finite() || source.powertrain.fuel_liters < HEAL_PACK_FUEL_LITRES { return Err("Health packs require 0.25 L of fuel.".into()); }
        self.query_pipeline.update(&self.colliders);
        let mut candidates: Vec<_> = connected.iter().filter(|target| {
            self.health_pack_pair_valid(actor,target,HEAL_PACK_RANGE,HEAL_PACK_HEIGHT) &&
                self.vehicle_health.get(target.as_str()).is_some_and(|h| h.hp < h.max_hp) &&
                self.health_pack_line_of_sight(actor,target)
        }).filter_map(|target| self.health_pack_body_position(target).map(|position| (target.clone(),position))).collect();
        let from = self.health_pack_body_position(actor).ok_or("Your mechanic body is unavailable.")?;
        candidates.sort_by(|a,b| ((a.1[0]-from[0]).powi(2)+(a.1[2]-from[2]).powi(2))
            .total_cmp(&((b.1[0]-from[0]).powi(2)+(b.1[2]-from[2]).powi(2))).then_with(|| a.0.cmp(&b.0)));
        let (target,position) = candidates.into_iter().next().ok_or("No injured living teammate is visible within 30 metres.")?;
        let mut origin = from; origin[1] += 0.45;
        let seq = self.support.sequences.entry(actor.into()).or_default(); *seq = seq.saturating_add(1);
        let view = HealthPackView { seq:*seq,target,origin,position:origin,target_position:position,
            remaining_s:HEAL_PACK_LIFETIME,duration_s:HEAL_PACK_LIFETIME,state:"flying".into(),healed_hp:0.0 };
        let vehicle = self.vehicles.get_mut(actor).unwrap(); vehicle.powertrain.fuel_liters -= HEAL_PACK_FUEL_LITRES;
        if let Some(health) = self.vehicle_health.get_mut(actor) { health.stats.burn_fuel(HEAL_PACK_FUEL_LITRES); health.spawn_protection_s = 0.0; }
        self.support.ensure_cooldown(actor,HEAL_PACK_COOLDOWN);
        self.support.packs.insert(actor.into(),Pack { view:view.clone(),hold_s:FINAL_EVENT_SECONDS });
        Ok(view)
    }
    pub(crate) fn advance_health_packs<'a>(&mut self, dt:f32, active:impl Iterator<Item=&'a str>) {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 { return; }
        for value in self.support.cooldowns.values_mut() { *value = (*value-dt).max(0.0); }
        self.support.cooldowns.retain(|_,value| *value>0.0);
        if self.support.packs.is_empty() { return; }
        let active: HashSet<&str> = active.collect();
        let actors: Vec<_> = self.support.packs.keys().cloned().collect();
        if self.support.packs.values().any(|pack|pack.view.state=="flying") {self.query_pipeline.update(&self.colliders);}
        for actor in actors {
            let Some(mut pack) = self.support.packs.remove(&actor) else { continue; };
            if pack.view.state != "flying" {
                pack.hold_s = (pack.hold_s-dt).max(0.0);
                if pack.hold_s > 0.0 { self.support.packs.insert(actor,pack); }
                continue;
            }
            pack.view.remaining_s = (pack.view.remaining_s-dt).max(0.0);
            let target = pack.view.target.clone();
            let valid = active.contains(actor.as_str()) && active.contains(target.as_str()) && self.health_pack_pair_valid(&actor,&target,40.0,8.0);
            if valid {
                let goal = self.health_pack_body_position(&target).unwrap(); pack.view.target_position = goal;
                let delta = Vector::new(goal[0]-pack.view.position[0],goal[1]-pack.view.position[1],goal[2]-pack.view.position[2]);
                let distance = delta.norm(); let travel = HEAL_PACK_SPEED*dt;
                let next = if distance <= travel { goal } else { let d=delta*(travel/distance); [pack.view.position[0]+d.x,pack.view.position[1]+d.y,pack.view.position[2]+d.z] };
                if self.health_pack_trace(&actor,&target,pack.view.position,next) {
                    pack.view.position = next;
                    if distance <= travel + 0.35 {
                        let healed = self.heal_living_ally(&actor,&target,HEAL_PACK_HP).unwrap_or(0.0);
                        pack.view.healed_hp = healed; pack.view.state = if healed > 0.0 {"hit"} else {"missed"}.into();
                        pack.view.remaining_s=0.0;
                    }
                } else { pack.view.state="missed".into(); pack.view.remaining_s=0.0; }
            } else { pack.view.state="missed".into(); pack.view.remaining_s=0.0; }
            if pack.view.state == "flying" && pack.view.remaining_s <= 0.0 { pack.view.state="missed".into(); }
            self.support.packs.insert(actor,pack);
        }
    }
}
