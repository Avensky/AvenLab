# useDebugViewStore

Stores the inspector scope and interpolation preference.

**Expected updates** · On preference changes.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `interpolationEnabled`, `playerScope` | Local preference actions and hydration. The active debug mask and scope affect the next driver input request. | Per edit or hydration. Actual debug packets are capped at 10 Hz. |

[Implementation](debugViewStore.ts) · [All store update rates](../README.md)
