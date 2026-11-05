//! Optional lumped tire model. Simulation seconds, degrees C, gauge PSI.
//! Tuned gameplay model, not measured data for a particular tire compound.
use crate::physics::PhysicsWorld;
pub fn server_default() -> bool {
    std::env::var("AVENLAB_TIRE_THERMALS").ok().is_some_and(|s| matches!(s.as_str(), "1" | "true" | "on"))
}
#[derive(Clone, Copy, Debug)]
pub struct TireThermal { pub temp_c: f32, pub psi: f32, pub grip: f32 }
impl Default for TireThermal {
    fn default() -> Self { Self { temp_c:25.0, psi:32.0, grip:0.9 } }
}
impl TireThermal {
    /// One inexpensive update at ~10 Hz. The force solver reuses the last grip.
    pub fn step(&mut self, dt:f32, ambient:f32, speed:f32, load:f32, scrub:f32, braking:f32) {
        let speed=speed.abs().min(90.0);
        let gain=load.clamp(0.0,2.5)*(0.006*speed+0.20*scrub.abs().min(18.0)+0.055*braking.clamp(0.0,1.0)*speed);
        let cooling=(self.temp_c-ambient)*(0.012+0.00045*speed);
        self.temp_c=(self.temp_c+(gain-cooling)*dt).clamp(-30.0,155.0);
        // Constant-volume absolute pressure referenced to 32 PSI gauge at 25 C.
        self.psi=((32.0+14.7)*(self.temp_c+273.15)/298.15)-14.7;
        let cold=((60.0-self.temp_c)/40.0).clamp(0.0,1.0);
        let hot=((self.temp_c-80.0)/65.0).clamp(0.0,1.0);
        let inflation=(1.0-0.008*(self.psi-37.0).abs()).clamp(0.84,1.0);
        self.grip=((1.0-0.075*cold-0.24*hot)*inflation).clamp(0.65,1.0);
    }
}
impl PhysicsWorld {
    pub fn set_tire_thermals(&mut self, enabled:bool) {
        if self.tire_thermals==enabled {return;}
        self.tire_thermals=enabled;
        self.tire_sample_elapsed=0.0;
        for wheel in self.wheels.values_mut().flatten() { wheel.thermal=TireThermal::default(); }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sustained_scrub_heats_and_inflates_then_unloaded_tire_cools() {
        let mut tire=TireThermal::default(); let cold=tire;
        for _ in 0..500 {tire.step(0.1,25.0,30.0,1.1,8.0,0.7);}
        assert!(tire.temp_c>cold.temp_c+20.0 && tire.psi>cold.psi+2.0);
        let warm=tire;
        for _ in 0..5000 {tire.step(0.1,25.0,0.0,0.0,0.0,0.0);}
        assert!(tire.temp_c<warm.temp_c && (tire.psi-32.0).abs()<0.1);
        for _ in 0..3000 {tire.step(0.1,25.0,70.0,2.0,18.0,1.0);}
        assert!(tire.grip<warm.grip && tire.grip>=0.65 && tire.temp_c<=155.0);
    }
}

#[cfg(test)]
mod integration {
    use crate::{physics::{PhysicsWorld,SIMULATION_DT}, tire_thermals::TireThermal};
    use rapier3d::prelude::*;
    #[test]
    fn wheeled_contacts_heat_but_tracks_and_disabled_worlds_bypass_the_model() {
        let mut world=PhysicsWorld::new();
        world.select_map("road_precision").unwrap();
        let car=world.spawn_vehicle_for_player("car".into(),[0.0;3],"brz","red").unwrap();
        let tank=world.spawn_vehicle_for_player("tank".into(),[0.0;3],"tank","blue").unwrap();
        world.set_tire_thermals(true);
        world.bodies[car].set_linvel(vector![8.0,0.0,15.0],true);
        for _ in 0..120 {world.step(SIMULATION_DT);}
        assert!(world.wheels[&car].iter().any(|w|w.thermal.temp_c>25.001));
        assert!(world.wheels[&tank].iter().all(|w|w.thermal.temp_c==25.0));
        world.set_tire_thermals(false);
        for _ in 0..30 {world.step(SIMULATION_DT);}
        assert!(world.wheels[&car].iter().all(|w|w.thermal.temp_c==TireThermal::default().temp_c));
    }
}
