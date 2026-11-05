# AvenLab map pieces

This pack contains 28 individual highway modules and five stone bridge modules. The stone GLBs open as the original 120 m crossing, assembled from ten placements. Open **stone/stone_bridge.lod0.glb** to inspect the finished bridge. Open any **highway/** piece folder for an individual road segment.

## Placement

- All GLBs use meters and Y up. A road piece's local origin sits at the center of its inlet, on the driving surface. The stone span runs along local −Z. The highway sections generally start along +X and curve according to their actual geometry.
- **catalog.json** records the drawable node, three visual files in near/mid/far order, one collision file, local bounds, and the measured socket positions, widths and headings. Align an inlet with the previous outlet by matching position and heading. Both heading vectors point in the direction of travel.
- The stone library shares five meshes and one texture set per LOD. For an individual piece, select the named mesh node from the catalog and reset its preset translation before placing it. Use the same local transform for the matching collision node. For the complete bridge, load the scene as authored or use the listed preset transforms once.
- The highway kit includes 12 m wide roads, roughly 4.64 m narrow sections, and ramps that taper from 6 m to 4.64 m. Match socket widths. Source group IDs distinguish pieces with different elevations and supporting structures. The stone road is about 11.55 m wide.

## Rendering and collision

Load one visual LOD per instance. LOD0 retains more close detail, LOD1 reduces the mesh for mid-distance, and LOD2 is the far mesh. The stone uses 1024, 512 and 256 px versions of the original color, normal and roughness/metalness maps at the three levels. Highway colors are fallback materials because the FBX referenced external images. UVs are included for future material replacement.

Collision GLBs are physics-only. Build fixed indexed triangle meshes from their POSITION and index buffers. Keep collision independent from visual LOD and exclude collision nodes from the visible scene. On the highway, the driving surface follows the source deck, including curves and grades. Structural rails, walls and supports use simplified collision geometry. Markings and lamp fixtures are visual only. The stone spans retain the source arch contours, with lighter pedestal collision meshes.

The stone pieces and assembled preset carry **destructible = false**. This is an asset catalog flag for the future map integration. World Builder registration, runtime LOD selection and gameplay damage handling are deferred.
