# Road kit foundation — source meshes, groups and snapping

This is the focused road-authoring workbench built from the three supplied GLBs.
It does not replace World workshop or install new collision geometry into Rust.
The standalone HTML embeds the original GLBs and Draco decoder, so it works
offline without a server. The source files remain unchanged.

## Group sidewalks inside the same GLB

Use an Empty named `Road_Module` as the parent. Preserve the following exportable
object hierarchy; Blender Collections alone are not the group contract:

| Parent | Children |
| --- | --- |
| Road_Module | Road_Surface, Road_Markings, Sidewalk_Left, Sidewalk_Right, Road_Details |
| Sidewalk_Left | Curb, Paving |
| Sidewalk_Right | Curb, Paving |
| Intersection's Road_Module | Road_Surface, Road_Markings, Sidewalk_NW, Sidewalk_NE, Sidewalk_SW, Sidewalk_SE, Road_Details |
| Each intersection sidewalk corner | Curb, Paving |

Keep individual tiles as children rather than joining the entire kit into one
mesh. A runtime side toggle then selects both the curb and paving and removes
both from the collision selection. Local Left/Right stays stable as a road is
rotated; which side is inward depends on the neighboring block. In the supplied
wide road the longitudinal axis is X, so local Left is −Z, with +X as the chosen
reference forward. The workbench rotates this file by 90° for a common −Z
forward inspection frame. The grouped GLB copies preserve their original axes.

## What the files actually contain

These are long, multi-object strips, not three equally sized grid pieces.
Measurements below use decoded vertices at import scale 1.0, in metres:

| File | Original objects | Asphalt width × length | Full sidewalk footprint |
| --- | ---: | --- | --- |
| road_narrow.glb | 127 | 25.2002 × 239.9997 | about 55.2501 × 240.125 |
| road_wide.glb | 90 | 44.1877 × 120.0010 in the normalized frame | about 72.3751 × 120.7318 in that frame |
| intersection.glb | 11 | 57.4983 × 72.5001 in its original X/Z frame | overall model about 57.5002 × 72.7714 |

Small differences between accessor bounds and decoded vertices come from the
compressed export. The workbench measures the decoded geometry. Sidewalk height
is approximately 0.20 m above asphalt. `Sidewalk_01` identifies the paving
primitive; `Sidewalk_02` identifies the curb primitive. Each side currently has
multiple separate tiles: 16 per side on the narrow strip and 8 per side on the
wide strip. Narrow asphalt tiles and sidewalk tiles have different end positions,
so a future length editor should cut/tile both at shared connector planes.

The wide file already paints arrows in opposing directions. Traffic intent,
painted markings, sidewalk visibility and collision selection are separate
properties. Changing a traffic-intent field does not repaint arrows or enforce
vehicle movement. Use separately controlled marking objects for later lane
variants.

## Use the workbench

- Inspect any original asset and toggle the left/right sidewalk, or each
  intersection corner. A sidewalk control includes both curb and paving.
- Mesh collider preview uses the source road, curb and paving triangles. It
  retains rounded corners and gaps; an outer bounding frame is only a snap guide.
  Road paint and small drain details are excluded from collision candidates.
- Build opposing pair creates a second copy rotated 180° and removes the two
  adjacent sidewalk groups. Choose the asphalt frame to join carriageway edges.
  Hiding sidewalks while leaving road centers at their old outer-footprint
  spacing would leave an empty median; the placement must change as well.
- Drag the orange copy toward the blue copy. Nearby corners take priority;
  matching edges can lock while sliding longitudinally. A held target releases
  at 1.5 times its engagement radius to avoid flicker. Only the visual preview is
  eased; release commits an exact pose. Escape, blur and pointer cancel restore
  the drag's starting pose.
- Snap bottom corners demonstrates the lower-right/lower-left join exactly.
- Block interior computes a rectangular clear lot between four road centerlines
  using the inward paving boundary. The diagram covers straight frontages. It
  does not generate an intersection layout or claim to solve curved lot corners.

The geometric snap helper is independent of GLB loading and can also be reused
for rectangular structure footprints. It rejects candidate positions that overlap
the selected snap frames. It does not yet validate mixed-width road ports or
infer a full road network from meshes.

## Collision export is an authoring format

Export collision template downloads `avenlab-road-collider-template`, version 1.
It records the source hash, normalization, enabled groups, traffic intent,
corner frames and source triangle positions/indices. Hidden sidewalk parts are
absent from the export. The original asset floor becomes Y=0 in this template;
a future runtime loader must add the map road elevation exactly once.

This is a **static triangle surface** template, not a solid extrusion or an
existing schema 2 map file. The current Rust World workshop loader supports
boxes/wedges and does not consume this format. Connecting these triangles to
Rapier, validating street-to-intersection seams, and instancing the grouped
materials in the full city renderer are the next integration work. Grouping
alone does not reduce draw calls.

## Grouped copies

`scripts/group-road-kit.mjs` creates copies with the hierarchy above. It rewrites
JSON hierarchy and wraps existing material primitives; it preserves every byte
of the original GLB BIN chunk, including compressed geometry, UVs, normals,
textures and indices. Each primitive retains the source node transform. Original
and grouped world-space vertex fingerprints were independently compared through
the glTF loader and match for all 159 narrow, 106 wide and 16 intersection
primitives. The grouped files retain original coordinates and original material
definitions; normalization is a separate workbench operation.

## Rebuild

From the AvenLab repository root, with the existing frontend dependencies:

```bash
node scripts/build-road-kit-preview.mjs frontend frontend/public/models/world/road-kit AvenLab-road-kit-workbench.html
node scripts/group-road-kit.mjs frontend/public/models/world/road-kit road-kit-grouped
node --test frontend/tests/road-kit.test.mjs
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Open the generated HTML directly in a browser. The new source is separate from
the game's menu and simulation routes. The normal Vite dev entry does not inject
the embedded-asset module; use the supplied preview build command for this tool.
