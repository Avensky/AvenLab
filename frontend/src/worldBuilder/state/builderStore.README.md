# useBuilderStore

Owns the world editor document, undo history, tools and workspace state. Saved drafts and live world maps have separate owners.

**Expected updates** · On editor actions and document loads.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `doc`, `saved`, `past`, `future`, `selected`, `bounds`, `loadingMap`, `status`, `source` | Load/import/save, selection, edits, undo/redo and status. | On edit or I/O completion. |
| `workspace`, `presentation`, `view`, `tool`, `preset`, `zoom`, `snap` | Editor controls and camera/workspace choices. | On input or workspace action. |

[Implementation](builderStore.ts) · [All store update rates](../../store/README.md)
