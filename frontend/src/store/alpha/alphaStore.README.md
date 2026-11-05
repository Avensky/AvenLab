# useAlphaStore

Owns local game-mode and hero draft choices. Confirmed roster, queue and progression are part of the social view.

**Expected updates** · On draft or recovery actions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `mode`, `teamSize`, `lastMatchMode` | Choose or restore a mode and team size. | On selection or reconnect restoration. |
| `hero`, `previewHero`, `selectionInitialized` | Hero pick, clear and garage preview actions. Uses the vehicle selection catalog. | On user action or selection setup. |

[Implementation](alphaStore.ts) · [All store update rates](../README.md)
