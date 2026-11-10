//! Game presets, resource flags, reserves and status effects for the drivetrain.
use avenlab_physics::drivetrain::{DriveModifiers, Drivetrain, DrivetrainConfig};
use serde::Serialize;
use std::ops::{Deref, DerefMut};

pub use avenlab_physics::drivetrain::Demand;

pub const RPM: u16 = 1;
pub const GEAR: u16 = 2;
pub const FUEL: u16 = 4;
pub const TEMPERATURE: u16 = 8;
pub const BOOST: u16 = 16;
pub const CONDITION: u16 = 32;
pub const ULTIMATE: u16 = 64;
pub const STARTING: u16 = 1;
pub const HOT: u16 = 2;
pub const LOW_FUEL: u16 = 4;
pub const STARVED: u16 = 8;
pub const DAMAGED: u16 = 16;
pub const HEAT_LOCK: u16 = 32; // Legacy protocol bit; heat no longer disables the engine.
pub const THERMAL_RECOVERY:u16=64;
pub const BLINK_STRESS: u16 = 128;
/// Passive charge alone fills in eight minutes of active server simulation.
pub const PASSIVE_ULTIMATE_SECONDS: f32 = 480.0;

pub const NOS_SPEED_BONUS: f32 = 0.12;
pub const NOS_OUTPUT_BONUS: f32 = 0.35;

#[derive(Clone, Copy, Debug)]
pub struct ResourceConfig {
    pub model: DrivetrainConfig,
    pub nos_seconds: f32,
    pub impact_damage_multiplier: f32,
}

impl Deref for ResourceConfig {
    type Target = DrivetrainConfig;

    fn deref(&self) -> &Self::Target {
        &self.model
    }
}

impl DerefMut for ResourceConfig {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.model
    }
}

pub const ROAD_RESOURCES: ResourceConfig = ResourceConfig {
    model: DrivetrainConfig {
        fuel_rate_multiplier: 12.0,
        heat_rate_multiplier: 1.35,
        ..DrivetrainConfig::ROAD_CAR
    },
    nos_seconds: 10.0,
    impact_damage_multiplier: 1.0,
};

pub const MUSCLE_RESOURCES: ResourceConfig = ResourceConfig {
    model: DrivetrainConfig {
        fuel_capacity_liters: 72.0,
        idle_rpm: 750.0,
        max_rpm: 7500.0,
        redline_rpm: 6800.0,
        ..ROAD_RESOURCES.model
    },
    ..ROAD_RESOURCES
};

pub const SUPRA_RESOURCES: ResourceConfig = ResourceConfig {
    model: DrivetrainConfig {
        fuel_capacity_liters: 52.0,
        max_rpm: 7500.0,
        redline_rpm: 7000.0,
        ..ROAD_RESOURCES.model
    },
    ..ROAD_RESOURCES
};

pub const TANK_RESOURCES: ResourceConfig = ResourceConfig {
    model: DrivetrainConfig {
        fuel_capacity_liters: 1100.0,
        idle_rpm: 600.0,
        max_rpm: 4200.0,
        redline_rpm: 3800.0,
        final_drive: 7.0,
        gear_ratios: [4.5, 3.2, 2.4, 1.8, 1.3, 1.0],
        idle_liters_per_hour: 5.0,
        fuel_density_grams_per_liter: 835.0,
        bsfc_grams_per_kwh: 240.0,
        fuel_rate_multiplier: 22.0,
        heat_rate_multiplier: 1.5,
        thermal_capacity_kj_per_c: 500.0,
        cooling_multiplier: 16.0,
        max_heat_rise_c_s: 0.3,
        ..ROAD_RESOURCES.model
    },
    nos_seconds: 21.0,
    impact_damage_multiplier: 0.3,
};

#[derive(Clone, Copy, Debug, Serialize)]
pub struct HudCalibration {
    pub forward_gears:u8,
    pub cockpit_controls: bool,
    pub cockpit_version: u8,
    pub cluster_fields: u16,
    pub telemetry_mask: u16,
    pub max_rpm: f32,
    pub redline_rpm: f32,
    pub fuel_capacity_liters: f32,
    pub min_temp_c: f32,
    pub ambient_temp_c: f32,
    pub overheat_c: f32,
    pub critical_c: f32,
}
impl ResourceConfig {
    pub fn hud(self) -> HudCalibration {
        HudCalibration {
            forward_gears:self.gear_ratios.len() as u8,
            cockpit_controls: true,
            cockpit_version: 8,
            cluster_fields: (1 << 2) | (1 << 3) | (1 << 9) | (1 << 10),
            telemetry_mask: RPM
                | GEAR
                | FUEL
                | TEMPERATURE
                | CONDITION
                | ULTIMATE
                | if self.nos_seconds > 0.0 { BOOST } else { 0 },
            max_rpm: self.max_rpm,
            redline_rpm: self.redline_rpm,
            fuel_capacity_liters: self.fuel_capacity_liters,
            min_temp_c: 40.0, ambient_temp_c:self.ambient_c,
            overheat_c: self.overheat_c,
            critical_c: self.critical_c,
        }
    }
}

/// Game reserves and status effects wrapped around the shared drivetrain.
#[derive(Clone, Debug)]
pub struct Powertrain {
    model: Drivetrain,
    pub boost_requested: bool,
    pub blink_stress_s: f32,
    pub ultimate_fraction: f32,
    pub nos_remaining_s: f32,
    pub boost_active: bool,
}

impl Deref for Powertrain {
    type Target = Drivetrain;

    fn deref(&self) -> &Self::Target {
        &self.model
    }
}

impl DerefMut for Powertrain {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.model
    }
}

impl Powertrain {
    pub fn new(config: ResourceConfig) -> Self {
        Self {
            model: Drivetrain::new(config.model),
            boost_requested: false,
            blink_stress_s: 0.0,
            ultimate_fraction: 0.0,
            nos_remaining_s: config.nos_seconds,
            boost_active: false,
        }
    }

    pub fn advance(&mut self, config: ResourceConfig, demand: Demand, dt: f32) {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 {
            return;
        }
        let stressed = self.blink_stress_s > 0.0;
        self.blink_stress_s = (self.blink_stress_s - dt).max(0.0);
        let modifiers = DriveModifiers {
            auxiliary_fraction: if self.boost_requested && self.nos_remaining_s > 0.0 {
                (self.nos_remaining_s / dt).clamp(0.0, 1.0)
            } else {
                0.0
            },
            top_speed_gain: NOS_SPEED_BONUS,
            output_gain: NOS_OUTPUT_BONUS,
            fuel_load_scale: if stressed { crate::mechanic::FUEL_MULTIPLIER } else { 1.0 },
            heating_load_scale: if stressed { crate::mechanic::HEAT_MULTIPLIER } else { 1.0 },
        };
        let applied = self.model.advance(config.model, demand, modifiers, dt);
        self.nos_remaining_s = (self.nos_remaining_s - applied * dt).max(0.0);
        self.boost_active = applied > 0.0 && self.model.running;
    }

    pub fn impact(&mut self, delta_v: f32, config: ResourceConfig, damage_scale: f32) -> f32 {
        self.model.impact_wear(delta_v, config.impact_damage_multiplier, damage_scale)
    }

    /// One finite, capped accumulator for accepted server sources. Never assign
    /// client-reported charge or infer damage from the shooter's own condition.
    fn credit_ultimate_fraction(&mut self, fraction: f32) {
        let current = if self.ultimate_fraction.is_finite() { self.ultimate_fraction.clamp(0.0, 1.0) } else { 0.0 };
        self.ultimate_fraction = if fraction.is_finite() && fraction > 0.0 {
            (current + fraction.min(1.0)).clamp(0.0, 1.0)
        } else { current };
    }
    pub fn credit_damage_dealt(&mut self, fraction_lost: f32) {
        self.credit_ultimate_fraction(fraction_lost);
    }
    /// Physics calls this only for an active connected, living vehicle. The dt
    /// is fixed simulation time, never a wall-clock or input-packet catch-up.
    pub fn advance_passive_ultimate(&mut self, dt: f32) {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 { return; }
        self.credit_ultimate_fraction(dt / PASSIVE_ULTIMATE_SECONDS);
    }
    /// The world passes actual HP gained, not a requested healing amount. Fuel,
    /// service and self-repair have no path to this teammate-healing credit.
    pub fn credit_teammate_healing(&mut self, actual_hp: f32, maximum_hp: f32) {
        if actual_hp.is_finite() && maximum_hp.is_finite() && actual_hp > 0.0 && maximum_hp > 0.0 {
            self.credit_ultimate_fraction(actual_hp / maximum_hp);
        }
    }
    pub fn resource_mask(&self, config: ResourceConfig) -> u16 {
        (if self.model.starting() {
            STARTING
        } else {
            0
        }) | (if self.temperature_c >= config.overheat_c {
            HOT
        } else {
            0
        }) | (if self.fuel_liters < config.fuel_capacity_liters * 0.20 {
            LOW_FUEL
        } else {
            0
        }) | (if self.fuel_liters <= 0.0 { STARVED } else { 0 })
            | (if self.condition < 0.75 { DAMAGED } else { 0 })
            | (if self.thermal_recovery {THERMAL_RECOVERY}else{0})
            | (if self.blink_stress_s > 0.0 {BLINK_STRESS}else{0})
    }
    pub fn boost_fraction(&self, config: ResourceConfig) -> Option<f32> {
        (config.nos_seconds > 0.0)
            .then(|| (self.nos_remaining_s / config.nos_seconds).clamp(0.0, 1.0))
    }
    pub fn reconfigure(&mut self, previous: ResourceConfig, next: ResourceConfig) {
        self.fuel_liters = (self.fuel_liters / previous.fuel_capacity_liters).clamp(0.0, 1.0)
            * next.fuel_capacity_liters;
        self.nos_remaining_s = self.boost_fraction(previous).unwrap_or(0.0) * next.nos_seconds;
        self.gear = 0;
        self.rpm = 0.0;
        self.engine_torque_nm = 0.0;
        self.boost_active = false;
    }
    /// Restore the HUD reserves without changing the driver's gear or ignition.
    pub fn refill_gauges(&mut self, config: ResourceConfig) {
        self.fuel_liters = config.fuel_capacity_liters;
        self.nos_remaining_s = config.nos_seconds;
        self.condition = 1.0;
        self.ultimate_fraction = 1.0;
        self.temperature_c = config.initial_temp_c;
        self.thermal_recovery = false;
        self.blink_stress_s = 0.0;
    }

    pub fn service(&mut self, config: ResourceConfig) {
        let charge = self.ultimate_fraction;
        *self = Self::new(config);
        self.ultimate_fraction = charge;
        self.model.stop_engine();
    }
}

#[cfg(test)]
mod tests {
    #[test] fn an_idle_gear_tap_waits_for_throttle_before_automatic_takeover() {
        let mut p=Powertrain::new(ROAD_RESOURCES);p.request_forward_gear(6);
        let idle=Demand{throttle:0.0,longitudinal_speed:0.0,wheel_radius:0.33,engine_force:8500.0,top_speed:62.0};
        for _ in 0..1200 {p.advance(ROAD_RESOURCES,idle,1.0/120.0);assert_eq!(p.gear,6);}
        let load=Demand{throttle:1.0,..idle};
        for _ in 0..60 {p.advance(ROAD_RESOURCES,load,1.0/120.0);assert_eq!(p.gear,6);}
        for _ in 0..60 {p.advance(ROAD_RESOURCES,load,1.0/120.0);}
        assert_eq!(p.gear,1);assert_eq!(p.manual_gear,None);
    }
    #[test] fn configured_vehicles_reach_top_gear_and_calibrated_top_speed() {
        use crate::vehicle_setup::{AE86,GT86,BRZ,CAMARO,SUPRA,TANK};
        for (name,cfg) in [("ae86",AE86),("gt86",GT86),("frs",BRZ),("camaro",CAMARO),("supra",SUPRA),("tank",TANK)] {
            let mut p=Powertrain::new(cfg.resources);let mut speed=0.0;let dt=1.0/120.0;let mut highest=0;
            // Isolate the healthy driveline from the intentionally accelerated
            // fuel/heat game mechanics; existing resource tests cover those.
            for _ in 0..120_000 {
                p.fuel_liters=cfg.resources.fuel_capacity_liters;p.temperature_c=85.0;p.condition=1.0;
                p.advance(cfg.resources,Demand{throttle:1.0,longitudinal_speed:speed,wheel_radius:cfg.wheel_radius,engine_force:cfg.engine_force,top_speed:cfg.max_speed},dt);
                highest=highest.max(p.gear);
                let grip=cfg.mass*9.81*0.5*cfg.mu_base*cfg.tcs_nx_limit;
                let drive=(cfg.engine_force*p.power_multiplier*p.drive_ratio_multiplier).min(grip);
                let resistance=cfg.resources.road_resistance(cfg.engine_force,cfg.mass,cfg.linear_damping,cfg.max_speed,speed,true);
                speed=((speed+(drive-resistance)/cfg.mass*dt)/(1.0+cfg.linear_damping*dt)).max(0.0);
            }
            println!("{name}: gear={highest}, speed={speed:.3} m/s, configured={:.3}",cfg.max_speed);
            assert_eq!(highest,6,"{name}");assert!((speed/cfg.max_speed-1.0).abs()<0.03,"{name}: {speed} vs {}",cfg.max_speed);
        }
    }
    #[test] fn stopped_automatic_returns_directly_from_sixth_to_first() {
        let mut p=Powertrain::new(ROAD_RESOURCES);p.gear=6;
        p.advance(ROAD_RESOURCES,Demand{throttle:1.0,longitudinal_speed:0.0,wheel_radius:0.32,engine_force:4000.0,top_speed:62.0},1.0/120.0);
        assert_eq!(p.gear,1);assert_eq!(p.manual_gear,None);
        let mut moving=Powertrain::new(ROAD_RESOURCES);moving.gear=6;
        moving.advance(ROAD_RESOURCES,Demand{throttle:1.0,longitudinal_speed:15.0,wheel_radius:0.32,engine_force:4000.0,top_speed:62.0},1.0/120.0);
        let wheel_rpm=15.0/0.32*60.0/std::f32::consts::TAU;
        let rpm=wheel_rpm*ROAD_RESOURCES.gear_ratios[moving.gear as usize-1]*ROAD_RESOURCES.effective_final_drive(0.32,62.0);
        assert!(rpm<ROAD_RESOURCES.redline_rpm*0.85,"selected downshift must remain below the safe RPM limit");
    }
    #[test] fn a_forward_gear_tap_expires_then_automatic_shifts_continue_under_throttle() {
        let mut p=Powertrain::new(ROAD_RESOURCES);
        let demand=Demand {throttle:1.0,longitudinal_speed:8.0,wheel_radius:0.32,engine_force:4000.0,top_speed:62.0};
        p.request_forward_gear(6);
        for _ in 0..60 {p.advance(ROAD_RESOURCES,demand,1.0/120.0);assert_eq!(p.gear,6);assert_eq!(p.manual_gear,None);}
        for _ in 0..120 {p.advance(ROAD_RESOURCES,demand,1.0/120.0);}
        assert!(p.gear<6,"low road speed resumes automatic downshifts");
        p.request_forward_gear(1);
        let fast=Demand {longitudinal_speed:60.0,..demand};
        for _ in 0..60 {p.advance(ROAD_RESOURCES,fast,1.0/120.0);assert_eq!(p.gear,1);}
        for _ in 0..120 {p.advance(ROAD_RESOURCES,fast,1.0/120.0);}
        assert!(p.gear>1,"high road speed resumes automatic upshifts");
    }
    use super::*;

    #[test]
    fn assisted_manual_neutral_rev_and_reverse_use_selected_gear() {
        let mut p=Powertrain::new(ROAD_RESOURCES);
        let demand=Demand{throttle:1.0,longitudinal_speed:0.0,wheel_radius:0.3,engine_force:7000.0,top_speed:62.0};
        p.manual_gear=Some(0);p.advance(ROAD_RESOURCES,demand,1.0/120.0);
        assert_eq!(p.gear,0);assert_eq!(p.drive_throttle,0.0);assert!(p.rpm>ROAD_RESOURCES.idle_rpm);
        p.manual_gear=Some(-1);p.advance(ROAD_RESOURCES,demand,1.0/120.0);
        assert_eq!(p.gear,-1);assert_eq!(p.drive_throttle,-1.0);
    }

    #[test]
    fn manual_reverse_cannot_reverse_propulsion_while_rolling_forward() {
        let mut p=Powertrain::new(ROAD_RESOURCES);p.manual_gear=Some(-1);
        p.advance(ROAD_RESOURCES,Demand{throttle:1.0,longitudinal_speed:3.0,wheel_radius:0.3,engine_force:7000.0,top_speed:62.0},1.0/120.0);
        assert_eq!(p.drive_throttle,0.0);assert_eq!(p.direction_brake,1.0);
    }
    fn demand(throttle: f32, speed: f32) -> Demand {
        Demand {
            throttle,
            longitudinal_speed: speed,
            wheel_radius: 0.33,
            engine_force: 8500.0, top_speed:62.0,
        }
    }
    fn run(state: &mut Powertrain, input: Demand, seconds: f32, hz: u32) {
        for _ in 0..(seconds * hz as f32) as usize {
            state.advance(ROAD_RESOURCES, input, 1.0 / hz as f32);
        }
    }
    #[test]
    fn blink_strain_increases_real_burn_and_positive_heat_then_expires() {
        let mut normal=Powertrain::new(ROAD_RESOURCES);
        let mut blink=normal.clone();
        blink.blink_stress_s=crate::mechanic::STRESS_SECONDS;
        let fuel=normal.fuel_liters;
        let temp=normal.temperature_c;
        run(&mut normal,demand(1.0,10.0),1.0,60);
        run(&mut blink,demand(1.0,10.0),1.0,60);
        let fuel_ratio=(fuel-blink.fuel_liters)/(fuel-normal.fuel_liters);
        let heat_ratio=(blink.temperature_c-temp)/(normal.temperature_c-temp);
        assert!((fuel_ratio-crate::mechanic::FUEL_MULTIPLIER).abs()<0.08);
        assert!((heat_ratio-crate::mechanic::HEAT_MULTIPLIER).abs()<0.08);
        assert!(blink.resource_mask(ROAD_RESOURCES)&BLINK_STRESS!=0);
        run(&mut blink,demand(0.0,0.0),5.1,60);
        assert_eq!(blink.resource_mask(ROAD_RESOURCES)&BLINK_STRESS,0);
    }
    #[test]
    fn rates_use_seconds_and_are_nearly_substep_independent() {
        let mut a = Powertrain::new(ROAD_RESOURCES);
        let mut b = a.clone();
        run(&mut a, demand(0.45, 20.0), 30.0, 60);
        run(&mut b, demand(0.45, 20.0), 30.0, 120);
        assert!((a.fuel_liters - b.fuel_liters).abs() < 0.03);
        assert!((a.temperature_c - b.temperature_c).abs() < 0.1);
    }
    #[test]
    fn heavy_load_burns_and_heats_more_than_moderate_cruise() {
        let mut heavy = Powertrain::new(ROAD_RESOURCES);
        let mut cruise = heavy.clone();
        run(&mut heavy, demand(1.0, 25.0), 20.0, 120);
        run(&mut cruise, demand(0.20, 25.0), 20.0, 120);
        assert!(heavy.fuel_liters < cruise.fuel_liters - 1.0);
        assert!(heavy.temperature_c > cruise.temperature_c + 5.0);
    }
    #[test]
    fn engine_off_burns_no_fuel_and_cools_without_adding_motion() {
        let mut state = Powertrain::new(ROAD_RESOURCES);
        state.engine_requested = false;
        state.temperature_c = 120.0;
        run(&mut state, demand(1.0, 20.0), 30.0, 120);
        assert_eq!(state.fuel_liters, ROAD_RESOURCES.fuel_capacity_liters);
        assert!(state.temperature_c < 120.0);
        assert!(!state.running);
        assert_eq!(state.drive_throttle, 0.0);
        assert_eq!(state.power_multiplier, 0.0);
    }
    #[test]
    fn empty_fuel_gates_propulsion_while_heat_reduces_power_without_stalling() {
        let mut state=Powertrain::new(ROAD_RESOURCES);state.fuel_liters=0.0;
        run(&mut state,demand(1.0,10.0),1.0,120);assert!(!state.running);assert_eq!(state.power_multiplier,0.0);
        let mut state=Powertrain::new(ROAD_RESOURCES);state.temperature_c=140.0;
        run(&mut state,demand(1.0,0.0),1.0,120);assert!(state.running);assert!(state.thermal_recovery);assert!(state.power_multiplier>0.0&&state.power_multiplier<=0.30);assert!(state.temperature_c<140.0);assert_eq!(state.resource_mask(ROAD_RESOURCES)&HEAT_LOCK,0);
    }
    #[test]
    fn nos_has_a_real_limited_reserve_and_no_free_recharge() {
        let mut state = Powertrain::new(ROAD_RESOURCES);
        state.boost_requested = true;
        run(&mut state, demand(0.4, 10.0), 2.0, 120);
        assert!(state.boost_active);
        assert!(state.nos_remaining_s < 8.01);
        run(&mut state, demand(0.4, 10.0), 12.0, 120);
        assert!(!state.boost_active);
        assert_eq!(state.nos_remaining_s, 0.0);
        state.boost_requested = false;
        run(&mut state, demand(0.0, 0.0), 5.0, 120);
        assert_eq!(state.nos_remaining_s, 0.0);
    }
    #[test]
    fn impact_damage_ignores_standing_support_and_is_not_counted_per_contact_substep() {
        let mut state = Powertrain::new(ROAD_RESOURCES);
        state.impact(0.08, ROAD_RESOURCES, 1.0);
        assert_eq!(state.condition, 1.0);
        state.impact(10.0, ROAD_RESOURCES, 1.0);
        let condition = state.condition;
        assert!(condition < 1.0);
        state.impact(10.0, ROAD_RESOURCES, 1.0);
        assert_eq!(state.condition, condition);
        run(&mut state, demand(0.0, 0.0), 0.3, 120);
        state.impact(10.0, ROAD_RESOURCES, 1.0);
        assert!(state.condition < condition);
    }
    #[test]
    fn changing_models_preserves_fuel_fraction_damage_heat_and_reserve() {
        let mut state = Powertrain::new(ROAD_RESOURCES);
        state.fuel_liters = 25.0;
        state.condition = 0.5;
        state.temperature_c = 115.0;
        state.nos_remaining_s = 2.0;
        state.ultimate_fraction = 0.4;
        state.reconfigure(ROAD_RESOURCES, MUSCLE_RESOURCES);
        assert_eq!(state.fuel_liters, 36.0);
        assert_eq!(state.condition, 0.5);
        assert_eq!(state.temperature_c, 115.0);
        assert_eq!(state.nos_remaining_s, 2.0);
        assert_eq!(state.ultimate_fraction, 0.4);
    }
    #[test]
    fn ultimate_only_accepts_finite_positive_authoritative_damage_and_service_cannot_refill_it() {
        let mut state = Powertrain::new(ROAD_RESOURCES);
        state.impact(15.0, ROAD_RESOURCES, 1.0);assert_eq!(state.ultimate_fraction, 0.0);
        for value in [f32::NAN, f32::INFINITY, -1.0, 0.0] { state.credit_damage_dealt(value); }
        assert_eq!(state.ultimate_fraction, 0.0);
        state.credit_damage_dealt(0.2);state.service(ROAD_RESOURCES);assert_eq!(state.ultimate_fraction,0.2);
        state.credit_damage_dealt(0.9);assert_eq!(state.ultimate_fraction,1.0);
    }
    #[test]
    fn passive_ultimate_is_slow_simulation_time_and_all_charge_sources_are_bounded() {
        let mut passive = Powertrain::new(ROAD_RESOURCES);
        for dt in [0.0, -1.0, f32::NAN, f32::INFINITY, f32::MAX, 0.101] { passive.advance_passive_ultimate(dt); }
        assert_eq!(passive.ultimate_fraction, 0.0);
        for _ in 0..600 { passive.advance_passive_ultimate(0.1); }
        assert!((passive.ultimate_fraction - 0.125).abs() < 0.00001, "one minute earns one eighth of passive charge");
        let mut action = Powertrain::new(ROAD_RESOURCES);
        action.credit_damage_dealt(0.3);
        let mut healer = Powertrain::new(ROAD_RESOURCES);
        for (healed, maximum) in [(f32::NAN, 500.0), (50.0, 0.0), (-1.0, 500.0), (50.0, f32::INFINITY)] { healer.credit_teammate_healing(healed, maximum); }
        assert_eq!(healer.ultimate_fraction, 0.0);
        healer.credit_teammate_healing(150.0, 500.0);
        assert_eq!(healer.ultimate_fraction, action.ultimate_fraction);
        assert!(action.ultimate_fraction > passive.ultimate_fraction, "useful combat/healing beats passive waiting");
        for _ in 0..5000 { passive.advance_passive_ultimate(0.1); }
        assert_eq!(passive.ultimate_fraction, 1.0);
        healer.ultimate_fraction = f32::NAN; healer.credit_damage_dealt(0.1);
        assert_eq!(healer.ultimate_fraction, 0.1);
        healer.credit_teammate_healing(f32::MAX, 1.0); assert_eq!(healer.ultimate_fraction, 1.0);
        healer.service(ROAD_RESOURCES); assert_eq!(healer.ultimate_fraction, 1.0);
    }
    #[test]
    fn reverse_at_speed_brakes_before_selecting_reverse() {
        let mut state = Powertrain::new(ROAD_RESOURCES);
        run(&mut state, demand(-1.0, 20.0), 1.0, 120);
        assert_ne!(state.gear, -1);
        assert_eq!(state.drive_throttle, 0.0);
        assert_eq!(state.direction_brake, 1.0);
        run(&mut state, demand(-1.0, 0.0), 1.0, 120);
        assert_eq!(state.gear, -1);
        assert_eq!(state.drive_throttle, -1.0);
    }
}

#[cfg(test)]mod thermal_recovery_tests{
 use super::*;
 #[test]fn overheating_is_a_cooling_limp_debuff_and_hot_engines_can_restart(){
  for config in [ROAD_RESOURCES,TANK_RESOURCES]{
   let mut p=Powertrain::new(config);p.temperature_c=config.critical_c+1.0;p.engine_requested=false;
   let d=Demand{throttle:1.0,longitudinal_speed:0.0,wheel_radius:0.35,engine_force:200_000.0,top_speed:30.0};
   p.advance(config,d,1.0/120.0);assert!(!p.running);assert!(p.thermal_recovery);let hot=p.temperature_c;
   p.engine_requested=true;p.boost_requested=true;
   for _ in 0..120{p.advance(config,d,1.0/120.0);}
   assert!(p.running,"heat cannot prevent a fresh START request");assert!(p.drive_throttle>0.0);assert!(p.power_multiplier>0.0&&p.power_multiplier<=0.30);assert!(!p.boost_active);assert!(p.temperature_c<hot);
   p.engine_requested=false;for _ in 0..1800{p.advance(config,d,1.0/120.0);}
   assert!(p.temperature_c<config.overheat_c,"stopping must offer faster cooling");
   p.temperature_c=config.initial_temp_c;p.advance(config,d,1.0/120.0);assert!(!p.thermal_recovery);
  }
 }
 #[test]fn thermal_wear_does_not_turn_a_limping_engine_into_a_permanent_stall(){
  let mut p=Powertrain::new(ROAD_RESOURCES);p.temperature_c=150.0;p.condition=0.11;
  let d=Demand{throttle:1.0,longitudinal_speed:2.0,wheel_radius:0.35,engine_force:8500.0,top_speed:62.0};
  for _ in 0..12000{p.advance(ROAD_RESOURCES,d,1.0/120.0);assert!(p.running);}
  assert!(p.condition>=0.1);assert!(p.temperature_c<150.0);
 }
}
