# Shifter, parking latch and drift pull

Public entry: `index.ts`; `../MechanicalControls.tsx` and `../controlGeometry.ts` keep earlier imports working.

| Module / exports | Owner and editing result |
| --- | --- |
| GearSelector.tsx / GearSelector | Gate slots, drag selection and routed knob animation; actual gear/gates are Rust-owned |
| ParkingBrake.tsx / HandbrakeLever | Cockpit ratchet: hold builds three levels, tap releases; interruption ends charging |
| DriftBrakeLever.tsx / DriftBrakeLever | Driving pull: immediate analog rear brake, released with the pointer/key |
| ParkingArtwork.tsx / ParkingLeverArtwork, ParkingDetents | Stitched physical grip, simple P face, optional crystals or plain numeric detents |
| ParkingAppearance.tsx / ParkingAppearance | Cockpit Drive controls for lever/button appearance and crystals |
| commands.ts / requestParkingStrength | One normalized command-3 latch request that preserves gear/assists and never sends gas |
| geometry.ts / parkingLeverPose, inNeutralLane, shiftKnobRoute | Pure projected lever pose, neutral lane, and H/automatic knob route |

Use `styles/mechanical.css` for artwork and dimensions; `styles/layout.css` makes the parking brake and shifter siblings. The driving assist bank is 3 columns by 2 rows, roughly the height of the pedals. The last cell is deliberately empty. Shared press feedback and the silver assist faces with black lettering live in `styles/switches.css`; do not use hover or aria-pressed as a held border.

Appearance preferences are `parkingBrakeStyle` (lever/button) and `parkingCrystals` (default false). These never change cable tension. The driving pull has input source `touch-parking`; releasing it cannot erase a simultaneous keyboard or controller pull. Side detents still set a deliberate parking latch; the 0 button releases that latch. This is separate from automatic transmission P.

Do not simulate failure in an artwork component. Brake wear/failure must be an explicit Rust vehicle-state/force model, then expose confirmed health through telemetry. The current pull uses the existing rear-wheel handbrake solver.
