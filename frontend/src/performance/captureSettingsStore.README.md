# useCaptureSettingsStore

Owns the recorder label, capture duration and baseline preference.

**Expected updates** · On settings changes and hydration.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `label`, `seconds`, `asBaseline` | Local recording setup. The recorder keeps its frame samples separately. | Per preference change or hydration. |

[Implementation](captureSettingsStore.ts) · [All store update rates](../store/README.md)
