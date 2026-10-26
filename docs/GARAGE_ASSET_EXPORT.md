# Garage source and export

The provided `garage_special.blend` is the editable source. The game loads a derived `frontend/public/models/world/garage_special.glb`.

## Why the earlier GLB lost parts

The source inspection confirms that these parts depend on modifiers:

| Part | Source geometry generation | Result when only the base mesh is exported |
| --- | --- | --- |
| `Toit_GRILLE` aluminum ceiling lattice | Array counts 9 and 13 | One cell instead of 117 sections |
| `FOND_01` / `FOND_01.001` upper trusses | Array count 12 plus Mirror | A short section on one side |
| `PDS` stand base | Mirror on X | Part of the supporting feet is missing |
| `Base_Light` and `Base_Light.001` rack | Mirror on X and Z, plus Bevel | Partial frame and light bars |
| `Sol_CUBE` original tile grid | Array counts 66 and 60 | One tile instead of the full grid |

Blender's glTF **Apply Modifiers** option exports evaluated mesh geometry. It defaults to false in Blender 5.1.2. The older asset contained the base versions; the corrected export enables this option. The relevant source modifiers are already enabled for viewport and render.

The original Blender file is retained without changes. The export script operates on an in-memory copy, converts curve/text surfaces to meshes, evaluates modifiers, omits the embedded demo car, and writes a compressed GLB. Scene lights/cameras and animations are omitted because the game already controls lighting and turntable movement.

## Repeat the export

Run from the repository root using Blender 5.1 or later:

```sh
blender --background --factory-startup --disable-autoexec /path/to/garage_special.blend --python scripts/export_garage_glb.py -- --output frontend/public/models/world/garage_special.glb
```

In PowerShell, use `&` and a quoted path to `blender.exe` if Blender is not on PATH. Supply the original `.blend` path before `--python`; do not use the GLB as input. The script writes a separate `.glb` and never saves over the source `.blend`. It validates the required garage objects before replacing the output atomically.

After export, restart/reload the frontend. The model URL includes an export revision to avoid reusing the old cached GLB. The corrected asset marks its scene as `avenlabGarageComplete`; the game then keeps the native ceiling, rack and stand and skips the legacy reconstruction helper. The full original tile grid stays in the GLB; the app hides that covered layer because its single reflective tile shader already draws the floor, saving 47,520 redundant triangles.

## Shared vehicle sizing

Vehicle previews use one common factor, calculated from the Tank's full visible footprint, including its barrel. The factor is applied equally to the entire lineup. Contact shadows follow each model's wheels/tracks and all models remain grounded. The Tank dimensions are stored as small preview metadata so selecting a car does not download the 31MB Tank model.

The current Tank is about 7.93m long and the platform is about 7.93m long. With clearance around the safety band, the common factor is about 0.95. A closer shared camera makes the lineup more prominent without changing its proportions. Its Tank framing was checked over 16 turntable headings on desktop and phone aspect ratios. A literal 2x enlargement of every vehicle cannot fit this existing platform while preserving their relative sizes; that would require a larger display space.

When replacing the Tank asset, re-measure `PREVIEW_LINEUP_REFERENCE` in `previewPlacement.ts`. Gameplay geometry, wheel poses and physics sizes are unaffected by these presentation settings.

## Verification

- `frontend/tests/garage-asset.test.mjs` checks real exported array/mirror coverage and the stand base.
- `frontend/tests/garage-structure.test.mjs` checks that complete assets bypass the legacy replacement.
- `frontend/tests/preview-placement.test.mjs` checks shared lineup scale, grounding and shadow alignment.

References: [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html), [Blender instance realization](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances/realize_instances.html).
