# useHudPanelsStore

Controls the minimap, radio and climate panel layout for this session.

**Expected updates** · On panel toggles and deployment/round transitions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `map`, `mapSessionKey` | A lifecycle observer checks deployment, player, world and round. A new session opens the map once. | On a changed session key or explicit toggle. |
| `radio`, `climate` | Local expand/collapse controls. The audio and physical cabin settings have separate owners. | Per panel toggle. |

[Implementation](hudPanelsStore.ts) · [All store update rates](../README.md)
