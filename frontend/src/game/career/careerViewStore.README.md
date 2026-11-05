# useCareerViewStore

Owns career display filters. Actual history comes from a separate server request.

**Expected updates** · On career view selections.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `tab`, `mode`, `hero` | Tab and filter controls. Career history and match reads reply to the requester. | Per navigation or filter action. |

[Implementation](careerViewStore.ts) · [All store update rates](../../store/README.md)
