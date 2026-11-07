# Placeable special garage

modelCatalog.ts / modelRoles.ts define approved garage masks and measured structure. garageLoader.ts owns the local Draco loader. ModelMeshes.tsx shares cached geometry and selects full/proxy detail; ModelInspector.tsx toggles modules.

## How to edit

The selection garage is garage_special.glb. Keep the open bay/driveable floor clear. Export/regenerate placement-colliders.json using scripts/build-placement-colliders.mjs. Distant structural proxies use measured faces; full decorative geometry is capped by detail settings. Do not use the full visual model as a physics mesh.


## Commercial building library

Commercial building GLBs live in categorized subfolders under `frontend/public/models/buildings/commercial/`. Pulling the feature branch adds the catalog loader, category routing, collision builder, and preview integration. Copy the separate commercial asset archive into that folder, then run `python scripts/build-commercial-buildings.py` from the repository root to generate `avenlab-server/src/assets/models/commercial-buildings.json`.

The generator records source hashes, center-bottom pivots, meter bounds, collection labels, and floor/wall/roof triangle groups. The editor uses the existing lazy cached portrait renderer. The selection-garage catalog remains separate. Bridge and tunnel GLBs belong in the road catalog because they need road-specific surfaces and scale validation.
