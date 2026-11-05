# useRenderSettingsStore

Owns render quality, scene visibility, inspector overrides and the previous state used by performance comparisons.

**Expected updates** · On settings, profile and lifecycle events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `cityQuality`, `cityViewDistance`, `environmentMode`, `vehicleOverrides`, `chunkOverrides`, `assetGlbs`, `dpr`, `shadows`, `reflections`, `vehicleLights`, `hud`, `overlay`, `autoVehicleAlignment`, `opaqueCityMaterials`, `lowDetail`, `savedDetail`, `beforeBenchmark` | Renderer preferences, HUD visibility and per-vehicle/asset/chunk overrides. Values are read by scene components. | On change, hydration or preset/reset action. |

[Implementation](renderSettingsStore.ts) · [All store update rates](../README.md)
