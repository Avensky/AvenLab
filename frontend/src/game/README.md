# Game composition

GameUI.tsx chooses routes from store/menus. menus/ owns application navigation; modes/sandbox is driving; modes/recon is CAN research; preview/ is the garage selection scene.

## How to edit

To add an overlay, change store/menus/types.ts, route its controls in controls/inputRouting.ts, then mount it in GameUI. Opening the world editor removes the driving renderers while networking and Rust keep running.
