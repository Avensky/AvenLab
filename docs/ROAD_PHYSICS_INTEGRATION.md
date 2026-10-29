# Measured road modules in World workshop and Rapier

Built against `40dcac6a843480404b0cbca637df324820e2cb0f` (the road LOD asset commit).

## Use it

1. Start/rebuild Rust and the frontend after applying the patch.
2. In Sandbox setup select **Road Precision Test** and start. This separate map contains a narrow opposing pair, a wide road, and an intersection. It leaves the existing Endless City definition available.
3. Press **F9** or use **World workshop** from the pause menu. The editor opens the installed server layout; changing it creates a browser draft.
4. Select a road in the scene list or viewport. Switch individual sidewalks/corners, curb collision, paving collision, asphalt collision, markings, and drains. Turning off **Physical collisions** makes the entire module decorative.
5. **Export map** writes an installable schema 2 map containing `authored_layout`, including the road asset references and masks. Put it in `avenlab-server/src/assets/blocks/<map_id>_colliders.json`, then rebuild/restart Rust and restart the session. A draft does not mutate a running multiplayer physics world.

Runtime Geometry/Collider views use the same physical triangle groups, and Hybrid overlays their wireframes on the GLB.

The main piece library includes all three GLB modules. Place, duplicate, resize, rotate, lock, undo/redo, save, import/export, and controller navigation use the same layout path as the starter pieces. With a blank layout, placing the first GLB road disables support ground and tile repetition by default. Both remain explicit project options.

**Add opposing carriageway** applies to a narrow one-way road. It rotates the duplicate by 180 degrees, disables the two adjacent *local right* sidewalks, and aligns the asphalt frames. The source direction arrows rotate with the GLB. A wide road retains its existing opposing arrows. Sidewalk masks do not decide traffic direction.

## Snapping and open space

Magnetic snapping is available in Plan, 3D translation handles, and placement. It prefers corners and then opposing parallel edges. A held target releases at 1.5 times its engage radius. Snapping uses horizontal frames at the same base elevation. It is not a curved-road solver or a whole-city collision-avoidance system.

Use **Visible outer edge** to place modules around a block, or **Asphalt · join carriageways** after disabling adjacent sidewalks. Asphalt snapping alone does not remove sidewalks. The frames are measured placement aids; the physics triangles remain the source geometry.

Turning **Support ground** off is important for road-only maps, holes, underpasses, and open interiors. The editor grid is visual and does not create a physics plane. With repetition off, export creates one fixed district, sizes its cell around the layout, and places both team spawns on the first enabled physical asphalt road. Review those spawn points for your final map. Legacy layouts that omit these options retain their original ground and repetition behavior. Overlay mode retains the installed city's physical base.

## What the attached JSON means

The `*_lod_report.json` files describe visual export results: object names, source-local bounds, triangle counts, textures, and simplification warnings. They contain no Rapier collision mesh. They explicitly say to keep one authoritative collider definition for every visual LOD. Their Blender-local bounds must not be used as runtime boxes; the intersection also has a nontrivial parent transform.

`scripts/build-road-colliders.mjs` reads the real LOD0 GLBs, composes all parent/node transforms, and extracts only:

| Source material | Physics role |
| --- | --- |
| `asphalt_01` | Road surface |
| `Sidewalk_02` | Curb faces |
| `Sidewalk_01` | Sidewalk paving |
| `MarkingRoad` | Decorative paint, excluded |
| `Sewers_01` and other details | Decorative details, excluded |

Joined intersection sidewalk primitives are partitioned into connected surfaces before corner classification. No source vertices are moved to repair gaps, smooth curves, or fill a bounding rectangle. Degenerate triangles are discarded. Runtime is Y-up metres, forward -Z; the wide road is normalized by +90 degrees around Y and the asphalt surface is centered at Y=0. The original GLBs and their textures are preserved.

Generated data lives in `avenlab-server/src/assets/roads/road-colliders.json`. The frontend imports the same file. Each placement records its LOD0 SHA-256, and both parsers reject an unknown/stale collision revision. Frontend dev/build checks the actual LFS asset hashes and generated collision catalog before starting, so an asset edit cannot silently ship stale collision triangles. Run `npm --prefix frontend run build:roads` after updating the GLBs, then update any older saved road placements. Render LOD is independent of physics. Merged visual primitives use the same material and side/corner classification. Auto detail respects the existing Fast render setting by using medium/low textures; an explicit High override remains available. Distant modules initially request only their appropriate visual LOD. Render geometry/textures are cached and shared across placements; fixed triangle BVHs are cached across repeated Rapier instances. Marking materials receive a render-only depth bias to avoid fighting with asphalt; no collider height is changed.

Rapier builds static triangle meshes with internal-edge contact correction. Object translation, resize, yaw, and chunk origin are applied once. Road references, not dense collision vertices, travel in the map snapshot. Existing vehicle raycast suspension and chassis collision groups are retained.

## Rebuild assets and test

Node 24 and the repository's existing dependencies are sufficient; no new npm or Cargo dependency is added.

```sh
git lfs pull --include="frontend/public/models/roads/**"
node scripts/build-road-colliders.mjs
node scripts/build-road-test-map.mjs
node scripts/build-road-colliders.mjs --check
node scripts/build-road-test-map.mjs --check
npm --prefix frontend run build
cargo test --manifest-path avenlab-server/Cargo.toml
```

Run frontend tests from `frontend`, because the Vite test harness resolves `/src` against the current directory:

```sh
cd frontend
node --test --test-concurrency=1 tests/*.test.mjs
```

The serial option avoids unrelated cockpit freshness/timeouts when multiple Vite/JSDOM suites compete for CPU. Verification for this patch: 239 frontend tests passed, three existing tests skipped for unrelated missing LFS assets; all 88 Rust tests passed. Dedicated tests cover source reproduction, masks, references, opposed snapping, finite district export, transformed ray heights, rounded cutouts, no hidden ground, visual LOD independence, and a real BRZ settling/driving across source tile joins.

Offline editor preview (rendering/authoring only; Rust simulation runs in the game):

```sh
node scripts/build-road-world-preview.mjs frontend AvenLab-road-physics-preview.html
```

## Accuracy boundary

These road colliders follow the supplied LOD0 mesh, including source asymmetries and small seams. This patch does not repair the source meshes or replace the existing legacy city-building boxes. The next building pass should author walls, floors, ramps, and openings explicitly; roofs and visual dressing should not inflate a single building box. The existing compound structure pieces already support decorative parts and open garages.
