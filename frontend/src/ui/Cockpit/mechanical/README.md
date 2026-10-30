# Shifter and progressive parking cable

Public entry: `index.ts`. `../MechanicalControls.tsx` and `../controlGeometry.ts` keep earlier imports working.

| Module / exports | Editing result and owner |
| --- | --- |
| ProgressiveParking.tsx / ProgressiveParking | Shared pointer/key hold, drag, release and interruption lifetime; pressure grows only during a pull |
| ParkingBrake.tsx / HandbrakeLever | Stable alias to the same component |
| DriftBrakeLever.tsx / DriftBrakeLever | Stable driving alias; release now keeps cable pressure |
| pressure.ts / parkingPressureAfterHold, PARKING_PULL_MS | Pure time-to-pressure curve; default 0–100% in 1200 ms |
| geometry.ts / parkingLeverPose | Rest horizontal at −180°, full upright at −90°; full reach is largest |
| geometry.ts / inNeutralLane, shiftKnobRoute | Selector drag lane and display-only animation route |
| commands.ts / requestParkingFraction | Precise inputStore cable setter; no independent sender |
| commands.ts / requestParkingStrength | Legacy 0/1/2/3 preset requests |
| ParkingArtwork.tsx / ParkingLeverArtwork, ParkingDetents | Grip/boot, optional crystals, numeric presets, simple P face with pressure arc |
| ParkingAppearance.tsx | Saved lever/button appearance and crystal switch |
| GearSelector.tsx | Gate targets and confirmed gear animation |

Hold adds pressure to the current value. Normal release commits elapsed time and keeps pressure; a short second pull never resets it. The explicit **0** target releases the cable. Arrow keys adjust 5%, Home releases and End applies full force. Dragging adjusts pressure directly. Blur, pause, disconnect, hide and unmount stop the pull timer while retaining the already requested latch. The timer runs at 20 Hz only during a pull and stops at full force.

`--shifter-size` and `--parking-control-height` in `styles/layout.css` both default to 128 px. In `styles/mechanical.css`, grip width equals that control height: rotation at full force gives the same vertical bounding height as the shifter. The 89.5% pivot placement accounts for the grip's transform origin. Change these together to preserve the full-height pose. Level 3 has the largest crystal. Angle/extension are the feedback; the brake has no held glow, flashing border or PULL label.

`inputStore.setParkingBrake` writes optional `parking_brake` plus a packed command-3 revision into the existing 60 Hz input packet. Rust cockpit v7 confirms `parking_brake`, applies the exact force through the existing rear-brake solver and retains coarse mask detents for older consumers. Other commands cannot quantize an accepted fraction; P and the keyboard/controller momentary handbrake remain independent. The sender carries the fraction with subsequent commands so composing a light request before a send cannot lose the last pressure update. Older servers use the three coarse detents until rebuilt with v7.

The three-switch HUD bank is left of the pedals. Cockpit Drive saves its visibility and `assistHudLayout` (three/extended). Silver/black contact faces live in `styles/switches.css`; positioning lives in `styles/layout.css`. Do not implement mechanical wear or failure in artwork: Rust must own any future model.
