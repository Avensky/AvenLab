# Vehicle rig helpers

vehicleVisualRig.ts / supraVisualRig.ts and setupVehicleParts.tsx identify visual pieces; visualAlignment.ts and colliderPreview.ts relate them to measured setup. vehicleMaterials.ts repairs shared display materials safely.

## How to edit

Edit a rig helper when wheel/light parts are wrong; edit the vehicle component for assembly. Handling changes belong to Rust. Use source GLB bounds/config rather than patching camera or suspension offsets to hide an alignment error.

headlightBeam.ts changes the existing SpotLights' aim/intensity/range from
confirmed headlights/high-beam snapshots. It caches exact low-beam settings and
restores them on release, with no extra lamps, timers or React subscriptions.
AE86.tsx also adjusts its existing pop-up opening rate during a flash.

## Static production batches

`staticVehicleBatches.ts` combines compatible opaque sibling meshes after the
vehicle's part and material preparation. It is called by the full gameplay rig
in `useVehicleVisualAlignment.ts` and by `VehiclePreviewModel.tsx` after its door
and steering splits and hinge construction. It does not change physics or the
existing remote fleet path. That path already uses role-batched, simplified
assets from `scripts/bake-vehicle-lods.py` and `RemoteFleet.tsx`.

Each batch has one shared material and one draw range. Keeping one geometry group
per source segment would preserve the old draw count, so these batches have no
per-segment geometry groups. Only siblings with the same material identity,
attribute layout, component role, shadow flags, render order and layer mask can
join. The transform is baked into an owned geometry; positions, split normals,
tangents, vertex colors and every UV channel are retained. Reflected transforms
also reverse triangle winding and tangent handedness.

The following remain independent:

- Wheels, calipers, steering, doors, hoods, trunks, hatches and other named
  controls, including the BRZ's generic `Mesh128` steering names from
  `GARAGE_STATIONS`.
- Glass, transparent/transmissive surfaces, alpha-tested surfaces, lamp lenses,
  mirrors, plates, named damage/breakable parts and non-static component roles.
- Animation targets and their descendants, skinned/morphed meshes, custom mesh
  render/raycast callbacks, R3F event handlers, and custom shadow materials.
- Separate material instances, even when they have the same color or name.

An unresolved animation binding disables batching for that root. Runtime rigs
must finish geometry splits before calling the helper: the garage door and
steering split recipes identify exact original vertex/index ranges. Callers must
pass any controls whose exported names do not identify their purpose through
`protectedNames` or `protectedObjects`. Future per-part damage/animation systems
must protect their targets too; a part that needs an independent transform or
material is not static batch content.

### Source and resource ownership

**Blender originals and authored GLBs stay editable and byte-identical.** No
source mesh is joined in Blender, no source binary is overwritten, and no
texture is resized or recompressed by this optimization. The existing Heroes
builder still writes its separate `public/models/heroes-generated/` outputs.
Batching operates on prepared runtime clones; original source objects and all
cached geometry/materials remain available.

The helper retains the original child order and restores the original objects
on disposal. Derived geometry is shared across equivalent live instances with a
reference count and disposed when its last user releases it. Source geometry,
materials and textures are never disposed by this helper. There is no retained
zero-user batch cache. Derived buffers add some resident geometry memory while
the originals remain cached; this is a draw-call optimization, not triangle
reduction or texture compression.

### Exact UV storage sharing

Before copying a batch's UV streams, the helper compares UV-family attributes
across every source segment. Channels can share storage only when attribute
class, component storage type, item size, count, normalization, GPU type and
usage match, and every stored component has exactly the same bits. The check
honors interleaved offsets and strides; it does not use tolerances, sampling or
hash collisions. Distinct signed zeros remain distinct. Position, normal and
tangent streams are not candidates for this optimization.

Each channel name remains on the derived geometry. Identical channels reference
the same **derived BufferAttribute**, so they share its CPU storage and renderer
upload. This never aliases a source-owned attribute or array. Changed source
buffer versions create a different cached result; existing derived geometry does
not change when a source buffer is edited. Equivalent live instances retain the
existing immutable shared-geometry contract. Any future writable per-instance UV
edit must first make its own geometry/attribute copies, including separating any
channel aliases that it intends to edit independently.

`stats.geometryBytes` counts unique underlying attribute/index allocations
referenced by all batches under that root, including when several material
batches reuse one geometry. It does not sum the same allocation once per UV
name, and it does not mean newly allocated bytes on a live cache hit or measured
VRAM.

### Reproduce and validate

From `frontend/`:

```sh
node --test tests/static-vehicle-batches.test.mjs
node scripts/audit-vehicle-batches.mjs brz ae86
```

The audit accepts additional catalog model IDs. Missing files and Git LFS
pointers are reported as unavailable rather than treated as measured assets.
It decodes real Draco/Meshopt vertex/index buffers, applies production material,
steering, door and hinge preparation, checks exact triangle counts and bounds,
restores the originals, and checks the source GLB SHA-256 again. Image uploads
are mocked by `scripts/load-vehicle-geometry.mjs`; no texture-quality or GPU
rendering claim follows from this headless audit. Draw ranges refer to the base
pass; shadows and reflection passes can multiply actual GPU calls.

### Measured installed assets (2026-11-18, America/Los_Angeles)

Measured after material preparation and the garage's door/steering/hinge setup:

| Asset | Before → after base-pass ranges | Reduction | Triangles retained | Unique derived geometry buffers |
| --- | ---: | ---: | ---: | ---: |
| BRZ | 259 → 143 | 116 / 44.8% | 204,815 | 16,125,666 bytes |
| AE86 | 46 → 46 | 0 | 706,225 | 0 |
| Camaro | Unavailable LFS source | Unmeasured | Unmeasured | Unmeasured |
| Supra | Unavailable LFS source | Unmeasured | Unmeasured | Unmeasured |

The AE86 starts at 37 source primitives and gains nine independently articulated
door pieces before this comparison. Its remaining material/behavior boundaries
do not offer safe sibling joins, so it is correctly left intact. The BRZ's 134
compatible static meshes become 18 batches; its other 125 meshes stay separate.
Both assets retain their exact triangle and vertex counts. Maximum BRZ bounds
difference was `7.43e-8` in source coordinates; AE86 bounds were unchanged.

All eight UV streams are byte-identical in each of the BRZ's 18 batches. Sharing
them reduces unique derived storage from 33,701,266 to 16,125,666 bytes: a saving
of **17,575,600 bytes / 52.2%**. Every UV channel name/value, vertex, triangle,
material and protected control remains intact; there are no unreferenced batch
vertices to compact away.

The initial implementation at `a0468bd` measured 147 ms for a cold BRZ derivation
and 0.23 ms for the AE86 in one local Node audit. The serialized current/baseline
CPU comparison and full geometry-equivalence evidence belong in the
[performance report](../../../../performance/README.md); neither the original
single run nor the headless benchmark is a browser timing guarantee. The
remaining approximately 16.1 MB of derived attribute/index buffers is still an
explicit memory tradeoff and **is not measured VRAM**. Equivalent live instances
reuse those buffers; after the final release they are disposed. A first
preparation can still cause a main-thread hitch. A worker or the established
derived-asset build pipeline remains an option if device profiling requires it;
keep generated outputs separate from originals.

Verified source hashes:

- BRZ, 18,193,436 bytes: `3f6b5f2ebd6c5bbf7f1badfcc6d4d04e4b97d229dcbfe578516a1df0ece06f9d`.
- AE86, 2,622,332 bytes: `0094d8bfd5a4cdf720d633c1857e6c29f5e4e4e9a89316e9404d94d45d90bdf8`.

The fourteen focused batching tests pass with both real assets installed. They
cover exact aliases, differing UV data/format/layout/usage, interleaved and shared
source buffers, unique allocation accounting, immutable source byte hashes, and
source-version cache invalidation. They also
exercise repeated body-color/finish changes on the real batched model, preserve
trim/glass/texture state, and verify that cached source colors are untouched.
All six Heroes staged-loading scenarios pass with the integration enabled.

### Remaining alpha checks

- Run a real browser/device capture for a representative crowded scene, including
  the first batch preparation, steady state, paint changes and disposal. The
  headless audit does not measure FPS, GPU time or VRAM.
- Inspect close-up steering, wheels, doors, lamp covers and transparent sorting
  on every vehicle. Only installed assets can be validated locally; hydrate the
  other Git LFS sources before claiming fleet-wide visual coverage.
- Keep export component roles and named control metadata current when replacing
  a GLB. New interactive parts must be excluded before enabling their behavior.
- Review source texture budgets separately. Static batching does not fix large
  textures, remove interiors or simplify triangles, and it deliberately avoids
  material deduplication that could couple independent paint/damage behavior.
- Resolve existing material-policy test disagreements before claiming a fully
  green car suite: `garage-vehicle-paint.test.mjs` expects AE86 glass opacity .25
  while the shared material policy produces .42; `vehicle-visuals.test.mjs` has
  an analogous Camaro .6/.42 expectation and a Supra opaque-surface fixture
  disagreement. These unchanged material helpers/tests do not call batching.
- Keep the GPU-independent batching helper separate from React rig/garage
  integration. It can move into a reusable rendering package after its ownership
  and protected-part contract are shared by another production caller; the audit
  and asset-decoder scripts remain developer tooling.
