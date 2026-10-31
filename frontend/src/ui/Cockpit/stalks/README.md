# Steering-column levers

Public entry: `index.ts`. `../ColumnStalks.tsx` is the stable composition entry used by Steering.

| File / function                                                   | Owns                                                                  | Change it when                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| geometry.ts / STALK_LAYOUTS                                       | One angle, reach and spacing for each complete lever                  | Move a lever and both adjacent buttons together                          |
| geometry.ts / stalkPoint                                          | Polar position in wheel-relative percentages                          | Change how a radius maps to the wheel                                    |
| geometry.ts / stalkStepAngle                                      | Mirrored up/down placement                                            | Change direction placement; up stays above the cap on both sides         |
| geometry.ts / stalkTangent                                        | Upright tangential button rotation                                    | Change how targets sit flush with the circular wheel                     |
| Stalk.tsx / Stalk                                                 | Pointer capture, key ownership, drag, detents and held/repeat cleanup | Change interactions; no networking loop belongs here                     |
| commands.ts / requestTurnSignal, stepTurnSignal, toggleTurnSignal | Shared exclusive left/right requests                                  | Keep Lights page and wheel controls consistent; hazards stay independent |
| ../ColumnStalks.tsx                                               | Lights/washer/cruise command wiring                                   | Change what a gesture requests                                           |

A short light-cap tap rotates OFF/AUTO/LOW. Holding it for 220 ms requests high-beam flash through cockpit v6 cabin bit 20. Release/cancel/blur/pause/hide/unmount restores the selected mode; it never also rotates the light mode. There is no extra FLASH label/button. Dragging consumes the tap so a returned drag cannot accidentally rotate a mode.

`useControlRelease` owns interruption cleanup; inputStore merges source intent; Rust confirms cabin/cockpit/cluster masks. Changing geometry does not change those protocol bits. The wheel-lever HUD switch is `preferences.hudGroups.stalks`.

Current layouts use reach 31%, spacing ±11.5° and face scale 0.9 for lights/wipers. Cruise uses reach 27%, spacing ±10.5° and scale 0.75, keeping it closer to the wheel center. Configuring an entry moves its cap and both buttons together. During a pull, `Stalk` rotates their shared actuator by its configured travel angle per detent (7° by default, 4° for cruise): the rod, cap and both adjacent buttons move as one rigid assembly. Their local coordinates stay fixed and pointer capture keeps the held target owned. Holding a signal direction repeats at 350 ms and steps left → off → right (or the reverse), clamped at the end. Two clicks take the same steps. No wheel button uses contact-border flashes; the light icon is white.

The cruise mount/radius/button spacing stay fixed when changing `travel`; this controls only the short held sweep. Rod/cap radial thickness lives in `styles/stalks.css`, so making the lever thicker does not shift the approved angular layout.
