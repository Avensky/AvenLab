# Collider excavation and Harbor Exchange

Built against main `6395a09b4f41d5ce01549ee73c43f5eacb1e0ac0`.

## Using the tools

Open World Builder → TOOLS → Road, tunnel & canal excavation. The editor and piece previews now start in Collision view. Turn that view off when inspecting visuals.

1. Place mountain segments from Blocks. Resize and rotate them with the ordinary inspector. Small, standard, long and broad mountain presets remain available.
2. Choose an open road cut, hillside tunnel, urban underpass, open canal, or mountain canal tunnel.
3. Choose a 12, 24, 48 or 96 m segment, or enter a custom length up to 384 m. Standard segments default to 24 m. Set width, clearance, heading and entry coordinates. Turn accepts signed angles, including 45° and 90° curves. Length measures the arc.
4. Optionally enter centreline samples as world `X, Z` pairs, one per line. These replace the preset. Intermediate samples round corners; the tool rejects joins over 30° and curves too tight for the selected width.
5. Preview collision cut. Cyan outlines show the requested passage. Review remaining obstructions, then Apply excavation. Undo restores both the mountain and the generated route in one step. Changing the draft invalidates an old preview.
6. Save, Export map, or Apply & Test Drive through the existing editor workflow.

Canals require a finite standalone layout with Support ground off. Set the entry Y to the water surface and depth to the distance down to the bed. Water is a nonsolid region used by server buoyancy and water hazards, not an invisible floor. The optional waterfall terminus has a separate solid rock blocker and animated nonsolid curtain.

## Physical representation

Excavation subtracts from unlocked box-based mountain objects in their own rotated/scaled frame. Floor and ceiling heights are exact; boundary cells are conservatively removed at the selected 0.5–4 m resolution. Adjacent retained boxes are merged to reduce collider count. The editor draws the same boxes that Rapier receives. The operation preserves unrelated objects, measured GLB road meshes and locked pieces.

This first tool supports level centreline paths. It does not perform arbitrary GLB boolean cuts or excavate buildings. Existing walls and imported meshes remain in place: the preview reports intersecting authored boxes and marks imported collision meshes for live testing. Joining two lined routes may require removing or shortening a wall. Requested passage dimensions are minimum clearances; the lining leaves additional room at bends.

Terrain, tree and bush asset packs remain deferred. Underwater tunnels, spline grade editing, automatic intersection rebuilding and large-city stress testing remain future work.

The shared limits are 3,072 objects, 16,384 counted shapes, and 512 explicit shapes per object. These are validation ceilings, not performance targets. This also fixes the older server limits that rejected already-installed harbor districts.

## Harbor Exchange

Select Harbor Exchange from the world list or use Open Harbor Exchange in TOOLS. It has its own save slot. The installed fixture contains 147 independently editable objects and 587 parts, including decorative guardrail posts. No GLB asset pack, legacy city geometry or invisible support ground is required.

The district includes a curved mountain cutting, two hillside tunnel sections with an open junction, an urban underpass, a mountain canal tunnel, water and bed at −2/−8 m, a waterfall end stop, a lookout deck, and a +10 m viaduct. Ramp endpoints meet the actual deck edge. Guardrails leave openings at both ramp entrances; piers stay out of the canal. The water has 11.5 m of clearance below the bridge.

Rebuild the checked-in fixture with `node scripts/build-harbor-exchange.mjs`, then refresh the installed world catalog with `node scripts/sync-world-builder-map.mjs --preserve-extras`. The normal frontend predev/prebuild sync also discovers the installed map.

## Vehicle lighting and HUD

The current main already contains the GTR rubber repair, Charger glass, opaque Interceptor/Enforcer body materials, measured light profiles, stalk Auto/On wiring, turn signals, tail/brake/plate lamps and held high-beam controls. Regression checks cover those existing fixes. This patch adds shadow support to the driver's two projected headlights and authored collision meshes, respecting the existing Shadows and Low Detail settings. There is no additional remote-vehicle spotlight budget.

## Validation

TypeScript typecheck and Vite production bundling pass. Focused Node tests cover rotated/scaled cuts, real tunnel roofs/floors, canal water/bed separation, locked objects, obstruction detection, presets, budgets, fixture roundtrips, preview/apply/cancel/undo, measured roads, vehicle materials, lamps and cockpit controls.

Rust tests compile the server (including the naval `add_force`/`add_torque` repair), raycast the tunnel widths and heights, verify canal beds and bridge clearance, verify local water hazards, and drive the BRZ through both vehicle corridors and up a viaduct ramp. Existing harbor tests also pass after moving one stale seabed probe away from the docked escort hull.

Visual browser inspection could not connect to the local preview in this environment. Final appearance and controller feel still need an interactive playtest on the PC. No aircraft integration or decorative asset packs are included in this slice.
