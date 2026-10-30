# Placeable special garage

modelCatalog.ts / modelRoles.ts define approved garage masks and measured structure. garageLoader.ts owns the local Draco loader. ModelMeshes.tsx shares cached geometry and selects full/proxy detail; ModelInspector.tsx toggles modules.

## How to edit

The selection garage is garage_special.glb. Keep the open bay/driveable floor clear. Export/regenerate placement-colliders.json using scripts/build-placement-colliders.mjs. Distant structural proxies use measured faces; full decorative geometry is capped by detail settings. Do not use the full visual model as a physics mesh.
