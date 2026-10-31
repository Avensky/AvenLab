//! Alpha capacity and lobby policy. Only Server's serialized control plane may
//! mutate this state. Inputs and physics never acquire it. No client can grant XP.
pub mod policy;
pub mod progression;
use crate::spawn::Team;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Quickplay,
    Competitive,
    Sandbox,
    Editor,
}
impl Mode {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "quickplay" => Ok(Self::Quickplay),
            "competitive" => Ok(Self::Competitive),
            "sandbox" | "solo" | "practice" => Ok(Self::Sandbox),
            "editor" => Ok(Self::Editor),
            _ => Err("Choose an available mode.".into()),
        }
    }
    pub fn bucket(self) -> u8 {
        match self {
            Self::Quickplay | Self::Competitive => 0,
            Self::Editor => 1,
            Self::Sandbox => 2,
        }
    }
    pub fn capacity(self) -> usize {
        if self.bucket() == 0 { 10 } else { 1 }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Quickplay => "QUICKPLAY",
            Self::Competitive => "COMPETITIVE",
            Self::Sandbox => "SOLO / PRACTICE",
            Self::Editor => "LIVE EDITOR",
        }
    }
}
#[derive(Clone, Debug)]
pub struct Member {
    pub mode: Mode,
    pub world: usize,
    pub hero: String,
    pub team: Team,
}
#[derive(Clone, Debug)]
pub struct Ticket {
    pub player: String,
    pub profile: String,
    pub mode: Mode,
    pub map: String,
    pub hero: String,
    pub joined: u64,
}
#[derive(Clone, Debug)]
pub struct Reservation {
    pub member: Member,
    pub expires: u64,
}
#[derive(Clone)]
pub struct AlphaState {
    pub restoring: HashSet<String>,
    pub enabled: bool,
    pub enforce_roles: bool,
    pub grace_seconds: u64,
    pub queue: VecDeque<Ticket>,
    pub members: HashMap<String, Member>,
    pub worlds: HashMap<usize, Mode>,
    pub reservations: HashMap<String, Reservation>,
    pub pending_team: HashMap<String, Team>,
}
impl Default for AlphaState {
    fn default() -> Self {
        Self {
            restoring: HashSet::new(),
            enabled: true,
            enforce_roles: true,
            grace_seconds: 30,
            queue: VecDeque::new(),
            members: HashMap::new(),
            worlds: HashMap::new(),
            reservations: HashMap::new(),
            pending_team: HashMap::new(),
        }
    }
}
impl AlphaState {
    #[cfg(test)]
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            ..Self::default()
        }
    }
}
