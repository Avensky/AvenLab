# Exact wardrobe fit reuse

`wardrobeFitCache.ts` reuses the expensive bind-space deformation in Gothic 01's inner panels, Gothic 03's covered lining, and skirt/corset tucking. Gothic 01 also supplies a vertex mask to `warpWardrobeGeometry`, so outer and unselected vertices skip both the initial warp and the six normal-derivative samples. The accepted fit constants and selected-vertex calculations stay unchanged.

## Bounds, keys, and ownership

The shared cache retains at most **12 entries and 16 MiB**. Its byte counter includes copied input typed arrays, fitted position/normal/tangent typed arrays, and two bytes per input-layout character. Small JavaScript objects and bounding-box/sphere metadata are bounded by the entry limit but are not included in that byte counter. These limits cover retained cache data, not the currently displayed models or temporary allocations while computing a miss. The least recently used entry is evicted when either bound would be exceeded. An individual oversized fit is computed and returned without being retained.

Each caller has its own module-local scope object and supplies any runtime fit variant; corset tucking includes the hem-extension flag. The key checks ordered target/support geometry lists, topology, draw ranges, raw input bytes, attribute types/layouts, and target position morph data. Target position, normal, and tangent inputs and support position inputs are included. A fast hash filters candidates, then the full layout and every input byte must match. Direct array edits invalidate the cache even without `needsUpdate`. Different body or garment tiers can share only when those exact fit inputs agree. Module reloads create fresh operation scopes, avoiding reuse across changed fit implementations.

The cache retains **CPU snapshots**, without retaining renderable geometries, source models, skeletons, or compute callbacks. Every hit clones the current source geometry and restores only fitted positions, normals, tangents, and bounds. Current UVs, skinning data, groups, and other attributes stay with that source. Materials and palettes are outside the cache. A model owns its returned geometry and can dispose it without affecting later instances. Corset fitting releases its temporary extended/tucked geometries before returning an independently owned final clone. Evicting or clearing the cache releases CPU snapshots; no GPU disposal is needed.

This helper is for topology-preserving deformations with the dependencies described above. A new operation that changes topology or depends on UVs, material values, skinning, or other metadata must extend the key/output contract before using it. Compute callbacks must preserve their source geometries. The current callers satisfy that contract.

## Measured preparation cost

The following run compared accepted commit `0e81afeab830870989492bc69d52dfac17c0a23c` with the optimization working tree. Both used identical preloaded GLB geometry, Node v24.22.3, and an AMD EPYC 9V74 CPU, with other build/test work paused. Each row has eight measured rounds after warmup; the baseline ran before and after alternating optimized pairs. The reported statistic is the **upper middle sample** of eight (the harness's `median` field). Units are milliseconds for `prepareVillager`; applying the look is measured separately in the JSON output.

“Cold” clears only this bounded cache before preparation. “Warm” immediately prepares the same outfit again. Asset download, texture decode, browser rendering, shader compilation, and GPU frame time are outside this measurement.

| Tier | Outfit | Accepted | Cold | Warm |
| --- | --- | ---: | ---: | ---: |
| Garage | Gothic skirt 01 | 153.93 | 65.15 | 38.69 |
| Garage | Gothic skirt 03 + corset 03 | 196.98 | 207.73 | 37.95 |
| Garage | Gothic skirt 05 + corset 05 | 1,031.97 | 1,058.76 | 54.95 |
| Garage | Gothic skirt 02 + corset 02 | 398.09 | 408.37 | 42.93 |
| Garage | Regular skirt 03 + corset 05 | 67.74 | 73.46 | 30.54 |
| Garage | Bundled Gothic 01 | 1,201.83 | 775.00 | 119.50 |
| Portrait | Gothic skirt 01 | 182.59 | 62.45 | 36.70 |
| Portrait | Gothic skirt 03 + corset 03 | 210.21 | 211.79 | 41.91 |
| Portrait | Gothic skirt 05 + corset 05 | 826.41 | 839.16 | 44.14 |
| Portrait | Gothic skirt 02 + corset 02 | 342.80 | 315.52 | 44.61 |
| Portrait | Regular skirt 03 + corset 05 | 53.89 | 54.21 | 17.68 |
| Portrait | Bundled Gothic 01 | 546.62 | 389.50 | 97.97 |

The measured retained snapshots ranged from 0.66 to 5.62 MiB per tested outfit. The cache is deliberately bounded; this does not mean all twelve outfits remain resident together. Some cold paths add snapshot/copy overhead. First-time or evicted corset combinations can still take about a second, and warm preparation can still exceed a frame budget. These results describe outfit-selection CPU hitches, not gameplay FPS.

## Verification and reproduction

From `frontend/`, with the Git LFS character assets materialized:

```sh
AVENLAB_WARDROBE_REQUIRE_ASSETS=1 node --test tests/wardrobe-fit-cache.test.mjs tests/gothic-skirt-layers.test.mjs tests/gothic-handkerchief-panels.test.mjs
node scripts/benchmark-wardrobe-fit.mjs --baseline 0e81afeab830870989492bc69d52dfac17c0a23c --samples 8 --output /tmp/wardrobe-fit.json
```

The focused suites passed eight tests with no skips. The twelve fixture looks above match the accepted commit's SHA-256 signatures on both cold and warm preparation: mesh names, draw ranges, groups, all raw geometry attributes and their layouts, and raw indices. Unit checks also cover direct input mutation, UV/skinning independence, interleaved arrays, per-model ownership, byte/entry eviction, and skipping unselected warp samples. Bounds are checked separately in the cache unit test; the asset signature excludes UUIDs, GPU counters, and bounding caches.

## Remaining issues

This change preserves the accepted fitting result, including existing regular-skirt/corset contact failures and remaining fabric/close-up visual issues. It does not rebuild skirt textures, change skirt 02/05 placement, or alter animation clearance. The central readiness grid tracks those work items separately. GPU performance, rendered appearance, and visual fit still require their browser/device gates; these CPU and geometry checks do not establish those passes.
