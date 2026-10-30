# Rendering and inspection choices

Import the public API from `store/presentation/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [renderSettingsStore.ts](renderSettingsStore.ts) | Graphics presets, view distance, effects and per-object visual overrides. |
| [debugViewStore.ts](debugViewStore.ts) | Interpolation buffer and diagnostic scope. |
| [gameStore.ts](gameStore.ts) | Camera/editor controls and old compatibility fields; uiStore owns active routes. |
| [inspectionActions.ts](inspectionActions.ts) | Enter/leave inspection and release controls. |
| [visualAlignmentStore.ts](visualAlignmentStore.ts) | Measured model alignment reports. |

## Editing recipe

Change graphics defaults here, then verify the renderer consumer. Visual overrides do not alter Rapier shapes. Keep frame-rate camera values out of React menus; read getState()/refs inside animation loops.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
