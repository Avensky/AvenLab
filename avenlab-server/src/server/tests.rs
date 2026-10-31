use super::*;

fn server(active: usize, players: usize) -> Server {
    Server {
        operations: Mutex::new(()),
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
