# Labeled performance recordings

The latency recorder already collected browser and Rust snapshot metrics. This
change adds direct overlay controls, shared labels, persistent local history and
downloadable data. These are measurements, not a video recording.

## Record and share

1. Enable **Performance overlay** in Debugger → Rendering. Enter a label such as
   `city-original` and select 5, 10 or 20 seconds. The first run becomes the
   baseline automatically; **Set baseline** replaces that reference explicitly.
2. Click **RECORD**, press **F8**, or press **A / Cross** while driving with the
   overlay visible. The countdown is red during the 3-second warm-up and capture.
   Press the shortcut again to cancel. Controller A retains its menu action when
   a menu is open. Shortcuts do not fire while typing in a field.
3. Click **EXPORT JSON** to share full recordings, or **EXPORT CSV** for the
   comparison table. The browser saves the download to its configured download
   location or prompts for a destination. Filenames contain the latest label and
   UTC export time. Each export includes all runs still in this session.

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
The overlay's **ACTIVE CITY ASSETS** lists the URLs received from the server.
Environment/chunk/asset GLB visibility must also be enabled in the debugger.

For the material comparison, record `city-original` with **OPAQUE CITY
MATERIALS** off, then record `city-opaque` with it on. This uses the same working
GLB, geometry, textures, nodes and backend transforms. Only non-glass city
materials with transmission enabled get a shared cloned material with
transmission set to zero. The material named `Glass` is preserved. Vehicles are
not affected. Each imported city asset has one cached material variant shared
across its repeated tiles. The setting is included in exports.

Keep the same map, camera, graphics and route for the comparison. Changes to
settings, map/roster, missing snapshots, hidden tabs or asset failures discard
an active measured run; they do not create misleading successful recordings.
