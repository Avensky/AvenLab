# Vehicle-selection garage

VehiclePreview.tsx owns the showroom camera/turntable; GarageEnvironment.tsx loads garage_special.glb. prepareGarageDisplay.ts and garagePlacement.ts define display transforms. VehiclePreviewModel.tsx normalizes lineup presentation.

## How to edit

To change selection-stage placement, edit previewPlacement.ts / garagePlacement.ts. For a placeable garage, change worldBuilder/models and rebuild measured placement colliders; preview decoration must not become guessed physics.
