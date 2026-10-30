# Cockpit pages and navigation

Public entry: `index.ts`. The root CockpitPanel keeps shared header/theme/status; individual pages mount only when selected.

| File / export | What to edit |
| --- | --- |
| tabs.ts / COCKPIT_TABS | Labels and order; persisted/shortcut route IDs stay stable |
| useCockpitNavigation.ts | Controller/arrow focus, tab switching, B/Escape, select/slider/key stepping; synthetic steps always include keyup |
| LightsPanel.tsx / LightsPanel | Light detents and vertical indicators: up is right, down is left |
| WipersPanel.tsx / WipersPanel | Wipe modes and bounded washer tap; page cleanup clears a pending wash |
| CruisePanel.tsx / CruisePanel | Confirmed cruise state/speed; mirrored right-hand lever diagram |
| ClimatePage.tsx / ClimatePage | Full HVAC controls, compact/full driving widget choice, and HUD visibility |
| ResearchPanel.tsx / ResearchPanel | Research commands and on-screen component preferences |
| HudVisibilityPanel.tsx / HudVisibilityPanel | Shared Settings preferences for climate, hazards, levers, ignition, GPS, parking/assists/shifter/pedals |

Climate has its own page with a live preview. Full renders three knobs; compact removes the dials and restores the centered round emergency-light button in the clock strip. Both sizes share the radio frame. No local expand/collapse arrows or header hazard duplicate are needed.

Research visibility switches never turn vehicle electronics off. Hidden controls stay available on their own cockpit pages and through the same input/CAN protocol. Legacy console/vehicle tab IDs remain accepted by the shell. The normalized `researchHud` preference is retained only as a synchronized compatibility alias for climate visibility.
