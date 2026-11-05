# useCanBusStore

Holds the chosen research CAN interface/mode and the last status returned by the CAN service.

**Expected updates** · Explicit status reads and selection events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `status` | CAN status fetch when the workflow calls refreshStatus. | Once per completed refresh. |
| `selectedInterface`, `selectedMode` | Research setup choices. | Per user selection. |

[Implementation](canBusStore.ts) · [All store update rates](../README.md)
