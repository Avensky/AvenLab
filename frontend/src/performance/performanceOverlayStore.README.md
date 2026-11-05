# usePerformanceOverlayStore

Owns the recorder overlay layout, focus and selected tab.

**Expected updates** · On overlay navigation.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `expanded`, `focused`, `tab` | Overlay open, minimize, focus and tab actions. Detailed samples belong to the recorder. | Per UI action. |

[Implementation](performanceOverlayStore.ts) · [All store update rates](../store/README.md)
