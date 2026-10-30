# Shared themes and accessibility

catalog.ts defines the seven base palettes and root token application. ThemePreferences.tsx selects the persisted store preference. theme.css applies palettes to menus/debugger/cockpit. Editor Shared style follows this preference.

## How to edit

Add a palette in catalog.ts; its key becomes a validated option in Settings and cockpit. Keep text contrast, focus rings, reduced motion and text scale. White, Strawberry and Pastel Purple use light surfaces. Base palettes remain unlocked; future earned cosmetic variants must not gate legibility. Physical instruments and semantic warning/controller colors keep their meaning.

`useAppTheme.ts` applies theme, text size, contrast and reduced motion once at the app/preview root; ThemeController is its component form. Standalone cockpit/editor previews use the same preferences.
