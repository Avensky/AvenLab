# Steering-column levers

Public entry: `index.ts`. `../ColumnStalks.tsx` is the stable composition entry used by Steering.

| File / function | Owns | Change it when |
| --- | --- | --- |
| geometry.ts / STALK_LAYOUTS | One angle, reach and spacing for each complete lever | Move a lever and both adjacent buttons together |
| geometry.ts / stalkPoint | Polar position in wheel-relative percentages | Change how a radius maps to the wheel |
| geometry.ts / stalkStepAngle | Mirrored up/down placement | Change direction placement; up stays above the cap on both sides |
| geometry.ts / stalkTangent | Upright tangential button rotation | Change how targets sit flush with the circular wheel |
| Stalk.tsx / Stalk | Pointer capture, key ownership, drag, detents and held/repeat cleanup | Change interactions; no networking loop belongs here |
| commands.ts / requestTurnSignal, stepTurnSignal, toggleTurnSignal | Shared exclusive left/right requests | Keep Lights page and wheel controls consistent; hazards stay independent |
| ../ColumnStalks.tsx | Lights/washer/cruise command wiring | Change what a gesture requests |

A short light-cap tap rotates OFF/AUTO/LOW. Holding it for 220 ms requests high-beam flash through cockpit v6 cabin bit 20. Release/cancel/blur/pause/hide/unmount restores the selected mode; it never also rotates the light mode. There is no extra FLASH label/button. Dragging consumes the tap so a returned drag cannot accidentally rotate a mode.

`useControlRelease` owns interruption cleanup; inputStore merges source intent; Rust confirms cabin/cockpit/cluster masks. Changing geometry does not change those protocol bits. The wheel-lever HUD switch is `preferences.hudGroups.stalks`.
