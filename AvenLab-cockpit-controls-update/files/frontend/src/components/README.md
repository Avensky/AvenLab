# Reusable presentation

GameButton.tsx is shared main/pause interaction. menus/ owns menu surfaces/focus. controller/ owns Xbox glyphs and shortcut guides. debugger/ owns optional physics visualizers.

## How to edit

Prefer existing shared components. Vehicle transforms/camera math belong to their feature, not a generic component. See debugger/README for diagnostics and theme/README for colors.
