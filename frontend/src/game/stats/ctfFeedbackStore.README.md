# useCtfFeedbackStore

Drives the transient capture indicator above the match HUD.

**Expected updates** · On confirmed capture, clear or timeout.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `capture` | Mission observer publishes a confirmed capture and its team. A new capture resets the timeout. | On capture, lifecycle clear, or one 3.5 s expiry. |

[Implementation](ctfFeedbackStore.ts) · [All store update rates](../../store/README.md)
