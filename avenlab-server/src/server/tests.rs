use super::*;

fn server(active: usize, players: usize) -> Server {
    Server {
        operations: Mutex::new(()),
        chat: Mutex::new(Default::default()),
        matches: Mutex::new(Default::default()),
        revivals: Mutex::new(Default::default()),
        alpha: Mutex::new(crate::alpha::AlphaState::disabled()),
        data: Mutex::new(SocialData::default()),
        connections: Mutex::new(HashMap::new()),
        runtimes: Mutex::new(HashMap::new()),
        path: std::env::temp_dir()
            .join(format!("avenlab-social-test-{}", id()))
            .join("social.json"),
        max_active_worlds: active,
        max_players: players,
    }
}
async fn client(server: &Server, name: &str) -> (String, Value, watch::Receiver<Option<String>>) {
    let player = id();
    let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
    let (frame, _frame) = watch::channel(None);
    let (social, view) = watch::channel(None);
    let (input_tx, input) = watch::channel(None);
    server
        .register(
            player.clone(),
            Connection {
                tx,
                frame,
                social,
                input,
                input_tx,
                profile_id: None,
                world_id: None,
                team: Team::Blue,
            },
        )
        .await
        .unwrap();
    let result = server
        .handle(&player, json!({"action":"identify","name":name}))
        .await
        .unwrap();
    (player, result, view)
}
async fn world(server: &Server, player: &str, name: &str, password: &str, listed: bool) -> usize {
    server.handle(player,json!({"action":"world_create","name":name,"map":"road_precision","password":password,"listed":listed})).await.unwrap()["world_id"].as_u64().unwrap() as usize
}
async fn cleanup(server: Server) {
    let _ = tokio::fs::remove_dir_all(server.path.parent().unwrap()).await;
}

#[tokio::test]
async fn private_world_requires_both_authorized_discovery_and_password() {
    let server = server(2, 10);
    let (a, _, owner_view) = client(&server, "Host").await;
    let (b, _, guest_view) = client(&server, "Guest").await;
    let world = world(&server, &a, "Private course", "world-key", false).await;
    let code = server.data.lock().await.worlds[&world].invite_code.clone();
    let before: Value = serde_json::from_str(guest_view.borrow().as_ref().unwrap()).unwrap();
    assert_eq!(before["data"]["worlds"].as_array().unwrap().len(), 0);
    assert!(
        server
            .handle(
                &b,
                json!({"action":"world_join","world_id":world,"password":"world-key"})
            )
            .await
            .is_err()
    );
    assert!(
        server
            .handle(
                &b,
                json!({"action":"world_join","code":code,"password":"wrong"})
            )
            .await
            .is_err()
    );
    assert_eq!(server.connections.lock().await[&b].world_id, None);
    server
        .handle(
            &b,
            json!({"action":"world_join","code":code,"password":"world-key"}),
        )
        .await
        .unwrap();
    assert_eq!(server.connections.lock().await[&b].world_id, Some(world));
    let view = owner_view.borrow().as_ref().unwrap().clone();
    assert!(!view.contains("password_hash"));
    assert!(!view.contains("world-key"));
    assert!(!view.contains("token_hash"));
    assert!(
        server
            .handle(&b, json!({"action":"world_rotate_code","world_id":world}))
            .await
            .is_err()
    );
    assert!(
        server
            .handle(&b, json!({"action":"world_delete","world_id":world}))
            .await
            .is_err()
    );
    cleanup(server).await;
}
#[tokio::test]
async fn budget_admission_is_atomic_and_empty_worlds_release_capacity() {
    let server = server(1, 10);
    let (a, _, _) = client(&server, "A").await;
    let (b, _, _) = client(&server, "B").await;
    let one = world(&server, &a, "One", "", true).await;
    let two = world(&server, &a, "Two", "", true).await;
    server
        .handle(&a, json!({"action":"world_join","world_id":one}))
        .await
        .unwrap();
    assert!(
        server
            .handle(&b, json!({"action":"world_join","world_id":two}))
            .await
            .is_err()
    );
    assert_eq!(server.connections.lock().await[&a].world_id, Some(one));
    assert_eq!(server.connections.lock().await[&b].world_id, None);
    // The sole occupant can move worlds without needing a second paid slot.
    server
        .handle(&a, json!({"action":"world_join","world_id":two}))
        .await
        .unwrap();
    assert_eq!(server.runtimes.lock().await.len(), 1);
    assert!(!server.runtimes.lock().await.contains_key(&one));
    server
        .handle(&a, json!({"action":"world_leave"}))
        .await
        .unwrap();
    assert!(server.runtimes.lock().await.is_empty());
    server
        .handle(&b, json!({"action":"world_join","world_id":one}))
        .await
        .unwrap();
    server.disconnect(&b).await;
    assert!(server.runtimes.lock().await.is_empty());
    cleanup(server).await;
}
#[tokio::test]
async fn global_player_limit_cannot_be_bypassed_by_creating_another_room() {
    let server = server(2, 1);
    let (a, _, _) = client(&server, "A").await;
    let (b, _, _) = client(&server, "B").await;
    let one = world(&server, &a, "One", "", true).await;
    let two = world(&server, &b, "Two", "", true).await;
    server
        .handle(&a, json!({"action":"world_join","world_id":one}))
        .await
        .unwrap();
    assert!(
        server
            .handle(&b, json!({"action":"world_join","world_id":two}))
            .await
            .is_err()
    );
    assert_eq!(server.runtimes.lock().await.len(), 1);
    cleanup(server).await;
}
#[tokio::test]
async fn profile_credentials_and_saved_worlds_survive_a_restart_without_plaintext_secrets() {
    let server = server(1, 10);
    let (a, identity, _) = client(&server, "Owner").await;
    let world = world(&server, &a, "Saved world", "secret-world", false).await;
    let bytes = tokio::fs::read_to_string(&server.path).await.unwrap();
    let token = identity["token"].as_str().unwrap();
    assert!(!bytes.contains(token));
    assert!(!bytes.contains("secret-world"));
    let mut restored = SocialData::load(&server.path).unwrap();
    assert!(restored.worlds.contains_key(&world));
    assert_eq!(
        restored.authenticate(Some(token), "Ignored").unwrap().0,
        identity["profile_id"].as_str().unwrap()
    );
    assert!(
        restored
            .authenticate(Some(&"f".repeat(64)), "Ignored")
            .is_err()
    );
    cleanup(server).await;
}

fn alpha_server() -> Server {
    let s = server(3, 12);
    s.alpha.try_lock().unwrap().enabled = true;
    s
}
#[tokio::test]
async fn matchmaking_reserves_ten_unpicked_seats_and_locks_roles_only_after_selection() {
    let s = alpha_server();
    let mut players = Vec::new();
    for index in 0..10 {
        let (player, _, _) = client(&s, &format!("Unpicked {index}")).await;
        let result = mode(&s, &player, "quickplay", "").await;
        assert_eq!(result["status"], "joined");
        assert_eq!(result["hero"], "");
        assert!(s.validate_alpha_vehicle(&player, "ae86").await.is_err());
        players.push(player);
    }
    let a = s.alpha.lock().await.clone();
    assert_eq!(a.members.values().filter(|m| m.team == Team::Red).count(), 5);
    assert_eq!(a.members.values().filter(|m| m.team == Team::Blue).count(), 5);
    assert!(a.members.values().all(|m| m.hero.is_empty()));
    let team = a.members[&players[0]].team;
    let same_team = players.iter().find(|p| *p != &players[0] && a.members[*p].team == team).unwrap();
    s.handle(&players[0], json!({"action":"hero_select","hero":"tank"})).await.unwrap();
    assert!(s.handle(same_team, json!({"action":"hero_select","hero":"tank"})).await.is_err());
    s.handle(same_team, json!({"action":"hero_select","hero":"mechanic"})).await.unwrap();
    let (waiter, _, _) = client(&s, "Eleventh").await;
    assert_eq!(mode(&s, &waiter, "quickplay", "").await["status"], "queued");
    s.handle(&players[0], json!({"action":"mode_cancel"})).await.unwrap();
    s.maintain_alpha().await;
    assert!(s.alpha.lock().await.members[&waiter].hero.is_empty());
    assert_eq!(s.alpha.lock().await.members.len(), 10);
    cleanup(s).await;
}
#[tokio::test]
async fn back_can_clear_a_pick_without_releasing_its_seat_and_role() {
    let s = alpha_server();
    let (player, _, _) = client(&s, "Preview driver").await;
    let joined = mode(&s, &player, "quickplay", "").await;
    s.handle(&player, json!({"action":"hero_select","hero":"tank"})).await.unwrap();
    assert_eq!(s.alpha.lock().await.members[&player].hero, "tank");
    s.handle(&player, json!({"action":"hero_select","hero":""})).await.unwrap();
    assert_eq!(s.alpha.lock().await.members[&player].hero, "");
    assert_eq!(s.connections.lock().await[&player].world_id, Some(joined["world_id"].as_u64().unwrap() as usize));
    assert!(s.validate_alpha_vehicle(&player, "tank").await.is_err());
    s.handle(&player, json!({"action":"hero_select","hero":"brz"})).await.unwrap();
    assert!(s.validate_alpha_vehicle(&player, "brz").await.is_ok());
    let map = joined["map"].as_str().unwrap();
    s.spawn(&player, map, "brz").await.unwrap();
    assert!(s.handle(&player, json!({"action":"hero_select","hero":""})).await.is_err());
    assert_eq!(s.alpha.lock().await.members[&player].hero, "brz");
    cleanup(s).await;
}
#[tokio::test]
async fn sandbox_can_reserve_each_installed_editor_environment_without_preselecting_a_hero() {
    let s = alpha_server();
    let (player, _, _) = client(&s, "Map tester").await;
    for map in available_maps() {
        let result = s.handle(&player, json!({"action":"mode_join","mode":"sandbox","hero":"","map":map})).await.unwrap();
        assert_eq!(result["status"], "joined");
        assert_eq!(result["map"], map.as_str());
        let world = result["world_id"].as_u64().unwrap() as usize;
        assert_eq!(s.data.lock().await.worlds[&world].map, map);
        assert!(s.alpha.lock().await.members[&player].hero.is_empty());
    }
    assert!(s.handle(&player, json!({"action":"hero_select","hero":"fake"})).await.is_err());
    cleanup(s).await;
}
async fn mode(server: &Server, player: &str, mode: &str, hero: &str) -> Value {
    server
        .handle(
            player,
            json!({"action":"mode_join","mode":mode,"hero":hero,"map":"road_precision"}),
        )
        .await
        .unwrap()
}
#[tokio::test]
async fn alpha_has_exactly_one_slot_per_category_and_fifo_admission() {
    let s = alpha_server();
    let (a, _, _) = client(&s, "A").await;
    let (b, _, _) = client(&s, "B").await;
    let (c, _, cv) = client(&s, "C").await;
    let (e, _, _) = client(&s, "Editor").await;
    assert_eq!(mode(&s, &a, "sandbox", "tank").await["status"], "joined");
    assert_eq!(
        mode(&s, &b, "sandbox", "mechanic").await["status"],
        "queued"
    );
    assert_eq!(mode(&s, &c, "sandbox", "brz").await["status"], "queued");
    assert_eq!(mode(&s, &e, "editor", "brz").await["status"], "joined");
    let view: Value = serde_json::from_str(cv.borrow().as_ref().unwrap()).unwrap();
    assert_eq!(view["data"]["alpha"]["queue"]["position"], 2);
    s.handle(&a, json!({"action":"mode_cancel"})).await.unwrap();
    s.maintain_alpha().await;
    assert!(s.connections.lock().await[&b].world_id.is_some());
    assert!(s.connections.lock().await[&c].world_id.is_none());
    s.handle(&b, json!({"action":"mode_cancel"})).await.unwrap();
    s.maintain_alpha().await;
    assert!(s.connections.lock().await[&c].world_id.is_some());
    assert_eq!(s.runtimes.lock().await.len(), 2);
    cleanup(s).await;
}
#[tokio::test]
async fn alpha_reconnect_reserves_then_restores_a_seat_and_expiry_promotes_queue() {
    let s = alpha_server();
    let (a, identity, _) = client(&s, "Reconnect").await;
    let (b, _, _) = client(&s, "Waiting").await;
    let original = mode(&s, &a, "sandbox", "mechanic").await["world_id"].clone();
    mode(&s, &b, "sandbox", "brz").await;
    s.disconnect(&a).await;
    s.maintain_alpha().await;
    assert!(s.connections.lock().await[&b].world_id.is_none());
    assert_eq!(s.runtimes.lock().await.len(), 1);
    let (reconnected, _, _) = client(&s, "Temporary").await;
    s.handle(
        &reconnected,
        json!({"action":"identify","name":"Reconnect","token":identity["token"]}),
    )
    .await
    .unwrap();
    assert_eq!(
        s.connections.lock().await[&reconnected].world_id,
        Some(original.as_u64().unwrap() as usize)
    );
    assert_eq!(s.alpha.lock().await.members[&reconnected].hero, "mechanic");
    s.disconnect(&reconnected).await;
    for reservation in s.alpha.lock().await.reservations.values_mut() {
        reservation.expires = timestamp() - 1;
    }
    s.maintain_alpha().await;
    assert!(s.connections.lock().await[&b].world_id.is_some());
    cleanup(s).await;
}
#[tokio::test]
async fn five_by_five_roles_share_one_match_slot_and_results_cannot_be_client_forged() {
    let s = alpha_server();
    let mut players = Vec::new();
    let picks = [
        "tank", "tank", "ae86", "ae86", "brz", "brz", "mechanic", "mechanic", "camaro", "camaro",
    ];
    let mut world = 0;
    for (index, hero) in picks.iter().enumerate() {
        let (player, _, _) = client(&s, &format!("Player {index}")).await;
        let result = mode(&s, &player, "competitive", hero).await;
        assert_eq!(result["status"], "joined");
        world = result["world_id"].as_u64().unwrap() as usize;
        players.push(player);
    }
    let (waiter, _, _) = client(&s, "Casual").await;
    assert_eq!(
        mode(&s, &waiter, "quickplay", "brz").await["status"],
        "queued"
    );
    assert!(
        s.handle(&players[2], json!({"action":"hero_select","hero":"tank"}))
            .await
            .is_err()
    );
    assert!(s.validate_alpha_vehicle(&players[0], "brz").await.is_err());
    assert!(
        s.handle(&players[0], json!({"action":"award_xp","amount":1000000}))
            .await
            .is_err()
    );
    s.record_completed_match(world, Team::Red, "trusted-test-result")
        .await
        .unwrap();
    s.record_completed_match(world, Team::Red, "trusted-test-result")
        .await
        .unwrap();
    let data = s.data.lock().await;
    assert_eq!(data.completed_results.len(), 1);
    assert_eq!(
        data.profiles
            .values()
            .map(|p| p.progression.matches)
            .sum::<u32>(),
        10
    );
    assert_eq!(
        data.profiles
            .values()
            .map(|p| p.progression.competitive_wins)
            .sum::<u32>(),
        5
    );
    drop(data);
    let runtime = s.runtime(&players[0]).await.unwrap();
    assert_eq!(
        runtime
            .lock()
            .await
            .game
            .entities
            .values()
            .filter(|e| e.team == Team::Red)
            .count(),
        5
    );
    cleanup(s).await;
}
#[tokio::test]
async fn live_editor_only_swaps_its_own_world_and_rejects_an_invalid_draft() {
    let s = alpha_server();
    let (e, _, _) = client(&s, "Editor").await;
    let (p, _, _) = client(&s, "Practice").await;
    mode(&s, &e, "editor", "brz").await;
    mode(&s, &p, "sandbox", "brz").await;
    let old = s.runtime(&e).await.unwrap();
    let practice = s.runtime(&p).await.unwrap();
    let doc: Value = serde_json::from_str(include_str!(
        "../assets/blocks/road_precision_colliders.json"
    ))
    .unwrap();
    assert!(
        s.handle(&p, json!({"action":"editor_apply","document":doc}))
            .await
            .is_err()
    );
    let mut invalid = doc.clone();
    invalid["cell"] = json!([0, 100]);
    assert!(
        s.handle(&e, json!({"action":"editor_apply","document":invalid}))
            .await
            .is_err()
    );
    assert!(Arc::ptr_eq(&old, &s.runtime(&e).await.unwrap()));
    s.handle(&e, json!({"action":"editor_apply","document":doc}))
        .await
        .unwrap();
    assert!(!Arc::ptr_eq(&old, &s.runtime(&e).await.unwrap()));
    assert!(Arc::ptr_eq(&practice, &s.runtime(&p).await.unwrap()));
    assert_eq!(
        s.runtime(&e)
            .await
            .unwrap()
            .lock()
            .await
            .physics
            .vehicles
            .len(),
        1
    );
    cleanup(s).await;
}

#[tokio::test]
async fn flex_testing_allows_any_combination_and_cannot_grant_competitive_rewards() {
    let s = alpha_server();
    s.alpha.lock().await.enforce_roles = false;
    let mut world = 0;
    for index in 0..10 {
        let (player, _, _) = client(&s, &format!("Flex {index}")).await;
        let result = mode(&s, &player, "competitive", "ae86").await;
        assert_eq!(result["status"], "joined");
        world = result["world_id"].as_u64().unwrap() as usize;
    }
    assert!(
        s.record_completed_match(world, Team::Red, "flex-result")
            .await
            .is_err()
    );
    assert!(
        s.data
            .lock()
            .await
            .profiles
            .values()
            .all(|p| p.progression.matches == 0)
    );
    cleanup(s).await;
}

#[tokio::test]
async fn chat_derives_identity_and_team_audience_and_drops_unloaded_world_history() {
    let s = server(3, 12);
    let (a, identity, _) = client(&s, "Driver A").await;
    let (b, _, _) = client(&s, "Driver B").await;
    let (c, _, _) = client(&s, "Driver C").await;
    let (d, _, _) = client(&s, "Other world").await;
    assert!(s.handle(&a, json!({"action":"chat_send","channel":"team","text":"hello"})).await.is_err());
    assert!(s.handle("unknown", json!({"action":"chat_history","channel":"lobby"})).await.is_err());
    let one = world(&s, &a, "One", "", true).await;
    let two = world(&s, &d, "Two", "", true).await;
    for player in [&a,&b,&c] { s.handle(player,json!({"action":"world_join","world_id":one})).await.unwrap(); }
    s.handle(&d,json!({"action":"world_join","world_id":two})).await.unwrap();
    let a_team = s.connections.lock().await[&a].team;
    s.connections.lock().await.get_mut(&c).unwrap().team = a_team;
    s.connections.lock().await.get_mut(&b).unwrap().team = if a_team == Team::Red {Team::Blue} else {Team::Red};
    let sent = s.handle(&a,json!({"action":"chat_send","channel":"team","text":"  TEAM SECRET  ","author_id":"forged","name":"Forged"})).await.unwrap();
    assert_eq!(sent["message"]["name"],"Driver A");
    assert_eq!(sent["message"]["author_id"],identity["profile_id"]);
    assert_eq!(sent["message"]["text"],"TEAM SECRET");
    for (player,count) in [(&c,1),(&b,0),(&d,0)] {
        let history=s.handle(player,json!({"action":"chat_history","channel":"team","world_id":one,"team":a_team.as_str()})).await.unwrap();
        assert_eq!(history["messages"].as_array().unwrap().len(),count);
    }
    assert!(s.handle(&a,json!({"action":"chat_send","channel":"lobby","text":"x".repeat(281)})).await.is_err());
    assert!(s.handle(&a,json!({"action":"chat_send","channel":"lobby","text":"\n\t"})).await.is_err());
    s.handle(&a,json!({"action":"chat_send","channel":"lobby","text":"<b>plain text</b>"})).await.unwrap();
    assert_eq!(s.handle(&d,json!({"action":"chat_history","channel":"lobby"})).await.unwrap()["messages"].as_array().unwrap().len(),1);
    s.handle(&a,json!({"action":"chat_send","channel":"lobby","text":"third"})).await.unwrap();
    assert!(s.handle(&a,json!({"action":"chat_send","channel":"lobby","text":"fourth"})).await.is_err());
    assert!(!serde_json::to_string(&*s.data.lock().await).unwrap().contains("TEAM SECRET"));
    for player in [&a,&b,&c] { s.handle(player,json!({"action":"world_leave"})).await.unwrap(); }
    s.handle(&a,json!({"action":"world_join","world_id":one})).await.unwrap();
    assert!(s.handle(&a,json!({"action":"chat_history","channel":"team"})).await.unwrap()["messages"].as_array().unwrap().is_empty());
    cleanup(s).await;
}

#[tokio::test]
async fn editor_tuning_is_isolated_validated_and_survives_environment_apply() {
    let s = alpha_server();
    let (e, _, _) = client(&s,"Tuner").await;
    let (p, _, _) = client(&s,"Practice").await;
    mode(&s,&e,"editor","brz").await;
    mode(&s,&p,"sandbox","brz").await;
    let runtime=s.runtime(&e).await.unwrap();
    runtime.lock().await.spawn(&e,"brz").unwrap();
    assert!(s.handle(&p,json!({"action":"editor_vehicle_apply","tuning":{"mass":1600}})).await.is_err());
    let factory=s.handle(&e,json!({"action":"editor_vehicle_get"})).await.unwrap();
    let old_mass=factory["current"]["mass"].as_f64().unwrap();
    assert!(s.handle(&e,json!({"action":"editor_vehicle_apply","tuning":{"mass":0}})).await.is_err());
    assert_eq!(runtime.lock().await.physics.vehicles[&e].config.mass as f64,old_mass);
    s.handle(&e,json!({"action":"editor_vehicle_apply","tuning":{"mass":1600}})).await.unwrap();
    {
        let room=runtime.lock().await;
        let v=&room.physics.vehicles[&e];
        assert_eq!(v.config.mass,1600.0);
        assert!((room.physics.bodies[v.body].mass()-1600.0).abs()<0.1);
    }
    let doc:Value=serde_json::from_str(include_str!("../assets/blocks/road_jump_lab_colliders.json")).unwrap();
    s.handle(&e,json!({"action":"editor_apply","document":doc})).await.unwrap();
    let room=s.runtime(&e).await.unwrap();
    assert_eq!(room.lock().await.physics.active_map_id(),Some("road_jump_lab"));
    assert_eq!(room.lock().await.physics.vehicles[&e].config.mass,1600.0);
    assert_eq!(s.data.lock().await.worlds[&s.alpha.lock().await.members[&e].world].map,"road_jump_lab");
    cleanup(s).await;
}

#[tokio::test]
async fn roster_portraits_publish_only_equipped_styles_for_live_and_reserved_players() {
    use crate::alpha::{AlphaState, Member, Mode, Reservation};
    let server = server(1, 10);
    let (player, _, _) = client(&server, "Styled driver").await;
    let profile_id = server.connections.lock().await[&player].profile_id.clone().unwrap();
    let mut data = server.data.lock().await;
    let profile = data.profiles.get_mut(&profile_id).unwrap();
    let mut appearance = crate::alpha::appearance::HeroAppearance::default();
    appearance.body = "#ed258d".into();
    appearance.finish = "soft".into();
    profile.progression.hero_loadouts.insert("brz".into(), appearance.clone());
    let mut alpha = AlphaState::default();
    alpha.members.insert(player.clone(), Member { mode: Mode::Quickplay, world: 7, hero: "mechanic".into(), team: Team::Red });
    let clients = server.connections.lock().await;
    let view = Server::alpha_view(&alpha, &profile_id, &player, &clients, &data);
    let card = &view["roster"][0];
    assert_eq!(card["appearance"]["body"], "#ed258d");
    assert_eq!(card["appearance"]["finish"], "soft");
    assert_eq!(card["world_id"], 7);
    assert!(card.get("token_hash").is_none());
    assert!(card.get("hero_loadouts").is_none());
    let member = alpha.members.remove(&player).unwrap();
    alpha.reservations.insert(profile_id.clone(), Reservation { retained_player:None, member, expires: timestamp() + 30 });
    let reserved = Server::alpha_view(&alpha, &profile_id, &player, &clients, &data);
    assert_eq!(reserved["roster"][0]["appearance"], card["appearance"]);
    assert_eq!(reserved["roster"][0]["reconnecting"], true);
    assert_eq!(reserved["roster"][0]["world_id"], 7);
    alpha.reservations.get_mut(&profile_id).unwrap().member.hero = "tank".into();
    let factory = Server::alpha_view(&alpha, &profile_id, &player, &clients, &data);
    assert_eq!(factory["roster"][0]["appearance"]["body"], "factory");
    drop(clients);
    drop(data);
    cleanup(server).await;
}

#[tokio::test]
async fn practice_disconnect_keeps_the_same_body_map_resources_and_authorized_owner(){
 for mode_name in ["sandbox","editor"]{
  let s=alpha_server();let (player,identity,_)=client(&s,"Practice owner").await;
  let world_id=mode(&s,&player,mode_name,"tank").await["world_id"].as_u64().unwrap() as usize;
  s.spawn(&player,"road_precision","tank").await.unwrap();
  let runtime=s.runtimes.lock().await[&world_id].clone();
  let handle;let position;
  {let mut room=runtime.lock().await;handle=room.physics.vehicles[&player].body;room.physics.vehicles.get_mut(&player).unwrap().powertrain.nos_remaining_s=12.0;room.physics.asset_health.insert("saved-destruction".into(),25.0);position=*room.physics.bodies[handle].translation();}
  s.disconnect(&player).await;
  {let mut room=runtime.lock().await;assert!(room.physics.vehicles.contains_key(&player));assert!(!room.game.clients.contains_key(&player));assert_eq!(room.tick(0.0),0);}
  let lease=s.alpha.lock().await.reservations[identity["profile_id"].as_str().unwrap()].clone();assert_eq!(lease.retained_player.as_deref(),Some(player.as_str()));assert!(lease.expires>=timestamp()+590);
  let (next,_,_)=client(&s,"Temporary").await;
  s.handle(&next,json!({"action":"identify","name":"Practice owner","token":identity["token"]})).await.unwrap();
  assert_eq!(s.connections.lock().await[&next].world_id,Some(world_id));
  assert_eq!(s.connections.lock().await[&next].team,lease.member.team);
  {let room=runtime.lock().await;assert_eq!(room.physics.vehicles[&next].body,handle);assert_eq!(*room.physics.bodies[handle].translation(),position);assert_eq!(room.physics.vehicles[&next].powertrain.nos_remaining_s,12.0);assert_eq!(room.physics.asset_health["saved-destruction"],25.0);assert!(!room.physics.vehicles.contains_key(&player));assert!(!room.game.entities.contains_key(&player));assert_eq!(room.physics.body_to_player[&handle],next);}
  s.handle(&next,json!({"action":"world_leave"})).await.unwrap();assert!(s.runtimes.lock().await.is_empty());cleanup(s).await;
 }
}
#[tokio::test]
async fn expired_practice_body_is_removed_before_world_capacity_is_reused(){
 let s=alpha_server();let (player,_,_)=client(&s,"Expiring").await;
 let world=mode(&s,&player,"sandbox","tank").await["world_id"].as_u64().unwrap() as usize;s.spawn(&player,"road_precision","tank").await.unwrap();
 let runtime=s.runtimes.lock().await[&world].clone();s.disconnect(&player).await;
 for lease in s.alpha.lock().await.reservations.values_mut(){lease.expires=timestamp()-1;}
 s.maintain_alpha().await;assert!(runtime.lock().await.physics.vehicles.is_empty());assert!(s.runtimes.lock().await.is_empty());cleanup(s).await;
}

#[tokio::test]
async fn world_member_levels_use_authenticated_profiles_and_do_not_publish_invented_mmr() {
    let s=server(2,10);
    let (a,_,a_view)=client(&s,"Host").await;
    let (b,b_identity,_)=client(&s,"Experienced driver").await;
    let (_,_,outside_view)=client(&s,"Outside observer").await;
    let world_id=world(&s,&a,"Scoreboard course","",true).await;
    let b_profile=b_identity["profile_id"].as_str().unwrap();
    s.data.lock().await.profiles.get_mut(b_profile).unwrap().progression.level=37;
    s.handle(&a,json!({"action":"world_join","world_id":world_id})).await.unwrap();
    s.handle(&b,json!({"action":"world_join","world_id":world_id})).await.unwrap();
    s.handle(&b,json!({"action":"refresh","level":999,"mmr":9000})).await.unwrap();
    let own:Value=serde_json::from_str(a_view.borrow().as_ref().unwrap()).unwrap();
    let current=own["data"]["worlds"].as_array().unwrap().iter().find(|w|w["id"]==world_id).unwrap();
    let members=current["members"].as_array().unwrap();
    let remote=members.iter().find(|member|member["player_id"]==b).unwrap();
    assert_eq!(remote["profile_id"],b_profile);assert_eq!(remote["level"],37);
    assert!(remote.get("mmr").is_none());
    let local=members.iter().find(|member|member["player_id"]==a).unwrap();assert_eq!(local["level"],1);
    let outside:Value=serde_json::from_str(outside_view.borrow().as_ref().unwrap()).unwrap();
    let listed=outside["data"]["worlds"].as_array().unwrap().iter().find(|w|w["id"]==world_id).unwrap();
    assert!(listed["members"].as_array().unwrap().is_empty(),"world discovery does not reveal member details to outsiders");
    cleanup(s).await;
}

async fn deployed_ctf(strict: bool) -> (Server, usize, Vec<(String, Value)>) {
    let s = alpha_server();
    s.alpha.lock().await.enforce_roles = strict;
    let picks: Vec<_> = if strict { vec!["tank","tank","ae86","ae86","brz","brz","mechanic","mechanic","camaro","camaro"] } else { vec!["brz","brz"] };
    let mut roster = Vec::new();
    let mut world = 0;
    for (index, hero) in picks.iter().enumerate() {
        let (player, identity, _) = client(&s, &format!("Career driver {index}")).await;
        let joined = mode(&s, &player, "competitive", hero).await;
        world = joined["world_id"].as_u64().unwrap() as usize;
        let vehicle = crate::alpha::policy::hero(hero).unwrap().vehicle;
        s.spawn(&player, "streaming_endless_city", vehicle).await.unwrap();
        roster.push((player, identity));
    }
    assert_eq!(s.runtimes.lock().await[&world].lock().await.round.as_ref().unwrap().phase, crate::ctf::CtfPhase::Running);
    (s, world, roster)
}
fn place_ctf_body(room: &mut WorldRuntime, player: &str, point: [f32;3]) {
    use rapier3d::prelude::*;
    let handle = room.physics.vehicles[player].body;
    let body = &mut room.physics.bodies[handle];
    body.set_body_type(RigidBodyType::KinematicPositionBased, true);
    body.set_translation(vector![point[0], point[1], point[2]], true);
    body.set_next_kinematic_translation(vector![point[0], point[1], point[2]]);
    body.set_linvel(Vector::zeros(), true);
}
fn travel_ctf_body(room: &mut WorldRuntime, player: &str, target: [f32;3]) {
    loop {
        let pos = room.physics.bodies[room.physics.vehicles[player].body].translation();
        let delta = [target[0]-pos.x,target[1]-pos.y,target[2]-pos.z];
        let distance = (delta.iter().map(|v| v*v).sum::<f32>()).sqrt();
        if distance < 0.001 { break; }
        let amount = (4.0 / distance).min(1.0);
        let next = [pos.x+delta[0]*amount,pos.y+delta[1]*amount,pos.z+delta[2]*amount];
        place_ctf_body(room, player, next);
        room.tick(0.0);
    }
    room.tick(0.0);
}

#[tokio::test]
async fn real_ctf_capture_completion_archives_careers_once_and_history_survives_restart() {
    let (s, world, roster) = deployed_ctf(true).await;
    let runtime = s.runtimes.lock().await[&world].clone();
    let mut red = roster.iter().find(|(id, _)| s.connections.try_lock().unwrap()[id].team == Team::Red).unwrap().0.clone();
    let red_profile = s.connections.lock().await[&red].profile_id.clone().unwrap();
    let match_id;
    {
        let mut room = runtime.lock().await;
        let bases = room.round.as_ref().unwrap().bases;
        match_id = room.round.as_ref().unwrap().match_id.clone();
        for (index, (id, _)) in roster.iter().enumerate() {
            place_ctf_body(&mut room, id, [bases[0][0]+50.0+index as f32*8.0,bases[0][1],bases[0][2]+40.0]);
        }
        place_ctf_body(&mut room, &red, bases[0]);
        room.tick(0.0); room.tick(0.0);
        for _ in 0..3 {
            travel_ctf_body(&mut room, &red, bases[1]);
            assert_eq!(room.round.as_ref().unwrap().flags[1].carrier.as_deref(), Some(red.as_str()));
            travel_ctf_body(&mut room, &red, bases[0]);
        }
        assert_eq!(room.round.as_ref().unwrap().phase, crate::ctf::CtfPhase::Ended);
        assert_eq!(room.round.as_ref().unwrap().scores.red, 3);
    }
    s.maintain_matches().await;
    s.maintain_matches().await;
    assert_eq!(s.data.lock().await.completed_results.len(), 1);
    {
        let data = s.data.lock().await;
        assert_eq!(data.profiles.values().map(|p| p.progression.matches).sum::<u32>(), 10);
        assert_eq!(data.profiles.values().map(|p| p.progression.competitive_wins).sum::<u32>(), 5);
        let career = &data.profiles[&red_profile].progression.career;
        assert_eq!(career.summary.wins, 1);
        assert_eq!(career.summary.best.captures, 3);
        assert_eq!(career.summary.mvp, 1);
        assert_eq!(career.summary.play_of_the_game, 1);
    }
    let history = s.handle(&red,json!({"action":"career_history","mode":"competitive","hero":"tank"})).await.unwrap();
    assert_eq!(history["matches"][0]["match_id"], match_id);
    let detail = s.handle(&red,json!({"action":"career_match","match_id":match_id})).await.unwrap();
    assert_eq!(detail["match"]["score"], json!([3,0]));
    let red_identity=roster.iter().find(|(id,_)| id==&red).unwrap().1.clone();
    s.disconnect(&red).await;
    let (resumed,_,_)=client(&s,"Result reconnect").await;
    let (result_tx,mut result_rx)=tokio::sync::mpsc::unbounded_channel();
    s.connections.lock().await.get_mut(&resumed).unwrap().tx=result_tx;
    s.handle(&resumed,json!({"action":"identify","name":"Career driver 0","token":red_identity["token"]})).await.unwrap();
    let mut replayed=false;
    while let Ok(packet)=result_rx.try_recv() {
        let packet:Value=serde_json::from_str(&packet).unwrap();
        if packet["type"]=="match_result" { assert_eq!(packet["data"]["match_id"],match_id);replayed=true; }
    }
    assert!(replayed,"a reconnecting participant must receive the already-committed result");
    red=resumed;
    let (outsider, _, _) = client(&s, "Private history outsider").await;
    assert!(s.handle(&outsider,json!({"action":"career_match","match_id":match_id})).await.is_err());
    assert!(s.handle(&outsider,json!({"action":"match_result","winner":"blue","stats":{"kills":999}})).await.is_err());
    let mut reloaded = SocialData::load(&s.path).unwrap();
    super::matches::recover_archives(&s.path,&mut reloaded).unwrap();
    let committed = reloaded.completed_results.clone();
    let page = crate::alpha::career::read_history(&s.path,&red_profile,None,20,&committed).unwrap();
    assert_eq!(page.matches.len(),1);
    assert_eq!(page.matches[0].stats.captures,3);
    assert_eq!(reloaded.profiles[&red_profile].progression.career.summary.sessions,1);
    // A player asking for another game must queue while others view this result.
    assert_eq!(mode(&s,&red,"competitive","tank").await["status"],"queued");
    s.matches.lock().await.ended.insert(world,timestamp()-46);
    s.maintain_matches().await;
    s.maintain_alpha().await;
    assert!(s.alpha.lock().await.members.contains_key(&red));
    assert_eq!(s.runtimes.lock().await[&world].lock().await.round.as_ref().unwrap().phase,crate::ctf::CtfPhase::Waiting);
    cleanup(s).await;
}

#[tokio::test]
async fn practice_reconnect_deduplicates_retained_stats_and_saves_without_match_rewards() {
    let s=alpha_server();
    let (old,identity,_)=client(&s,"Persistent mechanic").await;
    mode(&s,&old,"sandbox","tank").await;
    s.spawn(&old,"road_precision","tank").await.unwrap();
    let runtime=s.runtime(&old).await.unwrap();
    runtime.lock().await.physics.vehicle_health.get_mut(&old).unwrap().note_damage_dealt(150.0);
    s.disconnect(&old).await;
    assert!(s.data.lock().await.completed_results.is_empty());
    let (new,_,_)=client(&s,"Reconnect placeholder").await;
    s.handle(&new,json!({"action":"identify","name":"Persistent mechanic","token":identity["token"]})).await.unwrap();
    runtime.lock().await.physics.vehicle_health.get_mut(&new).unwrap().note_damage_dealt(50.0);
    s.handle(&new,json!({"action":"mode_leave"})).await.unwrap();
    let profile=identity["profile_id"].as_str().unwrap();
    let data=s.data.lock().await;
    assert_eq!(data.profiles[profile].progression.matches,0);
    assert_eq!(data.profiles[profile].progression.career.summary.totals.damage_dealt,200.0);
    assert_eq!(data.profiles[profile].progression.career.summary.sessions,1);
    drop(data);
    let history=s.handle(&new,json!({"action":"career_history"})).await.unwrap();
    assert_eq!(history["matches"][0]["outcome"],"completed");
    cleanup(s).await;
}

#[tokio::test]
async fn interrupted_archive_commit_rolls_back_then_recovers_exactly_once() {
    let s=alpha_server();
    let (player,identity,_)=client(&s,"Crash recovery").await;
    let profile=identity["profile_id"].as_str().unwrap().to_string();
    let record=crate::alpha::career::CareerMatch {
        match_id:"server-recovery-result".into(),world_id:1,mode:crate::alpha::Mode::Competitive,
        map:"road_precision".into(),ended_at:timestamp(),duration_s:30.0,progression_eligible:true,winner:Some("red".into()),score:[3,0],
        participants:vec![crate::alpha::career::CareerParticipant {profile_id:profile.clone(),name:"Crash recovery".into(),team:Some("red".into()),hero:"tank".into(),stats:crate::alpha::career::CareerStats {kills:4,..Default::default()},..Default::default()}],..Default::default()
    };
    let baseline=SocialData::load(&s.path).unwrap();
    // A directory in place of the atomic temp file simulates a failed social
    // save after the full immutable record has reached disk.
    std::fs::create_dir(s.path.with_extension("tmp")).unwrap();
    assert!(s.persist_record(&record).await.is_err());
    assert!(s.data.lock().await.completed_results.is_empty());
    assert_eq!(s.data.lock().await.profiles[&profile].progression.matches,0);
    assert!(s.handle(&player,json!({"action":"career_match","match_id":record.match_id})).await.is_err());
    let mut restarted=baseline;
    super::matches::recover_archives(&s.path,&mut restarted).unwrap();
    super::matches::recover_archives(&s.path,&mut restarted).unwrap();
    assert_eq!(restarted.completed_results.len(),1);
    assert_eq!(restarted.profiles[&profile].progression.matches,1);
    assert_eq!(restarted.profiles[&profile].progression.career.summary.best.kills,4);
    cleanup(s).await;
}

#[tokio::test]
async fn running_ctf_reconnect_aggregates_new_body_and_records_explicit_leaver_without_rewards() {
    let (s, world, roster)=deployed_ctf(false).await;
    let (old, identity)=&roster[0];
    let runtime=s.runtimes.lock().await[&world].clone();
    runtime.lock().await.physics.vehicle_health.get_mut(old).unwrap().note_damage_dealt(100.0);
    assert!(s.handle(old,json!({"action":"hero_select","hero":"tank"})).await.unwrap_err().contains("locked for this CTF round"));
    s.disconnect(old).await;
    let (new,_,_)=client(&s,"Reconnect guest").await;
    s.handle(&new,json!({"action":"identify","name":"Career driver 0","token":identity["token"]})).await.unwrap();
    s.spawn(&new,"streaming_endless_city","brz").await.unwrap();
    runtime.lock().await.physics.vehicle_health.get_mut(&new).unwrap().note_damage_dealt(50.0);
    s.handle(&new,json!({"action":"mode_leave"})).await.unwrap();
    {
        let mut room=runtime.lock().await;
        room.round.as_mut().unwrap().duration_s=crate::physics::SIMULATION_DT;
        room.tick(0.0);
    }
    s.maintain_matches().await;
    s.maintain_matches().await;
    let profile=identity["profile_id"].as_str().unwrap();
    {
        let data=s.data.lock().await;
        let career=&data.profiles[profile].progression.career;
        assert_eq!(career.summary.totals.damage_dealt,150.0);
        assert_eq!(career.summary.sessions,1);
        assert_eq!(career.summary.losses,1);
        assert_eq!(career.summary.abandoned,1);
        assert_eq!(data.profiles[profile].progression.matches,0);
    }
    let history=s.handle(&new,json!({"action":"career_history","mode":"training"})).await.unwrap();
    assert_eq!(history["matches"][0]["outcome"],"loss");
    assert_eq!(history["matches"][0]["abandoned"],true);
    cleanup(s).await;
}

#[tokio::test]
async fn result_capacity_is_preflighted_and_existing_pending_archives_do_not_block_startup() {
    let s=alpha_server();
    let (_,identity,_)=client(&s,"Capacity driver").await;
    let profile=identity["profile_id"].as_str().unwrap().to_string();
    let record=crate::alpha::career::CareerMatch {
        match_id:"capacity-pending".into(),world_id:1,mode:crate::alpha::Mode::Sandbox,map:"road_precision".into(),ended_at:timestamp(),
        participants:vec![crate::alpha::career::CareerParticipant {profile_id:profile,name:"Capacity driver".into(),hero:"tank".into(),..Default::default()}],..Default::default()
    };
    s.data.lock().await.completed_results=(0..16384).map(|i| format!("old-result-{i}")).collect();
    assert!(s.persist_record(&record).await.unwrap_err().contains("ledger"));
    assert!(crate::alpha::career::pending_archives(&s.path,&s.data.lock().await.completed_results).unwrap().is_empty(),"logical capacity failure must precede archive creation");
    crate::alpha::career::write_match_archive(&s.path,&record).unwrap();
    let mut data=s.data.lock().await.clone();
    super::matches::recover_archives(&s.path,&mut data).unwrap();
    assert_eq!(data.completed_results.len(),16384);
    assert!(!data.completed_results.contains(&record.match_id));
    cleanup(s).await;
}

#[tokio::test]
async fn ctf_participant_history_budget_queues_new_profiles_but_preserves_reconnects() {
    let (s, world, roster)=deployed_ctf(false).await;
    for index in 2..32 {
        let (player,_,_)=client(&s,&format!("Replacement {index}")).await;
        assert_eq!(mode(&s,&player,"competitive","brz").await["status"],"joined");
        s.spawn(&player,"streaming_endless_city","brz").await.unwrap();
        s.handle(&player,json!({"action":"mode_leave"})).await.unwrap();
    }
    let (waiting,_,_)=client(&s,"Next round driver").await;
    assert_eq!(mode(&s,&waiting,"competitive","brz").await["status"],"queued");
    let (old,identity)=&roster[0];
    s.disconnect(old).await;
    let (resumed,_,_)=client(&s,"Resumed driver").await;
    s.handle(&resumed,json!({"action":"identify","name":"Career driver 0","token":identity["token"]})).await.unwrap();
    assert_eq!(s.connections.lock().await[&resumed].world_id,Some(world));
    s.spawn(&resumed,"streaming_endless_city","brz").await.unwrap();
    assert!(s.alpha.lock().await.members.contains_key(&resumed));
    assert!(s.alpha.lock().await.queue.iter().any(|t| t.player==waiting));
    cleanup(s).await;
}
