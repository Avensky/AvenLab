# useNavigationStore

Owns the selected GPS destination and any mission destination presented by an adapter.

**Expected updates** · On destination or objective actions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `destination`, `mission` | Map/log actions validate and replace the current target. Driver movement comes from telemetry. | Once per set/clear action. |

[Implementation](navigationStore.ts) · [All store update rates](../README.md)
