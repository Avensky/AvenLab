mod physics;
mod net;
mod state;

use crate::physics::PhysicsWorld;
use crate::net::start_websocket_server;
use crate::state::{SharedGameState, EntityType};

use rapier3d::prelude::RigidBodyHandle;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

#[tokio::main]
async fn main() {
    println!("🚀 Starting Rust Physics Server...");

    let state = Arc::new(Mutex::new(SharedGameState::new()));
    let physics = Arc::new(Mutex::new(PhysicsWorld::new()));

    // Start WebSocket server
    tokio::spawn(start_websocket_server(
        Arc::clone(&state),
        Arc::clone(&physics),
    ));

    // Fixed timestep: ~60 Hz
    let mut ticker = interval(Duration::from_millis(16));

    loop {
        ticker.tick().await;

        let mut phys = physics.lock().await;
        let mut game = state.lock().await;

        // For each entity, ensure it has a body and apply inputs
        for entity in game.entities.values_mut() {
            if entity.body_handle == RigidBodyHandle::invalid() {
                entity.body_handle = match entity.kind {
                    EntityType::Vehicle => phys.create_vehicle_body(),
                    EntityType::Drone
                    | EntityType::Helicopter
                    | EntityType::Jet
                    | EntityType::Boat
                    | EntityType::Ship => phys.create_drone_body(), // placeholder for non-cars
                };
                println!("Created {:?} body for entity {}", entity.kind, entity.id);
            }

            if let Some(ref input) = entity.last_input {
                let axes = &input.axes;
                match entity.kind {
                    EntityType::Vehicle => {
                        phys.apply_vehicle_input(entity.body_handle, axes.throttle, axes.steer);
                    }
                    EntityType::Drone
                    | EntityType::Helicopter
                    | EntityType::Jet
                    | EntityType::Boat
                    | EntityType::Ship => {
                        phys.apply_drone_input(
                            entity.body_handle,
                            axes.throttle,
                            axes.ascend,
                            axes.yaw,
                            axes.pitch,
                            axes.roll,
                        );
                    }
                }
            }
        }

        // Step physics
        phys.step(1.0 / 60.0);

        // Advance tick + broadcast snapshot
        game.tick += 1;
        game.broadcast_snapshot(&phys.bodies);
    }
}
