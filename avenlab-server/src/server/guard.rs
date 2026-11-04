//! Serialized BRZ hero authority and reconnect-safe ability cooldown.
use super::*;
impl Server {
    pub(super) async fn ability_cooldown(&self, player: &str, ability: &'static str) -> f32 {
        let profile = self.connections.lock().await.get(player).and_then(|c| c.profile_id.clone());
        if let Some(profile) = profile { self.revivals.lock().await.ability_remaining(&profile, ability) } else { 0.0 }
    }
    pub(super) async fn handle_dps_guard_boost(&self, player: &str, value: &Value) -> Result<Value, String> {
        let profile = self.actor(player).await?;
        let connection = self.connections.lock().await.get(player).cloned().ok_or("The connection closed.")?;
        let world = connection.world_id.ok_or("Join a world before using abilities.")?;
        let dive=value.get("action").and_then(Value::as_str)==Some("dive_shield");
        let hero=if dive {"cx30"}else{"brz"};
        let member = self.alpha.lock().await.members.get(player).cloned()
            .filter(|m| m.world == world && m.hero == hero && m.team == connection.team)
            .ok_or(if dive {"Select the CX-30 Support SUV."}else{"Select the BRZ DPS hero to use Guard Boost."})?;
        let ability=if dive {"dive_shield"}else{"guard_boost"};
        let remaining = self.revivals.lock().await.ability_remaining(&profile, ability);
        if remaining > 0.0 { return Err(format!("Shield ability is cooling down ({remaining:.1}s).")); }
        let runtime = self.runtime(player).await?; let mut room = runtime.lock().await;
        if room.round.as_ref().is_some_and(|r| r.phase == crate::ctf::CtfPhase::Ended) { return Err("This match has ended.".into()); }
        let entity = room.game.entities.get(player).filter(|e| e.room_id == world && e.team == member.team && e.vehicle_id.as_deref() == Some(hero))
            .ok_or("Deploy the vehicle for your selected hero.")?;
        let _ = entity;
        room.physics.set_assigned_hero(player, hero);
        if dive {room.physics.start_dive_shield(player)?;} else {room.physics.start_guard_boost(player)?;}
        let view = room.physics.guard_view(player); drop(room);
        self.revivals.lock().await.ability_used(profile, ability, if dive {crate::guard_boost::DIVE_COOLDOWN}else{crate::guard_boost::GUARD_COOLDOWN});
        Ok(json!({"activated":true,"guard":view}))
    }
    pub(super) async fn handle_tank_barrier(&self,player:&str,_value:&Value)->Result<Value,String> {
        let profile=self.actor(player).await?;
        let connection=self.connections.lock().await.get(player).cloned().ok_or("The connection closed.")?;
        let world=connection.world_id.ok_or("Join a world before using abilities.")?;
        let member=self.alpha.lock().await.members.get(player).cloned()
            .filter(|m|m.world==world&&m.hero=="tank"&&m.team==connection.team)
            .ok_or("Select the Tank hero to use its frontal barrier.")?;
        let remaining=self.revivals.lock().await.ability_remaining(&profile,"tank_barrier");
        if remaining>0.0 {return Err(format!("The frontal barrier is cooling down ({remaining:.1}s)."));}
        let runtime=self.runtime(player).await?;let mut room=runtime.lock().await;
        if room.round.as_ref().is_some_and(|r|r.phase==crate::ctf::CtfPhase::Ended) {return Err("This match has ended.".into());}
        if !room.game.entities.get(player).is_some_and(|e|e.room_id==world&&e.team==member.team&&e.vehicle_id.as_deref()==Some("tank")) {return Err("Deploy your assigned Tank first.".into());}
        room.physics.set_assigned_hero(player,"tank");room.physics.start_tank_barrier(player)?;
        let view=room.physics.guard_view(player);drop(room);
        self.revivals.lock().await.ability_used(profile,"tank_barrier",crate::guard_boost::BARRIER_COOLDOWN);
        Ok(json!({"activated":true,"guard":view}))
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{alpha::{Member,Mode},state::SharedGameState};
    const WORLD:usize=79;
    fn server()->Server {
        Server { operations:Mutex::new(()),chat:Mutex::new(Default::default()),matches:Mutex::new(Default::default()),revivals:Mutex::new(Default::default()),
            alpha:Mutex::new(crate::alpha::AlphaState::disabled()),data:Mutex::new(SocialData::default()),connections:Mutex::new(HashMap::new()),runtimes:Mutex::new(HashMap::new()),
            path:std::env::temp_dir().join(format!("avenlab-guard-{}",id())).join("social.json"),max_active_worlds:3,max_players:16 }
    }
    async fn client(server:&Server,name:&str)->(String,Value){
        let player=id();let(tx,_rx)=tokio::sync::mpsc::unbounded_channel();let(frame,_frame)=watch::channel(None);let(social,_social)=watch::channel(None);let(input_tx,input)=watch::channel(None);
        server.register(player.clone(),Connection{tx,frame,social,input,input_tx,profile_id:None,world_id:None,team:Team::Red}).await.unwrap();
        let identity=server.handle(&player,json!({"action":"identify","name":name})).await.unwrap();(player,identity)
    }
    async fn fixture(hero:&str)->(Server,String,Value){
        let server=server();let(actor,identity)=client(&server,"Guard driver").await;
        server.data.lock().await.worlds.insert(WORLD,World{mode:Some(Mode::Quickplay),id:WORLD,name:"Guard range".into(),map:"road_precision".into(),owner_id:None,listed:true,max_players:10,password_hash:None,invite_code:id()});
        {let mut alpha=server.alpha.lock().await;alpha.enabled=true;alpha.enforce_roles=false;alpha.worlds.insert(WORLD,Mode::Quickplay.into());
         alpha.members.insert(actor.clone(),Member{mode:Mode::Quickplay, team_size:5,world:WORLD,hero:hero.into(),team:Team::Red});}
        let mut game=SharedGameState::new();game.room_id=WORLD;
        let mut room=WorldRuntime::from_parts(game,crate::support::tests::blank_world());
        let connection=server.connections.lock().await[&actor].clone();room.join(&actor,connection.tx,connection.frame,connection.input,Some(Team::Red),10);server.connections.lock().await.get_mut(&actor).unwrap().world_id=Some(WORLD);
        room.spawn(&actor,if hero=="tank" || hero=="cx30" {hero}else{"brz"}).unwrap();room.physics.set_assigned_hero(&actor,hero);
        for _ in 0..90 {room.physics.step(crate::physics::SIMULATION_DT);}
        room.physics.vehicles.get_mut(&actor).unwrap().powertrain.gear=1;
        server.runtimes.lock().await.insert(WORLD,Arc::new(Mutex::new(room)));
        (server,actor,identity)
    }
    async fn cleanup(server:Server){let _=tokio::fs::remove_dir_all(server.path.parent().unwrap()).await;}
    #[tokio::test]
    async fn barrage_rejects_forged_charge_and_tuning_and_spends_charge_only_once(){
        let(s,actor,_)=fixture("tank").await;
        let request=json!({"action":"tank_barrage","ultimate_fraction":1.0,"duration":9999,"damage":99999,"targets":["ally"]});
        assert!(s.handle(&actor,request.clone()).await.is_err());
        let runtime=s.runtimes.lock().await[&WORLD].clone();
        runtime.lock().await.physics.vehicles.get_mut(&actor).unwrap().powertrain.ultimate_fraction=1.0;
        assert!(s.handle(&actor,request.clone()).await.is_ok());
        assert!(s.handle(&actor,request).await.is_err());
        assert_eq!(runtime.lock().await.physics.barrages[&actor].ticks_left,300);
        cleanup(s).await;
    }
    #[tokio::test]
    async fn guard_rpc_requires_actual_selected_hero_and_ignores_client_tuning(){
        let(s,actor,_)=fixture("mechanic").await;
        let request=json!({"action":"dps_guard_boost","hero":"brz","shield_hp":999999,"cooldown_s":0});
        assert!(s.handle(&actor,request.clone()).await.unwrap_err().contains("BRZ DPS"));
        s.alpha.lock().await.members.get_mut(&actor).unwrap().hero="brz".into();
        let response=s.handle(&actor,request.clone()).await.unwrap();assert_eq!(response["guard"]["shield_hp"],200.0);assert_eq!(response["guard"]["remaining_s"],4.0);
        assert!(s.handle(&actor,request.clone()).await.unwrap_err().contains("cooling down"));
        let runtime=s.runtimes.lock().await[&WORLD].clone();runtime.lock().await.physics.guard_boosts.clear();
        assert!(s.handle(&actor,request).await.unwrap_err().contains("cooling down"),"resetting physics does not erase profile deadline");
        cleanup(s).await;
    }
    #[tokio::test]
    async fn dive_shield_uses_its_own_server_timer_and_keeps_the_spray_gun(){
        let(s,actor,_)=fixture("cx30").await;
        let request=json!({"action":"dive_shield","duration_s":9999,"shield_hp":9999});
        let first=s.handle(&actor,request.clone()).await.unwrap();
        assert_eq!(first["guard"]["dive_remaining_s"],2.0);
        assert_eq!(first["guard"]["remaining_s"],0.0);
        assert!(s.handle(&actor,request).await.unwrap_err().contains("cooling down"));
        let runtime=s.runtimes.lock().await[&WORLD].clone();
        {let mut world=runtime.lock().await;
         world.physics.combat_tick(&actor,1,Some(&crate::state::CombatPose{enabled:true,fire:true,..Default::default()}));
         assert!(world.physics.combat_poses[&actor].shot>0);}
        cleanup(s).await;
        let(s,tank,_)=fixture("tank").await;
        assert!(s.handle(&tank,json!({"action":"dive_shield"})).await.is_err());
        cleanup(s).await;
    }
    #[tokio::test]
    async fn barrier_rpc_uses_tank_authority_and_profile_deadline_survives_token_reconnect(){
        let(s,actor,identity)=fixture("tank").await;
        let request=json!({"action":"tank_barrier","shield_hp":999999,"duration_s":500});
        let response=s.handle(&actor,request.clone()).await.unwrap();assert_eq!(response["guard"]["kind"],"tank_barrier");assert_eq!(response["guard"]["shield_hp"],500.0);
        s.disconnect(&actor).await;
        let(resumed,_)=client(&s,"Guard temporary").await;
        s.handle(&resumed,json!({"action":"identify","name":"Guard driver","token":identity["token"]})).await.unwrap();
        assert_eq!(s.alpha.lock().await.members[&resumed].hero,"tank");
        assert!(s.ability_cooldown(&resumed,"tank_barrier").await>0.0);
        assert!(s.handle(&resumed,request).await.unwrap_err().contains("cooling down"));
        assert!(s.handle(&resumed,json!({"action":"dps_guard_boost"})).await.unwrap_err().contains("BRZ DPS"));
        s.reset_revival_cooldowns(WORLD).await;assert_eq!(s.ability_cooldown(&resumed,"tank_barrier").await,0.0);
        cleanup(s).await;
    }
}
