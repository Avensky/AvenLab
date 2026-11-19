# Performance

These CSV files are recorded experiments, not configuration. Keep labels, car/map/route/quality/range and warmup comparable. UI changes in this update have deterministic render/sampling checks, not a target-machine FPS claim. Use docs/performance-recording.md to capture a new baseline.

## Second pass: shared buffers and repeated queries — 2026-11-18

This continues `perf/wardrobe-cache-and-gameplay-lods` and [draft PR #36](https://github.com/Avensky/AvenLab/pull/36).
The comparison baseline is the prior published branch head,
`a0468bde66c13a61fc61355da764bc7f90693d3e`. Performance, hair, and poses are the
three parallel workstreams; [branch responsibilities](../docs/readiness/README.md#three-branch-coordination)
and shared boundaries are recorded in the readiness README. This pass changes
vehicle buffer preparation, cold skirt/corset queries, and world damage selection.

### Measured results

| Measurement | Previous performance implementation | This pass | Observed change |
| --- | ---: | ---: | --- |
| BRZ unique derived geometry buffers | 33,701,266 bytes | 16,125,666 bytes | 17,575,600 bytes / 52.2% less storage |
| BRZ cold batch preparation | 105.44 ms | 69.90 ms | 33.7% lower median CPU time |
| Gothic skirt 05 + corset 05, garage cold preparation | 1,109.67 ms | 996.83 ms | 10.2% lower median CPU time |
| Gothic skirt 05 + corset 05, portrait cold preparation | 832.04 ms | 740.15 ms | 11.0% lower median CPU time |
| Shared damage-map scans in the deterministic fixture | 360 scans / 90,000 entry visits | 2 scans / 500 entry visits | Same 360 selector calls and results |

Timing comparisons use Node v24.22.3 on the same AMD EPYC 9V74 CPU and identical
installed assets, with other test/build/probe jobs paused. Both timing reports
contain eight measured samples per case and their min/max/mean. The reported
median is the upper middle value for an even sample count. These are CPU and
buffer measurements; browser frame time, GPU uploads, and VRAM remain unmeasured.

### Vehicle UV sharing

All eight UV streams are byte-identical in each of the 18 BRZ batches. The batcher
now checks exact stored bits and compatible attribute formats before copying
streams, then retains every channel name on one shared, derived BufferAttribute.
It preserves differing values, normalized formats, GPU types, component sizes,
and usage boundaries. Interleaved offsets/strides and signed-zero bits are checked.
Source buffers remain independent; live equivalent vehicle instances keep the
existing immutable shared-geometry ownership contract.

The new [comparison harness](../frontend/scripts/benchmark-vehicle-batches.mjs)
restores only the baseline batcher and uses the same material/door/steering/hinge
preparation on both sides. It alternates four unmeasured warmup pairs and eight
measured pairs. Each cold run releases the prior derived geometry; the second
instance measures reuse while the first is alive. An independent, untimed census
counts unique allocations for **both** versions, so savings do not depend on the
changed `stats.geometryBytes` accounting. Exact output signatures include every
attribute/index byte, transforms, draw ranges, groups, and mesh state.

BRZ remains at 143 prepared ranges and 204,815 triangles. Its median second-instance
preparation is 2.12 ms. AE86 remains at 46 ranges with no eligible batches or
derived allocation; both implementations take about 0.12 ms in the new harness.
Both real-asset signatures and original GLB hashes match. See the
[raw comparison](reports/vehicle-uv-sharing-2026-11-18.json) and
[vehicle ownership notes](../frontend/src/vehicles/tools/README.md).

### Cold fitting queries

Eligible cold corset fits use one temporary BVH over the active skirt triangles.
The same nearest-distance query now searches that union once; fit equations,
ray origins/directions, double-sided handling, and near/far intervals are unchanged.
Unsupported layouts or inputs exceeding 64 parts / a conservative 2 MiB packed
buffer-and-construction allowance keep the existing separate-surface path. The
union owns its copied buffers and is released after the synchronous fit. No new
persistent cache was added.

An untimed check of the **final bounded implementation** confirms that both High
Collar cases combine four surfaces into one, with 8,693 vertices and 10,758 triangles.
Their allowance calculation is 1,696,524 bytes; the returned position/index/packed
BVH buffers total 338,916 bytes. Full prepared-model hashes still match accepted
fixtures. See [path/budget evidence](reports/wardrobe-union-path-2026-11-18.json).

The [full twelve-case timing report](reports/wardrobe-union-2026-11-18.json)
separates cold preparation, warm preparation, and first look application. The
High Collar warm medians are 57.06 ms in garage and 42.76 ms in portrait. Several
other outfits change little; small differences in unaffected/control paths do not
establish an optimization gain. The garage cold case still takes about one second
on this CPU. Exact duplicate-position/Jacobian reuse or worker/offline preparation
remain future work requiring separate equivalence and ownership checks.

### Shared world damage selection

Authored-world chunks share a weak cache of the sorted destroyed-ID key, keyed by
the immutable `asset_health` object. Compact unchanged maps reuse that result;
damage, repairs, replacements, fresh legacy JSON maps, and world resets still
derive the appropriate key. Malformed scalar health fields retain their previous
empty-result behavior. The snapshot type documents immutable map replacement.

The [deterministic operation-count fixture](reports/destroyed-asset-scans-2026-11-18.json)
uses the production decoder, two keyframes, 30 packets per keyframe, six consumers,
and 250 health entries. It reduces enumeration/allocation work; the previous
string selector already suppressed React renders when the destroyed set stayed
unchanged. New keyframes and changed-since-baseline packets with fresh maps still
need scans. Weak keys allow abandoned map objects to be collected.
See the [world README](../frontend/src/world/README.md).

### Validation and remaining work

- The combined targeted run passed **51 tests, zero failures and zero skips**,
  with required wardrobe assets enabled. It covers all 12 accepted cold/warm
  geometry signatures, coverage boundaries/fallback/ownership, real vehicle
  UV/material/rig behavior, immutable damage updates, protocol delivery, and
  staged vehicle loading.
- Frontend TypeScript checking and the production Vite build passed. The build
  used the installed assets/configuration with public-file copying disabled;
  existing large-chunk and eager/dynamic world-builder import warnings remain.
  Source review found no blocking ownership or cache regressions in the three
  changes. `git diff --check` also passed.
- The original 27 regular-skirt/corset baseline failures and three vehicle
  material-policy assertion disagreements remain open. This pass preserves
  accepted geometry and does not mark those issues resolved.
- Browser visuals, actual frame time/GPU memory, cold preparation offloading,
  loaded-source/texture retention, and missing mobile tiers remain open. Cargo
  tests for the first pass's server changes are still required before merge;
  this second pass does not change Rust or the wire schema.

Reproduce from `frontend/` after installing the required source assets:

```sh
node scripts/benchmark-vehicle-batches.mjs --baseline a0468bd --samples 8 --output /tmp/vehicle-uv-sharing.json
node scripts/benchmark-wardrobe-fit.mjs --baseline a0468bd --samples 8 --output /tmp/wardrobe-union.json
AVENLAB_WARDROBE_REQUIRE_ASSETS=1 node --test --test-concurrency=1 tests/wardrobe-coverage-union.test.mjs tests/wardrobe-fit-cache.test.mjs tests/gothic-skirt-layers.test.mjs tests/gothic-handkerchief-panels.test.mjs tests/static-vehicle-batches.test.mjs tests/destroyed-assets.test.mjs tests/compact-snapshot.test.mjs tests/snapshot-delivery.test.mjs tests/network-snapshot-delivery.test.mjs tests/heroes-vehicle-loading.test.mjs
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

## Fitting and gameplay LOD pass — 2026-11-18

Base: accepted merge `0e81afeab830870989492bc69d52dfac17c0a23c`.
Implementation branch: `perf/wardrobe-cache-and-gameplay-lods`.
The [readiness grid](../docs/readiness/README.md) separates alpha launch gates,
research/game separation, and reusable package work. It also records the requested
uniform color tool, outfit color groups, palette improvements, and details/mobile UI.

### What changed

- Skip Gothic 01's unselected vertices before the warp and finite-difference
  normal samples. Cache exact completed inner-layer and corset fits in a shared,
  bounded CPU cache; clone results into each model's own geometry.
- Allocate detailed driver models after React commits. Effect replay reuses the
  committed model; replacement/unmount disposes each real model once. Dye edits
  continue to update colors without rebuilding the rig.
- Render supported gameplay occupants with shared low-poly meshes and instance
  colors. Broad appearance is derived at equip/spawn and carried by compact
  snapshot v3; v1/v2 decoding and legacy JSON remain supported. Undyed Gothic
  outfits use shared authored silhouette colors rather than the base outfit tint.
- Combine compatible opaque vehicle siblings after required part splitting.
  Retain semantic controls, material boundaries, and editable source assets.
- Move Hero selection and the workshop behind actual lazy imports; keep profile
  synchronization in a small independently loaded component.

### Fitting measurements

Node 24.22.3 on AMD EPYC 9V74, with identical preloaded GLB geometry. Eight measured
samples follow warmup; baseline samples alternate around cold/warm pairs. The
harness's `median` field is the upper middle of eight sorted values. These values
measure `prepareVillager`, excluding file transfer/decode, first color application,
React, rendering, shaders, and GPU execution. Full min/max/mean and first-application
timings are retained in the [JSON report](reports/wardrobe-cache-2026-11-18.json).

| Tier / outfit | Accepted baseline | New cold preparation | New warm preparation |
| --- | ---: | ---: | ---: |
| Garage / Gothic skirt 01 | 153.93 ms | 65.15 ms | 38.69 ms |
| Garage / Gothic skirt 03 + corset 03 | 196.98 ms | 207.73 ms | 37.95 ms |
| Garage / Gothic skirt 05 + corset 05 | 1,031.97 ms | 1,058.76 ms | 54.95 ms |
| Garage / Gothic skirt 02 + corset 02 | 398.09 ms | 408.37 ms | 42.93 ms |
| Garage / bundled Gothic 01 | 1,201.83 ms | 775.00 ms | 119.50 ms |
| Portrait / Gothic skirt 05 + corset 05 | 826.41 ms | 839.16 ms | 44.14 ms |

The High Collar combination's repeated preparation decreases by about 94.7% in
both tiers. First-time and evicted combinations still perform cold fitting; some
cold cases add small cache-copy/fingerprint overhead. This is an improvement to
repeat selections, not a claim that the initial hitch is solved.

The cache retains at most 12 entries / 16 MiB of input/output arrays and layout
strings. Metadata is separately bounded by entry count. Tested retained data spans
0.66–5.62 MiB per outfit, so all outfits are not promised to remain cached at once.
It retains no rendered meshes, skeletons, or materials. See the
[cache ownership/invalidation README](../frontend/src/game/characters/wardrobeFitCache.README.md).

Twelve representative look/tier configurations retain exact accepted raw geometry
signatures on both cold and warm paths. This preserves known baseline visual and
clearance issues; it does not close the full wardrobe release gate.

### Preview lifecycle

The React/DOM probe records one initial preparation, zero extra preparations for
a dye edit, and one preparation for a garment replacement, both with and without
StrictMode. No still-mounted model was disposed, and every committed model was
released after unmount. The committed-resource test additionally covers a
suspended render that never allocates a model. These are CPU ownership checks,
not a measured GPU leak test.

### Gameplay occupants

| Quantity | Verified geometry/update budget |
| --- | ---: |
| Maximum triangles per visible driver | 592 |
| Shared geometry bytes, all variants | 34,488 |
| Fleet-wide maximum base-pass batches | 8 |
| Shared materials | 1 |
| Instance array bytes per supported roster capacity | 608 |
| Character textures, bones, mixers, and fitting calls | 0 |

One fleet update uses the shared pose reader and reusable scratch objects.
Visibility is polled at 10 Hz with screen-size hysteresis. Culled occupants skip
pose/matrix work between polls; unchanged instance buffers remain clean. Current
snapshot appearance is read independently of the React roster so color/occupancy
changes do not wait for a roster rebuild.

The warmed synthetic Node probe measured 16 visible occupants at 0.0065 ms median /
0.0188 ms p95, and 64 at 0.0255 / 0.0380 ms. It measures only the helper update with
prebuilt moving pose fixtures. The [raw report](reports/gameplay-driver-cpu-2026-11-18.json)
includes tail observations and 128-occupant stress cases, which exceed the current
96-entity decoder limit. None of these timings establish browser FPS.

See [driver implementation and remaining checks](../frontend/src/vehicles/drivers/README.md).
Naval bridge calibration, actual visibility through glass, close-range appearance,
and target-device rendering remain open.

### Vehicle grouping

The [real-asset report](reports/vehicle-batches-2026-11-18.json) uses decoded geometry
and the same material, door, steering, and hinge helpers as production; image
uploads are mocked. Counts are estimated base-pass draw ranges, not GPU captures.

| Model | Prepared ranges before → after | Triangles before = after | Derived buffers | Cold derivation |
| --- | ---: | ---: | ---: | ---: |
| BRZ | 259 → 143 (44.8% fewer) | 204,815 | 33,701,266 bytes | 147.29 ms |
| AE86 | 46 → 46 | 706,225 | 0 | 0.23 ms |

The BRZ combines 134 compatible static meshes into 18 batches and retains 125
other meshes separately. AE86's nine door splits turn its original 37 primitives
into 46; those remaining behavior/material boundaries are preserved. Source hashes
are unchanged, and BRZ bounds differ by less than 7.43e-8 in source coordinates.
Equivalent live instances share derived geometry; the last release disposes it.

The added BRZ buffers and first derivation cost are material tradeoffs. The source
asset remains cached; this is not a measured VRAM total. The helper reduces draw
submissions while retaining the source triangle count and original download size.
Move the proven protected-part contract into the existing offline export pipeline
or a worker before treating cold preparation as solved. AE86's high triangle count
also remains a quality/budget decision. Camaro/Supra sources were unavailable LFS
pointers in this checkout, so no reductions are claimed for them.

The existing remote fleet LOD baker remains in use. Original Blender and GLB
sources stay editable; production derivation must remain separate. See the
[vehicle tools README](../frontend/src/vehicles/tools/README.md) for exclusions,
paint/animation checks, source hashes, and known unrelated material test debt.

### Verification and remaining gates

The same-asset startup comparison shows **2,270,405 → 2,231,257 gzip bytes** in
the initial static JavaScript closure, a reduction of **39,148 bytes / 1.7%**.
This is a modest startup improvement: the workshop is now a real optional chunk,
while much of the renderer/game code and world-builder state still load eagerly.
See the [bundle manifest report](reports/startup-bundle-2026-11-18.json). The build
still warns about large chunks and the eager/dynamic world-builder imports; these
remain explicit research/game separation work.

- Final targeted suite: **66 passed, zero failed, zero skipped**. It covers fit
  equality/cache ownership, selected-vertex skipping, driver geometry/visibility,
  real vehicle batching and repainting, committed-resource lifetime, preview
  retention, staged loading, protocol compatibility, snapshot delivery, and HUD
  performance behavior. `AVENLAB_WARDROBE_REQUIRE_ASSETS=1` was enabled.
- Frontend TypeScript check passed after correcting a batch-label fallback to use
  the public material UUID. Production build passed; the startup bundle comparison
  separately verifies actual optional-screen chunks.
- The first High Collar fit remains roughly one second on this CPU. Warm
  preparation can still exceed a frame budget. Worker/offline fitting is open.
- Three existing vehicle-material assertions still disagree with current glass /
  opacity policy; they are documented in the vehicle tools README and are not
  included as passes in the 66-test targeted suite.
- The full wardrobe matrix has 27 known baseline pose/tier failures across nine
  distinct regular-skirt/corset combinations. It was not rerun in full for this
  optimization; representative byte-equivalence is the current regression gate.
- Browser/GPU execution and Cargo are unavailable in this workspace. Rust palette
  and compact snapshot fixtures are implemented and source-reviewed, but require
  Cargo execution before merge. Real GPU/frame-time/memory measurements and final
  visual approval remain release gates.
- Source GLTF cache eviction, duplicate/oversized textures, missing mobile garment
  tiers, preview-specific performance capture, idle reflections/frame policy, and
  the remaining eager world-builder imports are still open.

### Reproduce

Run from `frontend/` with Node 24 and the required LFS assets installed:

```sh
AVENLAB_WARDROBE_REQUIRE_ASSETS=1 node --test tests/wardrobe-fit-cache.test.mjs tests/gothic-skirt-layers.test.mjs tests/gothic-handkerchief-panels.test.mjs
node --test tests/committed-resource.test.mjs tests/driver-appearance.test.mjs tests/gameplay-drivers.test.mjs tests/static-vehicle-batches.test.mjs
node scripts/benchmark-wardrobe-fit.mjs --baseline 0e81afeab830870989492bc69d52dfac17c0a23c --samples 8 --output /tmp/wardrobe-fit.json
node scripts/benchmark-gameplay-drivers.mjs > /tmp/gameplay-driver-cpu.json
node scripts/audit-vehicle-batches.mjs brz ae86 camaro supra > /tmp/vehicle-batches.json
node scripts/audit-startup-bundle.mjs --baseline 0e81afeab830870989492bc69d52dfac17c0a23c --output /tmp/startup-bundles.json
```

For server validation, run `cargo test --locked --manifest-path
avenlab-server/Cargo.toml character` and the `compact_snapshot_fixture` test from
the repository root in a Rust-enabled environment. Keep these CPU/assets checks
separate from a named target-device gameplay/preview capture.
