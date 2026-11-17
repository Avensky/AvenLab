# Frontend behavior checks

Node tests use pure document helpers or the real React/store modules through Vite SSR. organized-features.test.mjs covers menu braking, themes, spawn history, radio render boundaries and minimap sampling.

## How to edit

Run node --test --test-concurrency=1 tests/*.test.mjs. Update behavior assertions when an interaction intentionally moves; retain independent steering/brake/cancellation/protocol checks. Browser QA verifies real WebGL/assets/layout separately.

From the repository root, `npm --prefix frontend run audit:wardrobe` runs the
wardrobe fixture checks. Use `npm --prefix frontend run audit:wardrobe -- --full`
to exercise the installed GLBs and animated fit with required asset checks.
The [wardrobe guide](../src/game/characters/README.md#run-the-checks) lists the
selective Git LFS pull and the manual CI run.
