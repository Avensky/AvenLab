// Outer tick owner: input -> physics substeps -> one completed network frame.
// Do not apply forces, smooth steering or clear debug data again in this file.
mod aven_tire;
mod world;
mod physics;
mod net;
mod state;
mod spawn;
mod suspension_contact;
mod vehicle_debug;
mod vehicle_state;
mod vehicle_setup;
mod vehicle_forces;

use rapier3d::prelude::RigidBodyHandle;
use crate::net::start_websocket_server;
use crate::physics::{PhysicsWorld, SIMULATION_DT, SIMULATION_HZ};
use crate::state::SharedGameState;
use crate::vehicle_debug::DebugFlags;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration, MissedTickBehavior};

#[tokio::main]
async fn main() {
    println!("Starting Rust Physics Server...");
    let state = Arc::new(Mutex::new(SharedGameState::new()));
    let physics = Arc::new(Mutex::new(PhysicsWorld::new()));
    tokio::spawn(start_websocket_server(Arc::clone(&state), Arc::clone(&physics)));

    // Use the same 60 Hz definition for the wall timer and the simulation dt.
    // A 16 ms timer runs at 62.5 Hz: advancing 1/60 s on each wake runs 4.17%
    // ahead of wall time and makes client interpolation chase uneven samples.
    let mut ticker = interval(Duration::from_secs_f64(1.0 / SIMULATION_HZ));
    // After a stall, resume on the timer grid instead of bursting old ticks and
    // snapshots at the socket. Sustained overload slows simulation time; it
    // does not enlarge spring dt or enqueue an ever-growing catch-up backlog.
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let trace_server = vehicle_forces::contact_trace_enabled();

    loop {
        ticker.tick().await;
        let tick_started = std::time::Instant::now();
        // Keep the shared lock order physics -> game everywhere both are needed.
        // Network sends happen in a separate writer and are never awaited here.
        let mut phys = physics.lock().await;
        let mut game = state.lock().await;
        let lock_ms = tick_started.elapsed().as_secs_f64() * 1000.0;

        game.collect_input_packets();
        let mut requested_debug = DebugFlags::NONE;
        // Inputs are held controls, not impulses: store the latest intent once
        // per outer tick. Client packet dt never determines server physics dt.
        for entity in game.entities.values() {
            if entity.body_handle == RigidBodyHandle::invalid() { continue; }
            if let Some(packet) = &entity.last_packet {
                requested_debug |= DebugFlags::from_bits_truncate(packet.debug_mask.unwrap_or(0));
                phys.apply_player_input_packet(&entity.id, packet.clone());
            }
        }
        // One debug-mask owner per tick. Requests combine across players rather
        // than alternating as their 60 Hz packets arrive in different orders.
        phys.set_debug_flags(requested_debug);

        // PhysicsWorld owns 120 Hz force substeps and the final pose refresh.
        phys.step(SIMULATION_DT);
        game.tick += 1;
        // Snapshot and debug are built together from this completed tick. A
        // slow writer keeps only the latest pair, while setup messages stay FIFO.
        let frame_bytes = game.publish_physics_frame(&phys);
        if trace_server && game.tick % 60 == 0 {
            // Includes locks, integration AND serialization, unlike step_ms in
            // the contact trace. Repeated totals above 16.67 ms indicate overload.
            println!("[server] tick={} lock_ms={:.2} total_ms={:.2} frame_bytes={} clients={}",
                game.tick, lock_ms, tick_started.elapsed().as_secs_f64() * 1000.0,
                frame_bytes, game.clients.len());
        }
        // PhysicsWorld::step clears its own scratch overlay at the next tick.
    }
}
