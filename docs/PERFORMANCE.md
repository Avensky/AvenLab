# AvenLab latency experiments

This patch starts the frontend in a collider baseline. Rust still owns the
simulation, collision shapes, wheel poses and input processing. These controls
change presentation and diagnostic requests; they do not retune the vehicle.

## Run the updated code

Update both the frontend and Rust backend. Restart Rust after rebuilding so it
sends the new collider metadata and server timing fields. Existing GLBs use Git
LFS; run `git lfs pull` if a model is a small text pointer instead of a binary.

From the repository root, use separate terminals:

```sh
npm run dev:rust
npm run dev:frontend
```

For repeatable measurements, build the frontend and use its preview server:

```sh
npm --prefix frontend run build
npm --prefix frontend run preview -- --host 0.0.0.0
```

Vite preview uses the production `/ws/` WebSocket path. For a standalone local
preview without NGINX, build with `VITE_RUST_WS_URL=ws://localhost:9001` in
`frontend/.env.local`. Use the PC's LAN hostname/IP when viewing from a phone.
Restart/rebuild after changing Vite environment variables. Run Rust in **release**
mode for representative physics timing (`cargo run --release` in `avenlab-server`).
Development builds, React StrictMode, DevTools and screen recording affect timing.
Keep those conditions the same across comparisons.

## Make a baseline

1. Enter Sandbox, then press Escape → Debugger.
2. Select **Reset to lowest-lag collider baseline**. This disables diagnostics,
   GLBs, HDR reflections, stars, fog, shadows, vehicle spotlights, driving HUD and
   interpolation, and sets resolution scale to 1. Lower it to 0.75 or 0.5 for a
   separate resolution experiment. The measurement overlay is enabled by reset.
3. Choose a capture label and length (5, 10 or 20 seconds).
4. Select **Record baseline & resume**. The menu closes. After assets settle,
   a three-second warm-up starts, then the measurement interval begins.
5. Stay still for the first set of experiments. Use the same camera, location,
   viewport, player count and scene for every run. For driving tests, repeat the
   same route and input pattern from the same starting position.
6. Return to Debugger after the overlay says **Saved**. Repeat at least three
   times to understand normal run-to-run variation.

Raw snapshots have the least intentional display buffering and may look less
smooth. Interpolation is an independent experiment with a 50 ms target buffer;
that is a configured target, not measured end-to-end latency.

## Add one feature

Keep the environment in collider mode and change only your individual vehicle
row to GLB. Record a comparison. Next, change **one city chunk** to GLB and record
another. Chunk controls replace that chunk's collider preview while retaining
other chunks as colliders. For finer isolation, the **GLB asset chunk/id** rows enable just one asset
instance, such as the buildings GLB or roads GLB in one chunk. With that chunk
in collider mode, this adds the selected GLB over its collider preview. Chunk
mode changes reset that chunk’s asset overrides. Individual building meshes
inside a combined GLB are not separately selectable.

Modes are collider (wireframe), geometry (solid boxes), GLB, hybrid (GLB plus
collider), and hidden for individual entities/chunks. Changing a default clears
its per-object overrides. Hybrid draws both representations and costs more.

Then compare reflections, stars, fog, spotlights, HUD, resolution and interpolation
individually. Vehicle lights must also be requested through the existing vehicle
controls to emit light. Shadows require lit GLB meshes that cast/receive shadows;
basic collider materials are unlit and do not show shadows. The canvas starts
with shadows disabled; the original canvas did not enable a shadow map either.
Diagnostic switches are independent from previews. Enabling them requests the
corresponding Rust debug stream, so compare their network and rendering cost too.

A capture is discarded if the settings, map chunks, roster, camera mode or viewport
change, a menu opens, the tab becomes hidden, snapshots stop arriving, or assets
start loading during measurement. A failed GLB retains a collider fallback;
reload before capturing again after an asset error. Loading during warm-up restarts warm-up. The
profiler requires at least 30 frames and one snapshot. A real collider baseline
requires updated Rust map metadata; old servers show vehicle placeholders.

Export CSV or JSON before refreshing. Up to 50 captures are held in memory in the
current tab; CSV/JSON include the configuration, measurement conditions and vehicle pose
at the beginning/end of recording. Position is recorded as context, not locked
by the benchmark.
GLB resources remain in loader/GPU caches after being disabled. A page reload
returns to a cold collider baseline. These captures measure settled rendering,
not model download/parse time; use the browser Network/Performance tools for
cold-load spikes. Repeat all comparisons with the overlay in the same state.

## Read the math

For a fixed scene and consistent run conditions:

- Added mean frame time: `Δt = current_mean_ms - baseline_mean_ms`.
- Incremental cost: `current_mean_ms - previous_run_mean_ms`.
- Percentage increase: `100 * Δt / baseline_mean_ms`.
- Average frame rate: `1000 / mean_frame_ms`.
- 60 FPS budget: `1000 / 60 = 16.67 ms/frame`.
- 120 FPS budget: `1000 / 120 = 8.33 ms/frame`.

Example only: a 9 ms baseline and a 12 ms GLB capture give a 3 ms difference
and a 33.3% increase. These are not measured AvenLab results. Costs interact:
adding reflections to GLBs can cost more than adding them to unlit colliders.
The order of additions matters, so repeat A/B/A or alternate baseline/feature
runs. Differences smaller than normal repeat variation are inconclusive.
A display cap can keep both frame intervals near 16.67 ms even when a feature
uses extra GPU time. Use CPU submit, draw counts, and resolution experiments as
additional evidence; do not conclude that a capped frame-time delta means free.

| Measurement | Meaning / practical limit |
| --- | --- |
| Frame mean / p95 / p99 | Browser animation-frame intervals. Percentiles use nearest rank; high tails expose stutters. Includes pacing, not just rendering work. |
| CPU submit | Work from before R3F frame callbacks through rendering submission. Does not wait for GPU completion or include all browser/DOM work. |
| Draw calls / triangles | Three.js renderer counters. Wireframe box draws report lines rather than triangles. |
| Geometries / textures | Renderer resource counts, **not** memory bytes or VRAM usage. |
| Input → completed tick → receipt | Time from an actually sent input packet to receipt/ingestion of a snapshot acknowledging it. Superseded inputs have no separate samples. Excludes time before sending, interpolation and physical display latency. |
| RTT | Application ping/pong measured on one browser clock; sampled about every five seconds. Blank means no fresh sample. |
| Snapshot interval / receipt age | Delivery cadence and age since the newest receipt. They do not measure one-way network transit or server clock offset. |
| JSON decode | JSON.parse time per incoming message, sampled once per packet; excludes validation/store updates. |
| Snapshot / debug KiB/s | UTF-8 application payload bytes; excludes TCP, TLS and WebSocket framing. Live values use a trailing five-second window. |
| Server physics / work / lock | Same-tick server-clock timings. Work includes lock acquisition, input application and physics before serialization. It excludes serialization/socket sends. |
| Input queued bytes | Browser WebSocket outbound buffer. Growing bytes/pending inputs suggest backpressure or delayed acknowledgements. |

## What to address next, based on evidence

| Observation across repeated runs | Next investigation |
| --- | --- |
| GLB or chunk increases draw calls and CPU submit | Inspect mesh/material count; merge static compatible meshes or instance repeated meshes. Add distance LOD for expensive city assets. |
| Lower resolution helps with similar CPU submit | Investigate GPU fill, transparent materials, physical glass/transmission, reflections and light counts. Confirm with a GPU-capable profiler. |
| High frame tails when changing chunks/assets | Inspect loading, decoding, shader compilation and allocation/GC in browser traces. |
| Ack/RTT stays high in collider baseline | Inspect connection/proxy and server scheduling rather than vehicle mesh complexity. Compare a local connection. |
| Server physics/work approaches 16.67 ms | Profile Rust in release mode. Separate lock contention, physics and serialization; use existing AVENLAB_CONTACT_TRACE server logs for total tick costs. |
| Interpolation makes controls feel delayed with similar other metrics | Compare the intentional 50 ms render buffer separately from actual simulation/network timing. |
| Diagnostics cause larger packets and frame tails | Enable only the needed flags; a future improvement is lower-rate force diagnostics or binary/delta snapshots after measurements justify it. |

Source inspection also found a large frontend JavaScript bundle and a root README
that currently describes ChangeOrder. Those are separate follow-ups; neither is
a measured explanation for driving latency.

## Checks

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test:performance
npm --prefix frontend run build
cargo test --manifest-path avenlab-server/Cargo.toml
```
