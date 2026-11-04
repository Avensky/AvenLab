# AvenLab: coastal world and fleet roadmap

The goal is a multiplayer simulation where players can drive, fly and operate
watercraft in connected cities and fleets, later directed by a headless World
Director. Keep server-authoritative physics and mobile performance central.

## Endless City fleet playtest

The nine city tiles share one ocean perimeter and a moored carrier east of the central city block. Drive out over the service pier and ramp. The marked service bay uses the existing server fuel and repair rules. The two deck markings reserve space for aircraft launch lanes. The sea surface has no road collider. Vehicles that leave the city or deck use the existing falling recovery.

For the next water-physics test, define one room-owned sea level, then sample submersion at four hull points in the fixed Rapier step. Start with buoyancy proportional to displaced volume and damp vertical velocity at each point. Test rest, heel recovery and a car sinking off the pier. Replicate the hull pose through the existing entity stream. Clients can animate small ripples from the room clock independently of collision.

Move the carrier only after takeoff and touchdown work on the moored deck. Give an aircraft its deck-relative launch velocity plus the carrier's linear and angular velocity at the launch point. The first fleet-to-shore mission can use the existing service bay as the pickup and a land base as the delivery destination.

## Current coastal district patch

Coastal District is a separately registered environment (`coastal_district`) in
both the environment selector and the editor dropdown. Its server map lives at
`avenlab-server/src/assets/blocks/coastal_district_colliders.json`. Renaming an
export file or changing the display title does not register arbitrary new map
IDs; a general named-world library and server publish API are still pending.

Generate coastal district opens this independent world first, preserving the
previous world's browser draft. Confirm before regenerating an existing coast.
Generation updates the active editor document/selection, saves under its own
keys, and, when an editor session is reserved, applies the full map to that
isolated runtime. The server resets the test vehicle using explicit team spawns.
A failed live apply leaves the draft intact and reports Retry via Apply & Test
Drive; standalone authoring still needs Reserve Live Editor and Apply & Test Drive.
Undo restores the authored layout only; apply again to update live physics.

Four land pieces now range from 300–400 m wide and are 335 m deep. Longitudinal
run-up distances expand 2.5 times while the primary 40 m / 32 m canal widths
stay narrow. Land/road/bridge edges share the same coordinate transform to keep
connections intact. Designated open staging pads contain six separated team
spawns facing into the district. The damaged crossing has a takeoff ramp and
landing; intact crossings remain safe alternate routes. Existing fuel-only,
repair-only and combined service prefabs sit off the chase avenues. Their
existing gradual service logic is reused; they are not destructible yet.

For an older coastal export incorrectly identified as Road Precision, use the
editor's Files import. A validated layout containing coastal-land pieces is
retargeted into Coastal District; the original test-world draft is preserved.
Its geometry and saved spawn points remain as exported. Regenerate with this
version for the expanded islands and staging pads. Export map keeps the stable
`coastal_district_colliders.json` filename regardless of display title.

Permanent installation: export the complete map, back up and replace the same
file in `avenlab-server/src/assets/blocks/`, run
`node scripts/sync-world-builder-map.mjs`, rebuild the frontend, and restart
Rust. This patch changes Rust's allowed environments too: rebuild/restart Rust
when installing it initially. Browser Save and live Apply are not disk publishing.

Water surfaces are decorative and non-solid. There is no global support floor
beneath canals. A car can fall through, but this patch does not add water entry,
drowning, flotation or a water-specific recovery timer. The merged Heroes
update supplies manual reset to map/team spawn and automatic recovery after
falling more than 20 m below the spawn surface for 2 seconds. Use reset during
testing; water entry is not itself detected. Warning blocks and all fleet decks are static.

## Immediate world-builder pathway

1. Drive-test this larger district: both staging areas, intact bridge loops,
   damaged crossing jump, rooftop route, service-bay access and carrier approach.
   Tune launch/landing lengths from recorded vehicle speed and suspension behavior.
2. Add editable water hazard volumes and slow sinking/recovery, then authoritative
   breakable roadside barriers. These mechanics need server state, not only visuals.
3. Add hill/slope connectors, road junction graph and automated route validation:
   two safe paths between team bases, optional risky shortcuts and protected
   spawn/landing footprints for every seed. Keep hand-editing each generated piece.
4. Add a real named-world library and Save to Server / Publish workflow, with
   validated unique IDs, ownership and a shared server-fed catalog. This replaces
   manual file installation; it is not supplied by the current browser Save.
5. Expand deterministic recipes with blocks, bridges, canals, resource sites and
   eventual objectives. Destructible fuel storage/economy changes follow the
   authoritative breakable lifecycle. Avoid adding all mechanics in one patch.

## Next implementation batches

1. Water zones: shared validated volumes, surface/depth queries, authoritative
   entry/exit state and a car water hazard timer. Reuse the merged server-side
   map/team spawn recovery. Distinguish falling off the map from entering water;
   test under bridges and along banks. Preserve existing fuel/damage/temperature
   when recovering, and retain occupied-spawn checks.
2. Breakable barriers: impact thresholds, authoritative intact/broken state,
   collider removal, synchronized appearance, late-join snapshots and bounded
   reset. Begin with disappearing or pooled debris; avoid unrestricted dynamic
   fragments. Do not give visual-only breakage a blocking invisible collider.
3. Boats: several buoyancy samples, water-relative drag, forward thrust,
   rudder authority, capsizing/recovery and dry-land behavior. Tune a patrol
   boat first, then scale presets for landing craft, support and larger ships.
4. Drones: stabilized thrust/attitude control, hover, altitude and speed limits,
   collision/recovery, control prompts and multiplayer interpolation.
5. Helicopters: rotor lift, cyclic/collective/yaw, assisted hover, forward flight
   and landing. Share input/network foundations with drones, not tuning.
6. Fixed-wing aircraft: airspeed-dependent lift/drag, stall, control authority,
   takeoff/landing and recovery. Test on a land runway before moving carriers.
7. Fleet as a floating city: carrier flight deck/hangar, escort defense,
   logistics/fuel vessel, repair/support vessel, landing craft and patrol boats.
   Give vessels routes, service bays, landing zones and useful interiors.
   Prove stationary decks first, then one moving vessel with vehicles supported
   on its deck, then several vessels with boarding/launch/recovery.
8. General world automation: persistent named-world registry/server publishing, named district recipes, road/navigation graph,
   bridge clearance by vessel class, guaranteed routes and spawn safety,
   bounded streaming chunks, handcrafted landmarks and saved generation inputs.
9. Gameplay and scale: Tank/DPS/Support, CTF objectives, service/damage loops,
   progression/cosmetics, social worlds and capacity measurements. Then World
   Director and headless AI-driven strategy, with selective city activation.

## Why moving fleets come later

A large boat is not sufficient. Driving, taking off and landing on a translating
and rotating deck introduces relative velocities, collision stability and
network interpolation problems. The floating-city feeling can be developed
with stationary greyboxes while those mechanics are proven independently.

## Validation and limits

Automated tests cover deterministic generation, bounds, import/export, real
collision gaps, continuous bridge/carrier approaches, spawn elevations,
replacement/cancel behavior, undo, and isolation from the live world store.
Geometry probes do not prove suspension clearance, maximum ramp speed,
contact stability or multiplayer behavior. Runtime driving with the actual assets,
launch speeds and landing suspension response still require user feedback.
The current environment has no Rust toolchain, so the updated allowed-map list
has not been compiled here. No new buoyancy or breakage physics is claimed.

## Automatic catalog and footprint update

The source of selectable worlds is now `avenlab-server/src/assets/blocks/`.
Install schema-2 maps as `<map_id>_colliders.json`, with matching IDs inside the
map and authored layout. Rust discovers valid files on demand. The frontend
sync script validates/copies these files and generates the shared selection
catalog; both selectors import it. npm dev/build refresh the catalog first;
Vite watches map additions, changes and removals during development. Deployed
static frontends need rebuilding/redeploying to receive new map definitions.
Browser Save remains local; Export map remains the server installation workflow.

District footprints: Block ≈100–133 m wide, Chunk ≈200–267 m, Massive ≈600–800 m.
The massive footprint is approximately 3×3 standard 2×2 chunk areas per island.
These are connected greybox land areas, not nine expensive GLB chunks. Large
flat shapes are subdivided to stay inside collider size limits. Canals and
bridges connect the areas. The optional permanent land bridge is a deep solid
causeway on the safe loop. It has its own piece type, reserved for exclusion
from future destruction. Currently all crossings are static/indestructible;
no breakage mechanic is claimed here. Live driving still needs validation.
