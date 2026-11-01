# Shared themes and accessibility

catalog.ts defines the shared base palettes and root token application. ThemePreferences.tsx selects the persisted store preference. theme.css applies palettes to menus/debugger/cockpit. The editor always follows this preference; it has no separate theme selector or persisted theme.

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

Main menu → Heroes owns equipped body paint and finishes. Settings → Appearance
keeps the global interface palette and cockpit matching. Saved hero loadouts
are validated by the server and rendered by other clients; old showroom paint
preferences are only a fallback for vehicles with no saved loadout.

Editor surfaces use `--le-*` palette tokens, including toolbar ink, disabled
undo/redo, category chips, thumbnail tiles and grid/angle controls. Coordinate
labels rendered into Drei Html portals receive explicit palette colors because
they do not inherit the editor panel's inline CSS variables. Editor lighting is
neutral so a light-colored board does not pick up a fixed blue hemisphere tint.

Mode/role summaries remain transparent over scenery with scene-readable ink;
mode and vehicle filter tabs keep square corners. Settings still use the shared
rounded surface language.

Prefab visibility is saved independently of the document. Layout/collider
panels share editorPaletteCSS; floating controls and the 3D coordinate portal
use the same Settings-owned app palette.

AE86 fallback colors repair only untextured, default-white tire/rim/interior
materials on owned clones, in both showroom and the driving rig. Supra opaque
materials get bounded specular energy and a small roughness floor. Main menu > Heroes owns body paint and shared finish presets. Camaro exterior paint multiplies its retained texture;
glass, badges and interior materials are not recolored. Tank keeps factory paint.
