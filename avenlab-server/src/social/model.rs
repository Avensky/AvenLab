use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

/// Discover installed maps on demand: no environment allow-list to maintain.
pub fn available_maps() -> Vec<String> {
    let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/assets/blocks");
    let mut maps = Vec::new();
    if let Ok(files) = std::fs::read_dir(directory) {
        for entry in files.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|v| v.to_str()) else { continue; };
            let Some(id) = name.strip_suffix("_colliders.json") else { continue; };
            if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') { continue; }
            if let Ok(file) = crate::world::block_colliders::load_block_collider_file(path.to_string_lossy().into_owned()) {
                if file.schema_version == 2 && file.map_id == id { maps.push(id.to_owned()); }
            }
        }
    }
    maps.sort();
    maps
}
pub fn map_available(id: &str) -> bool { available_maps().iter().any(|map| map == id) }
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
    #[serde(default)]
    pub progression: crate::alpha::progression::Progression,
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
    #[serde(default)]
    pub tire_thermals: bool,
    #[serde(default)]
    pub mode: Option<crate::alpha::Mode>,
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
    #[serde(default)]
    pub completed_results: BTreeSet<String>,
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
            completed_results: BTreeSet::new(),
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
                progression: Default::default(),
            },
        );
        Ok((profile_id, Some(token)))
    }
}
