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
