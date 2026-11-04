//! Alpha capacity and lobby policy. Only Server's serialized control plane may
//! mutate this state. Inputs and physics never acquire it. No client can grant XP.
pub mod appearance;
pub mod career;
pub mod policy;
pub mod progression;
use crate::spawn::Team;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Quickplay,
    Competitive,
    Skirmish,
    Sandbox,
    Editor,
}
impl Mode {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "quickplay" => Ok(Self::Quickplay),
            "competitive" => Ok(Self::Competitive),
            "skirmish" => Ok(Self::Skirmish),
            "sandbox" | "solo" | "practice" => Ok(Self::Sandbox),
            "editor" => Ok(Self::Editor),
            _ => Err("Choose an available mode.".into()),
        }
    }
    pub fn bucket(self) -> u8 {
        match self {
            Self::Quickplay | Self::Competitive | Self::Skirmish => 0,
            Self::Editor => 1,
            Self::Sandbox => 2,
        }
    }
    pub fn capacity(self) -> usize {
        match self { Self::Skirmish => 6, Self::Quickplay | Self::Competitive => 10, _ => 1 }
    }
    pub fn team_size(self) -> usize { if self.bucket() == 0 { self.capacity() / 2 } else { 1 } }
    pub fn label(self) -> &'static str {
        match self {
            Self::Quickplay => "QUICKPLAY",
            Self::Competitive => "COMPETITIVE",
            Self::Skirmish => "3V3 CTF",
            Self::Sandbox => "SOLO / PRACTICE",
            Self::Editor => "LIVE EDITOR",
        }
    }
}
/// Match size is independent of queue/rules. Existing Skirmish IDs remain a
/// compatibility destination; new clients send Quickplay/Competitive + size.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct MatchFormat { pub mode: Mode, pub team_size: usize }
impl From<Mode> for MatchFormat {
    fn from(mode: Mode) -> Self { Self {mode,team_size:mode.team_size()} }
}
impl MatchFormat {
    pub fn requested(mode: Mode, size: Option<&serde_json::Value>) -> Result<Self,String> {
        if mode.bucket()!=0 { return Ok(mode.into()); }
        let team_size=match size { None=>mode.team_size(), Some(value)=>value.as_u64().and_then(|n|usize::try_from(n).ok()).ok_or("Choose a 3v3 or 5v5 match size.")? };
        if ![3,5].contains(&team_size)||(mode==Mode::Skirmish&&team_size!=3) {return Err("Choose a 3v3 or 5v5 match size.".into());}
        Ok(Self {mode,team_size})
    }
    pub fn for_world(mode: Mode, capacity: usize) -> Self {
        let team_size=if mode.bucket()==0 && [6,10].contains(&capacity) {capacity/2}else{mode.team_size()};
        Self {mode,team_size}
    }
    pub fn bucket(self)->u8 {self.mode.bucket()}
    pub fn capacity(self)->usize {if self.bucket()==0 {2*self.team_size}else{1}}
    pub fn role_caps(self)->[usize;3] {if self.team_size==3 {[1,1,1]}else{[1,3,2]}}
    pub fn role_minimums(self)->[usize;3] {if self.team_size==3 {[1,1,1]}else{[1,2,1]}}
}
#[derive(Clone, Debug)]
pub struct Member {
    pub mode: Mode,
    pub team_size: usize,
    pub world: usize,
    pub hero: String,
    pub team: Team,
}
impl Member { pub fn format(&self)->MatchFormat {MatchFormat {mode:self.mode,team_size:self.team_size}} }
#[derive(Clone, Debug)]
pub struct Ticket {
    pub player: String,
    pub profile: String,
    pub mode: Mode,
    pub team_size: usize,
    pub map: String,
    pub hero: String,
    pub joined: u64,
}
impl Ticket { pub fn format(&self)->MatchFormat {MatchFormat {mode:self.mode,team_size:self.team_size}} }
#[derive(Clone, Debug)]
pub struct Reservation {
    pub retained_player:Option<String>,
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
    pub worlds: HashMap<usize, MatchFormat>,
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
