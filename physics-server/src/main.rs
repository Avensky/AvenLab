// main.rs — Clean Enterprise Architecture
mod physics;// physics world and body creation
mod net;    // player join / disconnect, team/room assignment
mod state;  // world state
mod spawn;  // spawn logic

use rapier3d::prelude::RigidBodyHandle;
use crate::net::start_websocket_server;
use crate::physics::PhysicsWorld;
use crate::state::{SharedGameState, EntityType}; // shared world state

use std::sync::Arc; // multiple threads own the same object
use tokio::sync::Mutex; // only 1 thread at a time can mutate the object
use tokio::time::{interval, Duration};

#[tokio::main]
async fn main() {
    println!("🚀 Starting Rust Physics Server...");

    // -------------------------------------------------
    // 1) Create global shared game state
    // -------------------------------------------------
    let state = Arc::new(Mutex::new(SharedGameState::new()));
    // -------------------------------------------------
    // 2) Create global shared physics world
    // -------------------------------------------------
    let physics = Arc::new(Mutex::new(PhysicsWorld::new()));

    // -------------------------------------------------
    // 3) Launch WebSocket server (network thread)
    // -------------------------------------------------
    tokio::spawn(start_websocket_server(
        Arc::clone(&state),
        Arc::clone(&physics),
    ));

    // -------------------------------------------------
    // 4) Fixed timestep physics loop (~60 Hz)
    // -------------------------------------------------
    let mut ticker = interval(Duration::from_millis(16));

    loop {
        ticker.tick().await;

        // Lock physics & game state
        let mut phys = physics.lock().await;
        let mut game = state.lock().await;

        // -----------------------------------------------------
        // 5) For each known entity, apply their last input
        //    NOTE: We assume net.rs already created the entity,
        //    assigned team/room/spawn position,
        //    AND attached the correct physics body.
        // -----------------------------------------------------
        for entity in game.entities.values_mut() {  
            // Skip unspawned entities (net.rs will handle this)
            if entity.body_handle == RigidBodyHandle::invalid() {
                continue;
            }

            // If the player has sent recent input, apply it
            if let Some(ref input) = entity.last_input {
                let axes = &input.axes;
                match entity.kind {
                    // Vehicle: throttle + steering
                    EntityType::Vehicle => {
                        // Vehicle: throttle + steering
                        phys.apply_player_input(
                            &entity.id,
                            axes.throttle,
                            axes.steer,
                            axes.ascend,
                            axes.pitch,
                            axes.yaw,
                            axes.roll,
                        );

                    }
                    // Air/sea vehicles: full 6DOF controls
                    EntityType::Drone
                    | EntityType::Helicopter
                    | EntityType::Jet
                    | EntityType::Boat
                    | EntityType::Ship => {
                        phys.apply_player_input(
                            &entity.id,
                            axes.throttle,
                            axes.steer,
                            axes.ascend,
                            axes.pitch,
                            axes.yaw,
                            axes.roll,
                        );
                    }
                }
            }
        }


        // -----------------------------------------------------
        // 6) Step the physics world forward by dt
        // -----------------------------------------------------
        phys.step(1.0 / 60.0);

        // -----------------------------------------------------
        // 7) Update global tick counter
        // -----------------------------------------------------
        game.tick += 1;

        // -----------------------------------------------------
        // 8) Broadcast snapshots to all connected players
        // -----------------------------------------------------
        game.broadcast_snapshot(&phys.bodies);
    }
}
