# Progressive cockpit update

This update uses the latest requested layout and input behavior on top of the organized AvenLab patch.

| Feature | Behavior / editing owner |
| --- | --- |
| Assist HUD | Three switches by default, left of the pedals; identical individual switch size in either layout; show/hide and saved expanded option in Cockpit Drive; shared state with Research/Settings |
| Parking cable | Quick click releases to zero; a hold beyond 180 ms adds continuous 0–100% pressure over 600 ms and release keeps it; the metal tip also releases; angle/extension show force without a glow or PULL label |
| Mechanical size | 140 px aligned shifter and brake modules; rest begins at 145°; no numbered buttons; full-pressure grip is 85% of the 140 px parent height, with its pivot at 75% width; level 3 is the largest crystal |
| Dashboard | Confirmed engine-off state dims the instruments; Cockpit → Brightness adjusts a saved 10–100% gain with a real instrument preview; high contrast bypasses automatic dimming |
| Climate | Same silver frame as radio; full has three knobs; compact removes them and shows clock/ambient plus a centered round hazard switch |
| Climate preview | Size selection immediately updates both the cockpit preview and saved driving widget; selecting compact restores hazard visibility |
| Wheel levers | Lights/wipers are shorter; cruise is closer and smaller; all neighboring controls move proportionally with base geometry |
| Signals | Hold steps left → off → right, or use two clicks; both adjacent buttons rotate with the cap/rod as one assembly |
| Wheel feedback | White light icon; lever movement replaces border flashes |
| Mobile | Larger mechanical row clears the wheel; assists stay beside pedals; small phones retain the ignition in view |

## State and edit map

- `ui/Cockpit/mechanical/index.ts` exposes the progressive control, pressure curve, geometry, artwork and command helpers. Its README explains timing, drag, interruption and exact sizing.
- `store/input.setParkingBrake` is the single validated request writer. The existing sender carries optional `parking_brake` at its normal rate; a pull adds only a temporary 20 Hz interaction timer.
- Rust cockpit v7 confirms the exact fraction and applies it through the existing rear-brake force path. Coarse mask detents remain for legacy consumers. Rebuild/restart the server for continuous pressure.
- `preferences.assistHudLayout` saves three/extended; `hudGroups.assists` controls visibility. Changing either never toggles ABS/TRAC/VSC.
- `panels/ClimatePage.tsx` owns size selection and live preview; `ClimatePanel.tsx` omits the knobs in compact mode. Hazards live inside its clock strip.
- `stalks/geometry.ts` owns complete layouts. Caps and neighboring buttons share one radius and rotate together in a shared actuator during a held detent.
- `styles/layout.css` owns module sizes/mobile clearance; `styles/mechanical.css` owns the pressure pose; `styles/panels.css` owns HVAC frame/circular hazards; `styles/switches.css` owns silver/black assist faces.
- `Dashboard/dashboardModel.ts` exports instrumentBrightness; `Dashboard.tsx` combines saved gain and confirmed engine state. `panels/BrightnessPage.tsx` owns the range, live preview and shared dashboard visibility switch.

A quick click releases the brake; a deliberate hold retains partial force. Keyboard/controller momentary braking stays independent; hiding the control stops its timer without releasing a deliberate cable latch. P remains a separate transmission state. No mechanical wear/failure model is added by this interface work.

Radio transport buttons retain fixed circular faces rather than growing with the row. The ignition HUD is slightly closer to the right-hand console.

## Validation

Current results are recorded in the delivered package's validation.json. Checks include continuous pressure, the two-thirds rounding boundary, legacy parking commands, gear rejection, other-command composition, device release, compact preview/round hazards, engine-off-only dimming, aligned parent modules with 85% brake artwork and phone layout. Browser checks use labeled sample telemetry; they do not measure gameplay FPS or physical-device rendering.

## Climate and navigation refinement

See [INTUITIVE_COCKPIT_UPDATE.md](INTUITIVE_COCKPIT_UPDATE.md) for the latest climate master visibility, 24 px hazards, shared wheel selector, canonical Research links and return navigation. These refine the UI without changing the included v7 physics protocol.
