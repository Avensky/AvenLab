# Installed world and navigation

Import the public API from `store/world/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [worldStore.ts](worldStore.ts) | Live installed map, chunks and diagnostic request mask; socket is the map writer. |
| [navigationStore.ts](navigationStore.ts) | User waypoint and optional gameplay mission objective. |
| [debugMasks.ts](debugMasks.ts) | Requested diagnostic streams; read by the existing sender. |

## Editing recipe

The world editor owns its draft in worldBuilder/state; changing Editing world never changes this live map. Mission adapters set/clear navigationStore.mission; GPS destination stays separate. For a new map, add the selection catalog entry and install its Rust collider definition.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
