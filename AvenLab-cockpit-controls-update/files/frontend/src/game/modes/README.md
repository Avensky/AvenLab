# World modes

sandbox/ is driving and setup. recon/ is CAN research and captured-session workflows. VehicleSelector.tsx and MapSelector.tsx are shared setup controls. tools/FirstFrameReady.ts coordinates loading.

## How to edit

To add a world, update store/selection/worldCatalog.ts and the Rust map selection allow-list. A game mode route is separate from a map ID. World editor supports the map catalog without mutating the running session.
