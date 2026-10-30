# Device preferences and accessibility

Import the public API from `store/preferences/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [preferencesStore.ts](preferencesStore.ts) | Validated persisted settings, bindings, HUD visibility, theme, ignition visibility and research HUD opt-in. |

## Editing recipe

Add a preference to Preferences, DEFAULT_PREFERENCES and sanitizePreferences together. Preserve the existing storage key so users retain settings. Theme IDs come from theme/catalog.ts. Readability, text size, contrast and reduced motion are always available. Default ignition visibility is Auto (fades above 5 km/h with engine running); research HVAC is hidden from the driving HUD by default.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).

## Cockpit layout controls

`hudVisibility.ts` is the shared component-ID/default/label catalog. Settings → HUD owns the full visibility list; Cockpit → Research links there. `hudGroups.stalks` hides levers. `hudGroups.climate` is the single master for the entire clock/hazard/HVAC unit; `hudGroups.hazards` only selects the button inside it. The hazard option defaults on inside the initially hidden climate unit and cannot make that unit visible by itself. Climate visibility and the old `researchHud` flag are synchronized by every store action, preserving older saved layouts that had climate=true but researchHud=false.

`climateHudSize` selects compact/full in the Climate tab; `parkingCrystals` defaults off, and `parkingBrakeStyle` selects a realistic lever or simple P button on Drive. `ignitionVisibility` retains its auto/always/hidden policy. These are presentation preferences only: no physics, brake repair, weather simulation, or electronics commands belong here.

`dashboardBrightness` is a validated 0.1–1 gain (default 1), saved under the existing storage key and edited on Cockpit → Brightness. It controls both the dashboard preview and driving instruments without sending physics commands. `hudGroups.gauges` is the shared dashboard visibility switch.

`assistHudLayout` defaults to `three`; `extended` keeps the larger bank as a saved option for later work. Cockpit Drive owns the switch and `hudGroups.assists` visibility control, sharing state with Research/Settings. `climateHudSize=compact` hides dials; choosing it in Climate enables the inner hazard button while leaving the master visibility unchanged. Full restores knobs, and the cockpit preview follows the selected size immediately.
