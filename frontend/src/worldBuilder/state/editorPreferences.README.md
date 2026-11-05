# useEditorPreferences

Persists world editor panel visibility and authoring display preferences.

**Expected updates** · On editor settings and hydration.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `libraryVisible`, `inspector`, `detail`, `chunkGuide` | Editor preference changes and persisted hydration. | Per preference or hydration event. |

[Implementation](editorPreferences.ts) · [All store update rates](../../store/README.md)
