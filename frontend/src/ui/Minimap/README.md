# Minimap and mission navigation

Minimap.tsx owns expansion/range, static road layer and route/marker presentation. navigation/roadNavigation.ts builds the bounded graph and routes. store/world/navigationStore.ts owns destination/objective; store/telemetry/mapTelemetry.ts owns 10 Hz pose.

## How to edit

Change map styling/layout here and drivingHud.css. Road graph rebuilds on map changes; route search is memoized by road IDs. Only an open map mounts its telemetry owner. Mission objective and personal GPS waypoint remain independent.
