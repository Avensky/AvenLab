//! Server-owned support pulses and clearance for Dive Shield's forward blink.
use crate::{alpha::policy::{self, Role}, physics::PhysicsWorld};
use rapier3d::{parry::query::ShapeCastOptions, prelude::*};

pub const PULSE_SECONDS: f32 = 1.0;
pub const REPAIR_HP: f32 = 5.0;
pub const REFUEL_LITERS: f32 = 0.08;
pub const SERVICE_RADIUS: f32 = 12.0;
pub const BLINK_DISTANCE: f32 = 12.0;
pub const STRESS_SECONDS: f32 = 6.0;
pub const FUEL_MULTIPLIER: f32 = 1.6;
pub const HEAT_MULTIPLIER: f32 = 1.5;

impl PhysicsWorld {
    pub(crate) fn advance_field_service(&mut self, dt: f32, connected: impl Fn(&str) -> bool) {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 { return; }
        self.support.service_elapsed += dt;
        if self.support.service_elapsed + 1e-5 < PULSE_SECONDS { return; }
        self.support.service_elapsed = (self.support.service_elapsed - PULSE_SECONDS).max(0.0);
        let eligible = |id: &str| connected(id) && self.vehicle_health.get(id)
            .is_some_and(|h| !h.defeated && h.hp > 0.0);
        let mechanics: Vec<_> = self.trusted_heroes.iter().filter_map(|(id, hero)| {
            let car = self.vehicles.get(id)?;
            let role = policy::hero(hero).ok()?;
            (eligible(id) && role.role == Role::Support)
                .then(|| (id, car.team.as_str(), *self.bodies[car.body].translation()))
        }).collect();
        if mechanics.is_empty() { return; }
        let mut jobs = Vec::new();
        for (id, car) in &self.vehicles {
            if !eligible(id) { continue; }
            let health = &self.vehicle_health[id];
            if health.hp >= health.max_hp && car.powertrain.fuel_liters >= car.config.resources.fuel_capacity_liters { continue; }
            let point = self.bodies[car.body].translation();
            // One provider per target. Distance, then player ID, makes ties stable.
            let source = mechanics.iter().filter(|(_,team,_)| *team == car.team)
                .filter_map(|(who,_,pos)| {
                    let distance = (*pos - point).norm_squared();
                    (distance <= SERVICE_RADIUS * SERVICE_RADIUS &&
                        (*who == id || self.health_pack_line_of_sight(who, id))).then_some((distance,*who))
                }).min_by(|a,b| a.0.total_cmp(&b.0).then_with(|| a.1.cmp(b.1)));
            if let Some((_, who)) = source { jobs.push((who.clone(), id.clone())); }
        }
        for (who,id) in jobs {
            if who == id {
                let h = self.vehicle_health.get_mut(&id).unwrap();
                let gain = REPAIR_HP.min((h.max_hp - h.hp).max(0.0));
                h.hp += gain;
                h.stats.self_healing += gain;
                h.stats.healing_done += gain;
            } else if self.vehicle_health[&id].hp < self.vehicle_health[&id].max_hp {
                self.credit_ally_repair(&who, &id, REPAIR_HP);
            }
            let car = self.vehicles.get_mut(&id).unwrap();
            let gain = REFUEL_LITERS.min((car.config.resources.fuel_capacity_liters - car.powertrain.fuel_liters).max(0.0));
            car.powertrain.fuel_liters += gain;
            self.vehicle_health.get_mut(&id).unwrap().stats.gas_gained_liters += gain;
        }
    }

    pub(crate) fn dive_destination(&mut self, player: &str) -> Result<Vector<Real>, String> {
        let handle = self.vehicles[player].body;
        let body = &self.bodies[handle];
        let nose = body.rotation() * Vector::z();
        let forward = vector![nose.x, 0.0, nose.z].try_normalize(0.01)
            .ok_or("Level the vehicle before blinking.")?;
        self.query_pipeline.update(&self.colliders);
        let filter = QueryFilter::default().exclude_rigid_body(handle).exclude_sensors();
        let mut distance = BLINK_DISTANCE;
        for id in body.colliders() {
            let collider = &self.colliders[*id];
            if collider.is_sensor() { continue; }
            let options = ShapeCastOptions { max_time_of_impact: distance, stop_at_penetration: false, ..Default::default() };
            if let Some((_, hit)) = self.query_pipeline.cast_shape(&self.bodies, &self.colliders, collider.position(),
                &forward, collider.shape(), options, filter) {
                distance = (hit.time_of_impact - 0.12).max(0.0);
            }
        }
        if distance < 0.5 { return Err("Dive path blocked.".into()); }
        Ok(body.translation() + forward * distance)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::support::tests::{blank_world,place};

    #[test]
    fn pulse_applies_once_to_living_friends_and_self() {
        for (hero, chassis) in [("mechanic","fortuner"),("cx30","cx30"),("logistics","landcruiser")] {
            let mut w=blank_world();
            for (n,id,car,team) in [(0,"medic",chassis,"red"),(1,"ally","brz","red"),(2,"other","mini","blue"),(3,"far","brz","red")] {
                w.spawn_vehicle_for_player(id.into(),[0.0;3],car,team).unwrap();
                place(&mut w,id,n as f32*7.0,0.0);
                w.vehicle_health.get_mut(id).unwrap().hp=100.0;
                w.vehicles.get_mut(id).unwrap().powertrain.fuel_liters=1.0;
            }
            w.set_assigned_hero("medic",hero);
            for _ in 0..60 {w.advance_field_service(1.0/60.0,|_|true);}
            for id in ["medic","ally"] {assert_eq!(w.vehicle_health[id].hp,105.0);assert!((w.vehicles[id].powertrain.fuel_liters-1.08).abs()<1e-4);}
            for id in ["far","other"] {assert_eq!(w.vehicle_health[id].hp,100.0);}
            w.set_assigned_hero("ally","mechanic");
            for _ in 0..60 {w.advance_field_service(1.0/60.0,|id|id!="far");}
            assert_eq!(w.vehicle_health["ally"].hp,110.0);
            w.vehicle_health.get_mut("ally").unwrap().defeated=true;
            for _ in 0..60 {w.advance_field_service(1.0/60.0,|_|true);}
            assert_eq!(w.vehicle_health["ally"].hp,110.0);
        }
    }
    #[test]
    fn forward_blink_respects_chassis_clearance_and_failed_cast_costs_nothing() {
        let mut w=blank_world();
        let body=w.spawn_vehicle_for_player("medic".into(),[0.0;3],"fortuner","red").unwrap();
        w.set_assigned_hero("medic","mechanic");place(&mut w,"medic",0.0,0.0);
        w.bodies[body].set_rotation(Rotation::identity(),true);
        w.bodies.propagate_modified_body_positions_to_colliders(&mut w.colliders);
        let wall=w.colliders.insert(ColliderBuilder::cuboid(4.0,4.0,0.1).translation(vector![0.0,2.0,8.0]).build());
        w.start_dive_shield("medic").unwrap();
        assert!(w.bodies[body].translation().z>1.0 && w.bodies[body].translation().z<7.0);
        assert!(w.guard_view("medic").dive_remaining_s>0.0);
        assert_eq!(w.vehicles["medic"].powertrain.blink_stress_s,STRESS_SECONDS);
        w.guard_boosts.get_mut("medic").unwrap().dive_cooldown=0.0;
        assert!(w.start_dive_shield("medic").is_err());
        assert_eq!(w.guard_view("medic").dive_cooldown_s,0.0);
        w.colliders.get_mut(wall).unwrap().set_enabled(false);
        let before=w.bodies[body].translation().z;
        w.start_dive_shield("medic").unwrap();
        assert!((w.bodies[body].translation().z-before-BLINK_DISTANCE).abs()<1e-4);
    }
}
