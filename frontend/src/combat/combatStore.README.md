# useCombatStore

Owns local turret and scope controls, weapon selection and mount layout. High-frequency aim intent is kept separately for the input sender.

**Expected updates** · On combat control and loadout events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `enabled`, `scope`, `scopeLockBefore`, `scopeZoom`, `orientationLocked` | Deploy, defeat, scope open/close, lock and zoom actions. | On control or vehicle lifecycle transitions. |
| `weapon`, `secondaryWeapon`, `mounts` | Selection and mount edits. Mount configuration is persisted locally. | Per user selection or loadout setup. |
| `turretResetReadyAt`, `turretLockReadyAt` | Absolute local deadlines for reset/lock input. | When the action sets a deadline. Readers compute remaining time. |

[Implementation](combatStore.ts) · [All store update rates](../store/README.md)
