# useCanDataStore

Owns research terminal lines, frame capture/playback state and derived volatility.

**Expected updates** · Source-driven CAN batches and playback actions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `commandOpen`, `activeView`, `logs` | Terminal and tool actions. Visible log is bounded to 1,000 lines. | On open, view, log or clear actions. |
| `frames`, `liveFrameDrops`, `byteVolatility` | Frame imports, live additions and explicit volatility calculation. Live path retains 20,000 frames and counts discarded entries. | Once per supplied batch/single frame, import, clear or analysis request. Source rate varies. |
| `currentSessionId`, `isPlaying`, `playbackIndex`, `playbackSpeed`, `playbackTolerance` | Playback/session controls and cursor. | On playback or selection updates. No multiplayer snapshot clock. |

[Implementation](canDataStore.ts) · [All store update rates](../README.md)
