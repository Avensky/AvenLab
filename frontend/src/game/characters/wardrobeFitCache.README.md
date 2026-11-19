# Exact wardrobe fit reuse

`wardrobeFitCache.ts` reuses the expensive bind-space deformation in Gothic 01's inner panels, Gothic 03's covered lining, and skirt/corset tucking. Gothic 01 also supplies a vertex mask to `warpWardrobeGeometry`, so outer and unselected vertices skip both the initial warp and the six normal-derivative samples. The accepted fit constants and selected-vertex calculations stay unchanged.

## Bounds, keys, and ownership

The shared cache retains at most **12 entries and 16 MiB**. Its byte counter includes copied input typed arrays, fitted position/normal/tangent typed arrays, and two bytes per input-layout character. Small JavaScript objects and bounding-box/sphere metadata are bounded by the entry limit but are not included in that byte counter. These limits cover retained cache data, not the currently displayed models or temporary allocations while computing a miss. The least recently used entry is evicted when either bound would be exceeded. An individual oversized fit is computed and returned without being retained.

Each caller has its own module-local scope object and supplies any runtime fit variant; corset tucking includes the hem-extension flag. The key checks ordered target/support geometry lists, topology, draw ranges, raw input bytes, attribute types/layouts, and target position morph data. Target position, normal, and tangent inputs and support position inputs are included. A fast hash filters candidates, then the full layout and every input byte must match. Direct array edits invalidate the cache even without `needsUpdate`. Different body or garment tiers can share only when those exact fit inputs agree. Module reloads create fresh operation scopes, avoiding reuse across changed fit implementations.

The cache retains **CPU snapshots**, without retaining renderable geometries, source models, skeletons, or compute callbacks. Every hit clones the current source geometry and restores only fitted positions, normals, tangents, and bounds. Current UVs, skinning data, groups, and other attributes stay with that source. Materials and palettes are outside the cache. A model owns its returned geometry and can dispose it without affecting later instances. Corset fitting releases its temporary extended/tucked geometries before returning an independently owned final clone. Evicting or clearing the cache releases CPU snapshots; no GPU disposal is needed.

This helper is for topology-preserving deformations with the dependencies described above. A new operation that changes topology or depends on UVs, material values, skinning, or other metadata must extend the key/output contract before using it. Compute callbacks must preserve their source geometries. The current callers satisfy that contract.

## Temporary coverage for cold fits

`wardrobeCoverageUnion.ts` combines the active skirt triangles into one temporary BVH for `gothicCorsetTuck.ts`'s exact nearest-distance queries. Each ray searches the same triangle union once. The fit still uses the same ray origin/direction, double-sided intersections, near/far limits, and deformation calculations. The existing `wardrobeCoverageSurface` API and all its other consumers, including height-filtered coverage, remain unchanged.

The helper copies packed, unnormalized Float32 positions and active triangle indices into independently owned buffers. It respects draw ranges, ignores empty/unindexed parts, and never reorders or disposes source geometry. Higher-precision, normalized, interleaved, or unsupported layouts use the existing separate-surface path without conversion. Single-surface input also keeps that path. The union is distance-query geometry: original per-part face/material identities are not an output contract.

Additional union allocation is guarded before large buffers are created: at most **64 input parts** and a **2 MiB raw-buffer allowance**. That allowance counts copied positions, Uint32 indices, and conservative construction/packed-BVH bounds storage: at most two nodes per triangle, 32 packed bytes plus six Float32 bounds per construction node, six Float32 triangle bounds, and one six-Float32 scratch buffer. JavaScript metadata is bounded by those part/triangle limits but is not included in the byte counter. Larger inputs fall back to ordinary separate coverage. The allowance does not bound existing source models, the fallback's normal coverage costs, or the separate 16 MiB result cache.

The BVH uses the library's default split strategy. The fit releases every temporary surface geometry in `finally`; no union is retained across fits or model instances. Unit tests compare exact nearest distances at triangle seams, coincident faces, near/far boundaries, clipped/empty input, and fallback cases, and check source ownership. All twelve accepted geometry fixtures also pass with this path active.

The table below records the earlier result-cache pass. Compare the subsequent cold-fit union against `a0468bd` with the same benchmark harness; final comparisons belong in the repository's [performance notes](../../../../performance/README.md). These are preparation costs, not a GPU/FPS result.

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
node --test tests/wardrobe-coverage-union.test.mjs
node scripts/benchmark-wardrobe-fit.mjs --baseline 0e81afeab830870989492bc69d52dfac17c0a23c --samples 8 --output /tmp/wardrobe-fit.json
node scripts/benchmark-wardrobe-fit.mjs --baseline a0468bd --samples 8 --output /tmp/wardrobe-cold-fit.json
```

The focused suites passed eight tests with no skips. The twelve fixture looks above match the accepted commit's SHA-256 signatures on both cold and warm preparation: mesh names, draw ranges, groups, all raw geometry attributes and their layouts, and raw indices. Unit checks also cover direct input mutation, UV/skinning independence, interleaved arrays, per-model ownership, byte/entry eviction, and skipping unselected warp samples. Bounds are checked separately in the cache unit test; the asset signature excludes UUIDs, GPU counters, and bounding caches.

## Remaining issues

This change preserves the accepted fitting result, including existing regular-skirt/corset contact failures and remaining fabric/close-up visual issues. It does not rebuild skirt textures, change skirt 02/05 placement, or alter animation clearance. The central readiness grid tracks those work items separately. GPU performance, rendered appearance, and visual fit still require their browser/device gates; these CPU and geometry checks do not establish those passes.

Repeated exact positions at split vertices permit sharing the expensive warp/Jacobian calculation while still transforming each authored normal/tangent independently. The historical audit below supplies duplicate-rate evidence; the following implementation section records the bounded local reuse and its measured benefit.

## Preparation audit at `25988e1`

This is the historical audit snapshot. Its first recommendation is implemented
by the local memo described below; the other follow-ups remain open.

[`audit-character-preparation.mjs`](../../../scripts/audit-character-preparation.mjs) counts preparation work through in-memory diagnostics without editing runtime sources. Reproduce the [recorded count report](../../../../performance/reports/character-preparation-2026-11-18.json) from `frontend/`:

```sh
node scripts/audit-character-preparation.mjs --mode counts --include-default-desktop --output /tmp/character-preparation.json
```

This run checks the twelve accepted fixtures cold/warm, then two ordered sweeps of those twelve looks without clearing the cache. All 48 preparations match their accepted geometry signatures. Exact-position tracking is limited to 50,000 positions per warp and 200,000 per preparation. Keys preserve signed zero and exclude nonfinite coordinates or unsupported getters. No recorded case hit those limits or exclusions. Copy-byte counts are cumulative traffic, not retained memory or CPU time; repeatable rays describe potential avoided work, not an implemented speedup. No new timing or GPU result is claimed.

### Input scope and production-route check

The accepted `garage` fixtures explicitly use the garage base actor. Normal desktop `GarageDriver` uses a portrait base actor with garage garment/corset tiers unless displaying a victory. The old full-garage fixture timings therefore do not measure that exact production route.

One additional, separately reported High Collar case uses `villagerModelUrl`, `resolveWardrobePreview`, and `ReadyVillager`-equivalent preparation options for the default desktop route. It resolves the portrait actor, separate Gothic skirt 05, garage High Collar corset, and Vesper body donor. Its cold/warm geometry matches a fresh oracle generated in a separate, untouched-current-runtime context before diagnostic hooks are installed. This oracle is specific to `25988e1`; it is not an addition to the accepted `0e81afe` fixture set or visual approval. Its 505,709 cold rays and 171,292 potentially repeatable rays confirm that the main fitting finding applies to the actual selected inputs.

The report includes the audit-tool/fixture hashes, individual counting-module hashes, resolved source paths, and SHA-256/byte counts for all 17 loaded GLBs. Other transitive runtime code is identified by the recorded commit rather than individual hashes. Geometry signatures cover attributes, indices, groups and draw ranges; they do not establish texture quality, animation correctness, browser timing, or GPU memory. Changing the base actor requires reconciling ordered skeleton names, bind transforms, named body/face nodes, masks, and accepted arm clearance, rather than choosing a URL from file size alone.

### Ranked follow-ups

1. **Exact point/Jacobian reuse within a stable bind-space warp.** Gothic 02/05 have the strongest counted opportunity: 204,952/171,292 potentially repeatable rays in the garage fixtures and 133,843/129,864 in portrait, roughly 34–38% of total cold rays. The default desktop High Collar case has 45,557 tucked vertices but 29,033 unique positions; 37,452 of 93,300 derivative shape evaluations repeat prior Jacobian work. Any future memo must belong to the current geometry/fit variant, retain each authored normal/tangent independently, and preserve skirt-specific hand clearance. A bounded prototype must establish actual time savings before production changes.
2. **Cache pressure and admission/representation.** In the deliberate twelve-look mixed-tier sequence, the second sweep records 2 hits and 14 misses across fitting operations. Peak retained cache data is 16,770,416 bytes and 11 entries, within existing bounds. This is a stress sequence, not observed user browsing behavior. Investigate which expensive fits to retain and how to reduce exact snapshot duplication before increasing mobile memory limits.
3. **Warm copy and verification work.** The default desktop High Collar repeat clones 20 geometries covering 9,697,130 input bytes, hashes 3,694,484 input bytes and confirms the same number by exact comparison, and still performs 37,629 skirt-shape evaluations plus 10,560 rays. Profile these costs before changing clone or verification rules; model ownership, disposal, skinning and mutable shading data remain requirements.

Further generic BVH reuse is a lower priority for the High Collar case: only one exact repeated BVH input appears cold and none warm. Counts include first-encounter setup within the stated case order; existing module/source caches remain in-process, so the first-use clone counts are not equivalent to the warmed cache-cold timing intervals in earlier reports. Hair and pose contracts are unchanged by this audit.

## Exact reuse during one geometry warp

`warpWardrobeGeometry(shape, selected?, { reuseExactPositions: true })` uses
`wardrobeWarpMemo.ts` to reuse exact point results and the three post-subtraction
derivative vectors. The sole production opt-in is `seatHem` with `followFolds`.
Profile-only tucking, other warp callers, and the persistent fit-cache budget
retain their existing behavior.

The opt-in contract is strict: the callback must fully write and return its
target, be deterministic for exact XYZ while supporting data stays fixed, and
not mutate the source. It must not depend on invocation count or prior target
contents. Each returned `warp(source)` call creates its own table, so another
part, a changed source array, a different variant, or a later invocation cannot
reuse stale data. `seatHem`'s supporting profile arrays and coverage BVHs remain
fixed during that call; its ray is overwritten scratch state.

The table stores 15 Float64 values per entry: input XYZ, output XYZ, and nine
derivative components. Hash collisions are checked with exact values, including
signed zero. Each vertex still reads and transforms its own normal and tangent
in the original arithmetic order; tangent handedness, UVs, skin data, source
geometry, and result ownership are preserved. Intermediate values are never
rounded into Float32 before shading calculations.

At most 30,000 entries and 16 probes are permitted. Typed arrays consume at most
3,892,168 bytes per table, including its 24-byte scratch key. Native standard
BufferAttribute/InterleavedBufferAttribute position getters are supported;
custom getters, Float16 decoding, unsupported item size/count, nonfinite keys
or point results, and exhausted admission/probe budgets compute normally.
Nonfinite derivatives are recomputed rather than stored. A valid cached point
can later acquire a Jacobian when required. No table is retained by a fitted
model or the persistent cache. This is a per-table buffer limit, not a measured
heap peak; unreferenced buffers may await garbage collection.

### Evidence and remaining work

Against published `25de3c1`, the actual desktop Gothic 05 + High Collar case
reduces median cold preparation from **1,083.21 to 757.04 ms (30.1%)**. Its warm
medians are 45.36 and 45.08 ms. The four accepted Gothic 02/05 tier cases reduce
cold medians by 27.5–36.0%. Small warm/control differences are not claimed as
improvements; portrait Gothic 05 warm is 39.70 → 42.62 ms in this single run.
The [performance README](../../../../performance/README.md#third-pass-exact-fitting-reuse--2026-11-18)
and [raw timing report](../../../../performance/reports/wardrobe-warp-reuse-timing-2026-11-18.json)
provide input scope, alternating order, distributions and reproduction commands.

Actual desktop cold rays fall from 505,709 to 334,417. That fit uses five temporary
tables, with 6,044,997 cumulative buffer bytes and a largest table of 2,870,202
bytes; all recorded inputs fit without admission/probe fallback. Warm cases
allocate no table. The updated count tool observes vertices before lookup and
counts actual executed shape calls, cache hits, fallback and table allocation;
it does not infer a timing benefit from those counters.

Eleven focused warp tests plus twelve existing fitting/coverage/layer/panel
tests pass. The all-fixture baseline comparison retains accepted raw signatures
and additional morph/transform/binding/hand-room digests; input source buffers
remain unchanged. TypeScript and the production build pass. Original fixtures,
assets, skirt heights and animation policies are unchanged. Remaining cold work,
warm clone/fingerprint traffic, renderer/device validation, known regular-skirt
contact issues, and future shared-source texture budgets remain open.
