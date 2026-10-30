# Local media playback

Import the public API from `store/radio/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [radioStore.ts](radioStore.ts) | One local Audio element, bounded 100-file queue, volume, mute and event-driven transport. |

## Editing recipe

Add station/media behavior here; transport UI belongs to ui/Cockpit/RadioPanel.tsx. Keep playback independent from a panel mount so hiding the radio does not stop a track. No progress polling timer or audio upload is introduced. Mission bulletins are in store/missions.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
