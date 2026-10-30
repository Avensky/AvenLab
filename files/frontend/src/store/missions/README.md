# Gameplay mission radio presentation

Import the public API from `store/missions/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [missionRadioStore.ts](missionRadioStore.ts) | Current mission bulletin and deduplicated 12-entry history; event-driven. |

## Editing recipe

After a gameplay authority confirms a mission event, publish({id,title,message,kind}) through useMissionRadioStore.getState().publish. Use a stable event ID to avoid duplicate completion messages. The HUD gives live fuel/heat warnings priority. This adapter does not create scoring, traffic AI, mission logic, voice assets or rewards. Future cosmetic unlocks belong to confirmed gameplay progress; the seven base/accessibility palettes stay available.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
