use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub const MAP_IDS: [&str; 4] = [
    "streaming_endless_city",
    "road_jump_lab",
    "workshop_yard",
    "road_precision",
];
pub const MAX_WORLD_PLAYERS: usize = 10;
pub const MAX_PROFILES: usize = 1024;
pub const MAX_FRIENDS: usize = 100;
pub const MAX_GROUP_MEMBERS: usize = 10;

pub fn id() -> String {
    Uuid::new_v4().simple().to_string()
}
pub fn valid_name(value: &str, max: usize) -> Result<String, String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > max || name.chars().any(char::is_control) {
        Err(format!(
            "Enter a name with 1–{max} characters and no control characters."
        ))
    } else {
        Ok(name.to_string())
    }
}
pub fn timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    // Device guest credential, never included in any social-state response.
    pub token_hash: String,
    pub friends: BTreeSet<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub members: BTreeSet<String>,
    pub invited: BTreeSet<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct World {
    pub id: usize,
    pub name: String,
    pub map: String,
    pub owner_id: Option<String>,
    pub listed: bool,
    pub max_players: usize,
    pub password_hash: Option<String>,
    pub invite_code: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct WorldInvite {
    pub id: String,
    pub from: String,
    pub to: String,
    pub world_id: usize,
    pub expires: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SocialData {
    #[serde(default = "id")]
    pub server_id: String,
    pub version: u8,
    pub next_world: usize,
    pub profiles: BTreeMap<String, Profile>,
    pub friend_requests: BTreeSet<(String, String)>,
    pub groups: BTreeMap<String, Group>,
    pub worlds: BTreeMap<usize, World>,
    pub world_invites: Vec<WorldInvite>,
}
impl Default for SocialData {
    fn default() -> Self {
        Self {
            server_id: id(),
            version: 1,
            next_world: 1,
            profiles: BTreeMap::new(),
            friend_requests: BTreeSet::new(),
            groups: BTreeMap::new(),
            worlds: BTreeMap::new(),
            world_invites: Vec::new(),
        }
    }
}
impl SocialData {
    pub fn load(path: &std::path::Path) -> anyhow::Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let bytes = std::fs::read(path)?;
        anyhow::ensure!(
            bytes.len() <= 8 * 1024 * 1024,
            "Social data file is too large"
        );
        let mut data: Self = serde_json::from_slice(&bytes)?;
        anyhow::ensure!(
            data.version == 1
                && data.profiles.len() <= MAX_PROFILES
                && data.worlds.len() <= 256
                && data.groups.len() <= 256,
            "Unsupported or oversized social data"
        );
        data.world_invites
            .retain(|invite| invite.expires > timestamp());
        // IDs never reuse a saved world's number after a restart.
        data.next_world = data
            .next_world
            .max(data.worlds.keys().last().copied().unwrap_or(0) + 1);
        Ok(data)
    }
    pub fn profile(&self, id: &str) -> Result<&Profile, String> {
        self.profiles
            .get(id)
            .ok_or_else(|| "Choose a player profile first.".into())
    }
    pub fn groups_for(&self, id: &str) -> impl Iterator<Item = &Group> {
        self.groups
            .values()
            .filter(move |group| group.members.contains(id))
    }
    pub fn authenticate(
        &mut self,
        token: Option<&str>,
        name: &str,
    ) -> Result<(String, Option<String>), String> {
        if let Some(token) = token {
            if token.len() != 64 {
                return Err(
                    "This player credential is invalid. Create a new profile on this device."
                        .into(),
                );
            }
            let hash = super::security::token_hash(token);
            return self
                .profiles
                .values()
                .find(|profile| profile.token_hash == hash)
                .map(|profile| (profile.id.clone(), None))
                .ok_or_else(|| {
                    "This profile is unavailable on this server. Create a new device profile."
                        .into()
                });
        }
        if self.profiles.len() >= MAX_PROFILES {
            return Err("This server has reached its profile limit.".into());
        }
        let name = valid_name(name, 24)?;
        let profile_id = id();
        let token = format!("{}{}", id(), id());
        self.profiles.insert(
            profile_id.clone(),
            Profile {
                id: profile_id.clone(),
                name,
                token_hash: super::security::token_hash(&token),
                friends: BTreeSet::new(),
            },
        );
        Ok((profile_id, Some(token)))
    }
}
