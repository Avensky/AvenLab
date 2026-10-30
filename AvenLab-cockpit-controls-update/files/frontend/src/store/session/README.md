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
