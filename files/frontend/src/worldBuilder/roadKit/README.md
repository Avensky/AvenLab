# Road asset workbench

roadKitCore.ts measures/classifies source faces. roadKitSnap.ts solves joins. roadKitStage.ts owns the standalone Three renderer. RoadKitWorkbench.tsx controls the generated virtual asset bundle.

## How to edit

Use scripts/build-road-kit-preview.mjs for this standalone preview. virtual:road-kit-bundle is supplied by that build, not the app Vite entry. Dispose the stage when unmounting; main editor placement uses the measured runtime catalogs.

The public index exposes pure measurement/snapping functions. Import the standalone RoadKitWorkbench component directly only in its dedicated preview build, which supplies virtual:road-kit-bundle.
