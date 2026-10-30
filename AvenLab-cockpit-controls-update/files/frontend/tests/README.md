# Frontend behavior checks

Node tests use pure document helpers or the real React/store modules through Vite SSR. organized-features.test.mjs covers menu braking, themes, spawn history, radio render boundaries and minimap sampling.

## How to edit

Run node --test --test-concurrency=1 tests/*.test.mjs. Update behavior assertions when an interaction intentionally moves; retain independent steering/brake/cancellation/protocol checks. Browser QA verifies real WebGL/assets/layout separately.
