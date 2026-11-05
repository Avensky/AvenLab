# useScoreboardStore

Owns scoreboard visibility and the selected composition/stats view.

**Expected updates** · On display actions. Visible rows sample separately at 4 Hz.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `held`, `pinned` | Hold, release, pin or close from keyboard/controller/touch. Route changes, lost focus and disconnect can close it. | On effective held/closed transitions or pin toggle. |
| `view`, `teamFilter` | Tab and team filter selection, including new-round reset. The visible scoreboard reads session and social data on its own timer. | On tab/filter/reset actions. Visible table samples every 250 ms. |

[Implementation](scoreboardStore.ts) · [All store update rates](../README.md)
