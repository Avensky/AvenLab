# Road & Jump Lab

First slice of the October 29 brief, based on main commit
`00766ac49fd3db533fba94d84040b10a584879d4` (placement foundation installed).

## Installation

Retain local edits, then apply `road-jump-lab.patch` from the repository root.
The `files/` overlay is an alternative for manual merging; use one method.

```sh
git apply --check /path/to/road-jump-lab.patch
git apply /path/to/road-jump-lab.patch
npm ci --prefix frontend
npm --prefix frontend run build
cargo test --manifest-path avenlab-server/Cargo.toml --locked
```

Rebuild/restart both services normally. Select **Road & Jump Lab** and **BRZ** in
Sandbox and start a fresh session. Red starts about 110 m before the ramp, facing
-Z. Blue faces the road-seam station. In World builder, select this map and choose
`launch-ramp` from Scene. The same installed fixture is loaded by the editor,
frontend runtime and Rust. Prebuild refreshes the authoring catalog automatically.

Objects keep stable IDs and use existing previews, placement, inspector, undo/redo,
save/import/export and controller controls. Browser drafts do not change the
running server: export the map, replace its installed fixture and restart to drive
edits. No new dependencies or GLB files are needed beyond the placement foundation.

## Dimensions and route

Runtime metres, Y-up. Source roads retain measured size and hashes; joins use
asphalt bounds and preserve asymmetric sidewalk overhangs. The finite exported
cell is approximately **424.50 × 992.25 m**, derived from full object bounds rather
than the 200 m guide. Settings: `base: replace`, `ground: false`, `repeat: false`.
Legacy collider lists are empty. Nothing supplies invisible support below the gap.

| Station | Geometry |
| --- | --- |
| Approach/seam | X=0; narrow asphalt Z=0..240 and 240..480 |
| Launch ramp | X=0; Z=0..-16; 8 m wide, 16 m long, 4 m rise (~14.04 degrees) |
| Open gap | X=-4..4, Z=-16..-24; unsupported below |
| Landing roof | X=-20..20, Z=-24..-104; top Y=2; slab thickness 0.4 |
| Height limit | X=50, Z=-64; solid 16 × 24 × 24 building |
| Bypass entry | X=0..40, Z=20..40; top Y=0; east approach sidewalk masked |
| Ground bypass | X=20..40, Z=40..-124; top Y=0 |
| Cross lane | X=-20..40, Z=-120..-128 |
| Return ramp | X=12..20, Z=-120..-104; rises toward +Z from Y=0 to Y=2 |
| Opposing pair | Separate station near X=-160; inner sidewalks masked |
| Wide/junction | Separate station near X=160; measured asphalt ends aligned |

Use the bypass before committing to the jump. From the roof, use the far-end
return ramp, cross lane and side lane to return. A miss into the void requires
existing recovery/reset controls. The roof is an explicit slab, not a detailed
building interior. This patch does not rebuild the merged city assets.

## Measured physics results

These are **automated Rapier/BRZ simulations, not a recorded manual drive**.
Jumps start at the installed red spawn, settle for 180 steps, and accelerate with
the normal tire solver and powertrain. No scripted launch velocity or assist.
NOS is requested after Z=60 using the existing finite reserve. Speed is sampled
when the chassis crosses Z=-16. Landing requires 30 consecutive steps with all four
wheels grounded on the roof; braking begins during supported landing frames.

| Approach | Throttle | Launch speed | First roof contact Z | Result |
| --- | --- | --- | --- | --- |
| Unboosted | 1.0 | 25.043 m/s (90.2 km/h) | -51.994 | Landed; 84 airborne sampled frames |
| NOS | 1.0 | 25.467 m/s (91.7 km/h) | -52.905 | Landed; 85 airborne frames; 5.233 s NOS left |
| Slow | 0.12 | 6.975 m/s (25.1 km/h) | None | Fell below Y=-3 through the gap |

Separate initial-8-m/s coast tests cross 30.071 m through the road seam and
100.047 m along the bypass: zero wheel contact losses, peak |vertical speed|
0.034 m/s. A powered 0.3-throttle climb reaches the roof via the return ramp with
four grounded wheels. Static probes verify slope heights, roof, bypass and the
24 m obstacle; gap, masked sidewalk and out-of-map probes remain empty. Dynamic
BRZ tests establish jumping; the probes alone do not.

## Checks and remaining acceptance

Frontend lint/build and regression tests pass. Rust: **97 tests pass**, including
existing garage and measured-road driving tests. New frontend tests check finite
map roundtrips, source dimensions, masks, ordinary piece editing, pointer clicks,
controller actions and saved support settings. Packaging checks clean-base patch
application and hashes.

**Manual in-game acceptance remains pending:** drive seams, clean landing, missed
jump and the entire return loop; inspect real GLB previews and physical controller
feel, and record a short result/video. DOM tests do not replace these checks.

From the repository root:

```sh
node scripts/build-road-jump-lab.mjs --check
cargo test --manifest-path avenlab-server/Cargo.toml --locked road_jump_lab -- --nocapture
```

From `frontend/`:

```sh
node --test --test-concurrency=1 tests/*.test.mjs
```

To intentionally regenerate the fixture after editing its recipe, run
`node scripts/build-road-jump-lab.mjs` and rebuild the frontend. Restart Rust before
starting another Sandbox session.

Next comes the chokepoint template after installed playtesting. Authored boost
pads, CTF state/penalties, achievements, socket snapping, reusable chunk groups and
full city rebuilding remain follow-ups in the supplied brief.
