# Frontend entry points

App.tsx mounts controls and starts one socket/input sender. GameUI.tsx composes screens and overlays. FullCanvas.tsx owns the WebGL canvas; authoring uses demand rendering. index.css/App.css own global layout.

## How to edit

Start at [PROJECT_GUIDE](../../docs/PROJECT_GUIDE.md), then follow a feature README. Use a feature index.ts for external imports and concrete sibling files for internals. High-rate snapshots do not belong in screen-wide subscriptions.
