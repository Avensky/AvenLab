# Routes, overlays and menu navigation

Import the public API from `store/menus/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [types.ts](types.ts) | Screen, overlay, cockpit-tab and UI state contracts. |
| [uiStore.ts](uiStore.ts) | Current route, loading and overlay transitions; route-level menu brake policy. |
| [menuActions.ts](menuActions.ts) | Selection movement and activation for main, pause and setup menus. |

## Editing recipe

Add a route to types.ts and composition in game/GameUI.tsx. Add menu rows in game/menus/menuItems.ts. Main/pause menus, pointer actions, keyboard and controller share these same actions. Do not duplicate route flags in another store.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
