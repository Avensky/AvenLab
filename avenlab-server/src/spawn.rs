//! Room-local team allocation. Actual support height/pose belong to map spawns.
use serde::Serialize;
use std::collections::HashMap;
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Team {
    Red,
    Blue,
}
impl Team {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Red => "red",
            Self::Blue => "blue",
        }
    }
}
#[derive(Debug, Clone)]
pub struct PlayerSpawnInfo {
    pub player_id: String,
    pub room_id: usize,
    pub team: Team,
    pub position: [f32; 3],
}
#[derive(Debug)]
pub struct SpawnManager {
    pub team_counts: HashMap<(usize, Team), usize>,
}
impl SpawnManager {
    pub fn new(_max_players: usize) -> Self {
        Self {
            team_counts: HashMap::new(),
        }
    }
    pub fn allocate_spawn(&mut self, player_id: String) -> PlayerSpawnInfo {
        self.allocate_in_room(player_id, 0, None)
    }
    pub fn allocate_in_room(
        &mut self,
        player_id: String,
        room_id: usize,
        preferred: Option<Team>,
    ) -> PlayerSpawnInfo {
        let red = *self.team_counts.get(&(room_id, Team::Red)).unwrap_or(&0);
        let blue = *self.team_counts.get(&(room_id, Team::Blue)).unwrap_or(&0);
        let team = preferred.unwrap_or(if red <= blue { Team::Red } else { Team::Blue });
        *self.team_counts.entry((room_id, team)).or_insert(0) += 1;
        PlayerSpawnInfo {
            player_id,
            room_id,
            team,
            position: [0.0; 3],
        }
    }
    pub fn release(&mut self, room_id: usize, team: Team) {
        if let Some(count) = self.team_counts.get_mut(&(room_id, team)) {
            *count = count.saturating_sub(1);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rooms_and_departures_do_not_corrupt_team_balance() {
        let mut s = SpawnManager::new(10);
        assert_eq!(s.allocate_in_room("a".into(), 1, None).team, Team::Red);
        assert_eq!(s.allocate_in_room("b".into(), 2, None).team, Team::Red);
        s.release(1, Team::Red);
        assert_eq!(s.allocate_in_room("c".into(), 1, None).team, Team::Red);
        assert_eq!(
            s.allocate_in_room("d".into(), 1, Some(Team::Red)).team,
            Team::Red
        );
    }
}
