# useVisualAlignmentStore

Keeps measured model alignment reports keyed by ID for the debugger.

**Expected updates** · On model measurement and removal.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `reports` | Vehicle artwork/alignment code records or removes a report as a model or its alignment changes. | Per report action. |

[Implementation](visualAlignmentStore.ts) · [All store update rates](../README.md)
