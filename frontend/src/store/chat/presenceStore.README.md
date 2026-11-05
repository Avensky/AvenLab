# usePresenceStore

Turns personalized lobby changes into local join/leave notices.

**Expected updates** · On relevant differences between social views.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `events`, `activity` | Observes social views, comparing online players, current-world membership and reconnect state. First view establishes a baseline. History is bounded to 50. | On presence transitions or reset. No physics subscription. |

[Implementation](presenceStore.ts) · [All store update rates](../README.md)
