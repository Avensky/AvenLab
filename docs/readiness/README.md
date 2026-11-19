# Alpha, product separation, and reusable packages

Updated 2026-11-18 (America/Los_Angeles). This is the working release checklist,
including the latest wardrobe, performance, color, and mobile UI requests.
The performance implementation is published in [draft PR #36](https://github.com/Avensky/AvenLab/pull/36)
on `perf/wardrobe-cache-and-gameplay-lods`, based on `0e81afe`.
Rust and browser/target-device validation remain open; the PR is not merged or deployed.

## Decisions to preserve

- Keep the accepted skirt positions. Gothic skirts 02 and 05 sit just below the
  cups; do not globally lower the other Gothic skirts during optimization.
- Skirts are **nearly passing for alpha** and socks **passing for now**. Other
  wardrobe items remain visibly muted **Under Development** until their own
  review passes. These labels do not replace the launch checks below.
- Keep color controls in the selected item's **details pane**. Improve that pane's
  width, useful actions, and mobile layout rather than moving the controls away.
- Gameplay occupants need a recognizable silhouette and broad appearance colors.
  The fitting room keeps detailed geometry, materials, and animation.
- Keep Blender/source parts editable. Production grouping must preserve wheels,
  doors, steering, glass, lights, paint regions, and other independently controlled
  parts. Never overwrite source assets with a flattened production version.
- Fix and measure the current paths before extracting packages. A package is not
  reusable if it silently depends on game stores, research routes, or a particular
  renderer's global state.

## Three-branch coordination

The three workstreams are **performance, hair, and poses**. Keep each one's work
and validation in its own branch; the hair and pose branch names are still to be
supplied.

| Workstream | Branch | Responsibility and shared boundaries |
| --- | --- | --- |
| Performance | `perf/wardrobe-cache-and-gameplay-lods` | Reduce measured CPU, rendering, loading, and memory costs while preserving accepted appearance and behavior. Coordinate changes to character preparation and shared data before integration. |
| Hair | Name pending | Hair assets and their character integration. Coordinate stable asset IDs, appearance colors, and headwear compatibility with the existing character/LOD contracts. |
| Poses | Name pending | Poses and pose/animation transitions. Coordinate rig, animation, and resource-lifecycle interfaces with character preparation. |

- Use a separate worktree for each active branch so unfinished changes remain
  isolated. Record each branch's purpose, base commit, owning README, and dependent
  PRs before integrating work across branches.
- Keep commits focused and record shared dependencies by commit/PR. Coordinate one
  version of changes to `packages/wardrobe-catalog`, detailed-to-gameplay appearance
  mapping, and the TypeScript/Rust snapshot contract with their shared fixtures.
  Integrate the validated dependency before changes that consume it.
- Coordinate edits to `GameUI.tsx`, `HeroWorkshop.tsx`, vehicle preparation, and
  resource ownership before overlapping changes land. Preserve accepted fit
  signatures and source assets when bringing branches together.
- Compare current source and target heads before each integration, resolve
  conflicts against the intended behavior, and run checks for the affected shared
  boundaries. Keep open visual, Rust, and device checks attached to their branch;
  another branch's passing checks do not close them.
- Update this grid and the relevant component README with the branch/PR, evidence,
  and remaining issues. Record integration status separately from implementation
  status so parallel work does not appear released prematurely.

## Must-have grid

**Gate** = required before that milestone. **Keep** = preserve the accepted result
at later milestones. **Scope** = required for content exposed in that release;
unfinished content may remain explicitly unavailable/Under Development.
**—** = does not itself block that milestone. Status is evidence, not a promise of
visual approval. Unassigned work remains open.

| ID | Required result / current status | Alpha launch | Research / game separation | Reusable packages | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| FIT-01 | Preserve accepted skirt height and layer positions. Prior patch merged; regression checks available. | Gate | Keep | Keep | Gothic 02/05 remain just under the cups; other skirt positions and all stored geometry signatures remain unchanged by performance work. |
| FIT-02 | Finish regular-skirt/corset clearance. **Open:** 27 known baseline pose/tier failures across nine distinct skirt/corset combinations, up to about 7.7 mm. | Scope | Keep | Gate | Exposed combinations pass the full static/animated audit, or the failed combinations are explicitly excluded. Do not mark the whole wardrobe clean. |
| ART-01 | Review regular skirts 01–04 for dark smudges, blocky shape and wrinkled-fabric quality. Normal/tangent repairs are in the merged baseline; final close-up review/rebuild remains open. | Scope | Keep | Gate | Neutral-light and grazing-light close-ups pass at desktop and compact tiers without shifting the accepted fit. A texture-resolution increase requires a measured memory budget. |
| ART-02 | Review Gothic vertical tears/overlapping fabric and bow-tie close-ups. Panel repairs are merged; visual sign-off remains open. | Scope | Keep | Gate | Front/back/side, walk, turn, close-up, and relevant corset combinations show no tears, z-fighting, or displaced bow. Unapproved pieces stay Under Development. |
| MOT-01 | Keep hands clear of thighs and skirts during walk, removal, and entry. Automated motion checks passed the prior patch. | Gate | Keep | Gate | Repeat the accepted no-skirt, fitted-skirt, puffy-skirt, and seated cases on rendered assets; removing a skirt does not unexpectedly change Auto's animation choice. |
| UX-01 | Sticky wardrobe Back/section/search and sleeve removal/restoration. Implemented in the merged baseline. | Gate | Keep | Gate | The controls remain available while the list scrolls, preserve keyboard/controller focus, and work at narrow portrait and landscape sizes. |
| COLOR-01 | One uniform color selection control for wardrobe, vehicle paint, and other applicable material editors. Existing shared swatches are only a starting point. **Open.** | Gate | Gate | Gate | The same controlled picker, current value, preset selection, custom input, reset behavior, labels, focus behavior, and touch behavior are used by each consumer. Domain-specific finishes remain separate. |
| COLOR-02 | Multiple named outfit color groups where the asset supports them. Corsets already have partial group support; coverage is inconsistent. **Open.** | Scope | Gate | Gate | Per-asset metadata declares supported groups, such as main fabric, secondary fabric, trim, lining, hardware, and laces. Only applicable groups appear. Saving/reloading and server validation preserve each value independently. |
| COLOR-03 | Better curated color combinations with consistent group assignment. Current two-color themes exist; expanded palettes need review. **Open.** | Gate | Keep | Gate | Curated combinations work on the supported clothing groups, have clear names and selected state, and preview correctly across light/dark fabric. Applying a palette preserves unsupported or intentionally untouched groups. |
| UI-01 | Wider, clearer details pane with color controls retained inside. **Open.** | Gate | Keep | Gate | Desktop details use the available width without crowding the character. Mobile uses an intentional sheet/panel arrangement, readable labels, and no horizontal overflow. Verify portrait, landscape, keyboard, touch, and controller navigation. |
| UI-02 | Useful, contextual details actions and a cleaner mobile hierarchy. **Open.** | Gate | Keep | Gate | Equip/remove, applicable sleeve/layer controls, reset group/piece, compare with original, and save/apply/cancel behavior are easy to find. Show only meaningful actions; preserve the selected item and scroll position. |
| PERF-01 | Remove discarded fitting work; cache exact reusable fits; share temporary coverage queries; correct preview resource lifecycle. CPU/equivalence-tested. High Collar cold preparation improves 10–11% in the second pass but remains about one second in garage. | Gate | Keep | Gate | Cold and repeat selections are measured separately; accepted geometry stays identical; bounded caches cannot share mutable/disposed results; development replay prepares one model per committed fit. |
| PERF-02 | Cheap gameplay driver LOD with recognizable broad appearance. Implemented and geometry/update-tested; renderer/GPU review pending. | Gate | Keep | Gate | Occupied supported vehicles display the correct body/hair/hat/main colors, empty/static props remain empty, and fleet draw cost is bounded. Test close approach, culling hysteresis, color changes, removal, and cabin clipping on target hardware. |
| PERF-03 | Group compatible vehicle segments without breaking behavior. BRZ stays at 259 → 143 ranges; exact UV sharing reduces derived buffers from 33.7 MB to 16.1 MB. Original assets are preserved. Cold derivation/offline exports and GPU review remain open. | Gate | Gate | Gate | Measure actual render-range reductions and unchanged triangles/transforms. Doors, wheel/caliper rigs, steering, lights, glass, paint, and animations still work. Source GLB/Blender assets are unchanged. |
| PERF-04 | Set texture, loaded-source, and frame-time budgets for exposed assets. **Open:** wardrobe source GLTF/texture retention and mobile texture budgets still need work. | Scope | Gate | Gate | Repeated wardrobe browsing and fleet gameplay stay within documented memory/frame budgets on a named desktop and mobile baseline. Record GPU/browser results; CPU geometry timing alone cannot close this gate. |
| PERF-05 | Real lazy boundaries and a production startup budget. Hero selection/workshop splitting reduces initial gzip JS by 1.7%; remaining eager paths are open. | Gate | Gate | Gate | Bundle manifests show optional screens outside the initial static closure. The game entry does not import research/editor-only modules. Loading and return navigation retain correct state. |
| DATA-01 | One appearance schema across profile save, full preview, and gameplay LOD. Reduced driver contract added; group schema/migrations remain open. | Gate | Gate | Gate | Old saves load safely, the server validates supported fields, reconnect/equip updates are correct, and compact snapshot v1/v2 compatibility plus v3 driver fixtures pass. Draft/Under Development items cannot become unsupported live loadouts. |
| SPLIT-01 | Explicit research and game entry points, capabilities, routes, and data ownership. **Open; not part of this performance patch.** | — | Gate | Gate | Gameplay can build/start with research services and editor tools absent. Research can consume documented simulation/data APIs without importing game menus or profile stores. Diagnostics remain opt-in. |
| PKG-01 | Versioned public APIs with independent build/test/example consumers. Existing wardrobe catalog is the first shared data package. **Open for further extraction.** | — | — | Gate | Each extracted package has an owner README, exports, dependencies, compatibility policy, disposal/lifecycle rules where relevant, and two real consumers or a justified independent example. No back-imports into application internals. |

## Color and details work specification

### Shared color selection

Start from [`ColorSwatch`](../../frontend/src/components/menus/ColorSwatch.tsx)
and [`ClothingColorToolbar`](../../frontend/src/game/characters/ClothingColorToolbar.tsx).
Swatch reuse does not yet provide a unified picker: clothing and the vehicle
workshop still own their own selection/input flows.

The control should accept a value and callbacks, a set of named presets, supported
color groups, and reset values. Profile persistence, live vehicle updates, and
wardrobe fitting remain adapters outside the control. Use one interaction model
for mouse, touch, keyboard, and controller. Add recent/saved colors only with a
clear owner and bounded storage; do not create a new global color store for each
screen.

Keep `color` and `accent` compatible with existing saves. Extend the existing
catalog's group metadata rather than adding independent hard-coded lists to each
UI. The current `PieceColors` and corset profiles already include fields such as
panel, lining, hardware, laces, and closure. Expand that support by asset capability;
do not pretend every mesh has independently dyeable regions. Define a stable
mapping from detailed groups to the cheap driver's broad top/bottom colors.

Palette candidates should include neutral/contrast, coordinated tonal, Gothic,
pastel, and restrained accent combinations. Each palette should explicitly map
main, secondary, and accent/detail roles to supported groups. Evaluate combinations
on actual fabric and trim under neutral light before promoting them to defaults.
These are design requirements; the palette redesign has not been implemented in
the performance branch.

### Details pane

The current desktop detail rail in
[`dressingRoom.css`](../../frontend/src/game/characters/dressingRoom.css) is
`clamp(154px, 17vw, 208px)` and narrows to `clamp(108px, 25vw, 140px)` on compact
screens. That is a concrete starting point for the width problem, not a proposed
new target. Review the full layout instead of simply making every control smaller.

Keep item title, status, key actions, and color-group selection visually distinct.
On a phone, let a deliberate details panel or sheet use useful screen width while
preserving a way to see the character. Keep Back/current section/search accessible
in the wardrobe component. Avoid nested scrolling traps and action rows that push
the color controls out of reach.

Candidate actions are equip/remove, remove/restore sleeves when supported, reset
the selected color group, reset the piece, compare original/current, and save the
outfit. Apply/cancel controls must follow the actual draft/persistence model; do
not add buttons that silently commit previews or do nothing. Validate at 320, 360,
390, and 768 CSS-pixel widths plus short landscape layouts. These widths are a
proposed acceptance matrix, not a claim that screenshots have already passed.

## Suggested extraction order

| Boundary | Initial contents | Must remain outside | Readiness condition |
| --- | --- | --- | --- |
| Existing `@avenlab/wardrobe-catalog` | Stable IDs, asset capabilities, semantic color groups and versioned palette metadata | GLB loaders, fitting, React, accounts | Browser and Rust use the same schema/fixtures; migrations preserve existing saves. |
| Shared color controls | Controlled picker/swatches/group UI and accessible interaction | App stores, server calls, material mutation | Clothing and vehicle editors use it successfully before extraction. |
| Appearance / LOD helpers | Pure appearance reduction, visibility policy, batch keys and resource ownership interfaces | Profile store access, networking, game-specific camera hooks | Deterministic tests and adapter-based use in gameplay and a standalone preview/example. |
| Vehicle asset tooling | Source-to-production roles, protected part manifest, compatible batching and validation | Overwriting artist sources, editor/session state | Repeatable derived builds and semantic animation/material tests for representative vehicles. |
| Snapshot protocol | Versioned wire schemas, encoder/decoder fixtures and validation | WebSocket connection lifecycle, HUD and stores | Old/new client compatibility and cross-language fixture checks run in CI. |
| Performance measurement | Bounded sampling, comparison/export formats and capture contracts | Always-on research UI, renderer-specific globals | Named adapters and repeatable target-device captures. |

Do not extract everything at once. First stabilize the color/data contracts and
render ownership rules, then create the separate game/research entry points, then
move proven reusable code behind package exports. Keep source maps and examples
small enough that a new consumer can understand the public API without reading
the entire game.

## Current validation limits and open issues

- The accepted merge is `0e81afe`. New performance code lives on a feature branch
  until reviewed and merged; completing this README does not approve a release.
- Browser/GPU execution is unavailable in the current workspace. CPU tests,
  geometry equivalence, bundle analysis, and draw-range counts are available;
  target-device FPS, GPU memory, and final visual appearance remain unmeasured.
- The Rust toolchain is unavailable here. New server palette and protocol tests
  must run in an environment with Cargo before the network changes are merged.
- The full wardrobe audit has known regular-skirt/corset failures. Preserve the
  exact accepted baseline while optimizing, then fix those issues in a separately
  measured visual change. Gothic high-waist and hand-clearance checks are useful
  evidence but do not erase the broader failures.
- Those 27 baseline failures cover 13 tier-specific pairings and nine distinct
  combinations: regular skirt 01 with corset 05; regular skirts 02/03 with corsets
  02/03/05; and regular skirt 04 with corsets 03/05. The entire pairing matrix has
  not been rerun for this performance patch; representative cold/warm geometry
  signatures are compared against the accepted merge instead.
- The cheaper driver tier does not include detailed faces, lace, cloth simulation,
  full emotes, or fitting-room meshes. Naval bridge occupants are not calibrated
  in this pass. The renderer must be tested through actual glass and cabin framing.
- Static vehicle batching reduces draw submissions, not the source triangle count
  or original download size. Complete offline production exports/texture budgets
  remain separate work; existing remote vehicle LOD exports continue to be used.
- Three pre-existing material-policy assertions disagree with current glass/paint
  behavior in `garage-vehicle-paint.test.mjs` and `vehicle-visuals.test.mjs`. The
  [vehicle tools README](../../frontend/src/vehicles/tools/README.md) names the
  cases. Review the intended appearance policy and align fixtures before treating
  the wider vehicle suite as a clean alpha gate; batching does not change that policy.
- The fitting cache has a budget; this does not bound Drei/useGLTF source caches or
  all decoded textures. Missing mobile garment variants and repeated textures
  remain tracked under PERF-04.
- Pausing character playback does not yet establish a fully idle desktop preview
  pipeline. Camera transitions, reflections, mirrors, loading effects, and wake-up
  invalidation need one coordinated review before changing frame-loop policy.
- The current performance capture UI targets gameplay. Add an explicit preview
  capture context before reporting fitting-room frame-time comparisons from it.

## Updating this checklist

For each change, update its owning README and this grid with **what changed,
what was measured/tested, and what is still open**. Record commands and input
assets with numerical results in [performance notes](../../performance/README.md).
Do not convert a pending visual check into “done” based only on a successful build.
When a gate is completed, include the commit/PR and evidence rather than deleting
the history. COLOR-01–03 and UI-01–02 remain product follow-ups. Hair and pose work
proceed on their own branches while the performance branch continues measured
optimization and completes its validation.
