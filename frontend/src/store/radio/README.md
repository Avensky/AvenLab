# Local media playback

Import the public API from `store/radio/index.ts`; internal modules use concrete sibling imports to avoid cycles.

`radioStore.ts` owns one local Audio element, a bounded 100-file queue, playback, volume, mute and power. `ui/Cockpit/RadioPanel.tsx` renders the same owner in the driving HUD and cockpit page.

`setRadioPower(false)` pauses playback, invalidates pending play promises, clears the RADIO input flag and saves power-off locally. It keeps the playlist, current position, volume and mute setting. Explicit power-on resumes the selected source; source selection while off prepares a queue without starting it. Media events cannot restore power. Play/pause and mute remain separate actions.

Hiding a panel changes visibility only and does not stop audio. Turning the radio off is the playback action. No media progress polling, upload, extra Audio instance or simulation command is introduced. `startRadio` and `stopRadio` are the single shared paths for transport and power so cancellation stays consistent. Tests exercise normal playback, late events, pending promises and power cycling through the rendered switch.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
