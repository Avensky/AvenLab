# Cockpit feature organization

The current interaction and layout update is documented in [PROGRESSIVE_COCKPIT_UPDATE.md](PROGRESSIVE_COCKPIT_UPDATE.md). The detailed protocol reference is [COCKPIT_UI.md](COCKPIT_UI.md).

The shell `CockpitPanel.tsx` owns header/theme/status composition. `panels/` owns pages and navigation, `stalks/` owns wheel geometry/gestures, `mechanical/` owns the selector and continuous parking cable, `ignition/` owns key artwork, and `styles/` composes focused CSS through `index.css`. Each TypeScript feature exposes `index.ts`; each folder README lists exported functions and concrete editing recipes.

Appearance and visibility belong to store/preferences, selected tabs to store/menus, requests and device ownership to store/input, and accepted vehicle state to Rust. Existing MechanicalControls.tsx, controlGeometry.ts and CSS entry files remain compatibility adapters. GameUI explicitly imports modes/sandbox/index so old copied SandBox.tsx cannot shadow the organized folder on Windows.

The cumulative updater installs all replacement files before archiving the 123 obsolete flat paths. It backs up affected originals outside the repository and includes an undo helper. Keeping outdated flat modules beside their replacements can break module resolution; deleting whole feature directories would remove current source.
