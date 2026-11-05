# useVehicleEditorStore

Owns tuning presets, vehicle camera profiles, selected camera view and replay triggers.

**Expected updates** · On tuning, save, camera and replay actions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `presets`, `cameras` | Saved tuning and camera edits keyed by vehicle. | Per edit/save/hydrate. |
| `view`, `replay` | View selection sets the presentation camera and increments a replay counter. | On view or replay action. |

[Implementation](vehicleEditorStore.ts) · [All store update rates](../../store/README.md)
