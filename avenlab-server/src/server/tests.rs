use super::*;

fn server(active: usize, players: usize) -> Server {
    Server {
        operations: Mutex::new(()),
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
