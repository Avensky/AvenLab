use super::*;

impl Server {
    /// A replaceable, personalized view. Password hashes and guest credentials
    /// stay inside SocialData; private worlds appear only to authorized viewers.
    pub async fn publish(&self) {
        self.publish_for(None).await;
    }

    /// A manual refresh needs only the requesting player's personalized view.
    pub(super) async fn publish_for(&self, recipient: Option<&str>) {
        let has_recipient = self.connections.lock().await.iter().any(|(id, client)| {
            client.profile_id.is_some() && recipient.is_none_or(|target| target == id)
        });
        if !has_recipient { return; }

        // Discovery validates the installed collider files. Read them once per
        // publication on a blocking worker, outside the social/physics locks.
        let Ok(maps) = tokio::task::spawn_blocking(available_maps).await else {
            return;
        };
        // Read room phases before acquiring the control-plane data locks. A
        // room may checkpoint a match through those locks while it is held.
        let runtimes = self.runtimes.lock().await.clone();
        let mut phases = HashMap::new();
        for (world, runtime) in &runtimes {
            if let Some(round) = runtime.lock().await.round.as_ref() {
                phases.insert(*world, (round.match_id.clone(), round.phase));
            }
        }
        let data = self.data.lock().await;
        let clients = self.connections.lock().await;
        let alpha = self.alpha.lock().await;
        // Each personalized view lists other players. Index identities once
        // instead of scanning all connections for every person in every view.
        let by_profile: HashMap<&str, &Connection> = clients.values()
            .filter_map(|client| client.profile_id.as_deref().map(|id| (id, client))).collect();
        let now = timestamp();
        let mut world_members: HashMap<usize, Vec<Value>> = HashMap::new();
        let mut active_players = 0;
        for (id, peer) in clients.iter() {
            let Some(world) = peer.world_id else { continue; };
            active_players += 1;
            let profile = peer.profile_id.as_ref().and_then(|id| data.profiles.get(id));
            world_members.entry(world).or_default().push(json!({
                "player_id": id, "profile_id": peer.profile_id,
                "name": profile.map_or("GUEST", |p| p.name.as_str()),
                "level": profile.map(|p| p.progression.level), "team": peer.team.as_str()
            }));
        }
        for (player, client) in clients.iter() {
            if recipient.is_some_and(|target| target != player) { continue; }
            let Some(actor) = client.profile_id.as_ref() else {
                continue;
            };
            let Some(profile) = data.profiles.get(actor) else {
                continue;
            };
            let person = |id: &String| {
                let online = by_profile.get(id.as_str()).copied();
                json!({"id":id,"name":data.profiles.get(id).map(|p|p.name.as_str()).unwrap_or("Unavailable player"),"online":online.is_some(),"team":online.filter(|peer|peer.world_id==client.world_id && client.world_id.is_some()).map(|peer|peer.team.as_str())})
            };
            let players: Vec<Value> = clients
                .values()
                .filter_map(|peer| peer.profile_id.as_ref())
                .filter(|id| *id != actor)
                .map(person)
                .collect();
            let teammates: Vec<Value> = profile.friends.iter().map(person).collect();
            let requests:Vec<Value>=data.friend_requests.iter().filter(|(from,to)|from==actor || to==actor).map(|(from,to)|json!({"player":person(if from==actor{to}else{from}),"incoming":to==actor})).collect();
            let groups:Vec<Value>=data.groups.values().filter(|group|group.members.contains(actor)||group.invited.contains(actor)).map(|group|json!({"id":group.id,"name":group.name,"owner_id":group.owner_id,"joined":group.members.contains(actor),"members":group.members.iter().map(person).collect::<Vec<_>>(),"invited":if group.owner_id==*actor{group.invited.iter().map(person).collect::<Vec<_>>()}else{vec![]}})).collect();
            let invitations:Vec<Value>=data.world_invites.iter().filter(|invite|invite.to==*actor && invite.expires>now).filter_map(|invite|data.worlds.get(&invite.world_id).map(|world|json!({"id":invite.id,"world_id":world.id,"world_name":world.name,"map":world.map,"from":person(&invite.from),"tire_thermals":world.tire_thermals,"locked":world.password_hash.is_some(),"expires":invite.expires}))).collect();
            let worlds:Vec<Value>=data.worlds.values().filter(|world|world.listed || world.owner_id.as_ref()==Some(actor) || client.world_id==Some(world.id) || data.world_invites.iter().any(|invite|invite.to==*actor && invite.world_id==world.id && invite.expires>now)).map(|world|{
                let members = world_members.get(&world.id).map(Vec::as_slice).unwrap_or_default();
                let can_share=world.owner_id.as_ref()==Some(actor)||client.world_id==Some(world.id);
                json!({"id":world.id,"name":world.name,"map":world.map,"owner_id":world.owner_id,"listed":world.listed,"mode":world.mode,"team_size":world.mode.map(|mode|crate::alpha::MatchFormat::for_world(mode,world.max_players).team_size),"max_players":if alpha.enabled&&world.mode.is_none(){1}else{world.max_players},"players":members.len(),"active":runtimes.contains_key(&world.id),"tire_thermals":world.tire_thermals,"locked":world.password_hash.is_some(),"invite_code":if can_share{Some(&world.invite_code)}else{None},"members":if can_share { members } else { &[] }})
            }).collect();
            let view=json!({"type":"social_state","data":{"profile":{"id":profile.id,"name":profile.name,"progression":profile.progression.view()},"alpha":Self::alpha_view_for_phases(&alpha,actor,player,&clients,&data,self.max_active_worlds,&phases),"players":players,"teammates":teammates,"requests":requests,"groups":groups,"worlds":worlds,"world_invites":invitations,"current_world_id":client.world_id,"limits":{"active_worlds":runtimes.len(),"max_active_worlds":self.max_active_worlds,"active_players":active_players,"max_players":self.max_players},"maps":maps}}).to_string();
            client.social.send_if_modified(|current| {
                if current.as_ref() == Some(&view) {
                    false
                } else {
                    *current = Some(view);
                    true
                }
            });
        }
    }
}
