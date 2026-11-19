# Vehicle assets

`catalog.json` is the shared path registry. Runtime model loading uses `src/vehicles/assetCatalog.ts`. Vehicle IDs are stable gameplay identifiers; folder paths are presentation details.

| Group | Subgroups |
| --- | --- |
| land | sports-cars, compact-cars, suvs, pickups, police, specialty, armored |
| flying | jets, helicopters, drones |
| fleet | carriers, destroyers, battleships |
| boats | speedboats, patrol-boats, utility (reserved; no boat GLBs yet) |

Each vehicle lives at `<group>/<subgroup>/<vehicle-id>/`:

- `model.glb`: primary authored visual; for aircraft/ships this is the previous LOD0.
- `lod-near.glb`, `lod-medium.glb`, `lod-far.glb`: only tiers actually available. Car near shells are lighter exterior-only meshes, distinct from the full cockpit/animated model.
- `docked.glb`: fixed-world variant where available (Big E).
- `source-draco.glb`: preserved source candidate, not a runtime LOD (TU222).

LOD selection consults the registry. When a tier is absent, the shared loader returns the primary model; it never requests a fabricated filename. Fleet art's existing seed fallback and distance policy are unchanged. Do not rename gameplay IDs, collider piece IDs or physics profiles when moving visual files.

To add a vehicle: create its family/subgroup/ID folder, register its actual primary/LOD/variant URLs in the catalog, and then register gameplay or world-editor behavior separately. Assets do not become playable merely by existing in this directory. Keep all GLBs in Git LFS.

The manifests under `flying/` and `fleet/` preserve source provenance and preparation measurements. Their URLs refer to this layout. Physics colliders remain in the server catalog, separate from visual LODs.

Land LOD bake: `python scripts/bake-vehicle-lods.py frontend/public/models/vehicles frontend/public/models/vehicles --models brz` (run from repository root; see script dependencies). Flight export: pass `--output-dir frontend/public/models/vehicles/flying` to `prepare-flight-models.py`.

## Source and texture residency audit

From the repository root, run `node frontend/scripts/audit-asset-residency.mjs > performance/reports/asset-residency.json`. The audit reads character and vehicle catalogs plus local GLB metadata. It records installed files, LFS pointers and optional missing paths separately, with file/image SHA-256, encoded bytes, dimensions, material references, UV channel names, and declared/currently available preview tiers. It does not fetch, export, resize, evict or edit production assets.

Texture figures are **logical RGBA8 plus a complete mip chain**, not browser memory or measured VRAM. Inventory groups overlap and are not loaded together. Encoded image duplicates are byte-identical payloads; equal pixels with different encodings are not deduplicated. The per-asset `defaultSources` and `preferWebP` profiles select one image alternative per material-referenced texture definition. For example, the installed BRZ embeds 24 PNG/JPEG/WebP images but selects 12 for either profile; counting all 24 as simultaneous uploads would double the estimate.

Audit at `25988e1`:

| Installed asset scope | Finding | Follow-up |
| --- | --- | --- |
| Underbust vest, original cut and tucked, garage/mobile | Every variant carries the same 16 image payloads, including a 3072 × 3072 facing map and 2048 × 2048 normal map; each image inventory estimates 77,595,156 bytes with mips. Mobile reduces geometry but leaves these image sizes unchanged. | Add a reviewed texture budget to their derived mobile export and verify normal/cloth detail visually. Keep editable sources. |
| Installed Vesper base actor | Portrait has 19 maps at 768 × 768 (59,768,680 logical bytes with mips); garage has 19 maps at 512 × 512 (26,563,900 bytes). Portrait also has more metadata triangles and is the usual base actor in `GarageDriver`, including desktop previews. | Reconcile the tier names and export budgets while preserving the original face/rig geometry. Do not swap in the simplified garage actor solely because its file is smaller. |
| Four active Gothic garage bundles | 17,578,695 encoded image bytes across 86 image entries; only 5,952,915 bytes across 29 unique payload hashes. | Prefer existing compatible standalone pieces, then investigate shared image ownership before changing packaging. These figures describe a catalog pool, not one outfit. |
| Imported garment tiers | 33 of 66 active entries declare mobile URLs. This selective checkout has 4 of those files installed and 29 as LFS pointers. All five separate Gothic skirts have no mobile URL. | Distinguish missing local LFS hydration from missing tier definitions; verify deployed artifacts separately. |
| Land vehicle tiers | 15 of 16 catalog entries declare distinct near/medium/far exteriors; `supra-1998` falls back to its main model. Only BRZ and AE86 full sources are hydrated here, and all 45 declared reduced land files are LFS pointers. | Hydrate representative tiers before a geometry/texture audit. Exterior tiers do not replace the local cockpit rig. |

### Ownership and future hair/pose imports

`GarageDriver` retains previously requested source URLs for its mounted character, while drei's URL loader cache also retains parsed GLTF results. `fleetAssets` counts users but currently keeps loaded art after the count reaches zero. Fitted character instances already dispose their own geometry, materials and skeletons; source texture retention is a different ownership layer. The bounded fitting snapshot cache is not a texture budget. The generated showroom path releases renderer resources when its exclusive stage unmounts but deliberately keeps decoded source data cached.

Any future eviction or shared-texture package needs explicit references from active and previous previews, pending loads, fitted clones, animation users and URL/fleet loader caches. Current fit-cache scopes are source-independent identity objects and cached inputs/outputs are copied; preserve that contract. A material clone can still share source textures. Preserve color space, sampler, UV transform and transparency semantics when considering image sharing; matching a file hash alone does not establish interchangeable Texture objects. Hair imports must publish the same source/instance ownership contract, and pose imports must preserve skeleton/clip identity while a preview or mixer uses it. No hair or pose branch changes are made by this audit.

Keep authored Blender/GLB parts separate from derived production outputs. Current full-vehicle static grouping runs after steering/door extraction and protects movable parts; the Heroes builder prunes/compresses rather than baking these groups. Moving that work offline requires equivalent protected-part and original-triangle binding evidence. Existing role-batched fleet exteriors remain the established reduced-vehicle path. Aggregate priorities and browser measurement gaps live in [the performance README](../../../../performance/README.md).
