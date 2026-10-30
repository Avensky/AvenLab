# World builder: next update brief

Prepared October 29, 2026, for the placement patch based on `0af4c64e87fd86ef618dd2fabae78f415b969bd9`.

Finish installing and testing the current patch first. Then build a small road/jump proving map before implementing the chokepoint creator. Keep each step independently reviewable and playable.

## Current foundation

| Available after this patch | What still needs work |
| --- | --- |
| Measured narrow/wide/junction GLBs, sidewalk masks, opposing carriageways, magnetic edge/corner snapping and shared Rust collision catalog | Surface-height/socket snapping and road-join validation |
| Piece previews, actual selection-screen garage placement, structural masks and Workshop Yard | Generic building catalog, building collider accuracy pass and visual LODs for repeated garages |
| Box/wedge parts, wall panels, floors, barriers and a vehicle ramp | Jump tuning and reusable route templates |
| Saved drafts, layout/map export and finite maps | Spawn editing and a shorter installed playtest cycle |
| A 200 m guide divided into four quadrants | Reusable groups, independent chunks and rebuilding the old merged 2×2 assets |
| Server-owned vehicle NOS boost and impact damage | Authored speed-boost zones, CTF carrier rules and achievement triggers |

The 200 m guide is only an editor reference. Existing imported roads have their own measured dimensions, including a roughly 240 m narrow module. Read the installed map's actual `cell` and asset bounds when rebuilding chunks; do not infer the streaming-cell size from the guide or cut/rescale roads to fit it.

## First implementation: road and jump proving map

Recommended working title: **Road & Jump Lab**. This is a proposed next slice, not a feature included in the placement patch.

Build one finite test map from the existing measured road modules and explicit wedge/floor/barrier pieces. Reuse the current renderer, exporter and Rapier path. Keep source roads intact; independent sidewalk masks remain the way to join carriageways.

| Station | Build | Verify |
| --- | --- | --- |
| Road joins | End-to-end narrow pieces, an opposing pair, a wide road and a junction station | Suspension stays supported at intended seams; hidden sidewalks add no collision; source asymmetries are visible rather than silently filled |
| Ramp connection | A road, wedge and raised landing slab with measured elevations | No lip at takeoff; wheel contacts and chassis clearance match the visible slope |
| Short-building jump | A ramp, a real gap and a lower landing roof | A suitable approach can land; a slow or misaligned attempt falls through the actual gap |
| Height limit | A taller obstacle beside the reachable roof | Tall buildings remain obstacles when the launch cannot clear them; no invisible assist platform |
| Return route | Ground bypass and a ramp back to the approach | A missed optional jump does not remove every useful route |

Set `base: 'replace'`, `ground: false`, and `repeat: false` explicitly. Create support only where it is intended. Start with the BRZ already used in the physics integration tests. Test an unboosted approach and the existing vehicle NOS separately; record actual launch speed, ramp dimensions, gap, landing height and outcome. Treat any suggested dimensions as a draft until driven with the real solver.

Use the current installed-map workflow for this slice. A new map requires its schema 2 fixture in `avenlab-server/src/assets/blocks/` and its selection entry in `frontend/src/store/selection/selectionStore.ts`; normal frontend prebuild refreshes the authoring catalog. Do not turn this first map into a new terrain or physics system.

Acceptance for this slice:

- The same fixture loads in the editor, frontend runtime and Rust, with no fallback support across gaps.
- A repeatable BRZ simulation proves takeoff, airborne motion and landing on the intended surface. A too-slow approach proves that the gap is physically open. Raycasts alone do not prove a successful jump.
- Existing measured-road and garage-driving tests continue to pass.
- Pointer and controller workflows can select, preview, place and edit its component pieces.
- Save/import/export preserves explicit support and finite-map settings.
- Record a short manual drive result for road seams, clean landing, missed jump and the ground return path before tuning more routes.

## Second implementation: chokepoint creator

Build an editor template that lays out a fort and its routes using the existing walls, slabs, ramps and barriers. Preview its footprint before placement; one placement or regeneration should be one undoable edit. Keep its first output as ordinary validated layout objects with unique stable IDs, so the installed renderer and server use the existing geometry contract.

Expose only controls that affect the route: fort dimensions, ground opening/vehicle clearance, perimeter lane width, corner-cover placement, upper-platform height and ramp direction. Generate actual openings between structural parts. An enclosing building box cannot stand in for a drivable interior.

The layout must preserve your route requirements:

- A continuous drivable loop around the fort.
- At least two ground approaches, with corner cover and room to turn.
- An optional rooftop/second-story approach and drop into the intended capture area.
- A useful ground route when a vehicle cannot make the optional jump.
- A 1v1 escape test around corners and down from the upper route, with sightlines checked from both directions.

Measure clearance against the chosen vehicle's chassis and turning path. The first version should be a layout generator; automatic terrain modification, arbitrary GLB cutting and a generic procedural-city solver are later work.

## Gameplay follow-ups and dependencies

Your arcade direction includes speed boosts, rooftop jumps, secret paths and obstacle achievements. The first proving map should establish the geometry and handling before those systems add variables.

| Follow-up | Required contract and proof |
| --- | --- |
| Speed-boost zones | A separate server-owned trigger contract, duration/cooldown rules and authoritative snapshots. The current NOS request is vehicle input, not an authored boost-pad system. |
| CTF capture routes | Pickup/drop/return/capture state and capture-zone semantics on Rust. This source revision has team spawns but no implemented flag state machine. Any authoring marker is only a planning marker until that system exists. |
| Flag-carrier penalties | Implement slower movement and increased damage taken on the authoritative server; choose numerical values after baseline route tests. Test pickup/drop transitions, restoration of normal handling and both carrier/defender roles in 1v1. |
| Secret paths and achievements | Stable route/trigger IDs, server-confirmed completion and reset rules; a visual landmark alone does not award an achievement. |
| Additional vehicles/motorcycles | Repeat launch, landing, clearance and escape tests after the vehicle physics exist; car results do not establish motorcycle behavior. |

No new boost-pad logic, CTF state, flag penalty or achievement system ships in the placement patch.

## Rebuilding the 2×2 city chunks

After the first test map and chokepoint template are useful, rebuild one representative 2×2 chunk as the reference, then repeat the process for the remaining chunks.

1. Measure its real map cell, road frames and building footprint. Keep roads and standalone intersections as modules with separate sidewalk groups.
2. Author floors, walls, pillars, ramps and openings from structural geometry. Mark signs, trim and covering meshes as decorative. Check corners, inner block areas and access routes against the physics view.
3. Add multi-select/group operations and a reusable block/chunk library. Stamp transformed groups with fresh IDs; preserve per-instance masks and source hashes. Begin by exporting ordinary layout objects rather than introducing linked runtime dependencies.
4. Add surface-height and socket snapping for ramps, roofs and entrances; horizontal bounds snapping already exists. A collision surface is the elevation authority, with deliberate author overrides.
5. Add spawn/capture marker authoring and validation when their server contracts are ready. Check overlap, clearance, road connectivity, unsupported surfaces and cross-chunk joins.
6. Build adjacent-chunk tests at the installed cell size. Export/reload must apply object and chunk transforms exactly once; whole-map authoring limits must be revisited before increasing the city scale.
7. Measure frame time, draw calls, memory and collider counts on the same drive route before duplicating detailed building prefabs. Add visual LODs and instancing based on that measurement.

Current layout limits are 512 objects, a 4,096 part/collider-group budget and 2 MiB JSON; these are parser limits, not performance targets. The placement patch does not split or rebuild the merged city GLBs automatically.

## Source handoff

| Area | Existing starting point |
| --- | --- |
| Procedural pieces and layout validation | `frontend/src/worldBuilder/document/layoutDocument.ts` |
| Road catalog, masks, frames and snapping | `frontend/src/worldBuilder/roads/` and `roadKit/` |
| Selection, history and placement UI | `layoutStore.ts`, `WorldBuilderPanel.tsx`, `LayoutScene.tsx`, `LayoutPlan.tsx` |
| Shared primitive visual transforms | `LayoutMeshes.tsx` |
| Export and finite-map spawn defaults | `mapDocument.ts` |
| Fixture generation examples | `scripts/build-road-test-map.mjs`, `scripts/build-workshop-yard.mjs` |
| Rust authored geometry | `avenlab-server/src/world/authored_layout.rs`, `road_colliders.rs`, `model_colliders.rs` |
| Existing real vehicle integration tests | `avenlab-server/src/physics.rs` |
| Vehicle NOS and resources | `avenlab-server/src/powertrain.rs` and `vehicle_forces.rs` |

Next implementation handoff: inspect the repository's current head and any applicable instructions, preserve the placement patch, then implement **only Road & Jump Lab** as the first slice above. Deliver its map, source, meaningful physics checks and measured drive results before proceeding to the chokepoint creator. Use [the release checklist](WORLD_BUILDER_RELEASE_CHECKLIST.md) to establish the installed baseline.
