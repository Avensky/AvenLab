# Cockpit pages and navigation

Public entry: `index.ts`. The root CockpitPanel keeps shared header/theme/status; individual pages mount only when selected.

| File / export | What to edit |
| --- | --- |
| tabs.ts / COCKPIT_TABS | Labels and order; persisted/shortcut route IDs stay stable |
| useCockpitNavigation.ts | Controller/arrow focus, tab switching, B/Escape, select/slider/key stepping; synthetic steps always include keyup |
| LightsPanel.tsx / LightsPanel | Light detents and vertical indicators: up is right, down is left |
| SteeringSystemPicker.tsx / SteeringSystemPicker, SteeringSystem | Shared real wheel and three navigation targets; positions come from stalks/geometry.ts and clicks only select a page |
| WipersPanel.tsx / WipersPanel | Wipe modes and bounded washer tap; page cleanup clears a pending wash |
| CruisePanel.tsx / CruisePanel | Confirmed cruise state/speed; its right-mounted lever is selected through the shared wheel |
| ClimatePage.tsx / ClimatePage | Full HVAC controls, compact/full driving widget choice, and HUD visibility |
| BrightnessPage.tsx / BrightnessPage | Dashboard visibility, persisted 10–100% brightness, keyboard/controller range and live instrument preview |
| HudControlPages.tsx / RadioPage, IgnitionPage | Radio and key previews with a driving HUD visibility shortcut; hiding the widget retains cockpit access |
| HudVisibilityToggle.tsx / HudVisibilityToggle | Shared page-local Show/Hide HUD switch for radio, ignition, instruments and climate; writes only the existing preference group |
| ResearchPanel.tsx / ResearchPanel | Links from the shared tab catalog to canonical pages, plus CAN instrumentation |
| HudVisibilityPanel.tsx / HudVisibilityPanel | Stable public shortcut to Settings → HUD; no duplicated visibility switches |

Climate has its own page with a live preview. Full renders three knobs; compact removes the dials and restores the centered round emergency-light button in the clock strip. Both sizes share the radio frame. The climate master hides the entire clock/hazard/knob unit. The hazard preference only selects a button inside that unit; it cannot independently keep the HUD visible. The round hazard face is 24 px, with extra transparent contact space. No local expand/collapse arrows or header hazard duplicate are needed.

Research routes to the existing pages and Settings → HUD. CAN LOG, LIVE CAN and DYNO are its only direct controls. HUD visibility edits never turn vehicle electronics off. Hidden controls stay available on their own cockpit pages and through the same input/CAN protocol. Legacy console/vehicle tab IDs remain accepted by the shell. The normalized `researchHud` preference is retained only as a synchronized compatibility alias for climate visibility.

Native brightness ranges retain browser pointer/focus defaults. `useMomentaryFeedback` still owns physical button and custom rotary-slider contact, but skips native `input[type=range]`; cancelling pointerdown there stops real mouse/touch dragging. Brightness gain and dashboard visibility are separate preferences. The real instrument preview stays visible when its driving widget is hidden.
