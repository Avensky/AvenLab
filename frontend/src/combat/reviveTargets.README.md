# useReviveRequestStore

Tracks the pending mechanic recovery request separately from authoritative vehicle state.

**Expected updates** · On request and completion.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `key`, `busy` | Local in-flight guard for the vehicle_revive command. Health, resources and cooldowns are read from the server entity. | On accepted request start and on reply/error or invalidation. Checking eligibility can run more often. |

[Implementation](reviveTargets.ts) · [All store update rates](../store/README.md)
