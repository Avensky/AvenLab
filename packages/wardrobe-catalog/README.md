# Wardrobe catalog

`@avenlab/wardrobe-catalog` is a private package in the AvenLab repository.
The frontend uses its JSON files for selection and preview. Rust embeds the
same data to validate and save player outfits. Garment GLBs, fitting code,
and profile persistence live in their respective frontend and server paths.

| File | Contents |
| --- | --- |
| [`characters.json`](characters.json) | Character models and base outfit IDs |
| [`character-appearance.json`](character-appearance.json) | Appearance option IDs and palettes |
| [`character-clothing-pieces.json`](character-clothing-pieces.json) | Clothing piece IDs, labels, and camera framing hints |
| [`character-village-pieces.json`](character-village-pieces.json) | IDs and mesh names for detachable parts of the Village outfit |
| [`character-wardrobe.json`](character-wardrobe.json) | Gothic set IDs, retirement status, and supported corset dye fields |
| [`character-garments.json`](character-garments.json) | Curated standalone garments with slots and asset paths |
| [`discovered-wardrobe-garments.json`](discovered-wardrobe-garments.json) | Generated manifest for compatible loose GLBs |

## Edit the catalog

Keep IDs stable across relabeling, refits, and Garage or Mobile revisions.
Saved looks reference these IDs. Keep retired records where older saves can
encounter them. Preserve the set and waist when reading older Gothic looks
that saved a separate shirt. The runtime resolves that legacy shirt to `none`.
When adding a corset dye control, list its saved field in `extraDyeFields`
for that set. All pieces already accept `color` and `accent`. Profile saves
validate the extra fields against this list, including for retired sets.

`gameplayColors` supplies the broad original top/bottom colors for the cheap
seated driver tier. It does not change fitting-room materials. The current top
values follow the authored main-fabric values in `corsetDye.ts`; the bundled
Gothic skirt fabric factor `[0.72, 0.69, 0.64]` converts from linear RGB to
`#ddd8d1` in sRGB. These are intentionally broad silhouette colors rather than
texture averages. Explicit outfit dyes and per-piece colors take precedence.
Keep these values aligned with future authored asset changes and the shared
`frontend/tests/fixtures/driver-appearance.json` browser/Rust fixture.

The [readiness grid](../../docs/readiness/README.md) tracks the remaining uniform
color tool, per-asset color-group coverage, better palette combinations, and
package extraction requirements. Existing `extraDyeFields` support is partial;
do not expose unsupported controls or treat it as a finished shared color editor.

Edit curated entries in the relevant source JSON. Keep `slot` and `piece`
aligned with the garment the model replaces. Paths in the garment catalog
start at the frontend public root. A compatible revision can replace its
source in the preview, with the source path available as a fallback.

The scanner checks supported wardrobe subfolders for well-formed GLBs with
compatible garment nodes, ordered Vesper joints, and compatible bind
transforms. It keeps curated paths and IDs authoritative. Add compatible loose
GLBs under `frontend/public/models/characters/female/wardrobe/` and run the
following from the repository root with Node 24 and the relevant assets
installed.

```sh
npm run wardrobe:catalog
npm run wardrobe:catalog:check
```

The generation command refreshes `discovered-wardrobe-garments.json`. Review
the manifest diff alongside any asset change. Run the check with the same
assets installed as for generation. A checkout with missing GLBs can produce
a smaller inventory if the scanner is run explicitly.

The committed manifest is the input to both applications. Rust can build from
it without running Node and picks up new data on rebuild. Vite reloads catalog
changes and checks asset availability separately. Normal builds use the
committed manifest.

Run the [wardrobe audit and fit checks](../../frontend/src/game/characters/README.md#run-the-checks)
after a catalog or model change.
