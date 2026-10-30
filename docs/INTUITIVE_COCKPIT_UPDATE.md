# Intuitive cockpit controls

The climate clock, emergency switch and HVAC knobs now form one HUD unit. HIDE HUD always removes that unit, even when its hazard-button preference is enabled. Changing compact/full size while hidden cannot bring it back. The cockpit controls remain usable independently of the driving HUD; visibility never sends an electronics command. The centered round hazard face is 24 px, 80% of its previous size, with extra transparent contact space.

Lights, Wipers and Cruise share the real wheel artwork and a three-lever selector. Clicking a lever selects its existing page. The selected label identifies the current system; selecting a page never activates lights, washer or cruise.

Research links to every canonical cockpit page and the existing Settings → HUD menu. It retains CAN LOG, LIVE CAN and DYNO. The duplicate lights/assists/washer controls and visibility switches are removed. Settings has one climate row, without a second research-cabin or emergency-strip visibility gate. Back from Settings restores the cockpit page that opened it.

| Owner / public entry | Edit here to change |
| --- | --- |
| ui/ControlsPanel.tsx | The climate master mount condition; child hazards cannot mount the unit |
| ui/Cockpit/panels/ClimatePage.tsx | Compact/full, explicit SHOW HUD / HIDE HUD actions and inner hazard choice |
| store/preferences/index.ts | Saved HUD groups; researchHud remains a synchronized compatibility alias |
| ui/Cockpit/panels/index.ts / SteeringSystemPicker | Wheel navigation; shared STALK_LAYOUTS owns the physical positions |
| ui/Cockpit/WheelArtwork.tsx | Existing wheel artwork reused by driving and menu selection |
| ui/Cockpit/panels/ResearchPanel.tsx | Shortcuts derived from COCKPIT_TABS; add a tab once to expose it here |
| ui/Cockpit/ResearchControls.tsx | CAN-only instrumentation commands |
| ui/Cockpit/panels/HudVisibilityPanel.tsx | Compatibility export for the single HUD-layout shortcut |
| store/menus/uiStore.ts / types.ts | settingsParent, Settings entry and return routing |
| ui/Cockpit/styles/panels.css | Wheel picker, Research grid, hazard face and transparent contact area |

These changes add no simulation loop or 3D scene. The wheel selector is static SVG/HTML and the existing telemetry/clock owners remain shared. Rust, CAN protocol and vehicle forces are unchanged. The delivered validation.json records the exact tests and browser/installer checks.

## Brake spacing and pull timing

The brake parent remains aligned with the 140 px shifter. Its artwork is 85% tall at full force (119 px), bottom-aligned with whitespace above. The pivot is 75% across the parent, halfway between center and its right edge. The whole parent area accepts a click or hold; exact SVG contact is unnecessary. A fresh hold reaches full force after the 180 ms tap window plus a 600 ms pull, about 0.8 seconds. Click still releases to zero; release after holding retains pressure. Edit `mechanical/pressure.ts` for timing and `styles/mechanical.css` for size/placement.
