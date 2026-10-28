//! Small, authoritative cockpit state. Packed requests are sampled with normal
//! input; they never add another physics step, timer, or socket writer.
//! FR-S switch states; Sport relaxes traction limits but is not a VSC yaw model.
#[derive(Clone, Debug)]
pub struct Cockpit {
    pub enabled: bool,
    pub automatic: bool,
    pub gear: u8, // 0=N, 1..6, 7=R, 8=P (automatic only)
    pub parking: bool,
    pub parking_strength: u8, // 0 / 1 / 2 / 3 cable detents
    pub lights: u8, // 0=off, 1=auto running lights, 2=low, 3=high
    pub wipers: u8, // off/low/mid/high, exposed to a vehicle's visual/CAN adapter
    pub washer: bool,
    pub assist: u8, // normal / VSC Sport / TRAC off / TRAC + VSC off
    pub traction_active: bool,
    traction_requested: bool, // Sport supports TRAC on or off independently
    cruise_enabled: bool,
    cruise_target: Option<f32>,
    last_target: Option<f32>,
    rearmed: bool,
    revision: u8,
    rejected: u8,
    last_request: Option<u32>,
    rejected_gear: Option<(u8, bool)>,
}
impl Default for Cockpit {
    fn default() -> Self { Self { enabled:false, automatic:true, gear:1, parking:false, parking_strength:0,
        lights:0, wipers:0, washer:false, assist:0, traction_active:false, traction_requested:true,
        cruise_enabled:false, cruise_target:None, last_target:None, rearmed:false,
        revision:0, rejected:0, last_request:None, rejected_gear:None } }
}
impl Cockpit {
    pub fn receive(&mut self, packed: Option<u32>, speed: f32, traction_requested: bool) {
        let Some(packed) = packed else { return };
        if self.last_request == Some(packed) { return; }
        let first = !self.enabled;
        self.last_request = Some(packed);
        self.enabled = true;
        self.revision = (packed >> 16) as u8;
        self.rejected = 0;
        let command = (packed >> 24) & 15;
        let assist = ((packed >> 4) & 3) as u8;
        if first || command == 1 {
            if assist == 3 && speed.abs() > 0.5 { self.rejected = 1; }
            else { self.assist = assist; self.rearmed = false; self.traction_requested = traction_requested; }
        }
        self.lights = (packed & 3) as u8;
        self.wipers = ((packed >> 2) & 3) as u8;
        self.washer = packed & (1 << 12) != 0;
        let automatic = packed & (1 << 6) != 0;
        let gear = ((packed >> 7) & 15) as u8;
        let selection = (gear, automatic);
        if first || command == 2 || (selection != (self.gear, self.automatic) && self.rejected_gear != Some(selection)) {
            if gear > 8 || (!automatic && gear == 8) { self.rejected = 1; self.rejected_gear = Some(selection); }
            else if (gear == 8 && speed.abs() > 0.5)
                || (gear == 7 && speed > 0.6)
                || (gear > 0 && gear < 7 && speed < -0.6) { self.rejected = 2; self.rejected_gear = Some(selection); }
            else { self.gear = gear; self.automatic = automatic; self.rejected_gear = None; }
        }
        // A separate handbrake lever can latch at any speed; P itself is gated.
        if command == 3 || (self.rejected_gear != Some(selection) && self.rejected == 0) {
            self.parking = packed & (1 << 11) != 0;
            // Old boolean clients imply full tension. New clients send detents
            // in the two high bits, shared with confirmed snapshots.
            self.parking_strength = if self.parking { ((packed >> 30) as u8).max(1) } else { 0 };
            if self.parking && packed >> 30 == 0 { self.parking_strength = 3; }
        }
        let cruise_enabled = packed & (1 << 13) != 0;
        if !cruise_enabled { self.cruise_target = None; self.last_target = None; }
        self.cruise_enabled = cruise_enabled;
        if command == 4 {
            match (packed >> 14) & 3 {
                1 if cruise_enabled && speed >= 30.0 / 3.6 && self.gear != 7 && self.gear != 8 => {
                    let target = speed.min(200.0 / 3.6); self.cruise_target = Some(target); self.last_target = Some(target);
                }
                2 if cruise_enabled && speed >= 20.0 / 3.6 => { self.cruise_target = self.last_target; }
                3 => { self.cruise_target = None; }
                1 | 2 => { self.rejected = 3; }
                _ => {}
            }
        }
    }

    pub fn parked(&self) -> bool { self.enabled && (self.parking || self.gear == 8) }
    pub fn parking_force(&self) -> f32 {
        if !self.enabled { 0.0 } else if self.gear == 8 { 1.0 } else { self.parking_strength as f32 / 3.0 }
    }
    pub fn manual_gear(&self) -> Option<i32> {
        if !self.enabled || (self.automatic && self.gear > 0 && self.gear < 7) { None }
        else { Some(match self.gear { 7 => -1, 8 => 0, gear => gear as i32 }) }
    }
    pub fn tcs_enabled(&self, requested: bool) -> bool {
        if !self.enabled { return requested; }
        match self.assist { 1 => self.traction_requested || self.rearmed, 2 => self.rearmed, 3 => false, _ => true }
    }
    pub fn advance(&mut self, dt: f32, speed: f32, throttle: f32, brake: f32, handbrake: f32, running: bool) -> (f32, f32) {
        if !self.enabled { return (throttle, brake); }
        if !running || brake > 0.01 || handbrake > 0.01 || self.parked() || throttle < -0.01 || speed < -0.1 {
            self.cruise_target = None;
        }
        if !running { self.last_target = None; self.assist = 0; self.traction_requested = true; self.rearmed = false; }
        if dt.is_finite() && dt > 0.0 && dt <= 0.1 {
            if (self.assist == 2 || (self.assist == 1 && !self.traction_requested)) && speed.abs() > 50.0 / 3.6 { self.rearmed = true; }
        }
        if self.gear == 8 { return (0.0, brake); }
        if let Some(target) = self.cruise_target {
            if throttle > 0.1 { return (throttle, brake); }
            let error = target - speed;
            return ((0.04 + error * 0.18).clamp(0.0, 1.0), if error < -1.0 { (-error * 0.1).clamp(0.0, 0.45) } else { brake });
        }
        (throttle, brake)
    }
    pub fn headlights(&self, running: bool) -> bool { self.lights >= 2 || (self.lights == 1 && running) }
    pub fn cluster_mask(&self, handbrake: f32) -> u16 {
        (if self.enabled && self.lights == 3 { 1 << 3 } else { 0 })
            | (if self.cruise_enabled { 1 << 2 } else { 0 })
            | (if self.parked() || handbrake > 0.05 { 1 << 9 } else { 0 })
            | (if self.traction_active { 1 << 10 } else { 0 })
    }
    pub fn snapshot(&self) -> u32 {
        (self.lights as u32) | ((self.wipers as u32) << 2) | ((self.assist as u32) << 4)
            | ((self.automatic as u32) << 6) | ((self.gear as u32) << 7) | ((self.parking as u32) << 11)
            | ((self.washer as u32) << 12) | ((self.cruise_enabled as u32) << 13) | ((self.revision as u32) << 16)
            | ((self.cruise_target.is_some() as u32) << 24) | ((self.rearmed as u32) << 25)
            | ((self.parked() as u32) << 26) | ((self.rejected as u32) << 28)
            | ((self.enabled as u32) << 27)
            | ((self.parking_strength as u32) << 30)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn packet(gear:u32, automatic:bool, assist:u32, command:u32, revision:u32) -> u32 {
        (gear << 7) | ((automatic as u32) << 6) | (assist << 4) | (command << 24) | (revision << 16)
    }
    #[test] fn rejected_park_does_not_execute_when_an_unrelated_wiper_request_arrives_later() {
        let mut c=Cockpit::default();let p=packet(8,true,0,2,1)|(1<<11);
        c.receive(Some(p),15.0,true);assert!(!c.parked());
        let w=(p&0xffffff)|(7<<24)|(1<<2)|(1<<16);
        c.receive(Some(w),0.0,true);assert!(!c.parked());assert_eq!(c.wipers,1);
        c.receive(Some(packet(8,true,0,2,3)|(1<<11)),0.0,true);assert!(c.parked());
    }
    #[test] fn washer_release_and_fractional_parking_are_independent_of_gears_and_cruise() {
        let mut c=Cockpit::default();
        for level in 1..=3 {
            let p=packet(1,true,0,3,level)|(1<<12)|(1<<11)|(level<<30);
            c.receive(Some(p),0.0,true);assert!(c.washer);assert_eq!(c.parking_force(),level as f32/3.0);
            assert_eq!(c.snapshot()>>30,level);assert_eq!((c.snapshot()>>28)&3,0);
        }
        c.receive(Some(packet(1,true,0,4,5)|(3<<14)|(1<<11)|(2<<30)),0.0,true);
        assert!(!c.washer);assert_eq!(c.parking_force(),2.0/3.0);
        assert_eq!(c.advance(1.0/120.0,0.0,1.0,0.0,0.0,true).0,1.0);
        c.receive(Some(packet(1,true,0,3,6)),0.0,true);assert_eq!(c.parking_force(),0.0);
    }
    #[test] fn old_boolean_parking_packets_still_mean_full_cable_tension() {
        let mut c=Cockpit::default();c.receive(Some(packet(1,true,0,3,1)|(1<<11)),0.0,true);
        assert_eq!(c.parking_force(),1.0);assert_eq!(c.parking_strength,3);
    }
    #[test] fn legacy_controls_are_unchanged() {
        let mut c=Cockpit::default();c.receive(None,20.0,true);
        assert_eq!(c.advance(1.0/120.0,20.0,0.8,0.2,0.0,true),(0.8,0.2));
        assert!(c.tcs_enabled(true));assert!(!c.tcs_enabled(false));assert_eq!(c.manual_gear(),None);
    }
    #[test] fn park_and_reverse_are_rejected_at_speed_and_commands_are_deduplicated() {
        let mut c=Cockpit::default();let p=packet(8,true,0,2,1);c.receive(p.into(),15.0,true);
        assert_eq!(c.gear,1);assert!(!c.parked());assert_eq!((c.snapshot()>>28)&3,2);
        c.receive(p.into(),0.0,true);assert!(!c.parked());
        c.receive(packet(8,true,0,2,2).into(),0.0,true);assert!(c.parked());assert_eq!(c.parking_force(),1.0);
        c.receive(packet(7,false,0,2,3).into(),10.0,true);assert_eq!(c.gear,8);
        c.receive(packet(7,false,0,2,4).into(),0.0,true);assert_eq!(c.manual_gear(),Some(-1));
    }
    #[test] fn sport_preserves_independent_trac_setting_instead_of_disabling_it_for_one_launch() {
        let mut c=Cockpit::default();c.receive(packet(1,true,1,1,1).into(),0.0,true);
        for _ in 0..120 { c.advance(1.0/120.0,1.0,1.0,0.0,0.0,true);assert!(c.tcs_enabled(false)); }
        c.receive(packet(1,true,1,1,2).into(),0.0,false);assert!(!c.tcs_enabled(true));assert_eq!(c.assist,1);
        c.advance(1.0/120.0,14.0,0.4,0.0,0.0,true);assert!(c.tcs_enabled(false));assert_eq!(c.assist,1);
        c.advance(1.0/120.0,1.0,0.4,0.0,0.0,true);assert!(c.tcs_enabled(false));
    }
    #[test] fn traction_off_rearms_at_fifty_kmh_but_full_off_requires_stop_and_does_not_rearm_at_speed() {
        let mut c=Cockpit::default();c.receive(packet(1,true,2,1,1).into(),0.0,false);
        c.advance(1.0/120.0,13.8,0.4,0.0,0.0,true);assert!(!c.tcs_enabled(true));
        c.advance(1.0/120.0,14.0,0.4,0.0,0.0,true);assert!(c.tcs_enabled(false));
        c.receive(packet(1,true,3,1,2).into(),4.0,false);assert_eq!(c.assist,2);assert_eq!((c.snapshot()>>28)&3,1);
        c.receive(packet(1,true,3,1,3).into(),0.0,false);assert!(!c.tcs_enabled(true));
        c.advance(1.0/120.0,20.0,0.4,0.0,0.0,true);assert!(!c.tcs_enabled(true));
    }
    #[test] fn ignition_off_restores_normal_assists_and_unrelated_stale_requests_do_not_reenable_sport() {
        let mut c=Cockpit::default();c.receive(packet(1,true,3,1,1).into(),0.0,false);
        c.advance(1.0/120.0,0.0,0.0,0.0,0.0,false);assert_eq!(c.assist,0);assert!(c.tcs_enabled(false));
        c.receive(packet(1,true,3,7,2).into(),0.0,false);assert_eq!(c.assist,0);
        c.receive(packet(1,true,1,1,3).into(),0.0,true);assert_eq!(c.assist,1);
    }
    #[test] fn cruise_requires_speed_and_cancels_for_brakes_or_engine_off() {
        let mut c=Cockpit::default();let p=packet(1,true,0,4,1)|(1<<13)|(1<<14);
        c.receive(p.into(),0.0,true);assert!(c.cruise_target.is_none());assert_eq!((c.snapshot()>>28)&3,3);
        c.receive((p+(1<<16)).into(),15.0,true);assert_eq!(c.cruise_target,Some(15.0));
        assert!(c.advance(1.0/120.0,13.0,0.0,0.0,0.0,true).0>0.0);
        c.advance(1.0/120.0,15.0,0.0,0.2,0.0,true);assert!(c.cruise_target.is_none());
        c.receive((packet(1,true,0,4,3)|(1<<13)|(2<<14)).into(),15.0,true);assert!(c.cruise_target.is_some());
        c.advance(1.0/120.0,15.0,0.0,0.0,0.0,false);assert!(c.cruise_target.is_none());
    }
}
