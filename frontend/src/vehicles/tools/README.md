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

### Measured installed assets (2026-11-19)

Measured after material preparation and the garage's door/steering/hinge setup:

| Asset | Before → after base-pass ranges | Reduction | Triangles retained | Derived geometry buffers | Cold derivation |
| --- | ---: | ---: | ---: | ---: | ---: |
| BRZ | 259 → 143 | 116 / 44.8% | 204,815 | 33,701,266 bytes | 147 ms |
| AE86 | 46 → 46 | 0 | 706,225 | 0 | 0.23 ms |
| Camaro | Unavailable LFS source | Unmeasured | Unmeasured | Unmeasured | Unmeasured |
| Supra | Unavailable LFS source | Unmeasured | Unmeasured | Unmeasured | Unmeasured |

The AE86 starts at 37 source primitives and gains nine independently articulated
door pieces before this comparison. Its remaining material/behavior boundaries
do not offer safe sibling joins, so it is correctly left intact. The BRZ's 134
compatible static meshes become 18 batches; its other 125 meshes stay separate.
Both assets retain their exact triangle and vertex counts. Maximum BRZ bounds
difference was `7.43e-8` in source coordinates; AE86 bounds were unchanged.

Cold times are one local Node diagnostic run, not browser timing guarantees.
The BRZ's approximately 33.7 MB of derived attribute/index buffers is an explicit
memory tradeoff and **is not measured VRAM**. Equivalent live instances reuse
those buffers; after the final release they are disposed. A first preparation
can still cause a main-thread hitch. Move the same protected-part contract into
the established derived-asset build pipeline or a worker before treating cold
car preparation as solved; keep those generated outputs separate from originals.

Verified source hashes:

- BRZ, 18,193,436 bytes: `3f6b5f2ebd6c5bbf7f1badfcc6d4d04e4b97d229dcbfe578516a1df0ece06f9d`.
- AE86, 2,622,332 bytes: `0094d8bfd5a4cdf720d633c1857e6c29f5e4e4e9a89316e9404d94d45d90bdf8`.

The seven focused batching tests pass with both real assets installed. They also
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
