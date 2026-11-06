# Vehicle asset grouping patch

This update follows the Component Style First Pass patch (f476f07). It moves 92 existing GLBs into 30 per-vehicle folders under `frontend/public/models/vehicles/`, grouped into land, flying, fleet and reserved boats families. Every move preserves the exact file bytes, including Git LFS pointers. No collider hashes, vehicle identifiers, physics profiles or component rigging change.

`catalog.json` is the shared source for runtime primary models, remote LODs, selection portraits, editor vehicle placements, naval world props and the rescue scene. Original full car models remain distinct from their near exterior shells. Aircraft/ship LOD0 becomes `model.glb`; only actual reduced tiers are registered. Missing tiers resolve to the primary visual. Big E's docked variant and TU222's compressed source stay alongside their parent model.

The car LOD baker reads the catalog; aircraft exports now use family/subgroup/vehicle folders. Source manifests and their validation paths are updated. Boats have documented reserved subgroups; no placeholder models or gameplay classes are invented.

## Install

Extract the complete ZIP anywhere, including Downloads. Run `Update-AvenLab.cmd` and enter your repository path, or pass it as the first argument. Git is required. Install the Component Style First Pass code patch first; the separate standardized GLB exports from that package are not required.

The installer checks the entire patch before applying it and stops on incompatible local edits. It moves your existing GLBs rather than bundling replacements or downloading models. It does not commit or push your repository. Restart Vite after installation so the new public paths are used. A previously deployed web build must be deployed together with its matching public assets.

## Verification

- All 92 moved GLBs compared byte-for-byte with their original files.
- Catalog covers every vehicle GLB exactly once, with valid group/subgroup paths.
- Every existing cold-join vehicle retains its three LOD tiers.
- Fleet/flight manifests resolve to catalog entries; renderer and preview references use the shared catalog.
- TypeScript and the Vite production bundle checked.
- Python exporter syntax checked; exporters were not re-run because this is a path-only refactor.

64 vehicle GLBs are currently LFS pointers in this workspace; their binary rendering was not re-tested. Their tracked identities and files are preserved, so this move does not need the missing downloads. Windows CMD execution and live gameplay were not tested here.
