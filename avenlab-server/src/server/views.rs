use super::*;

impl Server {
    /// A replaceable, personalized view. Password hashes and guest credentials
    /// stay inside SocialData; private worlds appear only to authorized viewers.
    pub async fn publish(&self) {
        let data = self.data.lock().await;
        let clients = self.connections.lock().await;
        let runtimes = self.runtimes.lock().await;
        for client in clients.values() {
            let Some(actor) = client.profile_id.as_ref() else {
                continue;
            };
            let Some(profile) = data.profiles.get(actor) else {
                continue;
            };
            let person = |id: &String| {
                let online = clients
                    .values()
                    .find(|peer| peer.profile_id.as_ref() == Some(id));
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
            let invitations:Vec<Value>=data.world_invites.iter().filter(|invite|invite.to==*actor && invite.expires>timestamp()).filter_map(|invite|data.worlds.get(&invite.world_id).map(|world|json!({"id":invite.id,"world_id":world.id,"world_name":world.name,"map":world.map,"from":person(&invite.from),"locked":world.password_hash.is_some(),"expires":invite.expires}))).collect();
            let worlds:Vec<Value>=data.worlds.values().filter(|world|world.listed || world.owner_id.as_ref()==Some(actor) || client.world_id==Some(world.id) || data.world_invites.iter().any(|invite|invite.to==*actor && invite.world_id==world.id && invite.expires>timestamp())).map(|world|{
                let members:Vec<Value>=clients.iter().filter(|(_,peer)|peer.world_id==Some(world.id)).map(|(player_id,peer)|json!({"player_id":player_id,"profile_id":peer.profile_id,"name":peer.profile_id.as_ref().and_then(|id|data.profiles.get(id)).map(|p|p.name.as_str()).unwrap_or("GUEST"),"team":peer.team.as_str()})).collect();
                let can_share=world.owner_id.as_ref()==Some(actor)||client.world_id==Some(world.id);
                json!({"id":world.id,"name":world.name,"map":world.map,"owner_id":world.owner_id,"listed":world.listed,"max_players":world.max_players,"players":members.len(),"active":runtimes.contains_key(&world.id),"locked":world.password_hash.is_some(),"invite_code":if can_share{Some(&world.invite_code)}else{None},"members":if can_share{members}else{vec![]}})
            }).collect();
            let view=json!({"type":"social_state","data":{"profile":{"id":profile.id,"name":profile.name},"players":players,"teammates":teammates,"requests":requests,"groups":groups,"worlds":worlds,"world_invites":invitations,"current_world_id":client.world_id,"limits":{"active_worlds":runtimes.len(),"max_active_worlds":self.max_active_worlds,"active_players":clients.values().filter(|peer|peer.world_id.is_some()).count(),"max_players":self.max_players},"maps":MAP_IDS}}).to_string();
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
