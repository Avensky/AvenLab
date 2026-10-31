//! Repeatable headless CPU test for the actual instance you intend to rent.
//! Includes Rapier, input sampling and room snapshot serialization, not rendering.
use crate::{state::InputPacket, world_sessions::WorldRuntime};
use serde_json::json;
use tokio::sync::{mpsc, watch};

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
            let (tx, rx) = mpsc::unbounded_channel();
            let (frame, frame_rx) = watch::channel(None);
            let (input, input_rx) = watch::channel(None);
            room.join(&id, tx, frame, input_rx, None, 10);
            room.spawn(&id, "brz").map_err(anyhow::Error::msg)?;
            input_senders.push((input, player));
            receivers.push((rx, frame_rx));
        }
        worlds.push(room);
    }
    let mut times = Vec::with_capacity(ticks);
    // Warm physics/contact caches before the measured window.
    for _ in 0..120 {
        for world in &mut worlds {
            world.tick(0.0);
        }
    }
    for tick in 0..ticks {
        for (sender, player) in &input_senders {
            sender.send_replace(Some(InputPacket {
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
        let started = std::time::Instant::now();
        for world in &mut worlds {
            world.tick(0.0);
        }
        times.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(f64::total_cmp);
    let p = |fraction: f64| times[((times.len() - 1) as f64 * fraction).ceil() as usize];
    let result = json!({"worlds":count,"players_per_world":plan,"total_players":plan.iter().sum::<usize>(),"map":map,"ticks":ticks,"tick_budget_ms":1000.0/60.0,"p50_ms":p(0.5),"p95_ms":p(0.95),"p99_ms":p(0.99),"max_ms":times.last(),"p95_under_12ms":p(0.95)<12.0,"scope":"CPU physics and snapshot serialization; no socket traffic, target-client rendering, shared-host contention, or capacity guarantee"});
    let bytes = serde_json::to_string_pretty(&result)?;
    if let Some(output) = value("--output") {
        std::fs::write(output, bytes + "\n")?;
    } else {
        println!("{bytes}");
    }
    Ok(())
}
