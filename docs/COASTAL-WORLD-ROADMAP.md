# AvenLab: coastal world and fleet roadmap

The goal is a multiplayer simulation where players can drive, fly and operate
watercraft in connected cities and fleets, later directed by a headless World
Director. Keep server-authoritative physics and mobile performance central.

## Delivered in this patch

World Editor → Inspector → Files → Generate coastal district.

This finite greybox recipe creates four land districts around intersecting
canals, two east/west bridges, a safe north/south crossing, a damaged bridge
with a 12 m missing center, rooftop ramp, open warehouse, harbor approaches,
and a static carrier with three escort decks. Six team spawn points sit on
clear road surfaces. All solids are explicit box/wedge colliders; visual and
collider transforms use the existing shared layout format. GLBs are optional.

Seed changes building heights/colors while keeping the road plan fixed. This
is a first automated recipe, not a general procedural geography system. The
same seed produces the same editable layout. Generation is one undoable edit;
existing work requires an inline replacement confirmation. Save/export uses
the normal editor workflow. Apply & Test Drive uses the existing isolated
editor server session, or export/install the server map and restart Rust.

Water surfaces are decorative and non-solid. There is no global support floor
beneath canals. A car can fall through, but this patch does not add water entry,
drowning, flotation or a water-specific recovery timer. The merged Heroes
update supplies manual reset to map/team spawn and automatic recovery after
falling more than 20 m below the spawn surface for 2 seconds. Use reset during
testing; water entry is not itself detected. Warning blocks and all fleet decks are static.

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
8. General world automation: named district recipes, road/navigation graph,
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
contact stability or multiplayer behavior. A Rust toolchain is unavailable in the merge
environment; the Heroes source patch records its own prior backend validation,
but this merge does not rerun it. Coastal live Rapier driving and physical
handling remain manual validation work. No new backend physics is claimed in this patch.
