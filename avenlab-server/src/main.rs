// Outer tick owner: input -> physics substeps -> one completed network frame.
// Do not apply forces, smooth steering or clear debug data again in this file.
mod aven_tire;
mod cockpit;
mod net;
mod physics;
mod powertrain;
mod spawn;
mod state;
mod suspension_contact;
mod vehicle_debug;
mod vehicle_forces;
mod vehicle_setup;
mod vehicle_state;
mod world;

mod capacity_bench;
mod server;
mod social;
mod world_sessions;

use crate::{physics::SIMULATION_HZ, server::Server};
use std::sync::Arc;
use tokio::time::{Duration, MissedTickBehavior, interval};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().any(|arg| arg == "--capacity-bench") {
        return capacity_bench::run();
    }
    let server = Arc::new(Server::load()?);
    println!(
        "AvenLab: {} active world(s), {} total players maximum",
        server.max_active_worlds, server.max_players
    );
    tokio::spawn(net::start_websocket_server(Arc::clone(&server)));
    let mut ticker = interval(Duration::from_secs_f64(1.0 / SIMULATION_HZ));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let trace = vehicle_forces::contact_trace_enabled();
    let mut tick = 0u64;
    loop {
        ticker.tick().await;
        let started = std::time::Instant::now();
        // Copy only Arc handles under the registry lock. Map loading, password
        // hashing, persistence and socket I/O never hold the physics tick lock.
        let worlds: Vec<_> = server.runtimes.lock().await.values().cloned().collect();
        let mut bytes = 0;
        for world in &worlds {
            let wait = std::time::Instant::now();
            let mut room = world.lock().await;
            bytes += room.tick(wait.elapsed().as_secs_f64() * 1000.0);
        }
        tick += 1;
        if trace && tick % 60 == 0 {
            println!(
                "[server] worlds={} total_ms={:.2} frame_bytes={}",
                worlds.len(),
                started.elapsed().as_secs_f64() * 1000.0,
                bytes
            );
        }
    }
}
