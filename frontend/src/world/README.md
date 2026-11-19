# City and authored world rendering

CityScene.tsx composes floor/environment/map geometry. CityStreaming.tsx chooses full/reduced/proxy bands. cityBlocks/cityLod/cityViewDistance derive plans. cityDrawBatches/cityInstances share GPU work. AuthoredWorld.tsx draws installed authored layouts.

## How to edit

Use store/presentation for graphics preferences and store/world for installed map metadata. Change collision source under avenlab-server/src/world, not GLB visibility. City upload jobs share cityWorkQueue.ts; keep warmup separate from steady-state performance captures. See docs/CITY_PERFORMANCE.md.

## Snapshot damage selection

`AuthoredWorld` uses `destroyedAssets.ts` to derive the sorted destroyed-ID key.
A shared weak cache computes that key once per immutable `asset_health` object,
including when several authored-world chunks consume the same snapshot. Weak
keys do not retain damage histories from previous worlds. The key format and
strict `hp === 0` visibility rule are unchanged.

The compact decoder shares an unchanged health map with its immutable keyframe.
Damage patches copy the map, whole-map replacements supply a new object, and
legacy JSON parsing supplies fresh objects. Snapshot delivery retains the packet
data; the network store only copies the snapshot root to add receipt timing.
World/session resets clear the snapshot. Synthetic producers must follow the
same contract: replace a changed health map rather than mutating an earlier
snapshot. `PhysicsSnapshot.asset_health` is typed readonly to make that explicit.

New keyframes still require a scan. A changed-since-keyframe map can also be a
fresh object on each delta until the keyframe rotates; those maps are recomputed.
The cache therefore avoids repeated work on shared maps, without assuming every
motion packet has the same map identity. Fresh legacy JSON remains correct and
can share one derived result across its own chunk consumers.

Run `node --test tests/destroyed-assets.test.mjs` from `frontend`. Tests exercise
actual compact decoding, damage/repair/removal, return to baseline, legacy JSON,
empty maps, world resets and snapshot immutability. A deterministic two-keyframe
fixture uses 30 packets per keyframe, six chunk consumers and 250 health entries:
360 selector calls perform two map scans instead of 360. This measures avoided
enumeration/allocation work, not browser frame time or FPS. The existing string
selector already suppressed React renders when the destroyed set was unchanged.

## Recurring scene-work audit — 2026-11-18

This audit observes the runtime at `25988e1`; it changes no rendering behavior.
From `frontend/`, reproduce the count evidence with:

```sh
node scripts/audit-scene-work.mjs --output ../performance/reports/scene-work-2026-11-18.json
node --test tests/menu-preview-lifecycle.test.mjs tests/city-render-budget.test.mjs tests/fitting-room-mirror.test.mjs
```

The [saved report](../../../performance/reports/scene-work-2026-11-18.json)
records source hashes and executes the actual `useFrame` callback expressions
extracted with the TypeScript parser. Dependencies are explicit Three-only
fixtures. Shared shadow and reflection helpers execute directly. These are
operation counts and contract assertions, not measured frame times, FPS, GPU
cost, React rendering, or loaded production scenes. The existing nine focused
preview/city/mirror tests pass.

### Current map scope

The harbor census uses the committed build-script seeds: red 417, blue 1030,
fleet 1643. Coastal District uses its build-script default. All four generators
produce a fixed 1 × 1 map with `repeat: false`, so their authored layouts are
mounted once. Model counts include the garage replacement used by
`LayoutInstances`.

| Current generator | Authored objects | Kit placements | RoadModel placements | Model placements | Building placements |
| --- | ---: | ---: | ---: | ---: | ---: |
| Harbor red | 1,110 | 10 | 0 | 6 | 46 |
| Harbor blue | 1,110 | 10 | 0 | 6 | 46 |
| Harbor fleet | 1,185 | 10 | 0 | 6 | 46 |
| Coastal District | 76 | 0 | 0 | 3 | 11 |

The ten map IDs in the generated catalog are not ten available map documents:
the installed server `src/assets/blocks/` documents are absent in this checkout.
The audit reports each missing document explicitly. Generated maps are useful
current-source evidence, but are not proof of a running server's layout. In
particular, the number of prepared CityStreaming visual groups in Endless City
is not known here. Declared placeholder visuals in generated documents are not
counted as mounted prepared city assets.

LOD counts below assume normal visual authored-layout rendering. The fresh
`BASELINE_SETTINGS` uses collider mode, where kit distance work returns early;
the low-detail preset uses GLB mode. Both presets disable shadows. Persisted user
settings and an actual live snapshot were not inspected.

### Ranked opportunities and constraints

**1. Group kit LOD work and stop recomputing static ancestors.** In visual mode,
`worldBuilder/mapKit/KitMesh.tsx` calls `localToWorld` for each kit placement on
every rendered frame. Three's `localToWorld` updates the object's ancestor chain,
and automatic local matrices are composed even when transforms did not change.
For the ten harbor pieces, 60 callbacks per piece produce **600 distance checks**.
A minimal seven-level CityScene fixture produces **4,200 world-matrix update
calls and 4,200 local-matrix compositions**. Only ten initial state publications
occur; unchanged LODs do not repeatedly set React state. Additional application
ancestors and the renderer's own matrix work are outside that count. Collision
and force-detail modes perform zero distance checks.

A bounded first change would put the ten checks in one `KitInstances` scheduler
and reuse prepared placement centers/radii, refreshing them on layout or parent
transform changes. This can preserve the present per-frame LOD decisions. A
separate optional step can sample normal gameplay at 10 Hz; at 60 rendered
frames per second that would reduce steady distance checks from 600 to about
100 per second. That is a work-count projection, not a frame-time estimate.
Demand canvases must still check every requested frame, and the initial LOD
must be resolved immediately. Preserve the current 90/105 and 235/265 distance
hysteresis, bounding-sphere adjustment for long bridges, collision/force-detail
gates, placement scale/yaw, parent chunk transforms, and editor updates.

Acceptance: compare old/new LOD sequences for identical camera paths, edits,
teleports and threshold crossings; count matrix work separately from React
publications. If adding a time interval, test fast travel and accept the explicit
maximum extra distance `speed × interval` before a level changes. Run browser
crossing/long-span checks before changing cadence. Merely caching or grouping
world-space centers avoids that new delay.

**2. Share camera and shadow frusta across prepared city visuals, when more than
one is mounted.** `PreparedCityAsset` in `CityStreaming.tsx` independently updates
the camera matrix, rebuilds its frustum, and, when shadows are enabled, calls
`collectCityShadowFrusta`. That helper traverses the entire visible scene and
updates every visible shadow light's matrices. The arrays are reused already;
the duplication is repeated computation/traversal, not new Frustum allocation.

An explicit fixture with four prepared visual groups, 1,000 otherwise empty
nodes, and directional/spot/point shadow lights performs four camera/frustum
updates, **4,040 visible-node visits**, and **32 light-shadow matrix updates in
one frame**. Each visual receives identical frusta. There are eight unique
shadow faces, so one shared collection would need 1,010 visits and eight updates
for that same fixture. This scales with prepared visual count; it is conditional
evidence, not a claim that a deployed map has four visuals or 1,010 nodes. With
shadows off, all shadow traversal work is absent. With one visual there is no
cross-visual duplication to remove.

The bounded proposal is a per-canvas/per-frame read-only camera/shadow bundle
consumed by all prepared visuals, while retaining per-asset culling and its
current update cadence. Do not cache by camera identity across frames: camera
projection/transform, light transforms/targets/visibility/castShadow, and scene
membership can all change. Compute after the relevant camera/light updates and
keep reflection cameras separate. Acceptance: unchanged full/reduced/proxy and
offscreen-caster visibility, moved directional/spot/point lights, all six point
faces, settings changes, multiple canvases/cameras, and deterministic one-scan
counts. First confirm the actual map has several prepared visuals before
prioritizing this over the kit work.

**3. Preserve demand-render wake behavior when standardizing LOD timers.** Roads
already check only every 20 frames in continuous mode, and model/parked-vehicle
groups every 15; all three bypass their counters for demand canvases. The
synthetic one-road check performs three steady queries across 60 continuous
frames, versus 60 demanded frames. The six real harbor model placements produce
four scans, 24 distance queries, and 24 temporary candidate Vector3 allocations
across 60 continuous frames. That allocation count is small and should not be
called a demonstrated bottleneck. None of the current harbor generators has
RoadModel or parked-vehicle placements.

`HarborBuildingLods` has a different contract: its 0.25-second clock gate also
applies in demand mode and schedules no follow-up frame. The actual callback
fixture first marks a building near at time 0; a camera jump at 0.1 seconds is
skipped, and the result only corrects when another frame arrives at 0.3 seconds.
In an editor this can leave the last requested frame on the prior LOD. This is
an existing wake constraint, not evidence of a measured visual pop. Any shared
timer proposal must bypass the interval in demand mode or explicitly arrange a
final wake. Test a single final camera event, not only continuous drag streams.

### Preview work already gated; further savings need a wake contract

`FullCanvas.tsx` currently uses demand rendering for queue pause, authoring,
compact preview, and the application's Reduced Motion preference. A preview
retained behind Main uses `frameloop="never"`. The compact clock invalidates at
30 Hz only while visible, unpaused, outside authoring, and without that Reduced
Motion preference. These existing gates supersede the earlier concern that a
paused desktop preview always renders.

The active desktop preview remains continuous. `GarageGlow` performs the final
render/composer work each rendered frame. Planar reflections use smaller render
targets and clock gates, with at most one timed planar capture per scene/frame;
the environment cube uses `frames={1}` and is not a per-frame six-face capture.
`PreviewContactShadow` is a small static texture/draw, not a shadow-map pass.

Calling the real planar gate with unchanged camera/scene inputs gives:

| Explicit callback fixture | Input renders | Floor captures | Wall captures |
| --- | ---: | ---: | ---: |
| Desktop floor, 24 Hz configured, 60 Hz input for two seconds | 120 | 40 | 0 |
| Compact floor, 15 Hz configured, 30 Hz input for two seconds | 60 | 30 | 0 |
| Fitting floor 12 Hz + wall 24 Hz, 60 Hz input for two seconds | 120 | 24 | 36 |
| Reduced Motion, one requested render without a clock gate | 1 | 1 | 1 |
| Settled demand canvas, no requested render | 0 | 0 | 0 |

These counts include frame quantization and the shared capture arbiter. The
fixture makes both planes front-facing and submits the floor first; it does not
measure renderer passes, scene animation, GPU time, actual occlusion or FPS.
The reduced-motion path intentionally refreshes both mirrors on its one frame;
adding an unconditional shared one-pass guard there would risk a stale mirror
with no subsequent wake.

A future dirty-capture gate could avoid unchanged captures *within frames that
already occur*, without changing the global menu modes. It must notice camera
and projection changes, viewport resize, model/wardrobe/material/theme/loading
changes, animated geometry, moving parts, and visibility. Fully sleeping an
active preview also needs animation/turntable/materialization leases plus final
settling invalidations. That crosses the separately owned pose/animation
workstream and is not an immediate source-only recommendation. Current source
also handles OS Reduced Motion inside `VehiclePreview`, whereas `FullCanvas`
reads only the application preference; assess that policy disagreement before
assuming a visually still preview is eligible to sleep. No hair or pose files
were changed in this audit.
