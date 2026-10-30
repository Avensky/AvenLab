# Main, pause and settings menus

menuItems.ts is row order/actions. MainMenu.tsx and PauseMenu.tsx use shared GameButton/menus.css. SettingsMenu.tsx edits device preferences; VehicleMenu.tsx requests server-approved changes.

## How to edit

Use components/menus/TabbedMenu.tsx and the shared theme/controller glyphs. Update menu counts/actions in store/menus/menuActions.ts with row changes. Do not implement a second pause path or fake a server vehicle change.
