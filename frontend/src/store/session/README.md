# Authoritative connection and vehicle setup

Import the public API from `store/session/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [networkStore.ts](networkStore.ts) | Latest validated Rust snapshot, identity, connection, RTT; written by net/rustSocket.ts. |
| [vehicleConfigStore.ts](vehicleConfigStore.ts) | Setup/calibration by player ID; telemetry availability and gauge limits. |
| [types.ts](types.ts) | Shared team, vehicle, vector and quaternion types. |

## Editing recipe

To add a server field, extend the Rust snapshot in state.rs, validate it in net/rustSocket.ts, then project it in store/telemetry. Do not write simulation values from a gauge. Session data is cleared on disconnect; it is not a saved preference.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).

World migration uses resetWorld to clear old ticks/poses/diagnostics while keeping
the socket and player identity. rustSocket filters world-tagged snapshots and
resets vehicle setup, map and old packed controls before accepting a new world.
Social metadata belongs to store/social and does not follow physics updates.

The compact transport has one shared motion stream (~30 Hz), a changed-value owner-only driver stream (ordinary telemetry up to 10 Hz), and explicit diagnostics (up to 10 Hz). Driver fuel, engine temperature/torque, input ack and cockpit/cabin controls are not present on remote entities. Read the local body through getMe(); do not mirror its transform into physicsData. That field is a fallback for old servers before the first authoritative snapshot. Details and scope rules: [Snapshot transport](../../../../docs/NETWORK-SNAPSHOT-PROTOCOL.md).

## Update frequency by store

- [useMatchResultsStore](matchResultsStore.README.md)
- [useNetworkStore](networkStore.README.md)
- [useVehicleConfigStore](vehicleConfigStore.README.md)

Use the [network subscription groups](networkViews.README.md) for new UI subscriptions. Pick connection for menu identity, motion for live vehicle data and diagnostics for requested inspector data.
