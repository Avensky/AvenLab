// use uuid::Uuid;
use serde::{Serialize};
use std::collections::HashMap;  

// ---------------------------------------------
// TEAM TYPE
// ---------------------------------------------
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum Team {
    Red,
    Blue,
}

impl Team {
    pub fn as_str(&self) -> &str {
        match self {
            Team::Red => "red",
            Team::Blue => "blue",
        }
    }
}

// ---------------------------------------------
// SPAWN RESULT RETURNED TO STATE + NET
// ---------------------------------------------
#[derive(Debug, Clone)]
pub struct PlayerSpawnInfo {
    pub player_id: String,
    pub room_id: usize,
    pub team: Team,
    pub position: [f32; 3],
}

// #[derive(Debug)]
// pub struct Room {
//     pub id: usize,
//     pub red_count: usize,
//     pub blue_count: usize,
// }

// ---------------------------------------------
// SPAWN MANAGER FOR ALL ROOMS
// ---------------------------------------------
#[derive(Debug)]
pub struct SpawnManager {
    /// How many players are in each room
    // pub room_counts: HashMap<usize, usize>,

    /// How many players of each team are in each room
    pub team_counts: HashMap<(usize, Team), usize>,

    // Maximum players per game room
    // pub max_players: usize,
}

impl SpawnManager {
    pub fn new(_max_players:usize) -> Self {
        Self {
            // room_counts: HashMap::new(),
            team_counts: HashMap::new(),
            // max_players: max_players,
        }
    }


    // ---------------------------------------------------------
    // Generate a new player ID
    // ---------------------------------------------------------
    // pub fn create_player_id(&self) -> String {
    //     use uuid::Uuid;
    //     Uuid::new_v4().to_string()
    // }


    // ---------------------------------------------------------
    // Find a room that has space OR create a new one
    // ---------------------------------------------------------
    // fn get_or_create_room(&mut self) -> usize {
    //     // Find room with space
    //     for (&room_id, &count) in self.room_counts.iter() {
    //         if count < self.max_players {
    //             return room_id;
    //         }
    //     }

    //     // No room found → create new
    //     let new_room = self.room_counts.len();
    //     self.room_counts.insert(new_room, 0);
    //     new_room
    // }

    // ---------------------------------------------------------
    // Decide team based on balance
    // ---------------------------------------------------------
    fn choose_team(&mut self, room_id: usize) -> Team {
        let red = *self.team_counts.get(&(room_id, Team::Red)).unwrap_or(&0);
        let blue = *self.team_counts.get(&(room_id, Team::Blue)).unwrap_or(&0);

        if red <= blue {
            Team::Red
        } else {
            Team::Blue
        }
    }

    // ---------------------------------------------------------
    // Get spawn location depending on room + team
    // ---------------------------------------------------------
    // fn spawn_for_team(team: Team) -> [f32; 3] {
    //     match team {
    //         Team::Red => [-10.0, 2.0, 0.0],   // left base
    //         Team::Blue => [10.0, 2.0, 0.0],   // right base
    //     }
    // }

    // ---------------------------------------------------------
    // Full allocation pipeline called from net.rs
    // ---------------------------------------------------------
    pub fn allocate_spawn(&mut self, player_id:String) -> PlayerSpawnInfo {
        // let room_id = self.get_or_create_room();
        let room_id = 0; // TEMP FIX: all players in room 0

        // increment room count
        // *self.room_counts.entry(room_id).or_insert(0) += 1;
        
        // Count how many players of each team in this room
        let _red_count = *self.team_counts.get(&(room_id, Team::Red)).unwrap_or(&0);
        let _blue_count = *self.team_counts.get(&(room_id, Team::Blue)).unwrap_or(&0);

        // Choose the next team based on imbalance
        // let team = if red_count <= blue_count {
        //     Team::Red
        // } else {
        //     Team::Blue
        // };


        let team = self.choose_team(room_id);

        // increment team count
        *self.team_counts.entry((room_id, team)).or_insert(0) += 1;

        // let position = Self::spawn_for_team(team);

        // SPAWN POSITION
        let position = match team {
            Team::Red => [-5.0, 4.0, 0.0],
            Team::Blue => [5.0, 4.0, 0.0],
        };

        // Return full spawn info
        PlayerSpawnInfo {
            player_id: player_id.to_string(),
            team,
            room_id,
            position,
        }
    }
}
