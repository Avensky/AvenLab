# World builder — legacy collision template

The default World builder is now the modular **World workshop**. Open it from
the main menu, Pause menu or F9. See [WORLD_WORKSHOP.md](WORLD_WORKSHOP.md) for
piece placement, ramps, compound structures, saving and server-map export.
Use **Open original collision template** to access the workflow below.

Open a Sandbox, then press **F9**, or use Debugger → Environment →
**World builder**, then **Open original collision template**. This works with the existing 2×2
city GLBs and roads. No prop library is required.

The builder edits a **local draft** of the server's map definition. Plan view
opens first. Choose **VIEW: PLAN** to load a single template's actual GLBs as a
3D reference. Edits do not change the active multiplayer world's collisions.

## Why begin with collisions?

The current `streaming_endless_city_colliders.json` contains **34 building
boxes and one road box**. Its tile is 257.889923 × 439.4487 metres, repeated in
a 3×3 grid. The backend reads these supplied boxes; it does not measure the GLB
while driving. The road box is one flat slab across the whole tile, with a top
surface at Y = 0.32 m.

The current optimized building GLB contains 273 meshes grouped by block/material.
Individual mesh bounds can span multiple buildings, decorations or windows.
Treating each mesh as one building would create bad collision shapes across
openings and streets. These GLBs are suitable as references, but automatic
per-mesh fitting is not a reliable collision-authoring method for this export.

The inspected building GLB matches the repository's LFS SHA-256:
`f556dc10ec85cfa4ccfa9e7cba8fd4ca159137b6b222c30f90540b3efdab2095`.
Its geometry, transforms, materials and model files are unchanged by this patch.

## Edit the existing template

- Select a footprint in plan view, or cycle boxes using **LB / RB** or the
  Previous/Next buttons. Buildings take selection priority over the large road
  slab. The orange outline identifies the current collider.
- **TOOL: SELECT** selects. **TOOL: MOVE** drags a box in X/Z. Grid snapping is
  0.25, 0.5 or 1 metre. A drag creates exactly one undo entry on release;
  pointer movement only changes its temporary outline. Cancel/blur discards it.
- Inspector **Position X/Y/Z** is in runtime metres, with Y vertical. **Box
  width/height/depth** shows full dimensions, not half extents. Use the numeric
  fields or −/+ buttons. Bottom and top elevations are displayed explicitly.
  Resizing is about the box's center, so check both elevations afterward.
- Add or delete building/road boxes to make compound shapes and leave alleys
  open. New boxes are collision shapes, not new visible buildings or road meshes.
- **UNDO / REDO** retains up to 32 document states in this tab. **FIT** reframes
  plan view. The 3D view supports orbit/pan/zoom, plus top/isometric presets.
- A template edit repeats in every chunk using that template. This first patch
  does not create independent layouts for individual chunk instances.

Keyboard/controller menu routing remains separate from driving. Arrow keys or
D-pad navigate buttons, A/Enter activates, LB/RB cycles colliders, and B/Escape
returns to pause. Native Tab can reach numeric fields. Enter commits a field;
Escape cancels its text. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y undo/redo;
Delete removes the selected box when not editing text. F6/F7 vehicle cameras and
inspection retain their existing shortcuts.

## Save and apply

1. **SAVE** writes a map-specific draft in this browser. **LOAD** restores it
   with undo available. Closing/reopening retains the draft in this tab; use
   Save or Export before reloading the browser. A storage error leaves the
   current document intact and offers Export.
2. **EXPORT JSON** downloads `<map_id>_colliders.json`. Import accepts that same
   server map format. Invalid, oversized, mismatched-map and rotated-box files
   are rejected before replacing the document. Import is undoable.
3. Review the exported file and replace
   `avenlab-server/src/assets/blocks/<map_id>_colliders.json` in your checkout.
4. Run the frontend dev/build command to refresh its bundled authoring source.
5. Restart the Rust server to reload the map definition. JSON-only changes do
   not require recompiling Rust. The running room is not hot-patched by the UI.

Team spawns, visual asset paths, visual transforms, map layout and extra metadata
are preserved. Counts in metadata are refreshed on export. The header reports
whether the starting source matches the running server's collider template.
An imported/new draft can differ intentionally; its preview remains local.

## Coordinates: legacy compatibility

Although map metadata declares runtime Y-up, schema 2's `roads`/`buildings`
records contain legacy Blender-space positions and sizes. The existing Rust
loader explicitly converts them. The editor follows that contract:

| Value            | Stored schema 2                | Editor/runtime                 |
| ---------------- | ------------------------------ | ------------------------------ |
| Center           | `[x, depth, up]`               | `[x, up, -depth]`              |
| Half extents     | `[width/2, depth/2, height/2]` | `[width/2, height/2, depth/2]` |
| Visual transform | Already runtime Y-up           | Preserved without conversion   |

Export performs the inverse conversion exactly once. This avoids the double
axis swaps or guessed offsets that would move the collision geometry away from
the GLBs. This first editor supports **axis-aligned box colliders**; rotated
boxes, ramps, floors, triangle collisions and destruction authoring need a
subsequent server-format extension.

## Source freshness and performance

`V` runs before `frontend` dev/build. It copies
schema 2 definitions directly from the Rust source folder into the generated
`frontend/public/world-builder/` folder and writes source hashes in a catalog.
Do not edit generated copies. The backend JSON remains the source of truth.
The editor fetches this small definition only when opened.

Draft documents/history update on committed edits. Plan pointer motion does not
write the store, local storage, a socket or a React state update. The plan uses
two aggregated footprint paths instead of a DOM component for every box. The
3D collision overlay uses one instanced draw; only one template's GLBs are
loaded on demand. UI and 3D builder code are lazy-loaded, and existing city
instances remain cached behind the editor. Limits: 2 MiB JSON, 2,048 boxes,
32 visual assets and 32 undo states. These are authoring bounds, not an FPS
benchmark.

## Next foundation step

Author simple collision objects in Blender, separate from the merged render
meshes. Several boxes per building can leave real alleys/openings. A later
exporter can read those explicit shapes, rather than guess from material-batched
geometry. Modular chunks/roads, ramp collision shapes and a reusable prop atlas
can then extend the same authoring workflow.

## Standalone preview and validation

`AvenLab-world-builder-preview.html` embeds the actual current map definition
and plan editor. It needs no models or server; 3D reference is disabled. Its
browser drafts use a separate preview key, so Save cannot overwrite a game
authoring draft on the same origin. Open it in a browser to try the workflow.

Automated validation covers coordinate roundtrips, schema rejection, source
preservation, pointer commit/cancel behavior, history limits, controller
routing, local saves and isolation from the live world map. Lint and production
build pass. Native mobile layout, WebGL rendering and frame rate still need an
in-game check. This patch does not claim to have corrected the original 35
boxes automatically; it supplies the tools to inspect and author them.
