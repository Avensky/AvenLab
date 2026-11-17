# Frontend behavior checks

Node tests use pure document helpers or the real React/store modules through Vite SSR. organized-features.test.mjs covers menu braking, themes, spawn history, radio render boundaries and minimap sampling.

## How to edit

Run node --test --test-concurrency=1 tests/*.test.mjs. Update behavior assertions when an interaction intentionally moves; retain independent steering/brake/cancellation/protocol checks. Browser QA verifies real WebGL/assets/layout separately.

From the repository root, `npm --prefix frontend run audit:wardrobe` runs the
catalog, Heroes selection, fitting-room preview, and profile and device
saved-outfit checks. Use `npm --prefix frontend run audit:wardrobe -- --full`
to include those checks along with picking, camera and mirror controls, pose
clearance, portrait fallbacks, and preview canvas reuse. The full run also
checks installed GLBs, garment animation and skin coverage in sampled poses.
It builds the standalone wardrobe pieces from the tracked bundles and checks
the generated Sweetheart and Ruffled tiers for geometry and texture errors.
To check profile validation and character saving on the server, run
`cargo test --locked --manifest-path avenlab-server/Cargo.toml character`.
The [wardrobe guide](../src/game/characters/README.md#run-the-checks) lists the
selective Git LFS pull and the manual CI run.
