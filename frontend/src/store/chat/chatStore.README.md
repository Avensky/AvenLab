# useChatStore

Holds chat lines for the current account and team context.

**Expected updates** · On message, history, membership or notice events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `profile`, `teamContext` | Personalized social view establishes membership. Account/world transitions clear out-of-scope history. | On meaningful membership changes. |
| `history`, `activity` | chat_message and explicit chat_history results. Messages are deduplicated by ID. Up to 50 lines per context. | Per accepted message or history batch. |
| `notices` | Local system notices, including recovery messages. Keeps the last five. | Per notice. |

[Implementation](chatStore.ts) · [All store update rates](../README.md)
