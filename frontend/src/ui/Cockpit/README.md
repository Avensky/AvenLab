# Cockpit and driving controls

Use `index.ts` for public components. The root shell composes focused feature folders and one shared preference/input/telemetry ownership model.

Radio and Ignition have page-local Show/Hide HUD shortcuts; Brightness and Climate use the same shared switch. All four retain cockpit access while their driving widgets are hidden. Brightness gain does not change visibility. `IgnitionSwitch` subscribes only to key bits, capability and engine state; it reads the latest complete cabin mask when sending a command, preserving unrelated HVAC values without rerendering for them.

- [stalks](stalks/README.md): one circular layout for each lever and its adjacent buttons; held cap flash.
- [mechanical](mechanical/README.md): shifter and a shared continuous parking latch, appearances and optional crystals.
- [ignition](ignition/README.md): key artwork and complete light ring outside its labels.
- [panels](panels/README.md): cockpit tabs, climate size/visibility, canonical Research shortcuts, shared steering-wheel selection and common navigation.
- [styles](styles/README.md): readable CSS sections with one shared entry and editing boundaries.

| Root module | Responsibility |
| --- | --- |
| CockpitPanel.tsx | Shared menu header/theme, physical controller press bridge, selected page and confirmed footer |
| ColumnStalks.tsx | Stable lever composition and input command wiring |
| ResearchControls.tsx | CAN-only instrumentation; other options link to their owning pages |
| DriveControls.tsx / DriveAssists.tsx | Confirmed selector/brake adapters and deliberate ABS/TCS/Sport requests |
| MechanicalControls.tsx / controlGeometry.ts | Stable compatibility entries; new code uses mechanical/index.ts |
| IgnitionSwitch.tsx / starterRelayAudio.ts | Key input lifetime and confirmed starter clicking; no engine simulation |
| ClimatePanel.tsx / RotaryKnob.tsx | Full-size knobs or compact clock/hazard strip; live preview on Climate |
| HazardButton.tsx | Shared emergency switch; round in the climate strip, no header duplicate |
| ConsoleDisplay.tsx / RadioPanel.tsx / MissionApps.tsx | Media and mission information; no general menu tool duplication |
| DrivingIgnition.tsx | Fade policy while driving; the full ignition page stays available |
| useCockpitState.ts | Requested versus confirmed protocol projections |
| useMomentaryFeedback.ts | One contact-feedback owner per surface; release/cancel/focus cleanup |
| CabinClock.tsx / RadioIcon.tsx / WheelArtwork.tsx | Shared display artwork and bounded clock presentation |

Change device visibility/style in store/preferences; change requests in store/input; confirm actual state in Rust cockpit/powertrain/vehicle_forces. Hiding an on-screen control never turns off its system. Keep wheel/gauge artwork separate from shared menu theme tokens. See [the protocol guide](../../../../docs/COCKPIT_UI.md).

The compact landscape update is documented in [COMPACT_LANDSCAPE_COCKPIT_UPDATE.md](../../../../docs/COMPACT_LANDSCAPE_COCKPIT_UPDATE.md). For size changes, start with `styles/layout.css`; for radio power, start with `store/radio/radioStore.ts`.
