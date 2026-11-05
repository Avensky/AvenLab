//! Repeatable headless CPU test for the actual instance you intend to rent.
//! Includes Rapier, input sampling and room snapshot serialization, not rendering.
use crate::{state::InputPacket, world_sessions::WorldRuntime};
use serde_json::json;
use tokio::sync::watch;

// Optional benchmark-only CPU clock. Separates actual work from descheduling
// on Linux hosts; unsupported targets still report wall and per-world timings.
#[cfg(all(target_os = "linux", target_pointer_width = "64"))]
fn thread_cpu_ms() -> Option<f64> {
    #[repr(C)]
    struct Timespec { seconds: std::os::raw::c_long, nanos: std::os::raw::c_long }
    unsafe extern "C" { fn clock_gettime(clock: std::os::raw::c_int, time: *mut Timespec) -> std::os::raw::c_int; }
    let mut time = Timespec { seconds: 0, nanos: 0 };
    // Linux CLOCK_THREAD_CPUTIME_ID is 3; the 64-bit ABI uses two C longs.
    // `time` is initialized, aligned, writable and lives through the call.
    (unsafe { clock_gettime(3, &mut time) } == 0)
        .then_some(time.seconds as f64 * 1000.0 + time.nanos as f64 / 1_000_000.0)
}
#[cfg(not(all(target_os = "linux", target_pointer_width = "64")))]
fn thread_cpu_ms() -> Option<f64> { None }

pub fn run() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let value = |key: &str| {
        args.iter()
            .position(|arg| arg == key)
            .and_then(|index| args.get(index + 1))
            .cloned()
    };
    let number = |key: &str, default: usize, max: usize| {
        value(key)
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(default)
            .clamp(1, max)
    };
    let plan = if let Some(csv) = value("--players-per-world") {
        let plan: Vec<usize> = csv.split(',').map(str::parse).collect::<Result<_, _>>()?;
        anyhow::ensure!(
            !plan.is_empty() && plan.len() <= 16 && plan.iter().all(|n| (1..=10).contains(n)),
            "Use 1–16 world populations, each between 1 and 10"
        );
        plan
    } else {
        vec![number("--players", 10, 10); number("--worlds", 1, 16)]
    };
    let compact = args.iter().any(|arg| arg == "--compact-snapshots");
    let combat = args.iter().any(|arg| arg == "--combat");
    let cpu_timing = args.iter().any(|arg| arg == "--cpu-timing");
    let chassis = ["tank", "brz", "cx30", "sierra", "landcruiser", "mini"];
    let count = plan.len();
    let ticks = number("--ticks", 1200, 10000);
    let map = value("--map").unwrap_or_else(|| "streaming_endless_city".into());
    let mut worlds = Vec::new();
    let mut input_senders = Vec::new();
    let mut receivers = Vec::new();
    for n in 0..count {
        let mut room = WorldRuntime::new(n + 1, &map).map_err(anyhow::Error::msg)?;
        for player in 0..plan[n] {
            let id = format!("benchmark-{n}-{player}");
            let (tx, rx) = crate::outbox::channel();
            let (frame, frame_rx) = watch::channel(None);
            let frame=crate::snapshot_wire::SnapshotSender::from(frame);
            if compact { frame.format.store(crate::snapshot_wire::VERSION,std::sync::atomic::Ordering::Relaxed); }
            let (input, input_rx) = watch::channel(None);
            room.join(&id, tx, frame, input_rx, None, 10);
            let model = if combat { chassis[player % chassis.len()] } else { "brz" };
            room.spawn(&id, model).map_err(anyhow::Error::msg)?;
            if combat {
                room.physics.set_assigned_hero(&id, model);
            }
            input_senders.push((input, player));
            receivers.push((rx, frame_rx));
        }
        worlds.push(room);
    }
    let mut times = Vec::with_capacity(ticks);
    let mut cpu_times = Vec::new();
    let mut slow_ticks = Vec::new();
    // Warm physics/contact caches before the measured window.
    for _ in 0..120 {
        for world in &mut worlds {
            world.tick(0.0);
        }
    }
    let mut encoded_bytes = 0usize;
    for tick in 0..ticks {
        for (sender, player) in &input_senders {
            sender.send_replace(Some(InputPacket { combat: combat.then(|| crate::state::CombatPose {
                    enabled: true, fire: true, yaw: (tick as f32 * 0.004) + *player as f32, pitch: 0.0,
                    weapon: if (tick / 120) % 2 == 0 { "cannon" } else { "coax" }.into(),
                    role: if player % chassis.len() == 0 { "tank" } else { "dps" }.into(),
                    ..Default::default()
                }),
                r#type: "input".into(),
                seq: tick as u32,
                dt: 1.0 / 60.0,
                throttle: 0.7,
                steer: if (tick / 180 + player) % 2 == 0 {
                    0.2
                } else {
                    -0.2
                },
                brake: 0.0,
                handbrake: 0.0,
                cockpit_mask: None,
                parking_brake: None,
                cabin_mask: None,
                vehicleMask: 97,
                playerMask: 0,
                debug_mask: Some(0),
            }));
        }
        let cpu_start = cpu_timing.then(thread_cpu_ms).flatten();
        let started = std::time::Instant::now();
        for world in &mut worlds {
            encoded_bytes += world.tick(0.0);
        }
        let wall_ms = started.elapsed().as_secs_f64() * 1000.0;
        let cpu_ms = cpu_start.and_then(|start| thread_cpu_ms().map(|end| (end-start).max(0.0)));
        if let Some(cpu) = cpu_ms { cpu_times.push(cpu); }
        if wall_ms > 1000.0 / 60.0 && slow_ticks.len() < 16 {
            slow_ticks.push(json!({"sample_tick":tick,"wall_ms":wall_ms,"cpu_ms":cpu_ms,
                "worlds":worlds.iter().map(|w|json!({"id":w.game.room_id,"simulation_tick":w.game.tick,
                    "timing":w.game.server_timing,"bodies":w.physics.bodies.len(),"colliders":w.physics.colliders.len()})).collect::<Vec<_>>() }));
        }
        times.push(wall_ms);
    }
    times.sort_by(f64::total_cmp);
    let p = |fraction: f64| times[((times.len() - 1) as f64 * fraction).ceil() as usize];
    cpu_times.sort_by(f64::total_cmp);
    let cpu_p95 = (!cpu_times.is_empty()).then(|| cpu_times[((cpu_times.len()-1) as f64 * 0.95).ceil() as usize]);
    let result = json!({"worlds":count,"players_per_world":plan,"total_players":plan.iter().sum::<usize>(),"map":map,"ticks":ticks,"mean_encoded_bytes_per_world_tick":encoded_bytes as f64 / (count * ticks) as f64,"combat":combat,"compact_snapshots":compact,"over_budget_ticks":times.iter().filter(|v| **v>1000.0/60.0).count(),"tick_budget_ms":1000.0/60.0,"p50_ms":p(0.5),"p95_ms":p(0.95),"p99_ms":p(0.99),"max_ms":times.last(),"cpu_p95_ms":cpu_p95,"cpu_max_ms":cpu_times.last(),"slow_ticks":slow_ticks,"p95_under_12ms":p(0.95)<12.0,"scope":"Physics and snapshot serialization wall time includes host scheduling delays. No socket traffic, client rendering, or capacity guarantee."});
    let bytes = serde_json::to_string_pretty(&result)?;
    if let Some(output) = value("--output") {
        std::fs::write(output, bytes + "\n")?;
    } else {
        println!("{bytes}");
    }
    Ok(())
}
