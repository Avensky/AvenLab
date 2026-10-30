# Rust gameplay and physics

`src/main.rs` composes the server. Rust module declarations/reexports in main.rs
and each feature mod.rs are the Rust equivalent of index.ts.

| File / folder | Owns / change here for |
| --- | --- |
| net.rs | WebSocket protocol routing, spawn/change/service requests |
| state.rs | Input/snapshot protocol structures and masks |
| physics.rs | Fixed-tick world integration, authoritative spawn and update order |
| vehicle_setup.rs | Approved vehicles, dimensions, suspension and gauge calibration |
| vehicle_state.rs | Per-vehicle runtime state |
| vehicle_forces.rs | Vehicle force application |
| suspension_contact.rs | Contact probing/support continuity |
| aven_tire/ | Tire, steering and anti-roll solver |
| powertrain.rs | Engine, shifting, heat, fuel, condition, NOS and charge |
| cockpit.rs | Packed cabin/cockpit requests and confirmed electronic state |
| vehicle_debug.rs | Requested physics diagnostics |
| spawn.rs | Room/team spawn allocation; map points resolve in physics.rs |
| world/ | Map loading, static colliders, authored shapes and setup snapshots |

Change physics here, not in frontend gauges or editor theme state. Position is
runtime metres, Y-up; legacy Blender boxes convert at world/block_colliders.rs.
Input is merged client intent; Rust owns simulation and confirmed masks. A menu
brake arrives through the existing input packet, so the online world keeps ticking.

Run `cargo test --locked` from this directory. New spawn surface_y values preserve
vehicle-specific suspension clearance; old maps use surface.road_y. Map JSON must
be exported/installed and Rust restarted before editor changes affect driving.
