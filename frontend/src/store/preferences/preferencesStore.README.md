# usePreferencesStore

Device preferences and accessibility choices. Components select the options they display.

**Expected updates** · On hydration and preference edits.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `hudVisibilityVersion`, `radioHudStyle`, `healthBars`, `theme`, `vehicleCosmetics`, `garageEffects`, `ignitionVisibility`, `researchHud`, `climateHudSize`, `parkingCrystals`, `parkingBrakeStyle`, `assistHudLayout`, `dashboardBrightness`, `fov`, `cameraSensitivity`, `turretYawSensitivity`, `turretPitchSensitivity`, `controllerDeadzone`, `steeringSensitivity`, `invertSteering`, `reducedMotion`, `highContrast`, `menuTextScale`, `bindings`, `favoriteVehicles`, `touchLayout`, `drivingLayout`, `showTouchControls`, `showDriveControls`, `speedUnit`, `shiftLayout`, `hudGroups`, `wheelDrop`, `steeringTravel`, `minimapScale` | Preference setters and persisted-device hydration. Sliders and layout editing can write repeatedly during a drag. Hero account loadouts have a separate store. | Per edit, reset or hydration. No gameplay packet cadence. |

[Implementation](preferencesStore.ts) · [All store update rates](../README.md)
