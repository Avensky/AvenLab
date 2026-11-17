//! Server-authoritative first-pass naval handling. The water surface is an
//! authored volume, not a hidden collision floor. Cars still sink; ships do
//! not inherit the four tire rays, ABS, grip, or tank pivot-turn solver.
use rapier3d::prelude::*;
use avenlab_physics::watercraft::{HullConfig, apply_hull_forces};
use crate::physics::PhysicsWorld;
use crate::powertrain::Demand;
use crate::vehicle_state::VehicleStateFlags;

pub const RESCUE_SHIP_ID:&str = "hawaii-rescue";
pub const BATTLESHIP_ID:&str = "louisiana";
pub fn is_ship(id:&str)->bool {matches!(id,RESCUE_SHIP_ID|BATTLESHIP_ID)}

impl PhysicsWorld {
    pub(crate) fn apply_watercraft_forces(&mut self, dt:Real) {
        for (id, vehicle) in self.vehicles.iter_mut() {
            let cfg=vehicle.config;
            if cfg.wheels!=0 {continue;}
            let Some(body)=self.bodies.get_mut(vehicle.body) else {continue};
            let surface=self.coast.as_ref().and_then(|coast|
                coast.water_surface_at(body.translation().x,body.translation().z));
            let longitudinal = body.linvel().dot(&(body.rotation() * Vector::z()));
            let disabled=self.vehicle_health.get(id).is_some_and(|health|health.defeated);
            let (throttle,brake)=if disabled {(0.0,1.0)}else{
                vehicle.cockpit.advance(dt,longitudinal,vehicle.throttle,vehicle.brake,
                    vehicle.handbrake,vehicle.powertrain.running)
            };
            vehicle.powertrain.boost_requested=false;
            if !disabled {
                vehicle.powertrain.advance(cfg.resources,Demand{
                    throttle,longitudinal_speed:longitudinal,wheel_radius:cfg.wheel_radius,
                    engine_force:cfg.engine_force,top_speed:cfg.max_speed,
                },dt);
            }
            vehicle.powertrain.boost_active=false;
            vehicle.vehicle_flags.set(VehicleStateFlags::ENGINE_ON,vehicle.powertrain.running);
            vehicle.vehicle_flags.remove(VehicleStateFlags::BOOST);
            let Some(water_y)=surface else {continue};

            let running = vehicle.powertrain.running && !vehicle.powertrain.thermal_recovery && !disabled;
            apply_hull_forces(
                body,
                HullConfig { mass_kg: cfg.mass, thrust_n: cfg.engine_force, top_speed_m_s: cfg.max_speed },
                water_y,
                if running { throttle } else { 0.0 },
                brake,
                if running { vehicle.steer } else { 0.0 },
            );
        }
    }


    /// Short-range deck capture assist. A player who actually touches the
    /// floating deck loses relative horizontal velocity gradually. Nothing
    /// teleports or locks the body, so a deliberate jump can still clear it.
    pub(crate) fn apply_naval_deck_brake(&mut self) {
        let decks:Vec<_>=self.vehicles.values()
            .filter(|v|v.config.wheels==0)
            .filter_map(|v|self.bodies.get(v.body)
                .map(|b|(*b.translation(),*b.rotation(),*b.linvel(),v.config.chassis_half_extents)))
            .collect();
        if decks.is_empty(){return;}
        for (id,vehicle) in &self.vehicles {
            if vehicle.config.wheels==0 || self.vehicle_health.get(id).is_some_and(|h|h.defeated){continue;}
            let Some(body)=self.bodies.get_mut(vehicle.body) else {continue};
            let center=*body.translation();
            for (ship_pos,ship_rotation,ship_speed,hull) in &decks {
                let local=ship_rotation.inverse()*(center-*ship_pos);
                let deck=hull[1];
                let car_half=vehicle.config.chassis_half_extents;
                if local.x.abs()>hull[0]-car_half[0] || local.z.abs()>hull[2]-car_half[2]
                    || !(deck+car_half[1]-1.0..=deck+car_half[1]+2.0).contains(&local.y){continue;}
                let delta=*body.linvel()-*ship_speed;
                let match_velocity=vector![-delta.x*vehicle.config.mass*7.0,0.0,-delta.z*vehicle.config.mass*7.0];
                body.add_force(match_velocity,true);
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ship_buoyancy_keeps_a_floating_hull_near_the_authored_water_line(){
        let mut world=PhysicsWorld::for_harbor_room(2,"harbor_canal_fleet").unwrap();
        let body=world.spawn_vehicle_for_player("captain".into(),[0.0;3],RESCUE_SHIP_ID,"red").unwrap();
        assert!(world.wheels[&body].is_empty());
        for _ in 0..300 {world.step(crate::physics::SIMULATION_DT);}
        let y=world.bodies[body].translation().y;
        assert!((y-(-8.0+2.0)).abs()<3.0,"hull buoyancy drifted to {y}");
        assert!(!world.vehicle_health["captain"].defeated);
    }

    #[test]
    fn ships_need_a_navigable_harbor_and_a_free_berth(){
        let mut world=PhysicsWorld::for_harbor_room(2,"harbor_canal_fleet").unwrap();
        world.spawn_vehicle_for_player("first".into(),[0.;3],RESCUE_SHIP_ID,"red").unwrap();
        assert!(world.spawn_vehicle_for_player("second".into(),[0.;3],RESCUE_SHIP_ID,"red").is_err());
        assert!(world.spawn_vehicle_for_player("blue".into(),[0.;3],RESCUE_SHIP_ID,"blue").is_ok());
    }
}
