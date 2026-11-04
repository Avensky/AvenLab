# Compact performance recorder

The latency overlay starts as one compact row: **Name · Start/Stop · Export ·
Open · ×**. These are browser/Rust snapshot measurements, not a video recording.
The red countdown appears only while a capture is waiting, warming up or recording.
Compact mode keeps collecting measurements without calculating the hidden live
metric summaries. Expand the inspector only when those details are useful.

## Record and share

1. Choose **Open performance overlay** at the top of Debugger → Visualizers (or
   Captures), or press **F3** while driving. This resumes gameplay without
   recording. F3 and × close the overlay. Enter a label such as `city-original`,
   or leave it blank to name the run from the vehicle, city quality, view distance
   and shadow setting. Open the inspector to choose 5, 10 or 20 seconds or mark
   the next capture as a baseline. The first run is a baseline automatically.
2. Click **START**, press **F8**, or press **A / Cross** while driving with the
   compact overlay visible. Starting minimizes the inspector and releases its
   input focus so you can drive. A 3-second warm-up precedes measured sampling.
   **STOP** or the same shortcut saves a valid partial capture after at least
   one measured second, 30 frames and a snapshot. Earlier stops are not saved.
   Expanded **Discard** and Debugger **Cancel** discard deliberately. Settings,
   readiness and sample-validation checks still apply to a manual Stop.
3. **EXPORT**, next to Start/Stop, opens **CSV** / **JSON** choices and shows the
   number of saved runs. Export is disabled until one exists. JSON contains full
   recordings; CSV is the comparison table. Downloads contain all session runs,
   with the latest label and UTC time in the filename. The browser chooses the
   save location. `stoppedEarly` in JSON / `stopped_early` in CSV distinguishes
   partial recordings, and their rates use the actual measured duration.

## Inspector and controller shortcuts

**OPEN** expands three tabs without pausing the simulation:

- **POSITION:** world X/Y/Z, chunk/local coordinates, yaw, speed and Copy Spawn.
- **NETWORK / PHYSICS:** live frame/CPU percentiles, input acknowledgement,
  snapshot traffic, server timing, input queues and interpolation buffer.
- **CITY ASSETS:** quality/range, effects, model/silhouette counts, preparation,
  draw/triangle/memory counters and resolved optimized city model URLs.

| Input | Recorder action |
| --- | --- |
| View / Select (standard gamepad button 8) | Show and focus the inspector; press again to minimize |
| D-pad / stick, arrows or WASD while controller inspector is focused | Navigate controls |
| LB / RB, Q / E or Page Up / Page Down | Switch inspector tabs |
| A / Cross, Enter or Space | Activate the focused control |
| B / Escape | Close the Export chooser first, otherwise minimize |
| Shift+F3 | Show/focus inspector or minimize |
| F3 | Show/hide overlay |
| F8 | Start/Stop even while the inspector has focus |

Controller navigation owns driving input only while the inspector is focused.
Held controls must return to neutral across the transition; holding A cannot
activate a second action in a newly opened panel. Starting returns to driving.
Clicking Open with the mouse leaves the inspector passive so live data can be
watched while driving. Typing retains text editing and blocks game shortcuts.
View/Select replaces its old CAN-dump binding; keyboard **C** still toggles CAN
dump. Start still opens Pause. Signal Recon and other menus retain their routing.

Up to 20 recent captures, including the current baseline, survive reloads in the
same browser and site origin. The local archive also has a two-million-character
limit; older runs may be omitted from persisted history while remaining in the
current session's export. No backend upload is necessary. Private browsing,
cleared site data, another device, or another origin will not share that history.
The overlay reports storage failures so data can be exported before reloading.

JSON includes metric summaries, individual measured frame durations, bounded
10 Hz observations of the latest metric values and authoritative player poses,
start/end coordinates, chunk/local positions, yaw in radians, active asset URLs,
render settings, viewport, browser and baseline links. CSV retains summary
metrics and baseline/previous deltas. The 10 Hz timeline is not a replacement
for per-frame samples and is not an end-to-end input latency measurement.

**COPY SPAWN** copies the current chunk, local X/Z and yaw in the format used by
the map's `team_spawns` list. The overlay labels world X/Y/Z in meters. These are
the backend player's coordinates, not the chase camera's coordinates. A chunk
is selected by its centered bounds and actual rectangular cell dimensions.

## Restore the visible city before comparing materials

The earlier `city-2x2-step1-materials.glb` was derived from an uncentered source.
Its raw bounds are approximately X 35,637–84,798 and Z -147,339–-57,680. The map
expects a centered, scaled asset in meters. That test GLB is not a drop-in
replacement for the centered map asset.

Restore the `visuals` entry with `id: "blocks"` in
`avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json` to:

```json
"asset": "/models/chuncks/chunck_0,0_2x2_blocks_centered.glb"
```

Keep the working centered GLB in `frontend/public/models/chuncks/`. Restart the Rust server after changing its map JSON, then rejoin. If your
build embeds the JSON, rebuild Rust before restarting.
The inspector's **CITY ASSETS** tab lists the resolved model URLs, including
quality-specific texture variants and the reduced model where applicable.
Environment/chunk/asset GLB visibility must also be enabled in the debugger.

For the material comparison, choose **Original / A/B** quality, then record
`city-original` with **OPAQUE CITY
MATERIALS** off, then record `city-opaque` with it on. This uses the same working
GLB, geometry, textures, nodes and backend transforms. Only non-glass city
materials with transmission enabled get a shared cloned material with
transmission set to zero. The material named `Glass` is preserved. Vehicles are
not affected. Each imported city asset has one cached material variant shared
across its repeated tiles. The setting is included in exports.

Keep the same map, camera, graphics and route for the comparison. Changes to
settings, map/roster, missing snapshots, hidden tabs or asset failures discard
an active measured run; they do not create misleading successful recordings.

## Compact-recorder validation

All 135 frontend tests, TypeScript production build and full ESLint pass. Tests
cover manual-stop duration/rates and validation, archived partial runs, compact
summary suppression, controller neutral/activation handoff, typing guards and
existing menu routing. Native Chromium checks exercise mouse, keyboard, mocked
standard gamepad navigation, real CSV/JSON downloads, Copy Spawn and layouts at
320×240, 568×320, 390×844 and 844×390. UI checks use synthetic snapshots and metric
samples; they are not game FPS measurements. No renderer, model, dependency or
Rust physics changes are introduced by the compact-recorder follow-up.

## Multiplayer benchmark and wire format

The November 4 build was compared with cockpit revision `e2bd3f4` using optimized Rust builds on the same host. Each run used one streaming city, BRZ drivers, 120 warm-up ticks and 900 measured ticks. The run order was reversed for the second pair. The table reports the mean of the two runs’ 95th-percentile tick times. Each byte count is the average size of one room snapshot before WebSocket framing.

| Drivers | Previous p95 tick | Updated p95 tick | Previous snapshot | Updated snapshot |
| --- | ---: | ---: | ---: | ---: |
| 6 | 1.44 ms | 0.98 ms | 19,482 B | 16,363 B |
| 10 | 1.96 ms | 1.27 ms | 32,290 B | 27,105 B |

The tick measurement includes physics and snapshot serialization. Internet round-trip time, phone frame time and socket transmission are outside this benchmark. An isolated WebGL check of ten flying health packs went from four draws and 360 triangles to two draws and 20 triangles. The idle effect went from one empty draw to zero. In a vehicle-material test, Low detail also removed the off-screen opaque-scene pass requested by transmissive vehicle materials. Restoring Full HD restored the authored materials.

The driving client selects binary input only after the initial welcome advertises `packed_input_version: 1`. Each input message stands alone. A dropped or coalesced input does not depend on a preceding delta. Invalid frames do not replace the last valid input. An older peer can still use JSON. World snapshots, chat, social actions and reconnect use their existing messages.

| AI v1 field | Encoding |
| --- | --- |
| Header | ASCII `AI`, one version byte and one presence byte |
| Fixed controls | Little-endian u32 sequence, five f32 values for dt, throttle, steering and the two brakes, then u16 vehicle and player masks |
| Optional fields | Presence bits 0–3 select cockpit u32, parking f32, cabin u32 and debug u32 in that order. A present zero is a command |
| Combat | Presence bit 4 adds an action byte, a mount byte, and five f32 values for yaw, pitch and mount position |
| Action byte | Bits 0–4 mean enabled, fire, ram, hull lock and lock target. A lock target appends two f32 angles |
| Mount byte | Bits 0–1 select cannon, coax or basket. Bits 2–3 select assault, support or medic |

The compact and fully populated fixtures use 32 and 78 bytes. The same samples serialized by the browser as JSON use 138 and 394 bytes. Rust and browser tests share the same fixture file. The server continues to own simulation time, damage, healing and targeting.

To reproduce the server measurement, run the following from the repository root. Repeat with `--players 10`. Use the F3 recorder on a physical phone for an end-to-end frame-time and RTT comparison on the same route.

```sh
(cd avenlab-server && cargo run --release -- --capacity-bench --players 6 --ticks 900 --map streaming_endless_city)
cargo test --manifest-path avenlab-server/Cargo.toml benchmark_snapshot_encoder -- --ignored --nocapture
AVENLAB_SERVER_BIN="$PWD/avenlab-server/target/release/avenlab-server" node scripts/test-three-v-three.mjs
```

Settings → Display owns graphics profiles, quality and draw distance. Full HD uses this device’s saved settings. Low detail caps the resolution scale at 0.75×, uses a 250 m detailed-city range and skips decorative HUD layers. Debugger → Rendering opens the same Display controls. Debugger retains the world and vehicle inspection tools and the collider benchmark.

The mixed-client 3v3 check covered team privacy, reliable messages and token reconnect. In a separate ten-client streaming-city run, five binary senders and five JSON senders all observed all ten sequence acknowledgements on the same server tick. Coastal District has three authored red and three blue home spawns. With all six occupied, the seventh vehicle received a spawn error. A simultaneous 5v5 start on that map needs two additional clear home positions per side.
