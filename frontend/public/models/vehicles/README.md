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
