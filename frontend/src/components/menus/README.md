# Shared menu surfaces

TabbedMenu.tsx owns tab/row navigation and focus. menus.css owns density and layout. theme/theme.css supplies palette/contrast. menuFocus.ts traps dialogs. cityQualityControl.ts shares graphics rows.

## How to edit

Use this surface for new settings/debugger pages. Include visible ControllerButton/MenuShortcuts, label every action, and preserve focused/disabled states. Do not embed general settings into radio mission apps.
