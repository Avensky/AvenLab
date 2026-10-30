# Device preferences and accessibility

Import the public API from `store/preferences/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [preferencesStore.ts](preferencesStore.ts) | Validated persisted settings, bindings, HUD visibility, theme, ignition visibility and research HUD opt-in. |

## Editing recipe

Add a preference to Preferences, DEFAULT_PREFERENCES and sanitizePreferences together. Preserve the existing storage key so users retain settings. Theme IDs come from theme/catalog.ts. Readability, text size, contrast and reduced motion are always available. Default ignition visibility is Auto (fades above 5 km/h with engine running); research HVAC is hidden from the driving HUD by default.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).

## Cockpit layout controls

`hudVisibility.ts` is the shared component-ID/default/label catalog for Settings and Cockpit → Research. `hudGroups.stalks` hides levers; `hazards` restores emergency lights in the framed climate clock strip, including an emergency-only strip when the dials are hidden. Climate visibility and the old `researchHud` flag are synchronized by every store action, preserving older saved layouts that had climate=true but researchHud=false.

`climateHudSize` selects compact/full in the Climate tab; `parkingCrystals` defaults off, and `parkingBrakeStyle` selects a realistic lever or simple P button on Drive. `ignitionVisibility` retains its auto/always/hidden policy. These are presentation preferences only: no physics, brake repair, weather simulation, or electronics commands belong here.

`assistHudLayout` defaults to `three`; `extended` keeps the larger bank as a saved option for later work. Cockpit Drive owns the switch and `hudGroups.assists` visibility control, sharing state with Research/Settings. `climateHudSize=compact` hides dials; choosing it in Climate also turns hazard visibility on. Full restores knobs, and the cockpit preview follows the selected size immediately.
