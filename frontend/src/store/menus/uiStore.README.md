# useUIStore

Owns routes, overlays and menu navigation. Pause and editor transitions also apply the input-store menu brake.

**Expected updates** · On route, navigation and loading events.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `screen`, `overlay`, `vehicleSelectionParent`, `debugMenuParent`, `missionLogParent`, `settingsParent` | Screen and overlay transitions and return routes. | Per navigation action. |
| `selectedMenuIndexById`, `selectedMission`, `settingsTab`, `cockpitTab` | Current selections in visible menus. | Per selection or activation. |
| `isModeLoading`, `loadingLabel`, `loadingProgress` | Mode transition and loader progress callbacks. | On start, progress or completion. No fixed loading Hz. |

[Implementation](uiStore.ts) · [All store update rates](../README.md)
