# World

mod.rs exports map/collider modules. block_colliders.rs loads maps, streams static bodies and sends setup snapshots. authored_layout.rs validates explicit pieces/spawn markers. road_colliders.rs and model_colliders.rs use generated measured catalogs. background_vehicles.rs validates decorative references; those create no physics bodies.

For a road/garage source change, regenerate catalogs with scripts/build-road-colliders.mjs or build-placement-colliders.mjs. Editor spawn yaw is degrees; schema-2 team_spawns yaw is radians. Optional surface_y is the support surface, and physics.rs adds vehicle clearance once. Preserve old maps without that field. See docs/SPAWN_EDITING.md.
