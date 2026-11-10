//! Select the tire model and reset its wheel state when a world changes mode.
pub use crate::aven_tire::thermal::TireThermal;
use crate::physics::PhysicsWorld;
pub fn server_default() -> bool {
    std::env::var("AVENLAB_TIRE_THERMALS").ok().is_some_and(|s| matches!(s.as_str(), "1" | "true" | "on"))
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
