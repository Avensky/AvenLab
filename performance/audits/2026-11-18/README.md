# Next performance audit — 2026-11-18

Audited runtime: `25988e120d8d8b3a84872aa34d51335b4fef073a` on
`perf/wardrobe-cache-and-gameplay-lods`, [draft PR #36](https://github.com/Avensky/AvenLab/pull/36).
Date uses America/Los_Angeles. This audit adds repeatable inspection tools,
evidence, and priorities. It does not change production runtime code, source
assets, fitted positions, animation behavior, or cache budgets.

The largest newly verified startup target is the eagerly imported collision
catalog. The most direct CPU follow-up is exact repeated point/Jacobian reuse in
cold fitting. Texture tiers and source ownership need their own budget before
more assets are exposed. The findings below separate deterministic counts,
conditional synthetic work, and measurements that still need a device.

## Ordered work grid

| ID | Priority and next change | Evidence | Acceptance before claiming an improvement | Readiness gate |
| --- | --- | --- | --- | --- |
| A3-01 | High: reuse identical point and Jacobian calculations within one fit operation. Start with a bounded local memo and unchanged fit equations. | Gothic 05 full-tier and production-desktop cases each perform 505,709 cold preparation rays; 171,292 occur in repeated exact-position work. Gothic 02's full-tier fixture has 204,952 potentially reusable rays. | Bit-identical accepted geometry, signed-zero/unsupported-input fallback, unchanged normal handling and ownership, then uninstrumented cold/warm timings including the actual production actor/garment tier combination. | PERF-01 |
| A3-02 | High: split light model metadata from detailed collider arrays; load only required detail and preserve cheap gameplay proxies. | All 44 commercial buildings' geometry is in the initial static JS closure. Its compact JSON is 4,096,293 bytes / 986,520 gzip bytes. | Measured initial-chunk reduction with the same assets; valid bounds, IDs/revision checks, collider roles, collision-only rendering, layout validation, gameplay proxies, and editor selection/loading. | PERF-05, SPLIT-01 |
| A3-03 | High: make derived compact texture budgets real and inventory source-cache owners before eviction. | All six underbust garage/mobile variants embed byte-identical copies of 16 images; each estimates 77,595,156 RGBA8+mipmap bytes. Four active Gothic garage bundles repeat 11,625,780 encoded image bytes. | Original assets preserved; reviewed cloth/normal close-ups; texture color space/sampler/UV compatibility; active, pending and previous-preview owners covered; fit-cache scopes remain source-independent; device residency measured. | PERF-04 |
| A3-04 | Prerequisite for render comparisons: add preview capture context and complete whole-frame render counters. | Recorder is sandbox-only; per-render Three counter resets do not guarantee totals across shadows, nested reflections and composer passes. | Known multi-pass fixtures, per-renderer ownership/reset/cleanup, preview context invalidation, demand idle/wake, and actual device captures. | PERF-04, PKG-01 |
| A3-05 | Medium: group kit LOD checks and reuse static placement centers; share camera/shadow collection once per canvas/frame where multiple city visuals exist. | Ten generated-harbor kit placements perform 600 checks and 4,200 ancestor updates in a declared 60-frame fixture. Four synthetic city visuals repeat identical frusta. | Preserve per-frame decisions first; keep hysteresis, transforms, long spans, edits, teleports, offscreen shadow casters, and separate camera/canvas scopes. Measure live map counts before ranking city gains. | PERF-04 |
| A3-06 | Correctness companion: fix final demanded-frame LOD wake before adding more timers. | Harbor building LOD skips a camera move inside its 0.25-second timer and does not schedule a follow-up itself. | A last demanded camera move, teleport and edit leave the correct LOD without needing unrelated animation to wake it. | PERF-04, MOT-01 |

The first implementation should isolate A3-01 and measure it. A larger persistent
cache or a generic BVH cache is not the first choice: the exact duplicate workload
is already local to one warp, while warm fitting still has cloning and input-read
costs. A3-04 must precede any claimed GPU/frame-render comparison; it does not block
independent CPU or emitted-byte work.

## 1. Startup graph and collider data

The production build's initial static closure is approximately **7.95 MB raw JS /
2.23 MB gzip** across seven chunks and 767 emitted modules. Exact chunk sizes,
SHA-256 values, static paths, and source/config hashes are in the
[startup report](../../reports/startup-boundaries-2026-11-18.json).
This measures emitted code, not download latency or runtime execution. Gzip uses
Node's default zlib settings per chunk; source module attribution is not additive
compressed savings. Tiny repeated-build differences in generated chunk names are
not an optimization result.

Hero selection, the workshop, and `WorldBuilderPanel` are already outside the
initial static closure. Builder state/actions and the diagnostics overlay remain
eager, but their direct module sizes are small relative to the data catalogs.
Treating the entire `worldBuilder` directory as editor-only would remove valid
gameplay code.

| Eager data catalog | Asset records | Compact JSON bytes | Compact JSON gzip bytes | Vertices / triangles |
| --- | ---: | ---: | ---: | ---: |
| Commercial buildings | 44 | 4,096,293 | 986,520 | 95,126 / 90,342 |
| Roads | 3 | 386,097 | 70,100 | 5,461 / 7,820 |
| Placement models | 1 | 20,966 | 4,243 | 267 / 414 |

For commercial buildings, collider values account for 4,072,724 compact JSON
bytes. Removing those fields from a diagnostic serialization leaves 22,997 bytes
of metadata, or 4,798 gzip bytes. **That is field attribution, not a working
replacement or measured bundle saving.** The current model proxy/collision
renderers still consume the arrays, and model validation needs collider roles
and counts. Model bounds already come from metadata; road bounds additionally
derive from collider vertices.

One shortest static path runs through `Keyboard → builderActions → layoutDocument
→ modelCatalog`. There is also a gameplay path through `GameUI → sandbox →
CityScene → AuthoredWorld → LayoutMeshes → ModelMeshes → modelCatalog`. Deferring
builder actions alone therefore will not remove this data. Separate stable
metadata/role summaries from detailed per-asset geometry, preserve source hashes
and live proxy behavior, and load detail only for selected/visible consumers.
Keep server physics data intact. This boundary also prepares research/game
separation without changing the authoring source files.

## 2. Character preparation: exact work and cache pressure

The [character audit](../../reports/character-preparation-2026-11-18.json)
instruments current functions only in memory. It preserves the accepted twelve
fixtures and verifies cold/warm output signatures. A separate two-sweep sequence
tests bounded cache pressure. Counts are untimed: diagnostic maps and wrappers
would distort a benchmark, so they are not used to claim elapsed-time savings.

| Accepted fixture | Cold preparation rays | Rays in repeated exact-position/Jacobian work | Share of cold rays |
| --- | ---: | ---: | ---: |
| Garage / Gothic skirt 05 + corset 05 | 505,709 | 171,292 | 33.9% |
| Garage / Gothic skirt 02 + corset 02 | 577,329 | 204,952 | 35.5% |
| Portrait / Gothic skirt 05 + corset 05 | 342,680 | 129,864 | 37.9% |
| Portrait / Gothic skirt 02 + corset 02 | 354,046 | 133,843 | 37.8% |

These are potential work reductions, not predicted percentages of frame time or
wall time. In the garage Gothic 05 fixture, `seatHem` visits 45,557 vertices but
only 29,033 distinct exact positions. Of 93,300 derivative shape calls, 37,452
repeat an already encountered Jacobian. The proposed memo should live only for
the warp invocation, preserve signed zero, reject unsupported/nonfinite inputs,
and reuse the position/Jacobian while applying each vertex's own normal. A
coordinate-only key is valid only while all shape dependencies remain fixed.

An immediate warm repeat still performs 37,629 garment shape calls and 10,560
rays. Preparation plus first application makes 20 geometry clones with about
9.60 MB of source geometry payload visited. The fit cache fingerprints 3,694,484
input bytes and then confirms that many bytes again for the exact cache hit.
These are cumulative operations/input traffic, not peak or retained memory.
One exact BVH input repeats on the cold path and none on the warm path, making a
general BVH cache a weaker first target in this fixture.

The ordered twelve-look mixed-tier pressure sequence records **two hits and
fourteen misses on its second sweep**. A look can make more than one cache
request; these are cache-request counts, not a percentage of users or outfits.
The existing 12-entry / 16 MiB bound remains intact. Do not enlarge it solely to
make this deliberately broad sequence hit more often.

### Fixture and production tier distinction

The accepted separate-garment `garage` fixtures use a garage base actor as well
as garage clothing. Normal production `GarageDriver` uses a portrait base actor
unless showing victory, while clothing can still use garage tier. Portrait
fixtures match the compact base-actor selection; garage fixtures are controlled
regression/CPU cases and should not be labeled an exact default desktop route.
The earlier timing reports remain valid for their declared inputs, with this
scope qualification. Track actor and garment tiers separately in future captures.

One additional Gothic 05 + High Collar case uses the production resolver for the
actual desktop combination: portrait actor, garage skirt/corset, and wardrobe
body donor. A separate **uninstrumented current-25988e1 oracle** supplies its
geometry signature; both instrumented cold and warm outputs match. This is
separate from the twelve accepted-merge fixtures, not a new visual approval.
It confirms the same 505,709 cold rays and 171,292 potentially reusable rays.
Its warm preparation plus first application visits 9,697,130 clone-input bytes
across 20 geometry clones, then hashes and compares 3,694,484 fit-input bytes on
the cache hit. No new elapsed-time measurement is claimed for this mixed-tier
case. The report records all seventeen loaded source GLB paths, bytes and hashes.

Cold count cases clear only the fit cache, in the recorded order. Other source
and module caches remain available and can perform first-use work. Warm cases
are immediate repeats. Accepted signatures preserve existing fit problems and
are not visual sign-off for the complete wardrobe.

## 3. Asset tiers, duplicates, and retained sources

The [asset inventory](../../reports/asset-residency-2026-11-18.json) covers 71
installed GLBs, 247 LFS pointers, and two optional missing revision paths.
Missing/pointer assets were not decoded or treated as zero-cost production
assets. Independent [verification](../../reports/asset-residency-verification-2026-11-18.json)
checked all 71 file hashes, all 431 embedded-image hashes, and all 184 unique
image dimensions against `sharp.metadata()`.

All image-memory numbers below are **logical RGBA8 plus a complete mip chain**.
They are metadata comparisons, not browser heap, actual GPU residency, or a
simultaneously loaded working set. Formats, filtering, render targets, texture
clones, sharing and driver behavior change actual allocations.

### Mobile texture budget

The ordinary underbust vest, original-cut version and tucked version each embed
the same 16 image hashes in both garage and mobile assets: 527,131 encoded bytes
and 77,595,156 logical RGBA+mipmap bytes per file. Those include a 3072² facing
cloth map and a 2048² normal map. Geometry reduction does not reduce that texture
budget. Reducing only those two maps to 1024² would produce a **calculated**
16,078,704-byte logical image budget; no such export or visual approval is part
of this audit. Extend the existing derived export pipeline and review fabric
and normals at compact close-up distances before choosing dimensions.

Of 66 active imported garments, 33 declare mobile URLs, four have hydrated mobile
files here, and 29 mobile paths remain LFS pointers. Of the 32 entries that resolve
to installed assets, 28 use the same file for compact and garage selection. All
five standalone Gothic skirts declare no mobile URL. These are two distinct
issues: absent tier declarations and unavailable local evidence for declared
tiers. Compact selection depends on component width, not a universal mobile-device
flag.

The installed Vesper portrait base is also heavier than garage: 5,499,572 versus
4,192,432 file bytes, 39,783 versus 34,477 metadata triangles, and 59,768,680 versus
26,563,900 logical texture bytes. Its original face/rig requirements matter.
Reconcile the export contract and texture budgets before choosing a URL by size.
Ordered skeleton names alone do not establish equivalent body topology, bind
transforms, morphs, clothing coverage, or hand-clearance behavior.

### Repeated payloads and ownership

The four active Gothic garage bundles contain 86 image entries with 29 unique
encoded-image hashes: **17,578,695 encoded bytes versus 5,952,915 unique bytes**.
Logical image totals are 503,316,376 versus 184,549,348 bytes. These are pool
inventories; the retired fifth bundle is separate. Identical embedded hashes
across GLBs do not establish shared runtime Texture objects. A shared packaging
design must preserve color space, sampler settings and UV transforms.

Mounted character source maps add tried URLs, loader caches retain sources, and
fleet art remains in its module map when the user count returns to zero. The
bounded fit cache does not bound those sources/textures. Its current callers use
source-independent empty identity objects for scopes and copied input/output
arrays; they do not keep source scenes through scope references. Preserve that
contract. Fitted-instance disposal is already
present and has prior lifecycle checks. This is retention evidence, not a proven
instance leak. Inventory owners before eviction: active and previous previews,
pending loads, animation users, fitted clones, and URL/fleet loader caches.
Disposing a shared source texture on one component's unmount is unsafe.

### Existing vehicle budgets

BRZ's 24 embedded images include PNG/JPEG and WebP alternatives. Either inspected
source profile selects 12 images, estimating 10,487,160 logical bytes. Do not sum
both alternatives as simultaneous texture use. AE86 has one 1×1 WebP image.
The prior vehicle grouping/UV work remains useful; this audit does not support
generic vehicle texture downsizing as its next major target.

Fifteen of sixteen land entries declare distinct reduced exteriors; `supra-1998`
falls back to its main asset. All 45 declared reduced land files are pointers here, so
their geometry/texture budgets remain unmeasured. Preserve protected parts and
the existing role-batched exterior pipeline when moving local-car preparation
offline. See the [vehicle asset README](../../../frontend/public/models/vehicles/README.md).

## 4. Recurring scene work and demand-mode correctness

The [scene audit](../../reports/scene-work-2026-11-18.json) extracts actual
production frame callbacks with the TypeScript AST and supplies explicit
Three-only fixtures. It does not mount React or render WebGL. The three committed
harbor generator seeds produce ten kit placements and six model placements each;
the ten catalog-listed installed map documents are absent, so generated and
deployed map counts are not treated as interchangeable.

In GLB visual mode, ten kits over 60 rendered frames make 600 distance checks and
4,200 ancestor matrix updates/compositions in the documented seven-level fixture.
Only ten React state publications occur, all initial: this is repeated transform
work, not repeated unchanged state updates. The baseline preset uses collider
mode and makes zero such checks; the low-detail preset uses GLB mode. Actual
persisted settings were not inspected. Group checks and precompute centers when
placements/parents change before considering a lower sampling rate.

Four synthetic city visuals in a declared 1,010-node scene rebuild the same
camera frustum four times, traverse 4,040 nodes for shadow collection, and perform
32 light-shadow matrix updates for eight unique faces. One shared per-frame
collection would need 1,010 visits and eight updates in that fixture. This is a
conditional opportunity: there is no cross-visual duplication with one visual,
and shadow collection disappears when shadows are disabled. Refresh shared data
after camera/light changes and retain per-asset culling.

Harbor building LOD has a concrete last-frame wake edge: a camera jump at 0.1 s
is skipped by its 0.25 s timer after an initial check at 0 s. A separate frame at
0.3 s corrects the state; the callback itself requests no follow-up. Preserve
immediate initial/demand checks in any consolidated scheduler. The six harbor
model placements already scan only four times in 60 continuous frames, making
24 candidate Vector3 allocations; that smaller allocation count is low priority.

## 5. Preview rendering and capture limits

Paused previews already use demand rendering, covered previews use `never`, and
the compact 30 Hz invalidation clock stops when covered/paused/authoring or when
the application Reduced Motion setting is active. The environment cube uses a
single capture, and the contact shadow is a static texture/draw. Preserve those
controls. OS-only Reduced Motion and application Reduced Motion currently differ
in the canvas policy and need a coordinated review.

While frames continue, planar captures can still run from elapsed time even with
stationary fixture inputs. In a two-second 60 Hz fitting-room fixture, floor and
wall gates admit 24 and 36 captures. That is a gate count with counter stubs, not
actual GPU passes; no demanded frame means zero captures. A future dirty gate
must account for animated poses, camera/projection, viewport, geometry, loading,
material/theme, moving parts and visibility. Coordinate that boundary with the
pose branch rather than assuming an active preview is static.

The recorder is currently sandbox-only and cannot validate preview comparisons.
Three's default per-render counter reset also prevents treating existing sampled
draw/triangle values as guaranteed totals across all frame passes. Resource
counts are not bytes and CPU submission intervals are not GPU execution time.
The [capture README](../../../frontend/src/performance/README.md) records the
required accumulation/context contract and primary documentation link.

## Validation, branch boundaries, and reproduction

Completed for this audit:

- Production build/static graph inspection with current installed assets and
  public copying disabled. No runtime input changes were present.
- Twelve accepted cold/warm geometry pairs plus 24 pressure preparations retain
  their accepted signatures: 48 checks. Exact duplicate tracking is bounded,
  complete for these inputs, and distinguishes signed zero.
- One production-desktop Gothic 05 case also matches its separate, uninstrumented
  current-runtime geometry oracle on both cold and warm paths. It closes the
  actor/garment-tier count gap without changing the accepted-fixture set.
- Asset file/image hashes and independent dimensions verified as described above.
- Scene operation-count assertions and nine existing menu-preview, city-budget,
  and mirror tests pass. They do not substitute for rendered visual review.
- Script syntax, report provenance, documentation links, and changed-file scope
  are checked before publication. Existing large-chunk/eager-import warnings remain.

Reproduce from `frontend/`, with the same required GLB inputs materialized:

```sh
node scripts/audit-character-preparation.mjs --mode counts --include-default-desktop --output ../performance/reports/character-preparation-2026-11-18.json
node scripts/audit-asset-residency.mjs > ../performance/reports/asset-residency-2026-11-18.json
node scripts/audit-scene-work.mjs --output ../performance/reports/scene-work-2026-11-18.json
node scripts/audit-startup-boundaries.mjs --output ../performance/reports/startup-boundaries-2026-11-18.json
node --test tests/menu-preview-lifecycle.test.mjs tests/city-render-budget.test.mjs tests/fitting-room-mirror.test.mjs
```

Run timing tools separately with competing builds/audits paused; diagnostic
counts are intentionally not timing samples. New GLB materialization can change
build-time tier selection and the resulting bundle, so compare asset inventories
alongside source commits.

Performance remains on PR #36. `feature/character-pose-pack` is draft
[PR #37](https://github.com/Avensky/AvenLab/pull/37), inspected at `c726345`; the hair
ref `feat/hero-hair` was inspected at `0e81afe`. The performance and pose diffs now
overlap in `VehiclePreviewModel.tsx`: preserve post-rig static batching and the
new seat-side door/mirror targeting. The pose branch also reparents exterior
handles under door pivots. Repeat protected-control, door-entry, mirror and
vehicle batch-count checks after integration; unchanged old counts are not
guaranteed. Its added pose catalog and cockpit work are outside this audited
runtime. The audit-only files do not overlap its changes. Held poses, transition
cleanup, skirt hand clearance, fit-cache invalidation and source ownership still
need combined checks. This audit does not merge either branch. See the
[readiness grid](../../../docs/readiness/README.md).

Browser/GPU execution and Cargo are unavailable in this workspace. Device frame
time, GPU residency, close-up appearance, Rust/protocol tests, 27 known
regular-skirt/corset baseline failures, and three prior vehicle material-policy
assertion disagreements remain open. No alpha gate is closed by a metadata scan.
