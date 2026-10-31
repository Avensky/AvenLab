use super::model::*;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum SocialAction {
    Rename {
        name: String,
    },
    FriendRequest {
        target: String,
    },
    FriendAccept {
        target: String,
    },
    FriendDecline {
        target: String,
    },
    FriendCancel {
        target: String,
    },
    FriendRemove {
        target: String,
    },
    GroupCreate {
        name: String,
    },
    GroupInvite {
        group_id: String,
        target: String,
    },
    GroupAccept {
        group_id: String,
    },
    GroupDecline {
        group_id: String,
    },
    GroupLeave {
        group_id: String,
    },
    GroupRemove {
        group_id: String,
        target: String,
    },
    WorldInvite {
        world_id: usize,
        target: Option<String>,
        group_id: Option<String>,
    },
    WorldRotateCode {
        world_id: usize,
    },
    WorldDelete {
        world_id: usize,
    },
}

impl SocialData {
    /// Every recipient/group/world ID is resolved on the server. Clients supply
    /// intent, never membership, friendship, ownership or player identity.
    pub fn apply_action(
        &mut self,
        actor: &str,
        action: SocialAction,
        actor_world: Option<usize>,
        occupied: &[usize],
    ) -> Result<Value, String> {
        self.profile(actor)?;
        match action {
            SocialAction::Rename { name } => {
                self.profiles.get_mut(actor).unwrap().name = valid_name(&name, 24)?
            }
            SocialAction::FriendRequest { target } => {
                self.profile(&target)?;
                if target == actor {
                    return Err("Choose another player.".into());
                }
                if self.profiles[actor].friends.contains(&target) {
                    return Err("You are already teammates.".into());
                }
                if self.friend_requests.len() >= 2048
                    || self
                        .friend_requests
                        .iter()
                        .filter(|(from, _)| from == actor)
                        .count()
                        >= 20
                    || self
                        .friend_requests
                        .iter()
                        .filter(|(_, to)| to == &target)
                        .count()
                        >= 32
                {
                    return Err("The teammate request limit has been reached.".into());
                }
                self.friend_requests.insert((actor.into(), target));
            }
            SocialAction::FriendAccept { target } => {
                if !self
                    .friend_requests
                    .contains(&(target.clone(), actor.into()))
                {
                    return Err("That teammate request is no longer available.".into());
                }
                if self.profile(actor)?.friends.len() >= MAX_FRIENDS
                    || self.profile(&target)?.friends.len() >= MAX_FRIENDS
                {
                    return Err("A teammate list is full.".into());
                }
                self.profiles
                    .get_mut(actor)
                    .unwrap()
                    .friends
                    .insert(target.clone());
                self.profiles
                    .get_mut(&target)
                    .unwrap()
                    .friends
                    .insert(actor.into());
                self.friend_requests.remove(&(target.clone(), actor.into()));
                self.friend_requests.remove(&(actor.into(), target));
            }
            SocialAction::FriendDecline { target } => {
                self.friend_requests.remove(&(target, actor.into()));
            }
            SocialAction::FriendCancel { target } => {
                self.friend_requests.remove(&(actor.into(), target));
            }
            SocialAction::FriendRemove { target } => {
                self.profiles
                    .get_mut(actor)
                    .unwrap()
                    .friends
                    .remove(&target);
                if let Some(profile) = self.profiles.get_mut(&target) {
                    profile.friends.remove(actor);
                }
            }
            SocialAction::GroupCreate { name } => {
                if self.groups.len() >= 256 || self.groups_for(actor).count() >= 8 {
                    return Err("The social group limit has been reached.".into());
                }
                let group_id = id();
                self.groups.insert(
                    group_id.clone(),
                    Group {
                        id: group_id.clone(),
                        name: valid_name(&name, 32)?,
                        owner_id: actor.into(),
                        members: [actor.to_string()].into_iter().collect(),
                        invited: Default::default(),
                    },
                );
                return Ok(json!({"group_id":group_id}));
            }
            SocialAction::GroupInvite { group_id, target } => {
                self.profile(&target)?;
                if !self.profiles[actor].friends.contains(&target) {
                    return Err("Add this player as a teammate first.".into());
                }
                let group = self
                    .groups
                    .get_mut(&group_id)
                    .ok_or("That group is unavailable.")?;
                if group.owner_id != actor {
                    return Err("Only the group leader can invite members.".into());
                }
                if group.members.len() + group.invited.len() >= MAX_GROUP_MEMBERS {
                    return Err("This group has no unreserved member slots.".into());
                }
                if !group.members.contains(&target) {
                    group.invited.insert(target);
                }
            }
            SocialAction::GroupAccept { group_id } => {
                if self.groups_for(actor).count() >= 8 {
                    return Err("Leave a group before joining another.".into());
                }
                let group = self
                    .groups
                    .get_mut(&group_id)
                    .ok_or("That group is unavailable.")?;
                if !group.invited.contains(actor) {
                    return Err("A group invitation is required.".into());
                }
                if group.members.len() >= MAX_GROUP_MEMBERS {
                    return Err("This group is full.".into());
                }
                group.invited.remove(actor);
                group.members.insert(actor.into());
            }
            SocialAction::GroupDecline { group_id } => {
                if let Some(group) = self.groups.get_mut(&group_id) {
                    group.invited.remove(actor);
                }
            }
            SocialAction::GroupLeave { group_id } => {
                let group = self
                    .groups
                    .get_mut(&group_id)
                    .ok_or("That group is unavailable.")?;
                if !group.members.remove(actor) {
                    return Err("You are not a member of this group.".into());
                }
                if group.members.is_empty() {
                    self.groups.remove(&group_id);
                } else if group.owner_id == actor {
                    group.owner_id = group.members.iter().next().unwrap().clone();
                }
            }
            SocialAction::GroupRemove { group_id, target } => {
                let group = self
                    .groups
                    .get_mut(&group_id)
                    .ok_or("That group is unavailable.")?;
                if group.owner_id != actor || target == actor {
                    return Err("Only the leader can remove another member.".into());
                }
                group.members.remove(&target);
                group.invited.remove(&target);
            }
            SocialAction::WorldInvite {
                world_id,
                target,
                group_id,
            } => {
                let world = self
                    .worlds
                    .get(&world_id)
                    .ok_or("That world is unavailable.")?;
                if world.owner_id.as_deref() != Some(actor) && actor_world != Some(world_id) {
                    return Err("Join the world before inviting teammates.".into());
                }
                let recipients: Vec<String> = if let Some(group_id) = group_id {
                    let group = self
                        .groups
                        .get(&group_id)
                        .filter(|group| group.members.contains(actor))
                        .ok_or("Join this social group first.")?;
                    group
                        .members
                        .iter()
                        .filter(|member| member.as_str() != actor)
                        .cloned()
                        .collect()
                } else {
                    vec![target.ok_or("Choose a teammate or group.")?]
                };
                for target in &recipients {
                    self.profile(target)?;
                    if target == actor
                        || (!self.profiles[actor].friends.contains(target)
                            && !self
                                .groups_for(actor)
                                .any(|group| group.members.contains(target)))
                    {
                        return Err("Invite a teammate or a member of your group.".into());
                    }
                }
                if recipients.is_empty() {
                    return Err("Add another member to this group first.".into());
                }
                self.world_invites
                    .retain(|invite| invite.expires > timestamp());
                let mut sent = 0;
                for target in &recipients {
                    self.world_invites.retain(|invite| {
                        !(invite.to == *target
                            && invite.from == actor
                            && invite.world_id == world_id)
                    });
                    if self.world_invites.len() >= 512
                        || self
                            .world_invites
                            .iter()
                            .filter(|invite| invite.to == *target)
                            .count()
                            >= 20
                    {
                        continue;
                    }
                    self.world_invites.push(WorldInvite {
                        id: id(),
                        from: actor.into(),
                        to: target.clone(),
                        world_id,
                        expires: timestamp() + 900,
                    });
                    sent += 1;
                }
                if sent == 0 {
                    return Err("The recipients' invitation lists are full.".into());
                }
                return Ok(json!({"invited":sent}));
            }
            SocialAction::WorldRotateCode { world_id } => {
                let world = self
                    .worlds
                    .get_mut(&world_id)
                    .ok_or("That world is unavailable.")?;
                if world.owner_id.as_deref() != Some(actor) {
                    return Err("Only the world host can replace its invite code.".into());
                }
                world.invite_code = id();
                self.world_invites
                    .retain(|invite| invite.world_id != world_id);
            }
            SocialAction::WorldDelete { world_id } => {
                let world = self
                    .worlds
                    .get(&world_id)
                    .ok_or("That world is unavailable.")?;
                if world.owner_id.as_deref() != Some(actor) {
                    return Err("Only the world host can delete it.".into());
                }
                if occupied.contains(&world_id) {
                    return Err("Everyone must leave before deleting this world.".into());
                }
                self.worlds.remove(&world_id);
                self.world_invites
                    .retain(|invite| invite.world_id != world_id);
            }
        }
        Ok(json!({}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn people() -> (SocialData, String, String, String) {
        let mut data = SocialData::default();
        let a = data.authenticate(None, "A").unwrap().0;
        let b = data.authenticate(None, "B").unwrap().0;
        let c = data.authenticate(None, "C").unwrap().0;
        (data, a, b, c)
    }
    #[test]
    fn friendship_requires_a_real_request_and_is_mutual() {
        let (mut d, a, b, _) = people();
        assert!(
            d.apply_action(
                &a,
                SocialAction::FriendAccept { target: b.clone() },
                None,
                &[]
            )
            .is_err()
        );
        d.apply_action(
            &a,
            SocialAction::FriendRequest { target: b.clone() },
            None,
            &[],
        )
        .unwrap();
        d.apply_action(
            &b,
            SocialAction::FriendAccept { target: a.clone() },
            None,
            &[],
        )
        .unwrap();
        assert!(d.profiles[&a].friends.contains(&b) && d.profiles[&b].friends.contains(&a));
        d.apply_action(
            &b,
            SocialAction::FriendRemove { target: a.clone() },
            None,
            &[],
        )
        .unwrap();
        assert!(d.profiles[&a].friends.is_empty());
    }
    #[test]
    fn group_permissions_and_leader_handoff_are_authoritative() {
        let (mut d, a, b, c) = people();
        let group = d
            .apply_action(
                &a,
                SocialAction::GroupCreate {
                    name: "Crew".into(),
                },
                None,
                &[],
            )
            .unwrap()["group_id"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(
            d.apply_action(
                &c,
                SocialAction::GroupAccept {
                    group_id: group.clone()
                },
                None,
                &[]
            )
            .is_err()
        );
        d.profiles.get_mut(&a).unwrap().friends.insert(b.clone());
        d.apply_action(
            &a,
            SocialAction::GroupInvite {
                group_id: group.clone(),
                target: b.clone(),
            },
            None,
            &[],
        )
        .unwrap();
        d.apply_action(
            &b,
            SocialAction::GroupAccept {
                group_id: group.clone(),
            },
            None,
            &[],
        )
        .unwrap();
        assert!(
            d.apply_action(
                &b,
                SocialAction::GroupRemove {
                    group_id: group.clone(),
                    target: a.clone()
                },
                None,
                &[]
            )
            .is_err()
        );
        d.apply_action(
            &a,
            SocialAction::GroupLeave {
                group_id: group.clone(),
            },
            None,
            &[],
        )
        .unwrap();
        assert_eq!(d.groups[&group].owner_id, b);
    }
}
