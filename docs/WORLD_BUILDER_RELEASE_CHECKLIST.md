# World placement release checklist

Base: `0af4c64e87fd86ef618dd2fabae78f415b969bd9` on `main`, verified October 29, 2026. Install the placement patch before starting the next update.

## Apply and build

Use a working branch and retain any local edits. From the repository root, set the patch path to the extracted ZIP's `world-placement.patch`:

```sh
git status --short
git apply --check /absolute/path/to/world-placement.patch
git apply /absolute/path/to/world-placement.patch
git lfs pull --include="frontend/public/models/world/garage_special.glb,frontend/public/models/roads/**"
npm ci --prefix frontend
npm --prefix frontend run lint
npm --prefix frontend run build
cargo test --manifest-path avenlab-server/Cargo.toml --locked
```

Node 24 was used for verification. Run the frontend suite from its own directory, with CPU available:

```sh
cd frontend
node --test --test-concurrency=1 tests/*.test.mjs
```

The `files/` tree in the ZIP is an alternative overlay for manual merging. Use either the unified patch or the overlay. If the apply check fails, compare the affected files with your local changes before applying anything. The ZIP manifest records both original and patched SHA-256 hashes.

Frontend prebuild checks the road and garage source hashes and refreshes the map catalog. Existing LFS files must contain actual GLBs. Source/catalog mismatch needs an intentional asset regeneration and saved-placement revision update; the build should not hide it. See [placement documentation](WORLD_BUILDER_PLACEMENT.md) for the regeneration commands.

Build/restart both services using the project's usual workflow and open a new Sandbox session. The offline preview exercises authoring and rendering; real driving requires Rust.

## In-game acceptance

These boxes are a release smoke checklist for the installed build. Automated results below do not mark these user-side checks complete.

| Check | Expected result | Complete |
| --- | --- | --- |
| Open World builder from the menu and with F9 | Both entry points work; driving inputs stay blocked while editing | [ ] |
| Change Dark navy to Hacker blue, reload, then choose Dark navy | Preference persists; changing theme leaves the map draft clean | [ ] |
| Preview a road and the selection-screen garage | Real GLBs load; orbit/zoom and garage cutaway work; Escape or controller Back closes the preview | [ ] |
| Choose Place this piece in the garage preview | The same garage appears in the map, at its measured size | [ ] |
| Move the garage, rotate it and press F | Camera frames the selected piece; Fit layout returns to the whole district | [ ] |
| Toggle garage floor, walls and roof | Visible structural groups and collision view agree; fixtures stay decorative | [ ] |
| Save, reload, undo/redo and export the garage layout | Placement, yaw, size, visibility and collision masks survive the roundtrip | [ ] |
| Start Workshop Yard with the BRZ | Car starts on the pad and drives out the open bay, over the apron and onto the road | [ ] |
| Start Road Precision Test | Narrow opposing carriageways, wide road and junction keep their existing measured collisions | [ ] |
| Add an opposing narrow carriageway | Adjacent sidewalks disappear; exterior sidewalks remain; arrows retain the correct source direction | [ ] |
| Turn the chunk guide on and off in Perspective and Plan | Reference outline appears without creating a collider or resizing roads | [ ] |
| Export a finite layout and install it on Rust | A new session matches the export; there is no repeated road tile or support floor unless explicitly enabled | [ ] |
| Reopen Streaming Endless City | Existing city remains selectable; its old merged chunks are unchanged | [ ] |

## Evidence included with this release

- Frontend lint, typecheck and production build passed.
- Frontend suite: **243 passed, 2 skipped, 0 failed**. The skips depend on unrelated vehicle LFS assets.
- Rust suite: **93 passed, 0 failed**. Includes a real BRZ driving out of the garage and onto the road, plus the existing road-seam driving test.
- Browser verification: real compressed garage decoding, 414 structural triangles matching the collider catalog, preview/cutaway, placement, masks, themes and reload, export, controller close, and mobile layout.
- Offline preview: embedded road/garage assets and Draco decoder; zero HTTP requests during the verified workflow.
- Patch packaging: clean-base application and file hashes checked. This handoff adds documentation to the tested runtime source; it does not add gameplay changes.

## Review text

Suggested title: **Add garage world placement, piece previews and saved editor themes**

The world builder can now preview library pieces and place the actual selection-screen garage in a playable map. The garage uses 414 measured structural triangles with an open bay and decorative fixtures excluded from physics. Dark navy is the default saved theme, with Hacker blue and Forest alternatives. Selected-piece framing and an optional chunk guide support rebuilding the city; Workshop Yard provides a drivable fixture.

Validation: frontend lint/build, 243 frontend tests and 93 Rust tests passed; two unrelated frontend asset tests skipped. Browser checks cover real Draco loading, visual/collision parity, draft roundtrips, export, controller close and mobile sizing.

## Rollback and next work

Before any later source edits, `git apply --reverse --check /absolute/path/to/world-placement.patch` checks whether the source patch can be reversed cleanly; `git apply --reverse` performs that reversal. Keep exported maps and browser drafts separately. Rebuild/restart both services after a source rollback. A server without model-placement support cannot run exports that contain the new garage reference.

After the installed smoke checks pass, follow [the next-update brief](WORLD_BUILDER_NEXT_UPDATE.md). The next implementation starts with a road/jump proving map, then a chokepoint template; full city-chunk rebuilding is a separate sequence.
