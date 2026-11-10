mod ctf;
mod vehicle_health;
mod vehicle_life;
#[cfg(test)]
mod vehicle_life_tests;
mod ballistics;
mod ram;
mod guard_boost;
mod mechanic;
mod harbor;
mod naval;
mod team_barrier;
mod tank_barrage;
mod forward_assist;
mod support_spray;
mod support;
// Outer tick owner: input -> physics substeps -> one completed network frame.
// Do not apply forces, smooth steering or clear debug data again in this file.
use avenlab_physics::tire as aven_tire;
mod cockpit;
mod net;
mod outbox;
mod packed_input;
mod snapshot_wire;
mod snapshot_delta;
mod tire_thermals;
mod physics;
mod powertrain;
mod spawn;
mod state;
use avenlab_physics::suspension as suspension_contact;
mod vehicle_debug;
mod vehicle_forces;
use avenlab_physics::tracked_drive;
mod vehicle_setup;
mod vehicle_state;
mod vehicle_tuning;
mod world;

mod alpha;
mod capacity_bench;
mod server;
mod social;
mod world_sessions;
mod world_scheduler;

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
    let admission = Arc::clone(&server);
    tokio::spawn(async move {
        let mut timer = interval(Duration::from_millis(500));
        timer.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            timer.tick().await;
            admission.maintain_matches().await;
            admission.maintain_alpha().await;
        }
    });
    let mut ticker = interval(Duration::from_secs_f64(1.0 / SIMULATION_HZ));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let trace = vehicle_forces::contact_trace_enabled();
    let mut tick = 0u64;
    let mut scheduler = world_scheduler::WorldScheduler::default();
    loop {
        ticker.tick().await;
        let started = std::time::Instant::now();
        // Copy only Arc handles under the registry lock. Map loading, password
        // hashing, persistence and socket I/O never hold the physics tick lock.
        let worlds: Vec<_> = server.runtimes.lock().await.iter().map(|(&id,room)|(id,room.clone())).collect();
        let world_count=worlds.len();
        let bytes=scheduler.schedule(worlds).await?;
        tick += 1;
        if trace && tick % 60 == 0 {
            println!(
                "[server] worlds={} total_ms={:.2} frame_bytes={}",
                world_count,
                started.elapsed().as_secs_f64() * 1000.0,
                bytes
            );
        }
    }
}

#[cfg(test)]
mod tank_tests;
