# useTextKeyboardStore

Owns an assisted text entry session and tracks whether hardware typing has been observed.

**Expected updates** · On typing and keyboard-assist actions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `mode`, `hardwareObserved`, `session` | Open, edit, close, hardware detection and assist preferences. The session holds local callbacks and focus. | Per input or lifecycle event. |

[Implementation](keyboardStore.ts) · [All store update rates](../README.md)
