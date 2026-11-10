//! Gearing, engine torque, road resistance, fuel, heat and mechanical wear.

#[derive(Clone, Copy, Debug)]
pub struct DrivetrainConfig {
    pub fuel_capacity_liters: f32,
    pub idle_rpm: f32,
    pub max_rpm: f32,
    pub redline_rpm: f32,
    pub final_drive: f32,
    pub gear_ratios: [f32; 6],
    pub idle_liters_per_hour: f32,
    pub fuel_density_grams_per_liter: f32,
    pub bsfc_grams_per_kwh: f32,
    pub fuel_rate_multiplier: f32,
    pub heat_rate_multiplier: f32,
    pub max_heat_rise_c_s: f32,
    /// Optional floor for the net temperature rise while the engine is running.
    pub min_running_heat_rise_c_s: f32,
    pub thermal_capacity_kj_per_c: f32,
    pub cooling_multiplier: f32,
    pub ambient_c: f32,
    pub initial_temp_c: f32,
    pub overheat_c: f32,
    pub critical_c: f32,
}

impl DrivetrainConfig {
    pub const ROAD_CAR: Self = Self {
        fuel_capacity_liters: 50.0,
        idle_rpm: 900.0,
        max_rpm: 8000.0,
        redline_rpm: 7400.0,
        final_drive: 3.9,
        gear_ratios: [3.63, 2.19, 1.54, 1.21, 1.0, 0.83],
        idle_liters_per_hour: 0.8,
        fuel_density_grams_per_liter: 745.0,
        bsfc_grams_per_kwh: 300.0,
        fuel_rate_multiplier: 1.0,
        heat_rate_multiplier: 1.0,
        max_heat_rise_c_s: f32::INFINITY,
        min_running_heat_rise_c_s: f32::NEG_INFINITY,
        thermal_capacity_kj_per_c: 160.0,
        cooling_multiplier: 1.0,
        ambient_c: 25.0,
        initial_temp_c: 85.0,
        overheat_c: 110.0,
        critical_c: 135.0,
    };
    pub fn effective_final_drive(self, wheel_radius: f32, top_speed: f32) -> f32 {
        if !top_speed.is_finite()
            || top_speed <= 0.1
            || !wheel_radius.is_finite()
            || wheel_radius <= 0.0
        {
            return self.final_drive;
        }
        self.redline_rpm * 0.82 * std::f32::consts::TAU * wheel_radius
            / (60.0 * top_speed * self.gear_ratios[5])
    }
    fn torque_factor(self, rpm: f32) -> f32 {
        let band =
            ((rpm - self.idle_rpm) / (self.redline_rpm - self.idle_rpm).max(100.0)).clamp(0.0, 1.0);
        if band < 0.35 {
            0.65 + band
        } else if band > 0.8 {
            1.0 - (band - 0.8) * 0.5
        } else {
            1.0
        }
    }
    pub fn road_resistance(
        self,
        engine_force: f32,
        mass: f32,
        damping: f32,
        top_speed: f32,
        speed: f32,
        grounded: bool,
    ) -> f32 {
        let top = top_speed.max(1.0);
        let rated = engine_force.max(0.0) * self.gear_ratios[5] / self.gear_ratios[0]
            * self.torque_factor(self.redline_rpm * 0.82);
        // Rolling resistance cannot consume a tracked vehicle's entire rated
        // tractive effort. The remaining load is quadratic aerodynamic drag.
        let rolling = (mass * 9.81 * 0.012).min(rated * 0.35);
        let aero = (rated - mass * damping * top - rolling).max(0.0) / (top * top);
        aero * speed * speed
            + if grounded {
                rolling * (speed / 0.5).clamp(0.0, 1.0)
            } else {
                0.0
            }
    }
}

impl Default for DrivetrainConfig {
    fn default() -> Self {
        Self::ROAD_CAR
    }
}

#[derive(Clone, Debug)]
pub struct Drivetrain {
    pub manual_gear: Option<i32>,
    pub engine_requested: bool,
    pub running: bool,
    pub thermal_recovery: bool,
    pub rpm: f32,
    pub gear: i32,
    pub fuel_liters: f32,
    pub temperature_c: f32,
    pub engine_torque_nm: f32,
    pub condition: f32,
    pub power_multiplier: f32,
    pub drive_throttle: f32,
    pub drive_ratio_multiplier: f32,
    pub direction_brake: f32,
    last_engine_request: bool,
    start_remaining_s: f32,
    shift_remaining_s: f32,
    impact_cooldown_s: f32,
}
#[derive(Clone, Copy)]
pub struct Demand {
    pub throttle: f32,
    pub longitudinal_speed: f32,
    pub wheel_radius: f32,
    pub engine_force: f32,
    pub top_speed: f32,
}
impl Drivetrain {
    pub fn new(config: DrivetrainConfig) -> Self {
        Self {
            manual_gear: None,
            engine_requested: true,
            running: true,
            thermal_recovery: false,
            rpm: config.idle_rpm,
            gear: 0,
            fuel_liters: config.fuel_capacity_liters,
            temperature_c: config.initial_temp_c,
            engine_torque_nm: 0.0,
            condition: 1.0,
            power_multiplier: 1.0,
            drive_throttle: 0.0,
            drive_ratio_multiplier: 0.0,
            direction_brake: 0.0,
            last_engine_request: true,
            start_remaining_s: 0.0,
            shift_remaining_s: 0.0,
            impact_cooldown_s: 0.0,
        }
    }

    // At idle a tap retains the chosen gear. Throttle starts a brief loaded
    // trial before the automatic can select a more suitable ratio.
    pub fn request_forward_gear(&mut self, gear: u8) {
        if (1..=6).contains(&gear) {
            self.gear = gear as i32;
            self.shift_remaining_s = 0.75;
        }
    }

    /// Advance one substep and return the auxiliary output fraction applied.
    pub fn advance(
        &mut self,
        config: DrivetrainConfig,
        demand: Demand,
        modifiers: DriveModifiers,
        dt: f32,
    ) -> f32 {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 {
            return 0.0;
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
        let throttle = self
            .manual_gear
            .map(|gear| gear.signum() as f32 * requested_throttle.max(0.0))
            .unwrap_or(requested_throttle);
        if throttle.abs() > 0.05 {
            self.shift_remaining_s = (self.shift_remaining_s - dt).max(0.0);
        }
        self.impact_cooldown_s = (self.impact_cooldown_s - dt).max(0.0);
        // Overreaching costs power and speed, never an unavoidable heat stall.
        if self.temperature_c >= config.overheat_c {
            self.thermal_recovery = true;
        }
        if self.temperature_c <= config.initial_temp_c + 10.0 {
            self.thermal_recovery = false;
        }
        if self.engine_requested && !self.last_engine_request {
            self.start_remaining_s = 0.7;
        }
        if !self.engine_requested {
            self.start_remaining_s = 0.0;
        }
        self.last_engine_request = self.engine_requested;
        let can_run = self.engine_requested && self.fuel_liters > 0.0 && self.condition > 0.05;
        if can_run {
            self.start_remaining_s = (self.start_remaining_s - dt).max(0.0);
        }
        self.running = can_run && self.start_remaining_s <= 0.0;

        // Reverse requested while moving forward (or vice versa) brakes to a
        // near stop before changing direction; it cannot select reverse at speed.
        let opposing =
            throttle.abs() > 0.05 && speed.abs() > 0.6 && throttle.signum() != speed.signum();
        self.direction_brake = if opposing {
            throttle.abs()
        } else if self.manual_gear.is_some() {
            (-requested_throttle).max(0.0)
        } else {
            0.0
        };
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
        // Calibrate road speed to the existing vehicle's configured maximum.
        // Every ratio remains mechanical: top gear reaches 82% of redline at
        // that speed, so all forward gears are usable for every vehicle class.
        let auxiliary = if self.running && !self.thermal_recovery && self.drive_throttle > 0.1 {
            modifiers.auxiliary_fraction.clamp(0.0, 1.0)
        } else {
            0.0
        };
        let adjusted_speed = demand.top_speed * (1.0 + auxiliary * modifiers.top_speed_gain);
        let final_drive = config.effective_final_drive(demand.wheel_radius, adjusted_speed);
        let coupled = wheel_rpm * gear_ratio(self.gear) * final_drive;
        let loaded = throttle.abs() > 0.05;
        if self.manual_gear.is_none()
            && self.running
            && self.gear > 0
            && loaded
            && self.shift_remaining_s <= 0.0
        {
            if coupled > config.redline_rpm * 0.90 && self.gear < 6 {
                while self.gear < 6
                    && wheel_rpm * gear_ratio(self.gear) * final_drive > config.redline_rpm * 0.90
                {
                    self.gear += 1;
                }
                self.shift_remaining_s = 0.35;
            } else {
                let floor = config.idle_rpm * 2.2
                    + (throttle.abs() - 0.3).max(0.0) * config.redline_rpm * 0.25;
                if self.gear > 1 && coupled < floor {
                    let mut chosen = self.gear;
                    for candidate in (1..self.gear).rev() {
                        let rpm = wheel_rpm * gear_ratio(candidate) * final_drive;
                        if rpm < config.redline_rpm * 0.85 {
                            chosen = candidate;
                            if rpm >= floor {
                                break;
                            }
                        }
                    }
                    if chosen != self.gear {
                        self.gear = chosen;
                        self.shift_remaining_s = 0.35;
                    }
                }
            }
        }
        let selected_ratio = gear_ratio(self.gear);
        let ratio = selected_ratio * final_drive;
        let coupled = wheel_rpm * ratio;
        let limiter = (1.0
            - (coupled - config.redline_rpm) / (config.max_rpm - config.redline_rpm).max(100.0))
        .clamp(0.0, 1.0);
        self.drive_ratio_multiplier =
            selected_ratio / config.gear_ratios[0] * config.torque_factor(self.rpm) * limiter;
        let launch_rpm = config.idle_rpm
            + self.drive_throttle.abs()
                * config.idle_rpm
                * 1.6
                * (1.0 - speed.abs() / 5.0).clamp(0.0, 1.0);
        let rpm_target = if self.running {
            if self.manual_gear == Some(0) {
                config.idle_rpm + requested_throttle.max(0.0) * (config.max_rpm - config.idle_rpm)
            } else {
                (wheel_rpm * ratio).max(launch_rpm).min(config.max_rpm)
            }
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
        self.power_multiplier = if self.running {
            (1.0 - heat_loss * 0.65)
                * (1.0 - condition_loss * 0.65)
                * (1.0 + auxiliary * modifiers.output_gain)
                * if self.thermal_recovery { 0.30 } else { 1.0 }
        } else {
            0.0
        };
        let wheel_force = demand.engine_force.max(0.0)
            * self.drive_throttle.abs()
            * self.power_multiplier
            * self.drive_ratio_multiplier;
        self.engine_torque_nm = if self.running && ratio > 0.0 {
            wheel_force * demand.wheel_radius / (ratio * 0.90)
        } else {
            0.0
        };
        let shaft_kw = self.engine_torque_nm * self.rpm * std::f32::consts::TAU / 60_000.0;
        // BSFC in g/kWh converts to fuel consumption in L/s.
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
                    * config.fuel_rate_multiplier
                    * modifiers.fuel_load_scale
                    * (1.0 + (1.0 - self.condition) * 0.25)
                    * dt)
                .max(0.0);
        }
        let thermostat = ((self.temperature_c - 75.0) / 15.0).clamp(0.0, 1.0);
        let cooling_kw_c = 0.025
            + thermostat
                * config.cooling_multiplier
                * (if self.running { 0.35 } else { 0.06 } + speed.abs() * 0.015);
        let cooling_kw = cooling_kw_c
            * (self.temperature_c - config.ambient_c).max(0.0)
            * (0.45 + self.condition * 0.55);
        let heating_kw = if self.running {
            (3.0 + shaft_kw * 0.55) * config.heat_rate_multiplier
        } else {
            0.0
        };
        let net_heat = (heating_kw - cooling_kw) / config.thermal_capacity_kj_per_c;
        // Thermal recovery allows reduced power while the engine cools.
        let heat_rate = if self.thermal_recovery {
            net_heat.min(if self.running { -0.6 } else { -2.0 })
        } else if self.running {
            net_heat.max(config.min_running_heat_rise_c_s)
        } else {
            net_heat
        };
        let rise = heat_rate.min(config.max_heat_rise_c_s);
        let multiplier = if rise > 0.0 {
            modifiers.heating_load_scale
        } else {
            1.0
        };
        self.temperature_c = (self.temperature_c + rise * multiplier * dt)
            .clamp(config.ambient_c, config.critical_c + 30.0);
        let exposure = ((self.temperature_c - config.overheat_c)
            / (config.critical_c - config.overheat_c))
            .clamp(0.0, 2.0);
        // Heat wear cannot destroy propulsion by itself; collision/weapon damage
        // and an empty fuel tank still have their existing consequences.
        let thermal_floor = self.condition.min(0.1);
        self.condition = (self.condition - exposure * 0.0015 * dt).clamp(thermal_floor, 1.0);
        if self.fuel_liters <= 0.0 || self.condition <= 0.05 {
            self.running = false;
            self.power_multiplier = 0.0;
            self.drive_throttle = 0.0;
        }
        auxiliary
    }

    // Rapier collision impulse / mass is a normal delta-v. Threshold removes
    // standing load and gentle scrapes; cooldown avoids charging one impact
    // repeatedly across its contact solver's substeps.
    pub fn impact_wear(&mut self, delta_v: f32, wear_multiplier: f32, damage_scale: f32) -> f32 {
        if !delta_v.is_finite() || delta_v <= 3.5 || self.impact_cooldown_s > 0.0 {
            return 0.0;
        }
        // Return the accepted wear so callers can observe the impact.
        let damage =
            ((delta_v - 3.5).powi(2) * 0.0025 * wear_multiplier).clamp(0.0, 1.0) * damage_scale;
        self.condition = (self.condition - damage).clamp(0.0, 1.0);
        self.impact_cooldown_s = 0.25;
        damage
    }

    /// Whether ignition is in the startup delay.
    pub fn starting(&self) -> bool {
        self.start_remaining_s > 0.0 && self.engine_requested
    }

    /// Clear the ignition request and its startup latch after servicing.
    pub fn stop_engine(&mut self) {
        self.engine_requested = false;
        self.last_engine_request = false;
        self.start_remaining_s = 0.0;
        self.running = false;
        self.rpm = 0.0;
        self.power_multiplier = 0.0;
        self.drive_throttle = 0.0;
    }
}

#[derive(Clone, Copy, Debug)]
pub struct DriveModifiers {
    /// Fraction of an external auxiliary power source available this step.
    pub auxiliary_fraction: f32,
    /// Fractional change in the speed used to calibrate the driveline ratio.
    pub top_speed_gain: f32,
    /// Fractional increase in output at full auxiliary power.
    pub output_gain: f32,
    /// Extra fuel draw under an external load.
    pub fuel_load_scale: f32,
    /// Extra heat under an external load. Applied only while heating.
    pub heating_load_scale: f32,
}

impl Default for DriveModifiers {
    fn default() -> Self {
        Self {
            auxiliary_fraction: 0.0,
            top_speed_gain: 0.0,
            output_gain: 0.0,
            fuel_load_scale: 1.0,
            heating_load_scale: 1.0,
        }
    }
}
