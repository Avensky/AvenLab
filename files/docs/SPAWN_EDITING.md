# Edit vehicle starts

1. Open World editor and choose **Editing world** in the header.
2. Show **Inspector**, then choose **Spawns**. Existing Red/Blue starts load from
   the source map, including chunk offsets and heading.
3. Select a marker or list entry. Edit **Spawn X/Y/Z**, team and **Spawn heading**.
   Add Red/Blue points at the placement cursor. Q/E rotates a selected spawn.
4. Y is the support floor/road surface, not the vehicle body center. Rust adds
   vehicle-specific wheel/suspension/chassis clearance once. For a rooftop start,
   set Y to the actual rooftop surface and ensure supporting collision exists.
5. Save retains the draft in this browser. Export layout retains marker metadata.
   **Export map** writes runtime team_spawns. Install that map JSON under
   `avenlab-server/src/assets/blocks` and restart Rust before driving it.

The editor requires at least one Red and one Blue point when exporting explicit
starts. IDs are unique; positions/headings are finite; at most 256 per team.
Deleting one point is undoable. A marker is editor presentation and never creates
its own collider or claims that the chosen location is free of obstacles.

| Data | Units / owner |
| --- | --- |
| authored_layout.spawns[].position | Runtime XYZ metres, Y-up; editor document |
| authored_layout.spawns[].yaw | Degrees around +Y; zero faces +Z, 90° faces +X |
| team_spawns[].chunk/local | Schema-2 runtime X/Z; source import resolves chunk × cell + local |
| team_spawns[].yaw | Radians; conversion occurs at export |
| team_spawns[].surface_y | Optional runtime support elevation; old maps use surface.road_y |

The server includes team starts in its map setup snapshot. Authored metadata
round-trips too. Runtime spawn selection continues to use team_spawns and existing
occupancy checks. Choosing an editor world does not switch the live multiplayer
map. The file export title is a draft label, under Files; it is not a second world
selector. The header Inspector button works in both layout and legacy-collider
workspaces; layout also supports a narrower minimized inspector.
