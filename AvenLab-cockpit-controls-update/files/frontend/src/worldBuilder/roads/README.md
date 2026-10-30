# Measured road pieces

roadCatalog.ts owns approved source revisions/role masks. roadGeometry.ts transforms measured triangles. layoutSnapping.ts prioritizes corners then edges with snap locks. roadPair.ts creates carriageway pairs. RoadInspector.tsx exposes sidewalk/physics options; RoadMeshes.tsx chooses visual LOD.

## How to edit

Change sidewalk variants via visible/collision roles, then verify both GLB faces and exact collision triangles. Paint/drains are decorative. Never replace measured road geometry with its bounds. Rebuild with scripts/build-road-colliders.mjs after source changes; geometry and Rust catalogs must agree.
