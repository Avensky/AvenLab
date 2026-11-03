# Xbox input glyphs

ControllerButton.tsx draws black-filled A/B/X/Y and labeled shoulders/triggers/sticks. ControllerGuide.tsx documents actual driving shortcuts. controller.css fixes semantic colors across palettes.

## How to edit

A is green, B red, X blue, Y yellow. Use LB/RB and LT/RT labels. Update the guide when controls/GameController.ts changes. Show only actions the current surface really supports.

ControllerAction.tsx owns clickable Xbox menu actions (A/Continue, B/Back, Confirm/Cancel, editor/cockpit close). Change their glow, spacing and focus feedback once in controller.css. It renders a native button and the shared semantic glyph; preserve native props, disabled state and each menu's existing input owner. MenuShortcuts remains a non-interactive hint row. Hover uses a theme-colored glow with no text underline or rectangular plate.

ProgressOrbit.tsx is the shared hold/cooldown fill. ControllerAction accepts an optional normalized progress without changing glyph or footer sizing. Combat cooldowns use the same ring with their own icon size and authoritative timer.
