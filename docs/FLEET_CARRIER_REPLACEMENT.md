# AvenLab fleet: Big E replacement and multiplayer ship plan

## Current asset classification

`models/vehicles/fleet/manifest.json` identifies **USS Louisiana (1949)** as a **battleship**, roughly 188.08 m long and 36.67 m abeam. It is not an aircraft carrier. This is the new selectable heavy surface combatant, alongside the 154 m Hawaii rescue cruiser. The existing Big E docked flight deck stays available in the classic harbor map until a replacement carrier asset can support aircraft, a usable flight deck and shore ramps.

The Louisiana source GLB contains one merged mesh. Its detailed guns and antenna geometry render, but individual original turrets and antennas **cannot yet track a target or spin independently**. Do not imply working weapons based on visual animation. The asset needs an exported hierarchy with separate pivots and clean local origins, or a dedicated rig, before implementing those effects.

## Size, visual model and physics

| Vessel | Authored length | Collision approach | Current behavior |
| --- | ---: | --- | --- |
| Hawaii rescue cruiser | 154 m | Lower hull box + simplified deck/ship collision; visuals scaled separately | Buoyancy, steering, drag and passive landing assist |
| Louisiana battleship | 188.08 m | Seven simple hull/deck/bridge regions; no collider on thin antennae | Heavy displacement buoyancy, steering and passive deck assist |
| Big E (temporary static deck) | 314.72 m authored game footprint | Existing walkable deck data | Shore boarding, static airfield; no sailing controls |
| Arleigh Burke escort | 154 m | Existing walkable proxy sections | Static docked harbor ship |

**Physics never derives colliders from a detailed GLB mesh.** All scale conversion is explicit. In a future authored ship format, record draft, waterline, displacement, top speed, turn inertia, deck contact volumes, navigation clearance and bridge opening requirements separately from the visual model. Compare model length/beam with the fleet manifest before import. Ship props must not be scaled uniformly just to fit a canal: widen the channel or create a different berth.

## Carrier replacement work order

1. Import a genuine aircraft carrier model with independently textured flight deck, aircraft elevators, hangars, deck attachment points, and separate gun/antenna pivots. Produce medium/far LODs; review texture channels in real lighting. Maintain Big E as a user-selectable legacy map in the meantime.
2. Preserve two representations: detailed R3F GLB for render, and simplified server-authoritative collision deck/hull/tower with an explicit waterline and vessel displacement. Run moving-deck tests with parked cars and helicopters before making it mobile.
3. Export turret-base/yaw and gun/elevation pivots from Blender, plus radar antenna rotation pivots and mount identifiers. Server owns target, acquisition arc, ammunition, heat, damage and cooldown; client interpolates aim and barrel recoil. Antennas may rotate cosmetically even without targets.
4. Add ship portraits captured from the finished models at consistent camera and lighting, and naval styling for hull/deck trim. Louisiana currently has a clearly labeled concept portrait; it will need a rendered replacement when its GLB is available locally.
5. Introduce boat-specific UI for RPM/shaft direction, knots, rudder angle, propulsion condition, hull integrity, radar contacts, deck assist and missile/aircraft cooldowns. The existing vehicle HUD remains until naval gauges are verified. Clearly label planned abilities and disable them until server-owned gameplay exists.
6. Implement server-authoritative navigation waypoint queues, scheduled harbor transits, safe collision avoidance and bridge permits. Then add helicopter/drones launches, AI escort defense and vessel recovery.

## Persistence migration

Today's `social.json` persists account profiles, installed world edits, and explicitly published server vehicle defaults. This patch supplies a **staging** SQLite schema and a non-destructive import command under `scripts/bootstrap-avenlab-db.py`; it does not silently switch authoritative storage from JSON. Next migrate the Rust server to transactional SQLite, restrict published defaults to moderators, add revision/conflict handling, migrate tokens only as hashes, and keep backup/rollback paths. Do not delete JSON or assume the staging DB receives live updates.

## Boat sea trial

After installing both fleet LFS models, choose **Sandbox → BOAT → Hawaii** then **Louisiana**. Confirm server hero acceptance, physical scale, steering and stop/reverse, buoyancy, deck contacts, drowning-camera floor, collisions near canal guardrails, and reconnect. In World Editor, publish a map, reload the game on another client, and confirm both users share that saved revision; then publish a car default and verify it on a new spawn. Do not mistake a successful client-only appearance change for a global saved physics setting.
