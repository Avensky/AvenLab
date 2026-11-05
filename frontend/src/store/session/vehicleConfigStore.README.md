# useVehicleConfigStore

Indexes gauge calibration and supported telemetry fields by player ID.

**Expected updates** · On vehicle setup or world lifecycle.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `byPlayer` | Validated vehicle_config packets on admission, spawn, chassis change or editor reconfiguration. World/reset clears the index. | On receipt. Identical parsed calibration skips the write. |

[Implementation](vehicleConfigStore.ts) · [All store update rates](../README.md)
