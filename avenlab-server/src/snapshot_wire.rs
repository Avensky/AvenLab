//! Version-one compact full snapshots. Tuple order is a wire contract, not game
//! logic. These lossless full tuples also seed the shared delta baseline cache.
//! Keep legacy JSON available until a client explicitly negotiates this version.
use serde::{Serialize, Serializer, ser::SerializeSeq};
use std::sync::{Arc, atomic::{AtomicU8, AtomicU64, Ordering}};
use tokio::sync::watch;
use crate::state::{PhysicsFrame, PhysicsSnapshot, PhysicsEntitySnapshot};

pub const VERSION: u8 = 1;
pub const AUX_DIVISOR: u64 = 6; // 10 Hz inspection / private slow readings.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DriverLane {
    pub world:usize, seq:Option<u32>, cockpit:u32, cabin:u32, brake:f32,
    cruise:Option<f32>, fuel:f32, temp:f32, torque:f32,
}
impl DriverLane {
    pub fn sample(world:usize,e:&PhysicsEntitySnapshot<'_>)->Self {
        Self{world,seq:e.last_input_seq,cockpit:e.cockpit_mask,cabin:e.cabin_mask,brake:e.parking_brake,
            cruise:e.cruise_target_kph,fuel:e.fuel,temp:e.temp,torque:e.engine_torque}
    }
    pub fn edge(self,old:Self)->bool {self.world!=old.world || self.cockpit!=old.cockpit ||
        self.cabin!=old.cabin || self.brake!=old.brake || self.cruise!=old.cruise}
    pub fn encode(self)->String {
        #[derive(Serialize)]
        struct Packet<T>{#[serde(rename="type")]kind:&'static str,world_id:usize,data:T}
        serde_json::to_string(&Packet{kind:"driver",world_id:self.world,data:(self.seq,self.cockpit,self.cabin,
            self.brake,self.cruise,self.fuel,self.temp,self.torque)}).expect("driver telemetry")
    }
}
pub const SNAPSHOT_DIVISOR: u64 = 2; // Physics stays 60 Hz; compact publication is 30 Hz.

#[derive(Clone)]
pub struct SnapshotSender {
    sender: watch::Sender<Option<Arc<PhysicsFrame>>>,
    pub format: Arc<AtomicU8>,
    pub revision: Arc<AtomicU64>,
}
impl From<watch::Sender<Option<Arc<PhysicsFrame>>>> for SnapshotSender {
    fn from(sender: watch::Sender<Option<Arc<PhysicsFrame>>>) -> Self {
        Self { sender, format: Arc::new(AtomicU8::new(0)), revision: Arc::new(AtomicU64::new(0)) }
    }
}
impl SnapshotSender {
    pub fn compact(&self) -> bool { self.format.load(Ordering::Relaxed) == VERSION }
    pub fn send_replace(&self, frame: Option<Arc<PhysicsFrame>>) { self.sender.send_replace(frame); }
}

macro_rules! row {
    ($s:expr; $($value:expr),+ $(,)?) => {{
        let mut row = $s.serialize_seq(None)?;
        $(row.serialize_element(&$value)?;)+
        row.end()
    }};
}
struct Rows<'a, T>(&'a [T]);
trait Compact { fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error>; }
struct Item<'a, T: Compact>(&'a T);
impl<T: Compact> Serialize for Item<'_, T> {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> { self.0.write(s) }
}
impl<T: Compact> Serialize for Rows<'_, T> {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut rows = s.serialize_seq(Some(self.0.len()))?;
        for value in self.0 { rows.serialize_element(&Item(value))?; }
        rows.end()
    }
}

impl Compact for crate::state::VehicleColliderShape {
    fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        row!(s; self.nominal_wheel_center_y, self.chassis_half_extents, self.chassis_offset, self.wheel_radius, self.wheel_count)
    }
}
impl Compact for crate::vehicle_state::PhysicsWheelSnapshot {
    fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        row!(s; self.id, self.position, self.rotation, self.radius, self.wheel_speed, self.steer_angle)
    }
}
impl Compact for crate::vehicle_health::VehicleHealth {
    fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        row!(s; self.hp, self.max_hp, self.respawn_remaining_s, self.disabled_reason, self.recovery_window_s, self.revive_cooldown_s, self.spawn_protection_s, self.damage_seq, self.last_attacker, self.last_damage, self.last_damage_kind, self.kills, self.deaths, Item(&self.stats))
    }
}
impl Compact for crate::vehicle_health::VehicleCombatStats {
    fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        row!(s; self.damage_dealt, self.healing_done, self.self_healing, self.gas_burned_liters, self.gas_gained_liters, self.assists, self.resurrections, self.respawns, self.current_kill_streak, self.best_kill_streak)
    }
}
impl Compact for crate::state::CombatPose {
    fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        row!(s; self.assisted_target, self.shot_origin, self.impact_normal, self.shot_weapon, self.impact, self.impact_time, self.lock_yaw, self.lock_pitch, self.ram_blocked, self.ram_remaining, self.ram_charge_remaining, self.stun_remaining, self.ram_cooldown, self.cannon_reload, self.coax_reload, self.basket_reload, self.weapon, self.cannon_shot, self.shot, self.ammo, self.reload, self.yaw, self.pitch, self.x, self.y, self.z, self.role)
    }
}
impl Compact for crate::guard_boost::GuardView {
    fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        row!(s; self.kind, self.remaining_s, self.cooldown_s, self.shield_hp, self.shield_max_hp, self.break_seq, self.panel, self.panel_yaw, self.dive_remaining_s, self.dive_cooldown_s)
    }
}
impl Compact for PhysicsEntitySnapshot<'_> {
    fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        row!(s; self.id, self.kind, self.vehicle_id, self.room_id, self.team, self.position, self.rotation, self.speed, self.rpm, self.gear, (!self.owner_fields_separate).then_some(self.fuel), (!self.owner_fields_separate).then_some(self.temp), (!self.owner_fields_separate).then_some(self.engine_torque), self.condition, self.ultimate_fraction, self.boost_fraction, self.resource_mask, (!self.owner_fields_separate).then_some(self.cockpit_mask), (!self.owner_fields_separate).then_some(self.parking_brake), (!self.owner_fields_separate).then_some(self.cabin_mask), self.cruise_target_kph.filter(|_|!self.owner_fields_separate), self.cluster_mask, self.vehicle_mask, self.player_mask, self.last_input_seq.filter(|_|!self.owner_fields_separate), Item(&self.collider), self.wheels.as_deref().map(Rows), Item(&self.combat), Item(&*self.health), Item(&self.guard), self.support, self.barrage, self.appearance,
            u8::from(self.health.defeated) | (u8::from(self.combat.enabled)<<1) |
            (u8::from(self.combat.fire)<<2) | (u8::from(self.combat.hull_locked)<<3) |
            (u8::from(self.combat.ram)<<4) | (u8::from(self.combat.impact_static)<<5),
            self.wheels.as_ref().map_or(0u32, |wheels| wheels.iter().enumerate().fold(0u32, |mask,(index,wheel)|
                mask | u32::from(wheel.grounded).checked_shl(index as u32).unwrap_or(0))))
    }
}
// Keep the v1 tuple length stable for older clients. The optional bridge transition
// travels with frame metadata; modern decoders lift it onto the normalized snapshot.
#[derive(Serialize)]
struct FrameMetadata<'a>{
    #[serde(flatten)] timing:&'a crate::state::ServerTiming,
    #[serde(skip_serializing_if="Option::is_none")] drawbridge:Option<&'a crate::harbor::BridgeMotion>,
}
impl Compact for PhysicsSnapshot<'_> {
    fn write<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        row!(s; self.tick, self.simulation_time_s, self.tick_dt_s,
            Rows(&self.entities), self.match_state, self.asset_health, FrameMetadata{timing:self.server_timing,drawbridge:self.drawbridge})
    }
}
pub fn encode(world_id: usize, data: &PhysicsSnapshot<'_>) -> String {
    #[derive(Serialize)]
    struct Envelope<T: Serialize> {
        #[serde(rename="type")] kind: &'static str,
        version: u8,
        world_id: usize,
        data: T,
    }
    serde_json::to_string(&Envelope {kind:"snapshot_compact",version:VERSION,world_id,
        data:Item(data)}).expect("snapshot is serializable")
}
