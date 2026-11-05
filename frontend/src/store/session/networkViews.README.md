# Network subscription groups

The socket writes to [networkStore.ts](networkStore.ts). Components subscribe to the fields they actually display through [networkViews.ts](networkViews.ts). Each active group shares one subscription to the socket store. The last unsubscribe detaches it. The views reference the existing snapshot, entities and diagnostic buffers. Imperative reads can run while no component is mounted.

| Read API | Fields that can notify it | Typical cadence and users |
| --- | --- | --- |
| `useConnectionView` | Connection, player ID, team, world ID/map/name and spawn | On welcome, identify, migration or disconnect. Used by menus, scoreboard visibility, local vehicle selection and camera identity. |
| `useMotionView` | Snapshot, tick, arrival interval, player/team/world identity and connection | Up to 30 Hz compact or 60 Hz legacy, plus world/session transitions. Used by interpolation, combat controls, CTF and HUD selectors. |
| `useDiagnosticsView` | Requested overlay and debug tick, ping, player/world identity and connection | Wheel/chassis diagnostics up to 10 Hz when requested. App ping checks every 5 seconds. Also updates on relevant resets or identity changes. |

Use a selector such as `useConnectionView(s => s.playerId)`. For imperative consumers, `view.subscribe((next, previous) => …)` returns an unsubscribe function. `view.getState()` immediately reflects the socket state. World and connection resets run through the same source as packet delivery. Keep packet writes and recovery actions on `useNetworkStore`.

These groups filter local notifications. Server fan-out, client interpolation and the 20 Hz HUD / 10 Hz minimap samplers keep their respective owners.
