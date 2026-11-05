# useSocialStore

Owns a personalized lobby and account view. Consumers include matchmaking, the world browser, chat membership and presence.

**Expected updates** · On personalized social or connection events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `view`, `available`, `profileStatus` | Validated social_state, identification and connection lifecycle. Shared mutations may reach several viewers. Manual refresh targets its requester. | On change. The server suppresses identical serialized views. |
| `message`, `recoveryMessage`, `entryCode` | Request/status feedback, reconnect handling and invite entry. | On the local action, reply or recovery event. |

[Implementation](socialStore.ts) · [All store update rates](../README.md)
