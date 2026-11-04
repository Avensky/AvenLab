//! World-local combat health and life transitions. Client packets never provide
//! damage or HP. Defeat keeps entity/body identity stable until safe respawn.
use crate::{physics::PhysicsWorld,vehicle_state::VehicleStateFlags};

impl PhysicsWorld {
    pub(crate) fn is_defeated(&self,player:&str)->bool {
        self.vehicle_health.get(player).is_some_and(|h|h.defeated)
    }

    /// Friendly weapon/Ram HP damage is disabled for this alpha. Physical
    /// collisions still resolve normally; unattributed world impacts can hurt.
    pub(crate) fn damage_vehicle(&mut self,victim:&str,attacker:Option<&str>,amount:f32,kind:&str)->bool {
        let Some(target)=self.vehicles.get(victim) else{return false};
        if let Some(source)=attacker {
            let Some(shooter)=self.vehicles.get(source) else{return false};
            if source==victim||shooter.team.eq_ignore_ascii_case(&target.team)||self.is_defeated(source){return false;}
        }
        self.apply_validated_vehicle_damage(victim,attacker,amount,kind)
    }

    /// Impact batches validate all attackers before resolving reciprocal lethal
    /// hits. This path preserves that simultaneous policy and credits one event.
    pub(crate) fn apply_validated_vehicle_damage(&mut self,victim:&str,attacker:Option<&str>,amount:f32,kind:&str)->bool {
        if self.dive_protected(victim){return false;}
        let amount=amount*if self.ctf_carriers.contains(victim){crate::ctf::CARRIER_DAMAGE_FACTOR}else{1.0};
        let amount=self.absorb_guard_damage(victim,attacker,amount,kind);
        let Some(health)=self.vehicle_health.get_mut(victim) else{return false};
        let before=health.hp;let maximum=health.max_hp;
        let defeated=health.apply_damage(amount,attacker,kind);
        let dealt=before-health.hp;
        if dealt<=0.0{return false;}
        if let Some(source)=attacker {health.note_contributor(source);}
        let assists=if defeated {health.take_assist_candidates(attacker)}else{Vec::new()};
        if let Some(source)=attacker {
            if let Some(vehicle)=self.vehicles.get_mut(source){vehicle.powertrain.credit_damage_dealt(dealt/maximum);}
            if let Some(health)=self.vehicle_health.get_mut(source){
                health.note_damage_dealt(dealt);
                if defeated {health.credit_kill();}
            }
        }
        for assistant in assists {
            let enemy=self.vehicles.get(&assistant).zip(self.vehicles.get(victim)).is_some_and(|(source,target)|assistant!=victim&&!source.team.eq_ignore_ascii_case(&target.team));
            if enemy {if let Some(h)=self.vehicle_health.get_mut(&assistant){h.stats.assists=h.stats.assists.saturating_add(1);}}
        }
        if defeated {self.freeze_disabled_vehicle(victim);}
        defeated
    }

    fn freeze_disabled_vehicle(&mut self,player:&str){
        self.suspend_shields(player);
        if let Some(vehicle)=self.vehicles.get_mut(player){
            vehicle.throttle=0.0;vehicle.steer=0.0;vehicle.brake=0.0;vehicle.handbrake=0.0;
            vehicle.pitch=0.0;vehicle.yaw=0.0;vehicle.roll=0.0;vehicle.ascend=0.0;vehicle.player_flags=0;
            vehicle.ram.cancel();vehicle.ram.requested=false;
            vehicle.powertrain.boost_requested=false;vehicle.powertrain.boost_active=false;vehicle.powertrain.running=false;
            vehicle.powertrain.rpm=0.0;vehicle.powertrain.engine_torque_nm=0.0;vehicle.powertrain.power_multiplier=0.0;
            vehicle.vehicle_flags.remove(VehicleStateFlags::BOOST|VehicleStateFlags::ENGINE_ON);
            if let Some(body)=self.bodies.get_mut(vehicle.body){
                if let Some(health)=self.vehicle_health.get_mut(player){health.downed_position=Some([body.translation().x,body.translation().y,body.translation().z]);}
                body.set_linvel(rapier3d::prelude::Vector::zeros(),false);body.set_angvel(rapier3d::prelude::Vector::zeros(),false);
                body.reset_forces(false);body.reset_torques(false);body.set_enabled(false);
                for handle in body.colliders(){if let Some(c)=self.colliders.get_mut(*handle){c.set_enabled(false);}}
            }
        }
        if let Some(combat)=self.combat_poses.get_mut(player){combat.enabled=false;combat.fire=false;combat.ram=false;}
        self.ctf_carriers.remove(player);
        self.ctf_reset_players.insert(player.into());
        self.query_pipeline.update(&self.colliders);
    }

    /// Restore a reserved player's rescue window on a fresh physics body.
    /// Scores stay fresh: the departed body's totals belong to its journal
    /// source, so copying them would duplicate career statistics on reconnect.
    pub fn restore_downed_lifecycle(&mut self,player:&str,state:&crate::vehicle_health::DownedLifecycle)->Result<(),String>{
        if !["combat","fuel"].contains(&state.disabled_reason.as_str())||!state.hp_fraction.is_finite()||!(0.0..=1.0).contains(&state.hp_fraction)||!state.remaining_s.is_finite()||!state.recovery_window_s.is_finite()||state.recovery_window_s<=0.0||state.recovery_window_s>60.0||state.remaining_s>state.recovery_window_s {
            return Err("Invalid retained recovery state.".into());
        }
        if state.position.is_some_and(|p|!p.iter().all(|v|v.is_finite()&&v.abs()<=100000.0)){return Err("Invalid retained recovery position.".into());}
        let health=self.vehicle_health.get(player).ok_or("Vehicle health unavailable")?;
        if health.defeated{return Err("The vehicle already has a recovery window.".into());}
        let body=self.vehicles.get(player).ok_or("Vehicle unavailable")?.body;
        if let Some(position)=state.position {
            let body=self.bodies.get_mut(body).ok_or("Vehicle body unavailable")?;
            body.set_translation(rapier3d::prelude::Vector::new(position[0],position[1],position[2]),false);
        }
        self.freeze_disabled_vehicle(player);
        // A fresh-body factory tank must not erase the fuel-empty cause while
        // its retained recovery window is still pending.
        if state.disabled_reason=="fuel" {self.vehicles.get_mut(player).unwrap().powertrain.fuel_liters=0.0;}
        let health=self.vehicle_health.get_mut(player).unwrap();health.defeated=true;
        health.hp=if state.disabled_reason=="combat"{0.0}else{health.max_hp*state.hp_fraction};
        health.disabled_reason=state.disabled_reason.clone();health.recovery_window_s=state.recovery_window_s;
        health.respawn_remaining_s=state.remaining_s.max(0.0);health.spawn_protection_s=0.0;
        self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);self.query_pipeline.update(&self.colliders);
        Ok(())
    }

    /// Transport/profile/hero authority is checked by the server adapter. These
    /// world-local invariants are checked again before any physical transition.
    pub fn revive_vehicle_at_current_location(&mut self,actor:&str,target:&str)->Result<(),String>{
        if actor==target{return Err("A mechanic cannot revive itself.".into());}
        let source=self.vehicles.get(actor).ok_or("Mechanic vehicle unavailable")?;
        let victim=self.vehicles.get(target).ok_or("Disabled vehicle unavailable")?;
        if !source.team.eq_ignore_ascii_case(&victim.team){return Err("Only teammates can be revived.".into());}
        let actor_health=self.vehicle_health.get(actor).ok_or("Mechanic health unavailable")?;
        if actor_health.defeated{return Err("A disabled mechanic cannot revive.".into());}
        if actor_health.revive_cooldown_s>0.0{return Err("Mechanic revive is cooling down.".into());}
        let health=self.vehicle_health.get(target).ok_or("Disabled health unavailable")?;
        if !health.defeated||health.respawn_remaining_s<=0.0{return Err("The recovery window has ended.".into());}
        let a=self.bodies.get(source.body).ok_or("Mechanic body unavailable")?;
        let b=self.bodies.get(victim.body).ok_or("Disabled body unavailable")?;
        let delta=a.translation()-b.translation();
        if !delta.iter().all(|v|v.is_finite())||delta.x*delta.x+delta.z*delta.z>crate::vehicle_health::REVIVE_RANGE_METERS.powi(2)||delta.y.abs()>4.0{return Err("Move within 8 metres of the disabled teammate.".into());}
        if a.linvel().norm()>3.0{return Err("Slow down before reviving a teammate.".into());}
        self.validate_revive_placement(target)?;
        let target_vehicle=self.vehicles.get_mut(target).unwrap();let handle=target_vehicle.body;
        let before_fuel=target_vehicle.powertrain.fuel_liters;
        target_vehicle.powertrain.fuel_liters=before_fuel.max(target_vehicle.config.resources.fuel_capacity_liters*0.10);
        let fuel_gained=target_vehicle.powertrain.fuel_liters-before_fuel;
        target_vehicle.powertrain.condition=target_vehicle.powertrain.condition.max(0.2);
        target_vehicle.powertrain.engine_requested=true;target_vehicle.powertrain.running=true;target_vehicle.powertrain.rpm=target_vehicle.config.resources.idle_rpm;
        target_vehicle.powertrain.boost_requested=false;target_vehicle.powertrain.boost_active=false;
        target_vehicle.vehicle_flags.insert(VehicleStateFlags::ENGINE_ON);target_vehicle.vehicle_flags.remove(VehicleStateFlags::BOOST);
        target_vehicle.throttle=0.0;target_vehicle.steer=0.0;target_vehicle.brake=0.0;target_vehicle.handbrake=0.0;target_vehicle.player_flags=0;
        target_vehicle.ram.cancel();target_vehicle.ram.requested=false;
        let health=self.vehicle_health.get_mut(target).unwrap();let (combat,healed)=health.revive();let maximum_hp=health.max_hp;health.stats.gain_fuel(fuel_gained);
        let health=self.vehicle_health.get_mut(actor).unwrap();health.revive_cooldown_s=crate::vehicle_health::REVIVE_COOLDOWN_SECONDS;health.spawn_protection_s=0.0;
        health.stats.healing_done=(health.stats.healing_done+healed).min(f32::MAX);
        if combat {health.stats.resurrections=health.stats.resurrections.saturating_add(1);}
        if let Some(vehicle)=self.vehicles.get_mut(actor){vehicle.powertrain.credit_teammate_healing(healed,maximum_hp);}
        if let Some(body)=self.bodies.get_mut(handle){body.set_enabled(true);body.set_linvel(rapier3d::prelude::Vector::zeros(),true);body.set_angvel(rapier3d::prelude::Vector::zeros(),true);for h in body.colliders(){if let Some(c)=self.colliders.get_mut(*h){c.set_enabled(true);}}}
        self.combat_poses.remove(target);self.combat_sequences.remove(target);
        self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);self.query_pipeline.update(&self.colliders);
        Ok(())
    }

    /// Only an accepted ally-health-pack arrival calls this. It cannot revive,
    /// heal self/enemies, award overhealing, or turn healing into self-repair.
    pub(crate) fn heal_living_ally(&mut self,actor:&str,target:&str,amount:f32)->Result<f32,String>{
        if !amount.is_finite()||amount<=0.0{return Err("Invalid healing amount.".into());}
        if !self.health_pack_pair_valid(actor,target,40.0,8.0)||!self.health_pack_line_of_sight(actor,target){return Err("The injured teammate is no longer reachable.".into());}
        let health=self.vehicle_health.get_mut(target).ok_or("Teammate health unavailable.")?;
        let maximum=health.max_hp;
        let healed=amount.min((maximum-health.hp).max(0.0));
        if healed<=0.0{return Ok(0.0);}
        health.hp=(health.hp+healed).min(maximum);
        if let Some(health)=self.vehicle_health.get_mut(actor){health.stats.healing_done=(health.stats.healing_done+healed).min(f32::MAX);}
        if let Some(vehicle)=self.vehicles.get_mut(actor){vehicle.powertrain.credit_teammate_healing(healed,maximum);}
        Ok(healed)
    }

    /// Runtime supplies connected client IDs. Retained practice bodies keep
    /// their charge while detached instead of farming through another player.
    pub(crate) fn advance_passive_ultimates<'a>(&mut self, dt:f32, active:impl Iterator<Item=&'a str>) {
        if !dt.is_finite() || dt <= 0.0 || dt > 0.1 { return; }
        for id in active {
            if !self.vehicle_health.get(id).is_some_and(|h| !h.defeated && h.hp > 0.0) { continue; }
            let Some(vehicle) = self.vehicles.get_mut(id) else { continue; };
            if self.bodies.get(vehicle.body).is_some_and(|body| body.is_enabled()) {
                vehicle.powertrain.advance_passive_ultimate(dt);
            }
        }
    }

    pub(crate) fn advance_vehicle_lives(&mut self,dt:f32){
        if !dt.is_finite()||dt<=0.0{return;}
        let empty:Vec<_>=self.vehicles.iter().filter(|(id,v)|!self.is_defeated(id)&&v.config.resources.fuel_capacity_liters.is_finite()&&v.config.resources.fuel_capacity_liters>0.0&&v.powertrain.fuel_liters.is_finite()&&v.powertrain.fuel_liters<=0.0).map(|(id,_)|id.clone()).collect();
        for id in empty {if self.vehicle_health.get_mut(&id).is_some_and(|health|health.disable_for_fuel()){self.freeze_disabled_vehicle(&id);}}
        let mut ready=Vec::new();
        for (id,health) in &mut self.vehicle_health {
            if health.defeated {if let Some(vehicle)=self.vehicles.get_mut(id){vehicle.ram.cooldown=(vehicle.ram.cooldown-dt).max(0.0);}}
            if health.advance(dt){ready.push(id.clone());}
        }
        for id in ready {
            // Placement checks other colliders first. A blocked pad never heals
            // or revives the corpse; countdown remains zero while retrying.
            if self.place_vehicle_after_recovery(&id).is_err(){continue;}
            let Some(vehicle)=self.vehicles.get_mut(&id) else{continue};
            let cooldown=vehicle.ram.cooldown;
            vehicle.ram=crate::ram::RamState::default();vehicle.ram.cooldown=cooldown;
            vehicle.powertrain=crate::powertrain::Powertrain::new(vehicle.config.resources);
            vehicle.cockpit=crate::cockpit::Cockpit::default();
            vehicle.throttle=0.0;vehicle.steer=0.0;vehicle.brake=0.0;vehicle.handbrake=0.0;vehicle.player_flags=0;
            vehicle.vehicle_flags.insert(VehicleStateFlags::ENGINE_ON);
            vehicle.vehicle_flags.remove(VehicleStateFlags::BOOST);
            if let Some(body)=self.bodies.get_mut(vehicle.body){body.set_enabled(true);for handle in body.colliders(){if let Some(c)=self.colliders.get_mut(*handle){c.set_enabled(true);}}}
            if let Some(health)=self.vehicle_health.get_mut(&id){health.respawn();}
            self.combat_poses.remove(&id);
            self.combat_cooldowns.remove(&id);
            for weapon in ["coax","basket"]{self.combat_cooldowns.remove(&format!("{id}:{weapon}"));}
            self.bodies.propagate_modified_body_positions_to_colliders(&mut self.colliders);self.query_pipeline.update(&self.colliders);
        }
    }
}
