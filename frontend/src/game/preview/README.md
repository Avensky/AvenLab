# Vehicle-selection garage

VehiclePreview.tsx owns the showroom camera/turntable; GarageEnvironment.tsx loads garage_special.glb. prepareGarageDisplay.ts and garagePlacement.ts define display transforms. VehiclePreviewModel.tsx normalizes lineup presentation.

## How to edit

To change selection-stage placement, edit previewPlacement.ts / garagePlacement.ts. For a placeable garage, change worldBuilder/models and rebuild measured placement colliders; preview decoration must not become guessed physics.

Garage and Character use `PreviewCameraSelect` for the camera buttons and
`PreviewCameraAngles` for the popover. The popover owns keyboard focus,
Escape, and controller Back. Adjust shared control styles in `previewControls.css`
and palette colors in the [theme catalog](../../theme/README.md).
`FittingCameraSelect` adds garment close-ups and their selection state.
