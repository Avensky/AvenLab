# Performance

These CSV files are recorded experiments, not configuration. Keep labels, car/map/route/quality/range and warmup comparable. UI changes in this update have deterministic render/sampling checks, not a target-machine FPS claim. Use docs/performance-recording.md to capture a new baseline.

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
