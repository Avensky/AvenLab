# CAN research sessions and mission protocols

Import the public API from `store/recon/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [store.ts](store.ts) | Small composition point: ONE Zustand store with four action sections. |
| [types.ts](types.ts) | Research state and CAN vehicle identity contracts. |
| [selectionActions.ts](selectionActions.ts) | Vehicle/mission/step selection and mission switching. |
| [protocolActions.ts](protocolActions.ts) | Marker/timing/analysis edits; saves the same protocol storage format. |
| [sessionActions.ts](sessionActions.ts) | Start, ordered/retried marker posts, finalize and capture reconciliation. |
| [runActions.ts](runActions.ts) | Timed phase execution and cancellation. |
| [protocol.ts](protocol.ts) | Sanitization, required-marker recovery and persisted protocol hydration. |
| [runtime.ts](runtime.ts) | Shared marker queue, cancellable waits and run IDs. |
| [identity.ts](identity.ts) | Vehicle identity normalization/default. |
| [catalog.ts](catalog.ts) | Research mission/step definitions and default protocols. |
| [canBusStore.ts](canBusStore.ts) | Interface/mode and explicit CAN service status refresh. |
| [canDataStore.ts](canDataStore.ts) | Research terminal/frame/playback state; 1,000 visible logs and 20,000 live frames, with liveFrameDrops. Explicit setFrames imports remain lossless. |

## Editing recipe

To change an A/C research experiment, edit catalog.ts and packed cabin requests, not a driving mission. Change phase sequencing in runActions; preserve the shared activeRunId cancellation check and marker queue. Session finalization must await marker posts. For HTTP behavior, use data-server/app/can/capture. Research missions do not award gameplay wins.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
