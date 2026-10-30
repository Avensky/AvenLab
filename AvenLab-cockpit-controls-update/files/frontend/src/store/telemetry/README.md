# Sampled display state

Import the public API from `store/telemetry/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [vehicleTelemetryStore.ts](vehicleTelemetryStore.ts) | One reference-counted 20 Hz sampler; units, availability, stale handling and unchanged-value suppression. |
| [mapTelemetry.ts](mapTelemetry.ts) | 10 Hz position/yaw projection inside that same sampler. No extra interval. |
| [cabinClock.ts](cabinClock.ts) | One visible-only 30-second local clock. |
| clusterMasks.ts / resourceMasks.ts | Server-confirmed cluster/warning bits. |

## Editing recipe

Add a display reading in projectVehicleTelemetry, then subscribe only the instrument that uses it. Use null for unavailable values. Hidden HUDs release their sampler owner. Physics and network delivery rates do not change when a display is hidden.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
