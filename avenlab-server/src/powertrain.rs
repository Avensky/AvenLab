//! Lightweight server-owned driveline telemetry and resource simulation.
//! Every rate is per second and advances exactly once per physics substep.
//! The existing tire solver owns grip/force application; this module supplies
//! resource gates/derating, not a second force or steering pass.
use serde::Serialize;

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
pub const HEAT_LOCK: u16 = 32;

#[derive(Clone, Copy, Debug)]
pub struct ResourceConfig {
    pub fuel_capacity_liters: f32,
    pub idle_rpm: f32,
    pub max_rpm: f32,
    pub redline_rpm: f32,
    pub final_drive: f32,
    pub gear_ratios: [f32; 6],
    pub idle_liters_per_hour: f32,
    pub fuel_density_grams_per_liter: f32,
    pub bsfc_grams_per_kwh: f32,
    pub fuel_gameplay_multiplier: f32,
    pub heat_gameplay_multiplier: f32,
    pub thermal_capacity_kj_per_c: f32,
    pub ambient_c: f32,
    pub initial_temp_c: f32,
    pub overheat_c: f32,
    pub critical_c: f32,
    pub restart_c: f32,
    pub nos_seconds: f32,
    pub impact_damage_multiplier: f32,
}

pub const ROAD_RESOURCES: ResourceConfig = ResourceConfig {
    fuel_capacity_liters: 50.0,
    idle_rpm: 900.0,
    max_rpm: 8000.0,
    redline_rpm: 7400.0,
    final_drive: 3.9,
    gear_ratios: [3.63, 2.19, 1.54, 1.21, 1.0, 0.83],
    idle_liters_per_hour: 0.8,
    fuel_density_grams_per_liter: 745.0,
    bsfc_grams_per_kwh: 300.0,
    fuel_gameplay_multiplier: 12.0,
    heat_gameplay_multiplier: 1.35,
    thermal_capacity_kj_per_c: 160.0,
    ambient_c: 25.0,
    initial_temp_c: 85.0,
    overheat_c: 110.0,
    critical_c: 135.0,
    restart_c: 100.0,
    nos_seconds: 10.0,
    impact_damage_multiplier: 1.0,
};
pub const MUSCLE_RESOURCES: ResourceConfig = ResourceConfig {
    fuel_capacity_liters: 72.0,
    idle_rpm: 750.0,
    max_rpm: 7500.0,
    redline_rpm: 6800.0,
    ..ROAD_RESOURCES
};
pub const SUPRA_RESOURCES: ResourceConfig = ResourceConfig {
    fuel_capacity_liters: 52.0,
    max_rpm: 7500.0,
    redline_rpm: 7000.0,
    ..ROAD_RESOURCES
};
pub const TANK_RESOURCES: ResourceConfig = ResourceConfig {
    fuel_capacity_liters: 1100.0,
    idle_rpm: 600.0,
    max_rpm: 3200.0,
    redline_rpm: 2900.0,
    final_drive: 7.0,
    gear_ratios: [4.5, 3.2, 2.4, 1.8, 1.3, 1.0],
    idle_liters_per_hour: 5.0,
    fuel_density_grams_per_liter: 835.0,
    bsfc_grams_per_kwh: 240.0,
    fuel_gameplay_multiplier: 22.0,
    heat_gameplay_multiplier: 1.5,
    thermal_capacity_kj_per_c: 500.0,
    nos_seconds: 0.0,
    impact_damage_multiplier: 0.3,
    ..ROAD_RESOURCES
};

#[derive(Clone, Copy, Debug, Serialize)]
pub struct HudCalibration {
    pub cockpit_controls: bool,
    pub cockpit_version: u8,
    pub cluster_fields: u16,
    pub telemetry_mask: u16,
    pub max_rpm: f32,
    pub redline_rpm: f32,
    pub fuel_capacity_liters: f32,
    pub min_temp_c: f32,
    pub overheat_c: f32,
    pub critical_c: f32,
}
impl ResourceConfig {
    pub fn hud(self) -> HudCalibration {
        HudCalibration {
            cockpit_controls: true,
            cockpit_version: 2,
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
            min_temp_c: 40.0,
            overheat_c: self.overheat_c,
            critical_c: self.critical_c,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Powertrain {
    pub manual_gear: Option<i32>,
    pub engine_requested: bool,
    pub boost_requested: bool,
    pub running: bool,
    pub rpm: f32,
    pub gear: i32,
    pub fuel_liters: f32,
    pub temperature_c: f32,
    pub engine_torque_nm: f32,
    pub condition: f32,
    pub ultimate_fraction: f32,
    pub nos_remaining_s: f32,
    pub boost_active: bool,
    pub power_multiplier: f32,
    pub drive_throttle: f32,
    pub direction_brake: f32,
    last_engine_request: bool,
    start_remaining_s: f32,
    shift_remaining_s: f32,
    heat_locked: bool,
    impact_cooldown_s: f32,
}
#[derive(Clone, Copy)]
pub struct Demand {
    pub throttle: f32,
    pub longitudinal_speed: f32,
    pub wheel_radius: f32,
    pub engine_force: f32,
}
impl Powertrain {
    pub fn new(config: ResourceConfig) -> Self {
        Self {
            manual_gear: None,
            engine_requested: true,
            boost_requested: false,
            running: true,
            rpm: config.idle_rpm,
            gear: 0,
            fuel_liters: config.fuel_capacity_liters,
            temperature_c: config.initial_temp_c,
            engine_torque_nm: 0.0,
            condition: 1.0,
            ultimate_fraction: 0.0,
            nos_remaining_s: config.nos_seconds,
            boost_active: false,
            power_multiplier: 1.0,
            drive_throttle: 0.0,
            direction_brake: 0.0,
            last_engine_request: true,
            start_remaining_s: 0.0,
            shift_remaining_s: 0.0,
            heat_locked: false,
            impact_cooldown_s: 0.0,
        }
    }

    pub fn advance(&mut self, config: ResourceConfig, demand: Demand, dt: f32) {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 {
            return;
        }
        let speed = if demand.longitudinal_speed.is_finite() {
            demand.longitudinal_speed
        } else {
            0.0
        };
        let requested_throttle = if demand.throttle.is_finite() {
            demand.throttle.clamp(-1.0, 1.0)
        } else {
            0.0
        };
        let throttle = self.manual_gear.map(|gear| gear.signum() as f32 * requested_throttle.max(0.0)).unwrap_or(requested_throttle);
        self.shift_remaining_s = (self.shift_remaining_s - dt).max(0.0);
        self.impact_cooldown_s = (self.impact_cooldown_s - dt).max(0.0);
        if self.temperature_c >= config.critical_c {
            self.heat_locked = true;
        }
        if self.temperature_c <= config.restart_c {
            self.heat_locked = false;
        }
        if self.engine_requested && !self.last_engine_request {
            self.start_remaining_s = 0.7;
        }
        if !self.engine_requested {
            self.start_remaining_s = 0.0;
        }
        self.last_engine_request = self.engine_requested;
        let can_run = self.engine_requested
            && self.fuel_liters > 0.0
            && self.condition > 0.05
            && !self.heat_locked;
        if can_run {
            self.start_remaining_s = (self.start_remaining_s - dt).max(0.0);
        }
        self.running = can_run && self.start_remaining_s <= 0.0;

        // Reverse requested while moving forward (or vice versa) brakes to a
        // near stop before changing direction; it cannot select reverse at speed.
        let opposing =
            throttle.abs() > 0.05 && speed.abs() > 0.6 && throttle.signum() != speed.signum();
        self.direction_brake = if opposing { throttle.abs() } else if self.manual_gear.is_some() { (-requested_throttle).max(0.0) } else { 0.0 };
        self.drive_throttle = if self.running && !opposing {
            throttle
        } else {
            0.0
        };
        if let Some(gear) = self.manual_gear {
            self.gear = gear.clamp(-1, 6);
        } else if !self.running {
            self.gear = 0;
        } else if throttle.abs() > 0.05 && speed.abs() <= 0.6 {
            self.gear = if throttle < 0.0 { -1 } else { self.gear.max(1) };
        } else if self.gear == 0 && speed.abs() > 0.6 {
            self.gear = if speed < 0.0 { -1 } else { 1 };
        }

        // Kinematic automatic driveline: wheel angular speed * actual ratios.
        // Healthy base traction remains the existing tire-solver calibration.
        let wheel_rpm = speed.abs() / demand.wheel_radius.max(0.05) * 60.0 / std::f32::consts::TAU;
        let gear_ratio = |gear: i32| {
            if gear < 0 {
                3.3
            } else if gear > 0 {
                config.gear_ratios[(gear as usize - 1).min(5)]
            } else {
                0.0
            }
        };
        let coupled = wheel_rpm * gear_ratio(self.gear) * config.final_drive;
        if self.manual_gear.is_none() && self.running && self.gear > 0 && self.shift_remaining_s <= 0.0 {
            if coupled > config.redline_rpm * 0.90 && self.gear < 6 {
                self.gear += 1;
                self.shift_remaining_s = 0.4;
            } else if self.gear > 1
                && coupled < config.idle_rpm * 2.2
                && wheel_rpm * gear_ratio(self.gear - 1) * config.final_drive
                    < config.redline_rpm * 0.85
            {
                self.gear -= 1;
                self.shift_remaining_s = 0.4;
            }
        }
        let ratio = gear_ratio(self.gear) * config.final_drive;
        let launch_rpm = config.idle_rpm
            + self.drive_throttle.abs()
                * config.idle_rpm
                * 1.6
                * (1.0 - speed.abs() / 5.0).clamp(0.0, 1.0);
        let rpm_target = if self.running {
            if self.manual_gear == Some(0) {
                config.idle_rpm + requested_throttle.max(0.0) * (config.max_rpm - config.idle_rpm)
            } else { (wheel_rpm * ratio).max(launch_rpm).min(config.max_rpm) }
        } else if can_run {
            300.0
        } else {
            0.0
        };
        self.rpm +=
            (rpm_target - self.rpm) * (1.0 - (-dt / if self.running { 0.12 } else { 0.35 }).exp());
        if self.rpm < 1.0 {
            self.rpm = 0.0;
        }
        let heat_loss = ((self.temperature_c - config.overheat_c)
            / (config.critical_c - config.overheat_c))
            .clamp(0.0, 1.0);
        let condition_loss = ((0.75 - self.condition) / 0.75).clamp(0.0, 1.0);
        let boost_weight = if self.running
            && self.boost_requested
            && self.drive_throttle > 0.1
            && self.nos_remaining_s > 0.0
        {
            (self.nos_remaining_s / dt).clamp(0.0, 1.0)
        } else {
            0.0
        };
        self.boost_active = boost_weight > 0.0;
        self.nos_remaining_s = (self.nos_remaining_s - boost_weight * dt).max(0.0);
        self.power_multiplier = if self.running {
            (1.0 - heat_loss * 0.65) * (1.0 - condition_loss * 0.65) * (1.0 + boost_weight * 0.25)
        } else {
            0.0
        };
        let wheel_force =
            demand.engine_force.max(0.0) * self.drive_throttle.abs() * self.power_multiplier;
        self.engine_torque_nm = if self.running && ratio > 0.0 {
            wheel_force * demand.wheel_radius / (ratio * 0.90)
        } else {
            0.0
        };
        let shaft_kw = self.engine_torque_nm * self.rpm * std::f32::consts::TAU / 60_000.0;
        // BSFC g/kWh -> L/s. Gameplay multiplier intentionally shortens range.
        // High-RPM coast cuts injection; idling still consumes fuel. Braking
        // itself does not subtract fuel or double-count kinetic energy losses.
        let overrun =
            self.running && self.drive_throttle.abs() < 0.01 && self.rpm > config.idle_rpm + 300.0;
        if self.running && !overrun {
            let liters_s = config.idle_liters_per_hour / 3600.0
                + shaft_kw * config.bsfc_grams_per_kwh
                    / config.fuel_density_grams_per_liter
                    / 3600.0;
            self.fuel_liters = (self.fuel_liters
                - liters_s
                    * config.fuel_gameplay_multiplier
                    * (1.0 + (1.0 - self.condition) * 0.25)
                    * dt)
                .max(0.0);
        }
        let thermostat = ((self.temperature_c - 75.0) / 15.0).clamp(0.0, 1.0);
        let cooling_kw_c =
            0.025 + thermostat * (if self.running { 0.35 } else { 0.06 } + speed.abs() * 0.015);
        let cooling_kw = cooling_kw_c
            * (self.temperature_c - config.ambient_c).max(0.0)
            * (0.45 + self.condition * 0.55);
        let heating_kw = if self.running {
            (3.0 + shaft_kw * 0.55) * config.heat_gameplay_multiplier
        } else {
            0.0
        };
        self.temperature_c = (self.temperature_c
            + (heating_kw - cooling_kw) / config.thermal_capacity_kj_per_c * dt)
            .clamp(config.ambient_c, config.critical_c + 30.0);
        let exposure = ((self.temperature_c - config.overheat_c)
            / (config.critical_c - config.overheat_c))
            .clamp(0.0, 2.0);
        self.condition = (self.condition - exposure * 0.0015 * dt).clamp(0.0, 1.0);
        if self.fuel_liters <= 0.0
            || self.condition <= 0.05
            || self.temperature_c >= config.critical_c
        {
            if self.temperature_c >= config.critical_c {
                self.heat_locked = true;
            }
            self.running = false;
            self.boost_active = false;
            self.power_multiplier = 0.0;
            self.drive_throttle = 0.0;
        }
    }

    // Rapier collision impulse / mass is a normal delta-v. Threshold removes
    // standing load and gentle scrapes; cooldown avoids charging one impact
    // repeatedly across its contact solver's substeps.
    pub fn impact(&mut self, delta_v: f32, config: ResourceConfig) {
        if !delta_v.is_finite() || delta_v <= 3.5 || self.impact_cooldown_s > 0.0 {
            return;
        }
        self.condition = (self.condition
            - (delta_v - 3.5).powi(2) * 0.0025 * config.impact_damage_multiplier)
            .clamp(0.0, 1.0);
        self.impact_cooldown_s = 0.25;
    }
    // Only authoritative damage attribution calls this. Never use own condition,
    // throttle, elapsed time, or a client-reported charge value as damage dealt.
    pub fn credit_damage_dealt(&mut self, condition_lost: f32) {
        if condition_lost.is_finite() && condition_lost > 0.0 {
            self.ultimate_fraction = (self.ultimate_fraction + condition_lost.min(1.0)).clamp(0.0, 1.0);
        }
    }
    pub fn resource_mask(&self, config: ResourceConfig) -> u16 {
        (if self.start_remaining_s > 0.0 && self.engine_requested {
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
            | (if self.heat_locked { HEAT_LOCK } else { 0 })
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
    pub fn service(&mut self, config: ResourceConfig) {
        let charge = self.ultimate_fraction;
        *self = Self::new(config);
        self.ultimate_fraction = charge;
        self.engine_requested = false;
        self.last_engine_request = false;
        self.running = false;
        self.rpm = 0.0;
        self.power_multiplier = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assisted_manual_neutral_rev_and_reverse_use_selected_gear() {
        let mut p=Powertrain::new(ROAD_RESOURCES);
        let demand=Demand{throttle:1.0,longitudinal_speed:0.0,wheel_radius:0.3,engine_force:7000.0};
        p.manual_gear=Some(0);p.advance(ROAD_RESOURCES,demand,1.0/120.0);
        assert_eq!(p.gear,0);assert_eq!(p.drive_throttle,0.0);assert!(p.rpm>ROAD_RESOURCES.idle_rpm);
        p.manual_gear=Some(-1);p.advance(ROAD_RESOURCES,demand,1.0/120.0);
        assert_eq!(p.gear,-1);assert_eq!(p.drive_throttle,-1.0);
    }

    #[test]
    fn manual_reverse_cannot_reverse_propulsion_while_rolling_forward() {
        let mut p=Powertrain::new(ROAD_RESOURCES);p.manual_gear=Some(-1);
        p.advance(ROAD_RESOURCES,Demand{throttle:1.0,longitudinal_speed:3.0,wheel_radius:0.3,engine_force:7000.0},1.0/120.0);
        assert_eq!(p.drive_throttle,0.0);assert_eq!(p.direction_brake,1.0);
    }
    fn demand(throttle: f32, speed: f32) -> Demand {
        Demand {
            throttle,
            longitudinal_speed: speed,
            wheel_radius: 0.33,
            engine_force: 8500.0,
        }
    }
    fn run(state: &mut Powertrain, input: Demand, seconds: f32, hz: u32) {
        for _ in 0..(seconds * hz as f32) as usize {
            state.advance(ROAD_RESOURCES, input, 1.0 / hz as f32);
        }
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
    fn empty_fuel_and_critical_heat_gate_propulsion_with_cooldown_hysteresis() {
        let mut state = Powertrain::new(ROAD_RESOURCES);
        state.fuel_liters = 0.0;
        run(&mut state, demand(1.0, 10.0), 1.0, 120);
        assert!(!state.running);
        assert_eq!(state.power_multiplier, 0.0);
        let mut state = Powertrain::new(ROAD_RESOURCES);
        state.temperature_c = 140.0;
        run(&mut state, demand(1.0, 0.0), 1.0, 120);
        assert!(!state.running);
        assert_ne!(state.resource_mask(ROAD_RESOURCES) & HEAT_LOCK, 0);
        state.temperature_c = ROAD_RESOURCES.restart_c - 1.0;
        run(&mut state, demand(0.0, 0.0), 1.0, 120);
        assert!(state.running);
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
        state.impact(0.08, ROAD_RESOURCES);
        assert_eq!(state.condition, 1.0);
        state.impact(10.0, ROAD_RESOURCES);
        let condition = state.condition;
        assert!(condition < 1.0);
        state.impact(10.0, ROAD_RESOURCES);
        assert_eq!(state.condition, condition);
        run(&mut state, demand(0.0, 0.0), 0.3, 120);
        state.impact(10.0, ROAD_RESOURCES);
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
        state.impact(15.0, ROAD_RESOURCES);assert_eq!(state.ultimate_fraction, 0.0);
        for value in [f32::NAN, f32::INFINITY, -1.0, 0.0] { state.credit_damage_dealt(value); }
        assert_eq!(state.ultimate_fraction, 0.0);
        state.credit_damage_dealt(0.2);state.service(ROAD_RESOURCES);assert_eq!(state.ultimate_fraction,0.2);
        state.credit_damage_dealt(0.9);assert_eq!(state.ultimate_fraction,1.0);
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
