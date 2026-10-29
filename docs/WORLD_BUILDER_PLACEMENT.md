# World workshop: previews, garage prefab and editor preferences

Base commit: `0af4c64e87fd86ef618dd2fabae78f415b969bd9`.

## Authoring workflow

- The right sidebar's **Editor theme** offers **Dark navy** (default), **Hacker blue**, and **Forest**. It changes the editor UI, grid and preview background. The preference survives reloads and does not modify map data or asset materials.
- Every library piece has a **Preview** button. The preview supports orbit/zoom, collision surfaces, and a garage roof cutaway. **Place this piece** enters the normal placement tool. The preview does not mutate an existing object or the layout.
- The library now includes **Selection-screen garage**, the actual `garage_special.glb`. The existing procedural **Open garage** is also available.
- Select a placed object and use **Focus in world** or **F**. **Fit layout** returns to the whole district. Source previews show the original prefab; instance switches remain in the inspector.
- A **200 m chunk guide** outlines four 100 × 100 m quadrants in Perspective and Plan. It is an authoring reference for rebuilding the old 2×2 chunks; it does not crop, scale, duplicate or create physics geometry.
- Garage floor, walls/pillars, roof/ceiling, and decorative fixtures have visibility controls. Floor, walls and roof have independent collision controls. A hidden structural group has no physics. The whole object can be decorative.
- Layout save/load, undo/redo, duplication, locking, sizing, rotation, magnetic edge/corner snapping, Plan and controller menu navigation continue to use the normal editor path.

## Drive it

Choose **Workshop Yard** in Sandbox setup. It contains the garage, an explicit apron, and a narrow road with its adjacent sidewalk removed. There is no hidden ground plane. A real BRZ simulation test drives from the room, through the open bay, over the apron and onto the road.

The garage uses the selection scene's 0.06 display scale and the top of `Plane_PISTE` as its floor anchor. Its real structural footprint is about 18.749 × 18.749 m. The full structural height is 9.454 m including the foundation below the pad; the editor position stays at pad height. Resizing and yaw apply once to both visual and collision data.

**Export map** writes an installable server map. Copy it to `avenlab-server/src/assets/blocks/<map_id>_colliders.json`, rebuild/restart Rust, and start a new session. Browser drafts are separate from the installed multiplayer map. A finite garage-only layout gets team spawn points on its display pad; edit those exported spawn points for the final map.

## Structure and decorative detail

The source GLB has 460,866 visual triangles. Physics uses 414 source triangles in three shared static meshes. These are not a box around the building.

| Source geometry | Collision role |
| --- | --- |
| `Plane_PISTE`, horizontal low faces of `BASE_Full` / `BASE_SOL` | Floor and substrate |
| Remaining `BASE_Full` / `BASE_SOL` faces, `03 Piler` | Walls and pillars |
| `PLANE_Plane` | Roof slab |
| Floor tile dressing, tube racks, lights, signs, rims and ceiling dressing | Visual detail |

The source floor substrate remains a few millimetres below the beveled visual tiles. Those tiles are deliberately decorative; baking every bevel into vehicle physics would add unnecessary collision detail. The pad, shell and pillars retain their source geometry, and the room is never filled with an enclosing collider.

The extractor and renderer share node-role rules. Multi-material GLTF nodes retain their parent authoring-node identity, so visibility masks do not leave child primitives behind. Visual geometry/materials are cached across placements. The preview renders on demand while idle. A private cached garage GLTF loader prevents concurrent road loads from replacing its Draco configuration. Runtime uses the bundled `/draco/` decoder; the offline preview embeds it.

## Regenerate after editing the garage

Normal dev/build checks the source hash against the committed collider catalog and needs no new runtime dependencies. To regenerate after an asset edit, use the repository's existing asset tooling:

```sh
npm ci --prefix scripts/city-lod
npm --prefix frontend run build:prefabs
```

This updates `avenlab-server/src/assets/models/placement-colliders.json` and the Workshop Yard fixture. Old placements with a different source hash are rejected until updated. Original GLBs remain unchanged.

To reproduce the offline preview:

```sh
node scripts/build-world-placement-preview.mjs frontend AvenLab-world-placement-preview.html
```

## Next priorities for rebuilding the city

1. **Multi-select, groups and reusable block/chunk prefabs.** Save a completed block once, stamp it, and update repeated instances deliberately.
2. **Surface height and structural socket snapping.** Place on floors/roofs and connect doors, walls, roads and ramps at explicit anchors.
3. **Spawn editing and a controlled playtest cycle.** Place team starts in the editor, validate clearance, and test an installed draft without manual JSON editing.
4. **Chunk validation and export.** Report open road joins, unsupported pieces, accidental overlaps and missing collision groups; package chunks for the streaming loader.
5. **Prefab visual LODs and draw-call budgets.** The garage's visual dressing is still full detail; large repeated sets need LODs and instancing before scaling to a whole city.

The new garage is a reusable asset placement. This patch does not automatically split or rebuild the old merged 2×2 city GLBs.

Use [the release checklist](WORLD_BUILDER_RELEASE_CHECKLIST.md) to install and verify this patch. [The next-update brief](WORLD_BUILDER_NEXT_UPDATE.md) scopes a road/jump proving map first, then the chokepoint creator and the later chunk-rebuilding workflow. Those are planned follow-ups; the checklist records what this patch actually includes.

## Validation

Frontend build/lint passed; 243 frontend tests passed with two unrelated missing-vehicle-asset skips, and all 93 Rust tests passed. Browser checks compare the 414 rendered structural triangles with the physics catalog, then exercise preview/cutaway, controller close, placement, masks, themes/reload, export, chunk guide and mobile sizing. The offline preview makes no HTTP requests.
