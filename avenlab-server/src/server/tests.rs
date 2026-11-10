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
    let (tx, _rx) = crate::outbox::channel();
    let (frame, _frame) = watch::channel(None);
    let (social, view) = watch::channel(None);
    let (input_tx, input) = watch::channel(None);
    server
        .register(
            player.clone(),
            Connection {
                tx,
                frame: frame.into(),
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
async fn anonymous_registration_is_bounded_without_waiting_for_control_plane() {
    let s = server(2, 10);
    let (identified, _, _) = client(&s, "Registered").await;
    let mut anonymous = s.connections.lock().await[&identified].clone();
    anonymous.profile_id = None;
    let operation = s.operations.lock().await;
    for i in 1..96 {
        tokio::time::timeout(std::time::Duration::from_secs(1),
            s.register(format!("anonymous-{i}"), anonymous.clone())).await.unwrap().unwrap();
    }
    assert!(s.register("excess".into(), anonymous).await.is_err());
    assert_eq!(s.connections.lock().await.len(), 96);
    drop(operation);
    cleanup(s).await;
}

#[tokio::test]
async fn anonymous_departure_does_not_rebuild_authenticated_social_views() {
    let s = server(2, 10);
    let (identified, _, _) = client(&s, "Registered").await;
    let mut anonymous = s.connections.lock().await[&identified].clone();
    anonymous.profile_id = None;
    s.register("anonymous".into(), anonymous).await.unwrap();
    // Publishing needs the data lock. An unrelated anonymous departure must not.
    let data = s.data.lock().await;
    tokio::time::timeout(std::time::Duration::from_secs(1), s.disconnect("anonymous")).await.unwrap();
    assert!(!s.connections.lock().await.contains_key("anonymous"));
    assert!(s.connections.lock().await.contains_key(&identified));
    drop(data);
    cleanup(s).await;
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
    let mut s = alpha_server(); s.max_active_worlds=1;
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
    s.handle(same_team, json!({"action":"hero_select","hero":"cx30"})).await.unwrap();
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
        mode(&s, &b, "sandbox", "cx30").await["status"],
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
    let original = mode(&s, &a, "sandbox", "cx30").await["world_id"].clone();
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
    assert_eq!(s.alpha.lock().await.members[&reconnected].hero, "cx30");
    s.disconnect(&reconnected).await;
    for reservation in s.alpha.lock().await.reservations.values_mut() {
        reservation.expires = timestamp() - 1;
    }
    s.maintain_alpha().await;
    assert!(s.connections.lock().await[&b].world_id.is_some());
    cleanup(s).await;
}
#[tokio::test]
async fn five_by_five_roles_respect_configured_match_budget_and_results_cannot_be_client_forged() {
    let mut s = alpha_server(); s.max_active_worlds=1;
    let mut players = Vec::new();
    let picks = [
        "tank", "tank", "ae86", "ae86", "brz", "brz", "cx30", "cx30", "camaro", "camaro",
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
async fn character_equip_validates_the_choice_and_persists_it_on_the_profile() {
    let s = server(1, 10);
    let (player, identity, _) = client(&s, "Driver").await;
    let profile = identity["profile_id"].as_str().unwrap();
    let legacy: crate::alpha::progression::Progression = serde_json::from_value(json!({"level": 7})).unwrap();
    assert!(legacy.view()["character"].is_null());
    assert_eq!(legacy.level, 7);

    let choice = json!({"id": "mara-vega", "outfit": "shop-crew"});
    let equip = json!({"action": "character_equip", "character": choice});
    assert!(s.handle("unknown", equip.clone()).await.is_err());
    assert_eq!(s.handle(&player, equip.clone()).await.unwrap()["character"], choice);
    assert_eq!(s.handle(&player, equip).await.unwrap()["character"], choice);
    let invalid = json!({"action": "character_equip", "character": {"id": "mara-vega", "outfit": "flight-line"}});
    assert!(s.handle(&player, invalid).await.is_err());
    let gender_change = json!({"action": "character_equip", "character": {"id": "jules-okafor", "outfit": "night-run"}});
    assert!(s.handle(&player, gender_change).await.unwrap_err().contains("gender is already set"));

    let mut styled = choice;
    styled["prop"] = json!("shop-bag");
    styled["appearance"] = json!({
        "hair": "cropped", "hair_color": "copper", "skin": "warm",
        "headwear": "hat", "color": "#101015", "accent": "#ff2d95",
    });
    let mut invalid_style = styled.clone();
    invalid_style["appearance"]["hair"] = json!("missing");
    assert!(s.handle(&player, json!({"action": "character_equip", "character": invalid_style})).await.is_err());
    assert_eq!(s.handle(&player, json!({"action": "character_equip", "character": styled})).await.unwrap()["character"], styled);
    for (field, value) in [("eye_color", "blue"), ("brow_color", "copper"), ("glasses", "aviator")] {
        let mut invalid_face = styled.clone();
        invalid_face["appearance"][field] = json!("missing");
        assert!(s.handle(&player, json!({"action": "character_equip", "character": invalid_face})).await.is_err());
        styled["appearance"][field] = json!(value);
    }
    assert_eq!(s.handle(&player, json!({"action": "character_equip", "character": styled})).await.unwrap()["character"], styled);
    for (field, value) in [("color", "deep-navy"), ("hair_color", "dark-auburn"), ("eye_color", "obsidian")] {
        styled["appearance"][field] = json!(value);
    }
    assert_eq!(s.handle(&player, json!({"action": "character_equip", "character": styled})).await.unwrap()["character"], styled);
    let reloaded: SocialData = serde_json::from_slice(&tokio::fs::read(&s.path).await.unwrap()).unwrap();
    let progression = &reloaded.profiles[profile].progression;
    assert_eq!(progression.view()["character"], styled);
    assert_eq!(progression.showcase_hero(), "brz");
    assert!(progression.hero_loadouts.is_empty());
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
    profile.progression.hero_loadouts.insert("cx30".into(), appearance.clone());
    profile.progression.character = Some(crate::alpha::character::CharacterChoice { id: "niko-park".into(), outfit: "field-kit".into(), appearance: None, prop: None });
    let mut alpha = AlphaState::default();
    alpha.members.insert(player.clone(), Member { mode: Mode::Quickplay, team_size:5, world: 7, hero: "cx30".into(), team: Team::Red });
    let clients = server.connections.lock().await;
    let view = Server::alpha_view(&alpha, &profile_id, &player, &clients, &data, server.max_active_worlds);
    let card = &view["roster"][0];
    assert_eq!(card["appearance"]["body"], "#ed258d");
    assert_eq!(card["appearance"]["finish"], "soft");
    assert_eq!(card["character"], json!({"id": "niko-park", "outfit": "field-kit"}));
    assert_eq!(card["world_id"], 7);
    assert!(card.get("token_hash").is_none());
    assert!(card.get("hero_loadouts").is_none());
    let member = alpha.members.remove(&player).unwrap();
    alpha.reservations.insert(profile_id.clone(), Reservation { retained_player:None, member, expires: timestamp() + 30 });
    let reserved = Server::alpha_view(&alpha, &profile_id, &player, &clients, &data, server.max_active_worlds);
    assert_eq!(reserved["roster"][0]["appearance"], card["appearance"]);
    assert_eq!(reserved["roster"][0]["character"], card["character"]);
    assert_eq!(reserved["roster"][0]["reconnecting"], true);
    assert_eq!(reserved["roster"][0]["world_id"], 7);
    alpha.reservations.get_mut(&profile_id).unwrap().member.hero = "tank".into();
    let factory = Server::alpha_view(&alpha, &profile_id, &player, &clients, &data, server.max_active_worlds);
    assert_eq!(factory["roster"][0]["appearance"]["body"], "factory");
    drop(clients);
    drop(data);
    cleanup(server).await;
}

#[tokio::test]
async fn enemy_lobby_picks_are_hidden_until_their_exact_world_has_started() {
    use crate::alpha::{AlphaState,Member,Mode,Reservation};
    use crate::ctf::CtfPhase;
    let s=server(3,24);
    let (me,identity,_)=client(&s,"Local driver").await;
    let (ally,ally_identity,_)=client(&s,"Ally driver").await;
    let (enemy,enemy_identity,_)=client(&s,"Enemy driver").await;
    let profile=identity["profile_id"].as_str().unwrap();
    let ally_profile=ally_identity["profile_id"].as_str().unwrap();
    let enemy_profile=enemy_identity["profile_id"].as_str().unwrap();
    let mut a=AlphaState::default();
    for (id,hero,team) in [(&me,"tank",Team::Red),(&ally,"brz",Team::Red),(&enemy,"cx30",Team::Blue)] {
        a.members.insert(id.clone(),Member{mode:Mode::Competitive,team_size:3,world:7,hero:hero.into(),team});
    }
    let mut data=s.data.lock().await;
    let mut paint=crate::alpha::appearance::HeroAppearance::default();paint.body="#ed258d".into();
    data.profiles.get_mut(enemy_profile).unwrap().progression.hero_loadouts.insert("cx30".into(),paint);
    data.profiles.get_mut(enemy_profile).unwrap().progression.character = Some(crate::alpha::character::CharacterChoice { id: "jules-okafor".into(), outfit: "race-crew".into(), appearance: None, prop: None });
    let clients=s.connections.lock().await;
    let mut phases=HashMap::from([(7,("round-seven".into(),CtfPhase::Waiting)),(8,("other-round".into(),CtfPhase::Running))]);
    let view=Server::alpha_view_for_phases(&a,profile,&me,&clients,&data,3,&phases);
    assert_eq!(view["active"]["match_id"],"round-seven");assert_eq!(view["active"]["match_phase"],"waiting");
    let card=|view:&Value,id:&str|view["roster"].as_array().unwrap().iter().find(|card|card["id"]==id).unwrap().clone();
    let hidden=card(&view,enemy_profile);
    assert_eq!(hidden["hero_hidden"],true);assert_eq!(hidden["hero"],"");assert_eq!(hidden["showcase_hero"],"");assert!(hidden["appearance"].is_null());
    assert!(hidden["character"].is_null());
    assert_eq!(card(&view,ally_profile)["hero"],"brz");assert_eq!(card(&view,profile)["hero"],"tank");
    let member=a.members.remove(&enemy).unwrap();a.reservations.insert(enemy_profile.into(),Reservation{member,expires:timestamp()+30,retained_player:None});
    let reserved=Server::alpha_view_for_phases(&a,profile,&me,&clients,&data,3,&phases);
    assert_eq!(card(&reserved,enemy_profile)["hero_hidden"],true);assert_eq!(card(&reserved,enemy_profile)["reconnecting"],true);
    for phase in [CtfPhase::Running,CtfPhase::Ended] {
        phases.insert(7,("round-seven".into(),phase));
        let started=Server::alpha_view_for_phases(&a,profile,&me,&clients,&data,3,&phases);
        let revealed=card(&started,enemy_profile);assert_eq!(revealed["hero_hidden"],false);assert_eq!(revealed["hero"],"cx30");assert_eq!(revealed["appearance"]["body"],"#ed258d");
        assert_eq!(revealed["character"]["outfit"], "race-crew");
    }
    drop(clients);drop(data);cleanup(s).await;
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
    let picks: Vec<_> = if strict { vec!["tank","tank","ae86","ae86","brz","brz","cx30","cx30","camaro","camaro"] } else { vec!["brz"; 10] };
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
    // Cap fixture travel so a regression reports its last pose instead of
    // keeping the entire server suite alive indefinitely.
    let mut steps = 0;
    loop {
        let pos = room.physics.bodies[room.physics.vehicles[player].body].translation();
        let delta = [target[0]-pos.x,target[1]-pos.y,target[2]-pos.z];
        let distance = (delta.iter().map(|v| v*v).sum::<f32>()).sqrt();
        if distance < 0.001 { break; }
        steps += 1;
        assert!(steps < 1024, "CTF travel stalled at {pos:?}, heading for {target:?}");
        let amount = (4.0 / distance).min(1.0);
        let next = [pos.x+delta[0]*amount,pos.y+delta[1]*amount,pos.z+delta[2]*amount];
        place_ctf_body(room, player, next);
        room.tick(0.0);
    }
    room.tick(0.0);
}

#[tokio::test]
async fn real_ctf_capture_completion_archives_careers_once_and_history_survives_restart() {
    let (mut s, world, roster) = deployed_ctf(true).await; s.max_active_worlds=1;
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
    let (result_tx,mut result_rx)=crate::outbox::channel();
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
async fn running_match_hero_changes_require_own_spawn_and_valid_role() {
    let (s, world, roster) = deployed_ctf(true).await;
    let (player, _) = &roster[2];
    let runtime = s.runtimes.lock().await[&world].clone();
    let home = {
        let mut room = runtime.lock().await;
        let position = *room.physics.bodies[room.physics.vehicles[player].body].translation();
        assert!(room.physics.can_change_hero_at_spawn(player));
        let enemy = if room.game.entities[player].team == Team::Red { 1 } else { 0 };
        let enemy_base = room.physics.ctf_bases().unwrap()[enemy];
        place_ctf_body(&mut room, player, enemy_base);
        assert!(!room.physics.can_change_hero_at_spawn(player));
        place_ctf_body(&mut room, player, [position.x, position.y + 6.0, position.z]);
        [position.x, position.y, position.z]
    };
    let rejected = s.handle(player, json!({"action":"hero_select","hero":"brz"})).await.unwrap_err();
    assert!(rejected.contains("spawn area"));
    assert_eq!(s.alpha.lock().await.members[player].hero, "ae86");
    {
        let mut room = runtime.lock().await;
        place_ctf_body(&mut room, player, home);
        room.physics.ctf_carriers.insert(player.clone());
        assert!(!room.physics.can_change_hero_at_spawn(player));
        room.physics.ctf_carriers.remove(player);
    }
    let rejected = s.handle(player, json!({"action":"hero_select","hero":"tank"})).await.unwrap_err();
    assert!(rejected.contains("invalid 5-player team"));
    let changed = s.handle(player, json!({"action":"hero_select","hero":"brz"})).await.unwrap();
    assert_eq!(changed["hero"], "brz");
    assert_eq!(s.alpha.lock().await.members[player].hero, "brz");
    assert_eq!(runtime.lock().await.game.entities[player].vehicle_id.as_deref(), Some("brz"));
    cleanup(s).await;
}

#[tokio::test]
async fn running_ctf_reconnect_aggregates_new_body_and_records_explicit_leaver_without_rewards() {
    let (s, world, roster)=deployed_ctf(false).await;
    let (old, identity)=&roster[0];
    let runtime=s.runtimes.lock().await[&world].clone();
    runtime.lock().await.physics.vehicle_health.get_mut(old).unwrap().note_damage_dealt(100.0);
    assert_eq!(s.handle(old,json!({"action":"hero_select","hero":"brz"})).await.unwrap()["hero"], "brz");
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
async fn live_match_reserves_reconnects_then_backfills_the_vacant_side() {
    let (mut s, world, roster) = deployed_ctf(true).await;
    s.max_active_worlds = 1;
    let (old, identity) = &roster[0];
    let seat = s.alpha.lock().await.members[old].clone();
    let runtime = s.runtimes.lock().await[&world].clone();
    let match_id = runtime.lock().await.round.as_ref().unwrap().match_id.clone();
    let (waiting, _, _) = client(&s, "Replacement").await;
    assert_eq!(mode(&s, &waiting, "competitive", "").await["status"], "queued");
    s.disconnect(old).await;
    s.maintain_alpha().await;
    assert!(s.connections.lock().await[&waiting].world_id.is_none());

    let (resumed, _, _) = client(&s, "Returning driver").await;
    s.handle(&resumed, json!({"action":"identify","token":identity["token"]})).await.unwrap();
    let restored = s.alpha.lock().await.members[&resumed].clone();
    assert_eq!((restored.world, restored.team, &restored.hero), (world, seat.team, &seat.hero));
    s.spawn(&resumed, "streaming_endless_city", "tank").await.unwrap();
    s.disconnect(&resumed).await;
    let profile = identity["profile_id"].as_str().unwrap();
    s.alpha.lock().await.reservations.get_mut(profile).unwrap().expires = timestamp();
    s.maintain_alpha().await;
    let replacement = s.alpha.lock().await.members[&waiting].clone();
    assert_eq!((replacement.world, replacement.team), (world, seat.team));
    assert!(replacement.hero.is_empty());
    assert!(s.handle(&waiting, json!({"action":"hero_select","hero":"brz"})).await.is_err());
    s.handle(&waiting, json!({"action":"hero_select","hero":"tank"})).await.unwrap();
    assert!(s.handle(&waiting, json!({"action":"hero_select","hero":"ae86"})).await.is_err());
    s.spawn(&waiting, "streaming_endless_city", "tank").await.unwrap();
    assert_eq!(runtime.lock().await.round.as_ref().unwrap().match_id, match_id);

    let (late, _, _) = client(&s, "Late return").await;
    s.handle(&late, json!({"action":"identify","token":identity["token"]})).await.unwrap();
    assert!(s.connections.lock().await[&late].world_id.is_none());
    assert_eq!(mode(&s, &late, "competitive", "").await["status"], "queued");
    // Leaving voluntarily releases the seat. A former participant waiting at
    // the head of the queue cannot change sides or block the next eligible driver.
    let (next, _, _) = client(&s, "Next replacement").await;
    assert_eq!(mode(&s, &next, "competitive", "").await["status"], "queued");
    s.handle(&waiting, json!({"action":"mode_leave"})).await.unwrap();
    s.maintain_alpha().await;
    assert_eq!(s.connections.lock().await[&next].world_id, Some(world));
    assert!(s.connections.lock().await[&late].world_id.is_none());
    runtime.lock().await.round.as_mut().unwrap().phase = crate::ctf::CtfPhase::Ended;
    s.handle(&next, json!({"action":"mode_leave"})).await.unwrap();
    let (postgame, _, _) = client(&s, "Postgame").await;
    assert_eq!(mode(&s, &postgame, "competitive", "").await["status"], "queued");
    s.maintain_alpha().await;
    assert!(s.connections.lock().await[&postgame].world_id.is_none());
    cleanup(s).await;
}


#[tokio::test]
async fn skirmish_admits_six_unpicked_seats_and_reserves_reconnects_without_mixing_modes() {
    let mut s = alpha_server(); s.max_active_worlds=1;
    let mut seats = Vec::new();
    let mut world = 0;
    for index in 0..6 {
        let (player, identity, _) = client(&s, &format!("3v3 seat {index}")).await;
        let joined = mode(&s, &player, "skirmish", "").await;
        assert_eq!(joined["status"], "joined");
        world = joined["world_id"].as_u64().unwrap() as usize;
        seats.push((player, identity));
    }
    let alpha = s.alpha.lock().await.clone();
    assert_eq!(alpha.members.len(), 6);
    for team in [Team::Red, Team::Blue] { assert_eq!(alpha.members.values().filter(|m| m.team == team).count(), 3); }
    assert_eq!(s.data.lock().await.worlds[&world].max_players, 6);
    let original = &seats[0].0;
    let team = alpha.members[original].team;
    let ally = seats.iter().find(|(id, _)| id != original && alpha.members[id].team == team).unwrap().0.clone();
    s.handle(original, json!({"action":"hero_select","hero":"tank"})).await.unwrap();
    assert!(s.handle(&ally, json!({"action":"hero_select","hero":"tank"})).await.is_err());
    s.handle(&ally, json!({"action":"hero_select","hero":"ae86"})).await.unwrap();
    assert!(s.handle(&ally, json!({"action":"hero_select","hero":"tank"})).await.is_err());
    let (seventh, _, _) = client(&s, "Seventh 3v3 player").await;
    assert_eq!(mode(&s, &seventh, "skirmish", "").await["status"], "queued");
    let (five_by_five, _, _) = client(&s, "5v5 waits for 3v3").await;
    assert_eq!(mode(&s, &five_by_five, "quickplay", "").await["status"], "queued");
    s.disconnect(original).await;
    s.maintain_alpha().await;
    assert!(s.connections.lock().await[&seventh].world_id.is_none(), "the sixth seat is reserved, not reusable");
    let (resumed, _, view) = client(&s, "Reconnect placeholder").await;
    s.handle(&resumed, json!({"action":"identify","name":"3v3 seat 0","token":seats[0].1["token"]})).await.unwrap();
    let member = s.alpha.lock().await.members[&resumed].clone();
    assert_eq!(member.mode, crate::alpha::Mode::Skirmish);
    assert_eq!(member.world, world);
    assert_eq!(member.team, team);
    assert_eq!(member.hero, "tank");
    let packet: Value = serde_json::from_str(view.borrow().as_ref().unwrap()).unwrap();
    assert_eq!(packet["data"]["alpha"]["active"]["team_size"], 3);
    assert_eq!(packet["data"]["alpha"]["active"]["capacity"], 6);
    assert_eq!(packet["data"]["alpha"]["active"]["role_caps"], json!({"tank":1,"dps":1,"support":1}));
    assert_eq!(s.runtimes.lock().await.len(), 1);
    assert!(s.alpha.lock().await.members.values().all(|m| m.mode == crate::alpha::Mode::Skirmish));
    s.handle(&resumed, json!({"action":"mode_cancel"})).await.unwrap();
    s.maintain_alpha().await;
    assert_eq!(s.alpha.lock().await.members[&seventh].world, world);
    assert!(s.connections.lock().await[&five_by_five].world_id.is_none());
    cleanup(s).await;
}

#[tokio::test]
async fn skirmish_starts_only_with_six_deployed_roles_and_archives_its_own_mode_once() {
    let s = alpha_server();
    let picks = ["tank", "tank", "ae86", "ae86", "cx30", "cx30"];
    let mut world = 0;
    let mut roster = Vec::new();
    for (index, hero) in picks.iter().enumerate() {
        let (player, identity, _) = client(&s, &format!("Scored 3v3 {index}")).await;
        let joined = mode(&s, &player, "skirmish", hero).await;
        assert_eq!(joined["status"], "joined");
        world = joined["world_id"].as_u64().unwrap() as usize;
        s.spawn(&player, "streaming_endless_city", crate::alpha::policy::hero(hero).unwrap().vehicle).await.unwrap();
        let runtime = s.runtimes.lock().await[&world].clone();
        let phase = runtime.lock().await.round.as_ref().unwrap().phase;
        assert_eq!(phase, if index == 5 { crate::ctf::CtfPhase::Running } else { crate::ctf::CtfPhase::Waiting });
        roster.push((player, identity));
    }
    let runtime = s.runtimes.lock().await[&world].clone();
    {
        let mut room = runtime.lock().await;
        assert_eq!(room.round.as_ref().unwrap().mode, "skirmish");
        assert!(!room.round.as_ref().unwrap().training);
        room.round.as_mut().unwrap().duration_s = 0.001;
        room.tick(0.0);
        assert_eq!(room.round.as_ref().unwrap().phase, crate::ctf::CtfPhase::Ended);
    }
    s.maintain_matches().await; s.maintain_matches().await;
    let data = s.data.lock().await;
    assert_eq!(data.completed_results.len(), 1);
    assert_eq!(data.profiles.values().map(|p| p.progression.matches).sum::<u32>(), 6);
    for (_, identity) in &roster {
        let profile = &data.profiles[identity["profile_id"].as_str().unwrap()];
        assert_eq!(profile.progression.career.by_mode["skirmish"].matches, 1);
        assert_eq!(profile.progression.career.by_mode["skirmish"].draws, 1);
        assert!(!profile.progression.career.by_mode.contains_key("competitive"));
    }
    drop(data);
    let history = s.handle(&roster[0].0, json!({"action":"career_history","mode":"skirmish"})).await.unwrap();
    assert_eq!(history["matches"].as_array().unwrap().len(), 1);
    assert_eq!(history["matches"][0]["mode"], "skirmish");
    cleanup(s).await;
}

#[tokio::test]
async fn skirmish_verified_rewards_are_nonranked_and_cannot_be_duplicated() {
    let s = alpha_server();
    let mut world = 0;
    for (index, hero) in ["tank", "tank", "ae86", "ae86", "cx30", "cx30"].iter().enumerate() {
        let (player, _, _) = client(&s, &format!("3v3 result {index}")).await;
        let joined = mode(&s, &player, "skirmish", hero).await;
        assert_eq!(joined["status"], "joined");
        world = joined["world_id"].as_u64().unwrap() as usize;
        if index == 0 { assert!(s.record_completed_match(world, Team::Red, "3v3-incomplete").await.is_err()); }
    }
    for _ in 0..2 { s.record_completed_match(world, Team::Red, "trusted-3v3-result").await.unwrap(); }
    let data = s.data.lock().await;
    assert_eq!(data.completed_results.len(), 1);
    assert_eq!(data.profiles.values().map(|p| p.progression.matches).sum::<u32>(), 6);
    assert_eq!(data.profiles.values().map(|p| p.progression.competitive_wins).sum::<u32>(), 0);
    assert_eq!(data.profiles.values().map(|p| p.progression.quickplay_wins).sum::<u32>(), 3);
    assert_eq!(data.profiles.values().map(|p| p.progression.career.by_mode["skirmish"].wins).sum::<u64>(), 3);
    drop(data); cleanup(s).await;
}

#[tokio::test]
async fn skirmish_flexible_composition_remains_training_without_progression() {
    let s = alpha_server(); s.alpha.lock().await.enforce_roles = false;
    let mut world = 0;
    for index in 0..6 {
        let (player, _, _) = client(&s, &format!("3v3 training {index}")).await;
        let joined = mode(&s, &player, "skirmish", "tank").await;
        assert_eq!(joined["status"], "joined"); world = joined["world_id"].as_u64().unwrap() as usize;
        s.spawn(&player, "streaming_endless_city", "tank").await.unwrap();
        if index < 5 {
            assert_eq!(s.runtimes.lock().await[&world].lock().await.round.as_ref().unwrap().phase,crate::ctf::CtfPhase::Waiting);
        }
    }
    let runtime = s.runtimes.lock().await[&world].clone();
    {
        let mut room = runtime.lock().await;
        assert_eq!(room.round.as_ref().unwrap().phase, crate::ctf::CtfPhase::Running);
        assert!(room.round.as_ref().unwrap().training);
        room.round.as_mut().unwrap().duration_s = 0.001; room.tick(0.0);
    }
    s.maintain_matches().await; s.maintain_matches().await;
    let data = s.data.lock().await;
    assert_eq!(data.completed_results.len(), 1);
    assert_eq!(data.profiles.values().map(|p| p.progression.matches).sum::<u32>(), 0);
    assert!(data.profiles.values().all(|p| !p.progression.career.by_mode.contains_key("skirmish")));
    assert_eq!(data.profiles.values().map(|p| p.progression.career.by_mode["training"].matches).sum::<u64>(), 6);
    drop(data); cleanup(s).await;
}

#[tokio::test]
async fn match_formats_fill_compatible_lobbies_and_allocate_bounded_concurrent_games() {
    let mut s=alpha_server();s.max_active_worlds=4;s.max_players=40;
    let mut first=Vec::new();
    for mode_name in ["quickplay","competitive"] {for size in [3,5] {
        let (player,_,view)=client(&s,&format!("{mode_name} {size}")).await;
        let joined=s.handle(&player,json!({"action":"mode_join","mode":mode_name,"team_size":size})).await.unwrap();
        assert_eq!(joined["status"],"joined");assert_eq!(joined["team_size"],size);
        let world=joined["world_id"].as_u64().unwrap() as usize;
        let packet:Value=serde_json::from_str(view.borrow().as_ref().unwrap()).unwrap();
        let active=&packet["data"]["alpha"]["active"];
        assert_eq!(active["mode"],mode_name);assert_eq!(active["team_size"],size);assert_eq!(active["capacity"],size*2);
        assert_eq!(packet["data"]["worlds"].as_array().unwrap().iter().find(|w|w["id"]==world).unwrap()["team_size"],size);
        assert_eq!(s.runtimes.lock().await[&world].lock().await.round.as_ref().unwrap().team_size,size as usize);
        first.push((player,world,mode_name,size));
    }}
    assert_eq!(first.iter().map(|(_,w,_,_)|*w).collect::<std::collections::HashSet<_>>().len(),4);
    let qp3=first[0].1;
    for i in 1..6 {let (p,_,_)=client(&s,&format!("QP3 fill {i}")).await;let joined=s.handle(&p,json!({"action":"mode_join","mode":"quickplay","team_size":3})).await.unwrap();assert_eq!(joined["world_id"],qp3);}
    let (overflow,_,view)=client(&s,"QP3 overflow").await;
    assert_eq!(s.handle(&overflow,json!({"action":"mode_join","mode":"quickplay","team_size":3})).await.unwrap()["status"],"queued");
    let snapshot:Value=serde_json::from_str(view.borrow().as_ref().unwrap()).unwrap();assert_eq!(snapshot["data"]["alpha"]["queue"]["team_size"],3);
    let (five,_,_)=client(&s,"QP5 not blocked").await;
    assert_eq!(s.handle(&five,json!({"action":"mode_join","mode":"quickplay","team_size":5})).await.unwrap()["world_id"],first[1].1);
    s.handle(&first[3].0,json!({"action":"mode_leave"})).await.unwrap();s.maintain_alpha().await;
    let second=s.alpha.lock().await.members[&overflow].world;assert_ne!(second,qp3);assert_eq!(s.runtimes.lock().await.len(),4);
    assert_eq!(s.alpha.lock().await.members[&overflow].team_size,3);
    cleanup(s).await;
}

#[tokio::test]
async fn invalid_match_sizes_do_not_release_existing_seats_and_missing_size_defaults_to_five() {
    let s=alpha_server();let (player,_,_)=client(&s,"Size validation").await;
    let first=mode(&s,&player,"competitive","").await;assert_eq!(first["team_size"],5);
    for size in [json!(0),json!(4),json!(999),json!("3"),json!(null)] {
        assert!(s.handle(&player,json!({"action":"mode_join","mode":"quickplay","team_size":size})).await.is_err());
        assert_eq!(s.connections.lock().await[&player].world_id,Some(first["world_id"].as_u64().unwrap() as usize));
    }
    cleanup(s).await;
}

#[tokio::test]
async fn competitive_three_by_three_uses_size_roles_and_records_size_without_changing_rules() {
    let mut s=alpha_server();s.max_active_worlds=2;
    let mut players=Vec::new();let mut world=0;
    for (index,hero) in ["tank","tank","brz","brz","cx30","cx30"].into_iter().enumerate(){
        let (player,identity,_)=client(&s,&format!("Competitive three {index}")).await;
        let joined=s.handle(&player,json!({"action":"mode_join","mode":"competitive","team_size":3,"hero":hero})).await.unwrap();
        assert_eq!(joined["status"],"joined");world=joined["world_id"].as_u64().unwrap() as usize;
        s.spawn(&player,"streaming_endless_city",crate::alpha::policy::hero(hero).unwrap().vehicle).await.unwrap();players.push((player,identity));
    }
    let runtime=s.runtimes.lock().await[&world].clone();{
        let room=runtime.lock().await;assert_eq!(room.round.as_ref().unwrap().phase,crate::ctf::CtfPhase::Running);assert_eq!(room.round.as_ref().unwrap().mode,"competitive");assert_eq!(room.round_view().unwrap().team_size,3);
    }
    s.record_completed_match(world,Team::Red,"competitive-three-format").await.unwrap();
    let history=s.handle(&players[0].0,json!({"action":"career_history"})).await.unwrap();assert_eq!(history["matches"][0]["team_size"],3);assert_eq!(history["matches"][0]["mode"],"competitive");
    let (outsider,_,_)=client(&s,"New round entrant").await;
    let newer=s.handle(&outsider,json!({"action":"mode_join","mode":"competitive","team_size":3})).await.unwrap();assert_eq!(newer["status"],"joined");assert_ne!(newer["world_id"],world);
    let original=players[0].0.clone();let team=s.alpha.lock().await.members[&original].team;
    s.disconnect(&original).await;let (resumed,_,_)=client(&s,"Resumed competition").await;
    s.handle(&resumed,json!({"action":"identify","token":players[0].1["token"]})).await.unwrap();
    let member=s.alpha.lock().await.members[&resumed].clone();assert_eq!(member.world,world);assert_eq!(member.mode,crate::alpha::Mode::Competitive);assert_eq!(member.team_size,3);assert_eq!(member.team,team);
    cleanup(s).await;
}

#[tokio::test]
async fn old_match_results_cannot_interrupt_another_world_or_a_reused_round() {
    use crate::alpha::career::{CareerMatch,CareerParticipant};
    let s=server(2,10);let (away,away_identity,_)=client(&s,"Moved to new game").await;let (current,current_identity,_)=client(&s,"Current result viewer").await;
    let (away_tx,mut away_rx)=crate::outbox::channel();let (current_tx,mut current_rx)=crate::outbox::channel();
    {let mut clients=s.connections.lock().await;let peer=clients.get_mut(&away).unwrap();peer.world_id=Some(2);peer.tx=away_tx;let peer=clients.get_mut(&current).unwrap();peer.world_id=Some(1);peer.tx=current_tx;}
    let mut room=WorldRuntime::new(1,"road_precision").unwrap();let mut round=crate::ctf::CtfRound::new("quickplay",false,[[0.0,0.0,0.0],[50.0,0.0,0.0]]).unwrap();round.match_id="ended-current-round".into();round.phase=crate::ctf::CtfPhase::Ended;room.round=Some(round);s.runtimes.lock().await.insert(1,Arc::new(Mutex::new(room)));s.matches.lock().await.ended.insert(1,timestamp());
    let mut record=CareerMatch{match_id:"ended-current-round".into(),world_id:1,mode:crate::alpha::Mode::Quickplay,team_size:Some(3),map:"road_precision".into(),ended_at:timestamp(),participants:vec![CareerParticipant{profile_id:away_identity["profile_id"].as_str().unwrap().into(),name:"Moved to new game".into(),team:Some("red".into()),hero:"brz".into(),..Default::default()},CareerParticipant{profile_id:current_identity["profile_id"].as_str().unwrap().into(),name:"Current result viewer".into(),team:Some("blue".into()),hero:"brz".into(),..Default::default()}],..Default::default()};
    s.persist_record(&record).await.unwrap();
    assert!(away_rx.try_recv().is_err(),"a participant now in world2 must not receive a world1 result overlay");
    let packet:Value=serde_json::from_str(&current_rx.try_recv().unwrap()).unwrap();assert_eq!(packet["type"],"match_result");assert_eq!(packet["data"]["team_size"],3);
    record.match_id="old-round-archive-retry".into();s.persist_record(&record).await.unwrap();
    assert!(current_rx.try_recv().is_err(),"world ID reuse cannot show the result of a different round");
    assert_eq!(s.data.lock().await.profiles[away_identity["profile_id"].as_str().unwrap()].progression.career.summary.sessions,2,"departed participants still receive durable career records");
    cleanup(s).await;
}

#[tokio::test]
async fn only_world_owner_can_switch_and_persist_tire_thermals() {
    let s=server(2,10);
    let (owner,_,_)=client(&s,"Tire host").await;
    let (guest,_,_)=client(&s,"Tire guest").await;
    let id=world(&s,&owner,"Rubber range","",true).await;
    s.handle(&owner,json!({"action":"world_join","world_id":id})).await.unwrap();
    let runtime=s.runtimes.lock().await[&id].clone();
    assert!(!runtime.lock().await.physics.tire_thermals);
    let enable=json!({"action":"world_tire_thermals","world_id":id,"enabled":true});
    assert!(s.handle(&guest,enable.clone()).await.is_err());
    s.handle(&owner,enable).await.unwrap();
    assert!(runtime.lock().await.physics.tire_thermals);
    let saved:SocialData=serde_json::from_slice(&std::fs::read(&s.path).unwrap()).unwrap();
    assert!(saved.worlds[&id].tire_thermals);
    s.handle(&owner,json!({"action":"world_tire_thermals","world_id":id,"enabled":false})).await.unwrap();
    assert!(!runtime.lock().await.physics.tire_thermals);
    cleanup(s).await;
}

#[tokio::test]
async fn reads_leave_other_social_subscribers_alone_and_mutations_still_broadcast() {
    let s = server(2, 10);
    let (a, identity, mut a_view) = client(&s, "Reader").await;
    let (b, _, mut b_view) = client(&s, "Observer").await;
    a_view.borrow_and_update();
    b_view.borrow_and_update();
    // Make both projections stale so wire deduplication cannot mask a full broadcast.
    let actor = identity["profile_id"].as_str().unwrap();
    s.data.lock().await.profiles.get_mut(actor).unwrap().name = "Changed".into();
    s.handle(&a, json!({"action":"career_history"})).await.unwrap();
    assert!(!a_view.has_changed().unwrap() && !b_view.has_changed().unwrap());
    s.handle(&a, json!({"action":"refresh"})).await.unwrap();
    assert!(a_view.has_changed().unwrap() && !b_view.has_changed().unwrap());
    let view: Value = serde_json::from_str(a_view.borrow_and_update().as_deref().unwrap()).unwrap();
    assert_eq!(view["data"]["profile"]["name"], "Changed");
    let id = world(&s, &b, "Shared range", "", true).await;
    assert!(a_view.has_changed().unwrap() && b_view.has_changed().unwrap());
    let outsider: Value = serde_json::from_str(a_view.borrow().as_deref().unwrap()).unwrap();
    let listed = outsider["data"]["worlds"].as_array().unwrap().iter().find(|w| w["id"] == id).unwrap();
    assert!(listed["invite_code"].is_null());
    assert_eq!(listed["members"], json!([]));
    cleanup(s).await;
}
