//! Serialized vehicle shield authority and reconnect-safe ability cooldown.
use super::*;
impl Server {
    pub(super) async fn ability_cooldown(&self, player: &str, ability: &'static str) -> f32 {
        let profile = self.connections.lock().await.get(player).and_then(|c| c.profile_id.clone());
        if let Some(profile) = profile { self.revivals.lock().await.ability_remaining(&profile, ability) } else { 0.0 }
    }
    pub(super) async fn handle_vehicle_shield(&self, player: &str, action: &str) -> Result<Value, String> {
        let profile = self.actor(player).await?;
        let connection = self.connections.lock().await.get(player).cloned().ok_or("The connection closed.")?;
        let world = connection.world_id.ok_or("Join a world before using a shield.")?;
        let member = self.alpha.lock().await.members.get(player).cloned();
        let (key, cooldown) = match action {
            "tank_barrier" => ("tank_barrier", crate::guard_boost::BARRIER_COOLDOWN),
            "dps_guard_boost" => ("guard_boost", crate::guard_boost::GUARD_COOLDOWN),
            "dive_shield" => ("dive_shield", crate::guard_boost::DIVE_COOLDOWN),
            _ => return Err("Unknown shield.".into()),
        };
        let remaining = self.revivals.lock().await.ability_remaining(&profile, key);
        let runtime = self.runtime(player).await?;
        let mut room = runtime.lock().await;
        if room.round.as_ref().is_some_and(|r| r.phase == crate::ctf::CtfPhase::Ended) {
            return Err("This match has ended.".into());
        }
        let chassis = room.game.entities.get(player)
            .filter(|e| e.room_id == world && e.team == connection.team)
            .and_then(|e| e.vehicle_id.as_deref());
        let hero = match &member {
            Some(m) if m.world == world && m.team == connection.team => crate::alpha::policy::hero(&m.hero)?,
            None if room.round.is_none() => crate::alpha::policy::HEROES.iter()
                .find(|h| Some(h.vehicle) == chassis).copied().ok_or("Unknown vehicle.")?,
            _ => return Err("Deploy your assigned hero first.".into()),
        };
        if action=="dps_guard_boost" && hero.id!="brz" {return Err("Select the BRZ DPS hero to use Guard Boost.".into());}
        let expected = match hero.id { "tank" => "tank_barrier", "brz" => "dps_guard_boost", _ => "dive_shield" };
        if action != expected {return Err("Use the shield for your deployed hero.".into());}
        if remaining > 0.0 {return Err(format!("Shield is cooling down ({remaining:.1}s)."));}
        if chassis != Some(hero.vehicle) {return Err("Deploy your assigned vehicle first.".into());}
        room.physics.set_assigned_hero(player,hero.id);
        match action {
            "tank_barrier" => room.physics.start_tank_barrier(player)?,
            "dps_guard_boost" => room.physics.start_guard_boost(player)?,
            _ => room.physics.start_dive_shield(player)?,
        }
        let guard=room.physics.guard_view(player);
        drop(room);
        self.revivals.lock().await.ability_used(profile,key,cooldown);
        Ok(json!({"activated":true,"guard":guard}))
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
        let player=id();let(tx,_rx)=crate::outbox::channel();let(frame,_frame)=watch::channel(None);let(social,_social)=watch::channel(None);let(input_tx,input)=watch::channel(None);
        server.register(player.clone(),Connection{tx,frame:frame.into(),social,input,input_tx,profile_id:None,world_id:None,team:Team::Red}).await.unwrap();
        let identity=server.handle(&player,json!({"action":"identify","name":name})).await.unwrap();(player,identity)
    }
    async fn fixture(hero:&str)->(Server,String,Value){
        let server=server();let(actor,identity)=client(&server,"Guard driver").await;
        server.data.lock().await.worlds.insert(WORLD,World{tire_thermals:false,mode:Some(Mode::Quickplay),id:WORLD,name:"Guard range".into(),map:"road_precision".into(),owner_id:None,listed:true,max_players:10,password_hash:None,invite_code:id()});
        {let mut alpha=server.alpha.lock().await;alpha.enabled=true;alpha.enforce_roles=false;alpha.worlds.insert(WORLD,Mode::Quickplay.into());
         alpha.members.insert(actor.clone(),Member{mode:Mode::Quickplay, team_size:5,world:WORLD,hero:hero.into(),team:Team::Red});}
        let mut game=SharedGameState::new();game.room_id=WORLD;
        let mut room=WorldRuntime::from_parts(game,crate::support::tests::blank_world());
        let connection=server.connections.lock().await[&actor].clone();room.join(&actor,connection.tx,connection.frame,connection.input,Some(Team::Red),10);server.connections.lock().await.get_mut(&actor).unwrap().world_id=Some(WORLD);
        room.spawn(&actor,if hero=="mechanic" {"brz"} else {crate::alpha::policy::hero(hero).unwrap().vehicle}).unwrap();room.physics.set_assigned_hero(&actor,hero);
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
    async fn road_vehicle_has_both_a_personal_shield_and_the_full_barrage() {
        let (server, player, _) = fixture("mini").await;
        let guard=server.handle(&player,json!({"action":"dive_shield"})).await.unwrap();
        assert_eq!(guard["guard"]["dive_remaining_s"],2.0);
        let runtime=server.runtimes.lock().await[&WORLD].clone();
        runtime.lock().await.physics.vehicles.get_mut(&player).unwrap().powertrain.ultimate_fraction=1.0;
        server.handle(&player,json!({"action":"barrage"})).await.unwrap();
        let mut room=runtime.lock().await;
        room.physics.advance_barrages(|_|true);
        assert_eq!(room.physics.barrages[&player].ticks_left,299);
        drop(room);cleanup(server).await;
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
