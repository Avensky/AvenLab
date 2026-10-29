# World workshop

World workshop is the modular layout workspace in AvenLab's World builder.
Open **Main menu → World builder**, **Pause → World builder**, or press **F9**
inside Sandbox. Main-menu authoring works without a Rust connection.

## Build a district

1. Choose a piece in the library, then click the ground. Placement stays active
   for repeated copies. Q/E turns the preview; Escape finishes placing.
2. Select an object on the map or in the Scene list. Use Move, Rotate or Scale
   handles in Perspective, or drag with Move in Plan. The inspector accepts exact
   position, full dimensions and yaw. Position Y is the object's **base**, not
   its center.
3. Set grid spacing and rotation increments at the bottom of the viewport.
   Orbit with left drag, pan with right drag, and zoom with the wheel. Plan
   supports right/middle drag to pan. F fits the layout; the camera button
   switches between the angled and top views.
4. Duplicate pieces, change their colors, toggle collisions or lock them.
   Undo/Redo keeps 64 committed edits. A drag records one edit on release;
   Escape, blur and lost pointer capture cancel unfinished edits.
5. Use **Example block** to inspect a small district with an open garage and a
   ramp leading to a raised floor. **New layout** starts fresh. Both operations
   are undoable; an existing layout first presents an inline choice.

The twelve starter pieces are straight road, intersection, sidewalk, building,
open garage, wall panel, floor slab, vehicle ramp, barrier, supply crate, bollard
and street light. These are procedural layout pieces: you can begin without a
prop GLB. The garage has seven physical parts with a real entrance. The ramp is
a six-vertex wedge. Thin road markings and decorative bands create no physics.
The ordinary building remains an intentionally solid block; use wall panels,
floors and the garage when you need accessible spaces.

## Controls

| Action | Keyboard / mouse | Controller |
| --- | --- | --- |
| Select / move / rotate / scale | V / W / R / S | Focus toolbar buttons, A/Cross activates |
| Turn preview or selected piece | Q / E | Turn left/right buttons |
| Place without aiming a pointer | Cursor fields + Place at cursor | Use the fields' −/+ buttons, then Place at cursor |
| Cycle objects | Scene list | LB / RB |
| Navigate controls | Arrows / Tab | D-pad; left/right cycles a focused dropdown |
| Duplicate | Ctrl/Cmd+D | Duplicate button |
| Undo / redo | Ctrl/Cmd+Z / Shift+Z, or Ctrl/Cmd+Y | Undo / Redo buttons |
| Save | Ctrl/Cmd+S | Save button |
| Delete | Delete / Backspace outside text fields | Delete button |
| Fit layout | F | Fit button |
| Cancel or exit | Escape / F9 / close button | B/Circle / close button |

Escape cancels an active drag first, then placement, then exits. A controller
can place pieces through the cursor fields and Place at cursor; direct pointer
placement and 3D handles still use a mouse/touch pointer. Driving controls are
blocked while authoring. This is a local editor, so multiplayer simulation
continues behind the Sandbox overlay.

## Save and export

The editor saves a map-specific browser draft 1.5 seconds after a committed edit.
Save writes immediately; Load saved restores that draft with Undo available.
Closing the editor flushes unsaved work. Storage failures leave the document in
memory and offer JSON export. Export layout JSON creates a portable
`<map_id>.layout.json`; Import JSON accepts this file or an exported server map
containing `authored_layout`.

**Export map** preserves the source map's ID, cell dimensions, layout, team
spawns, legacy colliders, asset paths and extra metadata, then adds the authored
layout. It does not overwrite a file or send edits to the running server.

1. Back up `avenlab-server/src/assets/blocks/<map_id>_colliders.json`.
2. Replace that file with the exported server map JSON.
3. Restart the Rust server. Install this patch's Rust code before using authored
   layouts; the older loader would ignore the new field.
4. Restart frontend development or run its build command so the bundled map
   source is refreshed for the next editing session. Rejoin Sandbox to receive
   the installed layout snapshot.

**Include existing city** controls the exported layout's behavior:

- Off: use the authored pieces and an explicit flat ground slab, whose top is
  exactly `surface.road_y`. The legacy city GLBs and colliders are skipped at
  runtime. Their definitions remain in the JSON for recovery.
- On: keep the existing city and add the authored pieces to it.

**Show city GLB reference** only displays the existing template for alignment in
the editor; it does not change the include-city setting. Model references are
loaded on request. The offline preview disables references because it contains
no city GLBs.

This version edits **one shared tile template**, repeated at the map's existing
chunk origins. It does not author independent chunks or change the map's spawn
lists. Check existing spawn locations and keep those areas clear when installing
a standalone layout. This is the first layout foundation; custom GLB catalogs,
grouped asset packs, destruction and independent chunk layouts remain future
work. It does not split or guess precise colliders for the merged city GLB.

## Collision and coordinate contract

`authored_layout` is optional on the existing schema 2 map. Without it, the old
map behavior is unchanged. Its own format is `avenlab-world-layout`, version 1.
All new positions and sizes use runtime metres with **Y up**. Yaw is degrees
around +Y; ramp height rises toward local −Z before yaw. The renderer and Rapier
both use each explicit part's local position and full dimensions. Object scale
is applied before yaw, then the object position and chunk origin are added once.

The frontend batches boxes and wedges into two instanced draws per chunk,
except for the currently manipulated object in the editor. Rust creates one
fixed rigid body per solid object, with its explicit compound shapes attached.
Wedges use a convex hull built from the same six vertices as the visible ramp.
Decorative parts and pieces with collisions disabled are omitted from physics.
Collision view shows the authored shapes, not a guessed outer box.

The previous collision-template editor remains available through **Open original
collision template**. It edits the existing Blender-space schema 2 boxes and
retains their conversion contract. See [WORLD_BUILDER.md](WORLD_BUILDER.md) for
that workflow. Those legacy boxes affect the installed map when Include existing
city is enabled; the new layout workspace never converts its runtime-space data
through that old Blender axis swap.

Import validation rejects non-finite transforms, duplicate IDs, invalid shapes,
unsupported versions and mismatched maps before replacing the draft. Limits:
512 pieces, 4,096 parts, 32 parts per piece and 2 MiB JSON. These are authoring
bounds, not a measured frame-rate guarantee.

## Development and verification

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:performance
cargo test --manifest-path avenlab-server/Cargo.toml --locked
node scripts/build-world-builder-preview.mjs frontend AvenLab-world-workshop-preview.html
```

The standalone HTML embeds the actual editor, starter geometry and current map
source. It needs no server, model downloads or internet connection. Its browser
draft key is separate from the game. `docs/examples/world-builder.layout.json`
is a portable example generated from the same palette definitions.

Tests cover export preservation, import rejection, history, locking, browser
saves, controller routing and isolation from live world state. Rust raycasts
check both ends of a rotated ramp and the garage opening versus its front
pillar. An integration test checks standalone ground height and the difference
between standalone and additive map snapshots. Browser checks exercise the
offline editor, pointer dragging/cancel, import/export, mobile layout and the
actual main-menu entry with the physics server offline.

The patch also repairs two existing frontend build blockers: the collision
panel's missing feedback-hook import and ChatDock's unregistered HUD group.
