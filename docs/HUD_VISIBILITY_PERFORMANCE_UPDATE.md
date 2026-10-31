# HUD visibility, brightness and performance audit

Base repository: `992f7cc37d8ad7af1f3758a458358fb2407838d1` (`updated hud`).
The update includes the preceding mobile cockpit changes, so it can be installed
on that Git revision or after the mobile cockpit update.

## Completed changes

| Finding | Result | Owner |
| --- | --- | --- |
| Radio and ignition lacked a visibility shortcut on their own pages | Cockpit → Radio and Ignition now have HIDE HUD / SHOW HUD. Cockpit controls remain accessible while hidden. | `ui/Cockpit/panels/HudControlPages.tsx` |
| Visibility controls repeated the same preference mutation | Radio, key, brightness and climate use one shared switch and the existing saved group IDs. | `panels/HudVisibilityToggle.tsx` |
| Press feedback cancelled native range pointer defaults | The brightness input retains mouse/touch dragging and browser focus. Physical switches and custom rotary controls retain their release feedback. | `ui/Cockpit/useMomentaryFeedback.ts`, `ui/DrivingHUD.tsx` |
| The brightness preview extended below the footer in short landscape view | Settings and the live preview sit side by side on short landscape screens, retaining the complete instrument cluster. | `ui/Cockpit/styles/panels.css` |
| A legacy hidden ignition policy could defeat a Show HUD action | Showing ignition clears that old policy to AUTO. Settings policy changes and Restore HUD stay synchronized with the group. | `store/preferences/preferencesStore.ts`, `game/menus/SettingsMenu.tsx` |
| Every preference edit recreated the HUD map, bindings and favorite array | Validation publishes only changed fields. Unchanged references stay stable; identical edits do not publish or write storage. Partial HUD maps merge in the store. | `store/preferences/preferencesStore.ts` |
| The ignition read gear, parking, traction and HVAC values through a broad hook | The key subscribes only to capability, confirmed key bits and engine status. Commands read the latest full cabin mask, retaining other cabin settings. | `ui/Cockpit/IgnitionSwitch.tsx` |
| A cold gauge mount could exceed its fixture's 500 ms freshness deadline | Its rendering test now fixes the fixture clock. Separate explicit-time tests still cover stale, missing and offline telemetry. | `frontend/tests/vehicle-hud.test.mjs` |

Radio visibility uses the existing `hudGroups.display` key for the complete
radio/mission head unit. It is independent of radio power, mute, playlist and
playback. Dashboard visibility uses `hudGroups.gauges`; brightness changes never
set that flag. Its cockpit preview remains visible when the driving HUD is
hidden. The saved 10–100% brightness range and existing engine-off dimming remain.

## Measured UI work

The same scripted sequences were run with the previous preference, ignition and
press-feedback implementations and with this update. Each telemetry change was
flushed independently with React `act`, and commits were counted with Profiler.

| Sequence | Before | After |
| --- | ---: | ---: |
| 20 brightness preference edits: HUD-map subscription notifications | 20 | 0 |
| 20 unrelated gear/HVAC/parking/traction updates: ignition commits | 20 | 0 |
| One changed confirmed key detent: ignition commits | 1 | 1 |
| Native brightness pointerdown cancelled | Yes | No |

These measure subscription/render work and event routing, not gameplay FPS or
network latency. The new controls add no polling timer. The existing shared
20 Hz telemetry sampler, ownership cleanup and hidden-document behavior remain;
the existing all-hidden-HUD test checks that display and clock timers stop.

The production main JavaScript chunk remains about 2.18 MB (about 605 kB gzip),
and Vite still reports its existing size warning. World-builder and Recon
feature bundles already load separately. Asset upload and draw-call costs still
need measurements on the target phone/PC; this patch makes no FPS claim.

## Follow-up measurements

Use the same map, vehicle, route, view distance, shadows and material settings
for before/after F3/F8 captures. Separate first-load upload/warmup hitches from
steady driving. Compare p95/p99 frame time, draw calls/triangles, preparation
time, network timing and server physics time. Record desktop and mobile
landscape separately before increasing city detail or physics budgets.

City streaming still computes LOD decisions at a bounded 10 Hz and uses a shared
preparation queue. Individual GPU uploads can exceed that queue's JavaScript
budget. Detailed city/vehicle assets, materials, reflections and shadows remain
the main rendering areas to measure. Additional cockpit controls still use the
broad `useCockpitState` API; the narrower ignition subscription provides a
pattern for future changes driven by profiler evidence.

Extracted older update trees are also tracked under `files/` and
`AvenLab-cockpit-controls-update/files/`. They add duplicate search results and
repository history size outside the active runtime. Any archive cleanup should
use a reviewed exact-path list; it is separate from this HUD update.

## Validation and code map

`validation.json` in the update archive records the exact test/build results and
remaining coverage limits. Regression checks exercise native pointer defaults,
keyboard/controller brightness, visibility persistence, legacy ignition
restoration, unchanged commands/playback and measured ignition render counts.
`frontend/src/ui/Cockpit/panels/README.md` and
`frontend/src/store/preferences/README.md` document the shared owners.
