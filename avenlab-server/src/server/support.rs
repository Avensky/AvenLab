//! Authenticated Mechanic primary fire. The client asks to launch; the server
//! chooses a living injured ally and simulates the pack before any HP changes.
use super::*;
use std::collections::HashSet;

impl Server {
    pub(super) async fn handle_vehicle_heal_pack(&self, player:&str, _value:&Value) -> Result<Value,String> {
        let profile=self.actor(player).await?;
        let clients=self.connections.lock().await;
        let source=clients.get(player).ok_or("The connection closed.")?;
        let world=source.world_id.ok_or("Join a world before firing a health pack.")?;
        let side=source.team;
        let connected:HashSet<_>=clients.iter().filter(|(_,c)|c.world_id==Some(world)&&c.profile_id.is_some()).map(|(id,_)|id.clone()).collect();
        drop(clients);
        let member=self.alpha.lock().await.members.get(player).cloned()
            .filter(|member|member.hero=="mechanic"&&member.world==world&&member.team==side)
            .ok_or("Select the Mechanic hero to fire health packs.")?;
        let remaining=self.revivals.lock().await.ability_remaining(&profile,"heal_pack");
        if remaining>0.0{return Err(format!("Health pack is reloading ({remaining:.1}s)."));}
        let runtime=self.runtime(player).await?;
        let mut room=runtime.lock().await;
        if room.round.as_ref().is_some_and(|r|r.phase==crate::ctf::CtfPhase::Ended){return Err("This match has ended.".into());}
        let expected = crate::alpha::policy::hero("mechanic")?.vehicle;
        let source=room.game.entities.get(player).filter(|e|e.room_id==world&&e.team==member.team&&e.vehicle_id.as_deref()==Some(expected)&&room.physics.assigned_hero(player)==Some("mechanic"))
            .ok_or("Deploy the Mechanic's assigned vehicle before firing health packs.")?;
        if !room.game.clients.contains_key(&source.id){return Err("Your mechanic vehicle is not connected.".into());}
        let pack=room.physics.launch_health_pack(player,&connected)?;
        let target=pack.target.clone();
        drop(room);
        self.revivals.lock().await.ability_used(profile,"heal_pack",crate::support::HEAL_PACK_COOLDOWN);
        Ok(json!({"launched":true,"target":target,"pack":pack,"cooldown_s":crate::support::HEAL_PACK_COOLDOWN,"healing_hp":crate::support::HEAL_PACK_HP}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{alpha::{Member,Mode},state::SharedGameState};
    const WORLD:usize=78;
    fn server()->Server {
        Server { operations:Mutex::new(()),chat:Mutex::new(Default::default()),matches:Mutex::new(Default::default()),revivals:Mutex::new(Default::default()),
            alpha:Mutex::new(crate::alpha::AlphaState::disabled()),data:Mutex::new(SocialData::default()),connections:Mutex::new(HashMap::new()),runtimes:Mutex::new(HashMap::new()),
            path:std::env::temp_dir().join(format!("avenlab-health-pack-{}",id())).join("social.json"),max_active_worlds:3,max_players:16 }
    }
    async fn client(server:&Server,name:&str)->(String,Value){
        let player=id();let(tx,_rx)=tokio::sync::mpsc::unbounded_channel();let(frame,_frame)=watch::channel(None);let(social,_social)=watch::channel(None);let(input_tx,input)=watch::channel(None);
        server.register(player.clone(),Connection{tx,frame,social,input,input_tx,profile_id:None,world_id:None,team:Team::Red}).await.unwrap();
        let identity=server.handle(&player,json!({"action":"identify","name":name})).await.unwrap();(player,identity)
    }
    async fn fixture()->(Server,String,String,Value){
        let server=server();let(actor,identity)=client(&server,"Pack Mechanic").await;let(target,_)=client(&server,"Pack Ally").await;
        server.data.lock().await.worlds.insert(WORLD,World{mode:Some(Mode::Quickplay),id:WORLD,name:"Health-pack range".into(),map:"road_precision".into(),owner_id:None,listed:true,max_players:10,password_hash:None,invite_code:id()});
        {let mut alpha=server.alpha.lock().await;alpha.enabled=true;alpha.enforce_roles=false;alpha.worlds.insert(WORLD,Mode::Quickplay.into());
         for(player,hero)in[(&actor,"mechanic"),(&target,"brz")]{alpha.members.insert(player.clone(),Member{mode:Mode::Quickplay, team_size:5,world:WORLD,hero:hero.into(),team:Team::Red});}}
        let mut game=SharedGameState::new();game.room_id=WORLD;
        let mut room=WorldRuntime::from_parts(game,crate::support::tests::blank_world());
        for (player,hero,z) in [(&actor,"mechanic",0.0),(&target,"brz",12.0)] {
            let connection=server.connections.lock().await[player].clone();room.join(player,connection.tx,connection.frame,connection.input,Some(Team::Red),10);server.connections.lock().await.get_mut(player).unwrap().world_id=Some(WORLD);
            room.spawn(player,crate::alpha::policy::hero(hero).unwrap().vehicle).unwrap();room.physics.set_assigned_hero(player,hero);crate::support::tests::place(&mut room.physics,player,0.0,z);
        }
        room.physics.vehicle_health.get_mut(&target).unwrap().hp=300.0;
        server.runtimes.lock().await.insert(WORLD,Arc::new(Mutex::new(room)));
        (server,actor,target,identity)
    }
    async fn launch(server:&Server,actor:&str)->Result<Value,String>{server.handle(actor,json!({"action":"vehicle_heal_pack","target":"not-a-real-ally","healing_hp":99999,"hero":"mechanic","cooldown_s":0})).await}
    async fn cleanup(server:Server){let _=tokio::fs::remove_dir_all(server.path.parent().unwrap()).await;}

    #[tokio::test]
    async fn health_pack_rpc_authenticates_actual_hero_and_chooses_target_without_client_hp(){
        let(s,actor,target,_)=fixture().await;
        s.alpha.lock().await.members.get_mut(&actor).unwrap().hero="brz".into();assert!(launch(&s,&actor).await.unwrap_err().contains("Mechanic hero"));
        s.alpha.lock().await.members.get_mut(&actor).unwrap().hero="mechanic".into();
        let response=launch(&s,&actor).await.unwrap();assert_eq!(response["target"],target);assert_eq!(response["healing_hp"],75.0);assert_eq!(response["pack"]["state"],"flying");
        let runtime=s.runtimes.lock().await[&WORLD].clone();
        {let mut room=runtime.lock().await;assert_eq!(room.physics.vehicle_health[&target].hp,300.0);for _ in 0..35{room.tick(0.0);}assert_eq!(room.physics.vehicle_health[&target].hp,375.0);assert_eq!(room.physics.vehicle_health[&actor].stats.healing_done,75.0);}
        assert!(launch(&s,&actor).await.is_err());cleanup(s).await;
    }
    #[tokio::test]
    async fn health_pack_rpc_excludes_enemy_foreign_and_disconnected_targets_without_spending(){
        let(s,actor,target,_)=fixture().await;let runtime=s.runtimes.lock().await[&WORLD].clone();let fuel=runtime.lock().await.physics.vehicles[&actor].powertrain.fuel_liters;
        s.connections.lock().await.get_mut(&target).unwrap().world_id=Some(99);assert!(launch(&s,&actor).await.is_err());
        s.connections.lock().await.get_mut(&target).unwrap().world_id=Some(WORLD);
        {let mut room=runtime.lock().await;room.physics.vehicles.get_mut(&target).unwrap().team="blue".into();}
        assert!(launch(&s,&actor).await.is_err());
        {let mut room=runtime.lock().await;room.physics.vehicles.get_mut(&target).unwrap().team="red".into();}
        s.connections.lock().await.get_mut(&target).unwrap().profile_id=None;
        assert!(launch(&s,&actor).await.is_err());
        assert_eq!(runtime.lock().await.physics.vehicles[&actor].powertrain.fuel_liters,fuel);cleanup(s).await;
    }
    #[tokio::test]
    async fn health_pack_profile_cooldown_survives_body_reset_and_real_token_reconnect(){
        let(s,actor,target,identity)=fixture().await;launch(&s,&actor).await.unwrap();let runtime=s.runtimes.lock().await[&WORLD].clone();
        // Extend only the fixture's accepted deadline so slow CI disk/restore
        // work cannot legitimately expire the short production reload timer.
        s.revivals.lock().await.ability_used(identity["profile_id"].as_str().unwrap().into(),"heal_pack",30.0);
        runtime.lock().await.physics.support.reset();assert!(launch(&s,&actor).await.unwrap_err().contains("reloading"));
        s.disconnect(&actor).await;
        let(resumed,_)=client(&s,"Temporary pack reconnect").await;
        s.handle(&resumed,json!({"action":"identify","name":"Pack Mechanic","token":identity["token"]})).await.unwrap();
        assert_eq!(s.alpha.lock().await.members[&resumed].hero,"mechanic");
        assert!(s.ability_cooldown(&resumed,"heal_pack").await>0.0);
        assert!(launch(&s,&resumed).await.unwrap_err().contains("reloading"));
        assert_eq!(runtime.lock().await.physics.vehicle_health[&target].hp,300.0);
        s.reset_revival_cooldowns(WORLD).await;
        assert_eq!(s.ability_cooldown(&resumed,"heal_pack").await,0.0);
        cleanup(s).await;
    }
}
