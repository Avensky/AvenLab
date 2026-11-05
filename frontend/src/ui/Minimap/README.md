# Minimap and mission navigation

Minimap.tsx owns expansion/range, static road layer and route/marker presentation. navigation/roadNavigation.ts builds the bounded graph and routes. store/world/navigationStore.ts owns destination/objective; store/telemetry/mapTelemetry.ts owns 10 Hz pose.

## How to edit

Change map styling/layout here and drivingHud.css. Road graph rebuilds on map changes; route search is memoized by road IDs. Only an open map mounts its telemetry owner. Mission objective and personal GPS waypoint remain independent.


## Team and detected enemy contacts

The self arrow remains separate. Teammates appear blue regardless of distance;
contacts outside the current zoom are pinned just inside the map rim. Defeated
teammates remain visible with lower opacity. Orange/red enemy dots appear when
a living vehicle on your team, including you, is within 150 metres horizontally.
The range is centralized as `MINIMAP_DETECTION_RANGE_M` in `minimapContacts.ts`.
Defeated enemies are hidden; defeated teammates do not detect enemies. Team
colours describe friend/enemy relationships even when you play on Red.

Contacts use the current world's authoritative snapshot positions and expire
from the view as soon as a fresh sample no longer places them in team range.
Unknown teams, invalid coordinates and other worlds cannot reveal contacts.
The isolated contact layer samples network changes at the map's 10 Hz display
rate, without a second timer or rerendering road/routes for every raw snapshot.
This is shared proximity detection for the minimap. Walls do not block this
initial detection radius; it does not cull 3D models or conceal snapshot data.

Carrier dots keep their relationship colour and add a gold ring/flag glyph.
The local arrow gets the same carrier ring. A hidden enemy carrier remains
hidden: authoritative flag state decorates detected contacts and never creates
an extra enemy marker outside shared detection range.

Mount `MinimapSessionLifecycle` once beside the game UI lifecycle owners. It
opens the normal map on deployment and real round start, without changing the
saved minimap size/visibility preferences. Later snapshots and menu close do
not reopen a map the player has minimized.

In Harbor Canal matches the Rust world samples living teammates' 100 m sectors at 4 Hz. A reliable world-scoped chart is sent to the appropriate team on a change or a new connection. The chart lasts for the world session. A land defender starts with both city banks charted. A carrier team discovers resources by scouting. The full Navigation map exposes known fuel and repair sites and distinguishes unexplored sectors. This controls the GPS display; static world geometry still goes to all players.
