# useMapTelemetryStore

Provides the minimap with the local vehicle pose. The existing HUD sampler supplies it.

**Expected updates** · Up to 10 Hz, changed pose only.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `x`, `z`, `yaw` | Rounded position and heading from vehicle telemetry. Sampling shares the display timer and pauses with it. | At most once per 100 ms on a continuous clock. |

[Implementation](mapTelemetry.ts) · [All store update rates](../README.md)
