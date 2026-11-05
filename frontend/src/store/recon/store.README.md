# useSignalReconStore

Composes selection, protocol, session and timed mission actions into one research store.

**Expected updates** · On action, phase boundary, marker or HTTP result.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `vehicleSlug`, `vehicleIdentity`, `missions`, `steps`, `selectedMission`, `selectedRank`, `missionProtocols` | Vehicle/mission selection and protocol edits/hydration. | On setup, selection or edit. |
| `activeSessionId`, `activeRunId`, `activeStep`, `activeStepIndex`, `activePhase`, `phaseStartedAt`, `phaseEndsAt` | Start/cancel, step and phase transitions. Default phase durations are 2 s baseline, 3 s countdown, 1.8 s action and 1.5 s capture, with per-step overrides. | Per phase or session transition. Cancellable waits check at most every 250 ms and do not write the store at each check. |
| `postedMarkerCount`, `markerPostFailures` | Ordered marker submissions and their completion/failure paths. | Per marker result. |

[Implementation](store.ts) · [All store update rates](../README.md)
