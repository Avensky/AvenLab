# useMatchResultsStore

Holds a confirmed live match result or an opened career record plus its presentation state.

**Expected updates** · One result per match, history and UI events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `record`, `source`, `profileId`, `returnScreen`, `returnOverlay`, `leftWorld` | Server match_result, history open, return routing and successful leave. | On confirmed result, record open or leave. |
| `tab`, `teamFilter`, `selectedPlayer`, `busy`, `error` | Result navigation and request state. | Per selection, request or reply. |

[Implementation](matchResultsStore.ts) · [All store update rates](../README.md)
