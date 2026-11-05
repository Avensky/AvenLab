# Sustained combat and connection audit

Base: `ed34e1ebd93e2d413844f0427a7244972a5eec16` (the ultimate-meter/snapshot patch).

## Changes

| Area | Confirmed repeated work or failure mode | Change |
| --- | --- | --- |
| Physics | The safety scan used Rapier's mutable body iterator, adding every city body to its modification queue every substep. | Inspect positions through immutable references; acquire mutable access only for an invalid body. Keep emergency recovery and sleeping bodies intact. |
| Collision queries | Repeated incremental index rebalancing left occasional very expensive combat ticks. | Rebuild the current world query index at the outer tick and before shots. This retains all colliders and removes four obsolete dirty/index-tracking fields. Five ten-player diagnostic runs then stayed below the 16.67 ms budget. |
| Combat records | Each hit rescanned up to 1,024 highlight events. | Maintain rolling kill/damage totals; evict expired contributions once. The ten-second window, cap, respawn behavior and best-moment scoring remain tested. |
| Career sampling | Each room cloned every connection/member, plus every player's health and private hit history, twice per second. | Copy the current room's profile/hero identities and project career totals and best moment directly. |
| Hidden HUD | A hidden legacy weapon panel committed on every new combat object. | Mount its detailed subscription only while visible. |
| Cooldowns | Buttons and rings repeated the same weapon-slot lookup; buttons redrew for every floating-point timer change. | Share the lookup, subscribe buttons to ready/cooling/unknown, and quantize visible rings to 50 ms and text to 100 ms. Positive remaining time never displays ready. Fire decisions still read authoritative timers. |
| Reliable messages | Slow clients had an unbounded event queue. | Nonblocking queues capped at 128 pending messages and 16 MiB of queued strings. Overflow signals connection teardown and the existing reconnect lease. A message removed for transmission is outside this queued-byte budget. No game lock waits for socket writes. |
| Socket admission | Incomplete handshakes could wait indefinitely before the existing 96-client registration limit. | At most 32 unfinished handshakes, each with a five-second deadline. |
| Diagnostics | A large wall-time outlier did not distinguish simulation work from host scheduling. | Capacity captures now retain up to 16 over-budget ticks with per-world timings. Optional `--cpu-timing` measures the simulation thread's CPU clock on 64-bit Linux; other targets report null CPU fields. |

## Measurements

Production builds, six and ten mixed vehicles, combat enabled, 120 warmup ticks,
then 1,800 measured ticks. Three runs per version/population, alternating version
order. The following are medians across the three runs. No browser or network
traffic is included; these are unpaced headless tests on this host, not an FPS
or hosting-capacity guarantee.

| Players | Tick p50 before → after | Tick p95 before → after | Tick p99 before → after | Maximum tick before → after | Ticks above 16.67 ms before → after |
| --- | --- | --- | --- | --- | --- |
| 6 | 0.449 → 0.497 ms | 3.116 → 2.628 ms | 4.531 → 4.491 ms | 11.041 → 83.806 ms | 0 → 1 |
| 10 | 0.515 → 0.491 ms | 1.163 → 1.086 ms | 2.258 → 1.805 ms | 4.754 → 4.664 ms | 0 → 0 |

P95 fell about 16% and 7% in this final paired batch. Typical six-player cost
rose slightly, and its median worst tick worsened. The very first six-player
pair had absolute outliers of 1,872.95 ms before and 1,007.33 ms after; other
runs were much faster. Those raw results are retained in `benchmark-runs.json`.
The later six-player CPU-timed follow-up peaked at 4.16 ms, with zero over-budget
ticks. Timing variability prevents a claim that all freezes are resolved.

During the initial audit, CPU diagnostics reproduced a 143.17 ms tick with
143.08 ms of thread CPU time; the main physics section took only 2.13 ms.
Most work was on the input/combat path. After changing query maintenance,
five ten-player experiments had zero ticks above 16.67 ms, with maxima of
4.17–7.35 ms. The final three ten-player runs also stayed within budget.
This supports using predictable query rebuilds for the current small collider
set, but does not isolate every possible hitch. Profile the rebuild cost again
if future maps substantially increase the collider count.

The patch retains the final paired summary and all runs, the initial summary,
and every CPU diagnostic/query experiment. These are finite headless runs,
not evidence about phone FPS, WAN latency or a thirty-minute session.

React Profiler replay of 60 incoming combat snapshots: hidden weapon-panel
commits fell from 60 to zero; one second of visible cannon reload fell from
60 to 20 commits. Readiness still changes immediately on a confirmed zero.

## Next bottlenecks and alpha gate

1. **Snapshot bandwidth.** This patch does not shrink the wire protocol. Measured
   snapshots averaged about 16.9 KB for six players and 28.1 KB for ten. At 60 Hz,
   that is roughly 1.01 MB/s or 1.69 MB/s per receiving client before transport
   overhead. Compare a negotiated compact snapshot format and a lower delivery
   cadence while retaining 60 Hz physics. Include keyframes, sequence checks,
   reconnect recovery, timer precision and old-client compatibility before
   introducing deltas or bitpacking.
2. **Loading/GPU stalls.** The city preparation queue has a 3 ms budget, but an
   individual geometry upload or shader compilation cannot be interrupted.
   Measure first encounters, respawns and new ability effects on real phones.
   Warm necessary shaders during loading and split expensive preparation jobs
   where measurements identify them. The fleet cache currently has a finite
   ten-model catalogue and three requested LOD tiers, but no inactive-tier
   eviction policy; measure retained GPU memory during repeated vehicle changes.
3. **Internet-facing ingress.** Reliable-output and handshake limits now protect
   those paths. Input decoding still needs an explicit per-connection traffic
   budget and deployment-level connection/rate limits before public alpha.
4. **Long-session verification.** Run a 30-minute six-player session, then a
   ten-player stress session, on the actual host and representative mobile GPU.
   Record p95/p99 frame time, simulation CPU/wall time, input acknowledgement,
   payload rate, GC/long tasks, memory and disconnect recovery. The headless
   test does not establish that client freezes are resolved.

## Reproduce

```sh
npm --prefix frontend run build
cargo test --locked --manifest-path avenlab-server/Cargo.toml
cargo build --release --locked --manifest-path avenlab-server/Cargo.toml
```

Frontend Vite-based tests must run with `frontend` as the working directory:
`node --test tests/combat-render-budget.test.mjs tests/tank-weapons.test.mjs tests/weapon-face-fire.test.mjs`.
Set `AVENLAB_SERVER_BIN` to the built executable to run
`node scripts/test-socket-admission.mjs` and `node scripts/test-match-formats.mjs`.
Both use disposable local server data. The first exercises incomplete TCP
handshakes, their limit/expiry and successful subsequent WebSocket admission;
the second verifies authenticated matches, reconnect reservations and backfill.

The server executable accepts `--capacity-bench --players 10 --combat --ticks 1800
--cpu-timing --output capacity.json`. Repeat with six players and preserve all
runs, including maxima and over-budget counts.
