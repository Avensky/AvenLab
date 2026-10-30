# Debugger and physics overlays

DebugMenu.tsx builds shared menu tabs. DebugColliders/ChassisCollider and individual wheel/force visualizers consume requested diagnostic data. AssetBoundary.tsx isolates asset errors.

## How to edit

Change debug request bits in store/world/debugMasks.ts and matching Rust vehicle_debug.rs. New panels use TabbedMenu and shared theme. Hidden visualizers should not request their diagnostic stream. This update retains the debugger design and brings cockpit styling into the same system.
