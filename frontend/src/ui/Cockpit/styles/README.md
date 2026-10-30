# Shared cockpit and driving styles

`../driverConsole.css` is the stable CSS entry; `index.css` is its CSS barrel. TypeScript component exports live in the sibling feature index.ts files.

| File           | Change here for                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| console.css    | Radio/climate surfaces, common wheel artwork and neutral contact feedback                                 |
| layout.css     | Peer parking/shifter row, assist/pedal row and narrow-screen wheel clearance, group positioning                                    |
| stalks.css     | Lever rods/targets; position angles/radius belong to stalks/geometry.ts                                   |
| mechanical.css | Gate, grip/P-button appearances, optional crystals and progressive cable pose/dimensions                              |
| ignition.css   | Full outer light, key sweep, crank flicker and mobile key position                                        |
| panels.css     | Vertical turn arrows, mirrored cruise/wiper diagrams, centered round climate hazards and preference controls |
| switches.css   | Shared pedal/assist contact faces; silver assists with black text/icons                                   |

Keep `index.css` import order: base surfaces first, focused physical styles afterward. Sizes are responsive and avoid a new per-frame render loop. Button contact uses `data-hud-held`; `aria-pressed` is system status and must not keep a face highlighted. Theme tokens come from theme/catalog.ts and theme.css. Semantic hazard/controller/warning colors keep their meaning. Reduced motion disables sweeps/flicker without changing commands.

The full brake grip and shifter are both 128 px tall. On narrow portrait screens the equipment row clears the wheel while assists stay beside the pedals. At ≤380 px the console narrows to 236 px so the ignition stays in view. Full HVAC shows knobs; compact omits them in React. `panels.css` shares the radio/climate frame and circular hazard face. Engine-off-only dimming is in `../../Dashboard/dashboard.css`, driven by confirmed `data-engine-on`; high contrast bypasses it.
