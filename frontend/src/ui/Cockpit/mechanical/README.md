# Shifter and progressive parking cable

Public entry: `index.ts`. `../MechanicalControls.tsx` and `../controlGeometry.ts` keep earlier imports working.

| Module / exports | Editing result and owner |
| --- | --- |
| ProgressiveParking.tsx / ProgressiveParking | Shared pointer/key hold, drag, release and interruption lifetime; pressure grows only during a pull |
| ParkingBrake.tsx / HandbrakeLever | Stable alias to the same component |
| DriftBrakeLever.tsx / DriftBrakeLever | Stable driving alias; release now keeps cable pressure |
| pressure.ts / parkingPressureAfterHold, PARKING_PULL_MS, PARKING_TAP_MS | Pure time-to-pressure curve; 180 ms tap window, then 0–100% in 600 ms (780 ms total from a fresh hold) |
| geometry.ts / parkingLeverPose | Rest at −145°, full upright at −90°; full reach is largest |
| geometry.ts / inNeutralLane, shiftKnobRoute | Selector drag lane and display-only animation route |
| commands.ts / requestParkingFraction | Precise inputStore cable setter; no independent sender |
| commands.ts / requestParkingStrength | Legacy 0/1/2/3 preset requests |
| ParkingArtwork.tsx / ParkingLeverArtwork, ParkingDetents | Grip/boot, optional crystal presets, simple P face with pressure arc; no numeric labels |
| ParkingAppearance.tsx | Saved lever/button appearance and crystal switch |
| GearSelector.tsx | Gate targets and confirmed gear animation |

Clicking releases the cable to zero for drifting. A press held beyond the 180 ms tap window adds pressure to the current value; release after a hold keeps that pressure. No force is added during the tap window. The unlabelled metal cap is also a release button, with an accessible name. Arrow keys adjust 5%, Home releases and End applies full force. Dragging adjusts pressure directly. Blur, pause, disconnect, hide and unmount stop the pull timer while retaining the already requested latch. The timer runs at 20 Hz only during a pull and stops at full force.

`--shifter-size` and `--parking-control-height` in `styles/layout.css` both default to 140 px. In `styles/mechanical.css`, `--parking-art-height` is 85% of that parent height (119 px at full force). Both artwork tracks sit at the bottom, leaving 21 px above the raised grip. The pivot is at 75% of the panel width, halfway from center to the right edge. Grip and metal cap share the same transform. The full transparent parent button accepts clicks and holds, including its whitespace; decorative SVGs do not narrow the press area. Level 3 has the largest optional crystal. Angle/extension are the feedback; the brake has no held glow, flashing border, numeric labels or PULL label.

`inputStore.setParkingBrake` writes optional `parking_brake` plus a packed command-3 revision into the existing 60 Hz input packet. Rust cockpit v7 confirms `parking_brake`, applies the exact force through the existing rear-brake solver and retains coarse mask detents for older consumers. Other commands cannot quantize an accepted fraction; P and the keyboard/controller momentary handbrake remain independent. The sender carries the fraction with subsequent commands so composing a light request before a send cannot lose the last pressure update. Older servers use the three coarse detents until rebuilt with v7.

The three-switch HUD bank is left of the pedals. Its switches keep the same width and 23.5 px height as each switch in the expanded 3×2 bank, including on phones. Cockpit Drive saves its visibility and `assistHudLayout` (three/extended). Silver/black contact faces live in `styles/switches.css`; positioning lives in `styles/layout.css`. Do not implement mechanical wear or failure in artwork: Rust must own any future model.
