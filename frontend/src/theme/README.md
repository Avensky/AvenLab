# Shared themes and accessibility

catalog.ts defines the seven base palettes and root token application. ThemePreferences.tsx selects the persisted store preference. theme.css applies palettes to menus/debugger/cockpit. Editor Shared style follows this preference.

## How to edit

Add a palette in catalog.ts; its key becomes a validated option in Settings and cockpit. Keep text contrast, focus rings, reduced motion and text scale. White, Strawberry and Pastel Purple use light surfaces. Base palettes remain unlocked; future earned cosmetic variants must not gate legibility. Physical instruments and semantic warning/controller colors keep their meaning.

`useAppTheme.ts` applies theme, text size, contrast and reduced motion once at the app/preview root; ThemeController is its component form. Standalone cockpit/editor previews use the same preferences.

Keep physical radio dimensions in `ui/Cockpit/styles/console.css`: fixed transport circles, a round mute key and both knob sizes. Theme rules supply their colors, without flex growth or minimum sizes that turn circles into stretched rectangles. This boundary keeps every palette compatible with the same HUD/cockpit artwork.

## Surface and scene separation

`scene-tint` is a low-opacity luminous accent, independent of panel colors.
Main-menu scenery always retains a dark neutral base and scene-readable ink;
choosing White or Strawberry does not reduce video opacity. Selection headers,
tabs, summaries and footers use paired panel/text tokens instead of fixed navy.
Every base palette's primary/secondary text is tested at >=4.5:1 against
background, panel and raised surfaces.

Settings/research pages use the shared TabbedMenu: grouped surfaces, separator
lines, rounded category pills, inline value/toggle indicators and a visible
focus ring. The same radius/surface tokens are available to HUD/cockpit tools;
physical instrument shapes and Xbox button colors keep their semantics.

Garage showroom paint is optional and local: Factory / Hot pink / Pastel pink.
Only known AE86, BRZ and Supra body materials are recolored on owned preview
clones. It does not recolor glass or cached models and does not claim an earned
or networked gameplay skin.
