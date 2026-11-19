# Alpha city render-budget audit — 2026-11-18

## Status
PR #38 covers the capture comparator, empty material batches and the city render passes measured below. The P0 audit remains open for physical-device frame times, first-load stalls and sustained driving.

## Existing evidence
The historical ten-second gameplay capture averaged 41.23 ms/frame, 4,187 draws and 19.70M triangles. A separate controlled city-only Chromium software-WebGL comparison measured Original at 4,385 draws / 19,418,060 triangles and Fast at 233 draws / 3,120,463 triangles. That is about 94.7% fewer draws and 83.9% fewer triangles **in that isolated view**. Both paths used 512px textures, and no vehicle was present. Do not claim mobile FPS or compare the gameplay and city-only records as a matched pair. See [CITY_PERFORMANCE.md](CITY_PERFORMANCE.md).

## Reproducible test procedure
1. Build and preview the production frontend. Use F3/F8 to record a fixed map, route, vehicle, camera, viewport, DPR, shadows, reflections and view distance.
2. Wait for asset warmup, then record a comparable duration and driving pattern. Change only the intended render setting.
3. Export captures and transcribe the actual verified counters to two JSON files with `context` and `metrics` objects. Do not invent missing frame percentiles.
4. Run `node --test frontend/tests/city-render-capture-compare.test.mjs`.
5. Run `node scripts/audit-city-render.mjs before.json after.json`. Exit 0 indicates no increases in the four checked metrics; 1 indicates a regression; 2 indicates invalid or incomparable input.

Example JSON **schema illustration, not a measured capture**:
```json
{"context":{"map":"city","route":"fixed-loop","camera":"chase","viewport":"1280x720","dpr":1,"vehicle":"BRZ","shadows":false,"reflections":false,"viewDistance":"500m","warmupComplete":true},"metrics":{"drawCalls":1000,"triangles":5000000,"frameP95Ms":16,"frameP99Ms":22}}
```

## Remaining implementation and visual checks
- Extend the fixed-view pass measurements to a warmed driving route with a vehicle and moving lights.
- Verify near/far building culling, junction geometry, stable instance buffers and authored collision transforms.
- Measure first-load texture/shader stalls separately from warmed driving.
- Compare Fast/Balanced/Original and 250/500/750m at identical settings on desktop and a physical phone.
- Perform a 15-minute mobile thermal run and verify visible building facades, road seams, shadows and glass.

## Acceptance
Do not close P0 until matched physical-device captures and visual checks exist. This comparator is deliberately strict: an increase in draws, triangles, p95 or p99 flags a regression; quality tradeoffs need separately documented approval. It does not measure GPU memory, per-pass overdraw, thermal behavior or input latency.

## Milestone 2: empty material-batch draw suppression

Reviewed `cityDrawBatches.ts` and `cityInstances.ts`. The existing native multi-draw path already groups compatible opaque materials, skips transparent/transmissive meshes, and frustum-culls placements. Found a concrete avoidable-work issue: `updateCityDrawPart` unconditionally sets the shared `BatchedMesh.visible = true` even when every part's instance count is zero. That can leave empty material batches eligible for a draw submission.

Added `settleCityDrawBatches`, called after all parts update, to set shared batch visibility from the aggregate live instance count. It preserves visibility if any sibling part still has instances. Added a regression test covering proxy-only, visible and frustum-culled placements. No changes to geometry, collision, textures, LOD thresholds or transparency ordering.

The empty/shared-batch regression test passed in this audit. The following captures use this milestone as their baseline.

## City render pass measurements

Compared PR head `4115f452` with the updated renderer. The fixture loads one full-detail city building tile, its facade repairs and road tile with the Fast 512 px or Balanced 1024 px assets. It renders one warmup frame, resets Three.js counters and measures one frame at the same camera pose. Chromium headless shell 158.0.8127.36 used SwiftShader WebGL2, a 480 × 270 buffer at DPR 1, a foggy-day sky environment and the world directional light. The fixture omits traffic, fog and chunk streaming to isolate the render passes.

| View and settings | Draws before → after | Submitted triangles before → after |
| --- | ---: | ---: |
| Junction, Fast, instanced fallback | 314 → 209 | 1,405,910 → 1,090,481 |
| Junction, Fast, native multi-draw | 156 → 141 | 1,142,740 → 1,090,481 |
| Junction, Balanced, instanced fallback | 473 → 368 | 2,100,295 → 1,784,866 |
| Junction, Fast fallback, shadows off, basic reflections | 161 → 160 | 764,705 → 729,545 |
| Road end, Fast fallback, all three paint decals in view | 302 → 204 | 1,589,640 → 1,191,740 |

Shadows and detailed reflections were enabled except in the fourth row. The rendered RGBA bytes matched before and after in all five cases. These counters measure submitted work. Gameplay p95/p99 and physical-device FPS require a separate production capture.

- **Shadows.** Full-detail fallback casters now maintain a sphere enclosing their packed placements. Each render camera can reject the entire mesh. Bounds refresh when membership or transforms change, or when shadows are re-enabled. Native batches retain their per-object culling. Unbatched singletons on that path use the new bounds too. At the Fast fallback junction the shadow pass went from 153 to 49 draws and 641,205 to 360,936 triangles. Main opaque draws held at 157. Road assets also skip the scene traversal for caster frusta.
- **Transparency.** The three flat, double-sided `MarkingRoad` decals in the shipped road tile use one blended pass each. They retain alpha blending, depth-write settings and both visible sides. At the road end transparent draws went from 8 to 5 and triangles from 98,264 to 49,904. Balanced retained its native glass transmission at the junction with 4 transmissive draws and 3,552 triangles on both revisions.
- **Reflections.** World paint and glass sample a generated sky environment. Longitude terms are now computed once per column and pixels facing away from the key light reuse their row's encoded sky color. At 256 × 128, longitude sine/cosine calls fall from 65,536 to 512 per generated map. All texels matched across day/night and both resolutions. These savings apply when the sky or reflection detail changes.

| Sky map generation, median CPU ms | 128 × 64 before → after | 256 × 128 before → after |
| --- | ---: | ---: |
| Foggy day | 0.91 → 0.43 | 3.67 → 2.11 |
| Starry night | 0.97 → 0.53 | 3.68 → 1.92 |

The CPU measurement used Node 24.22.3 in one process. For each preset and resolution, time one `skyReflectionMap(preset, detailed)` call with `performance.now()`, dispose the resulting texture outside the timed interval, and alternate revision order. Discard four runs per revision and take the median of the next 31. GPU environment filtering runs separately.

### Reproduce the WebGL capture

1. Use separate checkouts for `4115f452` and the candidate. Copy the candidate's `frontend/tests/fixtures/city-render-passes.html` into the same path on the baseline. Install the locked frontend dependencies and materialize the centered building and road `_textures512.glb` and `_textures1024.glb` files under `frontend/public/models/chuncks/`.
2. From each `frontend/` directory, run `npm exec -- vite --host 127.0.0.1`. Open `/tests/fixtures/city-render-passes.html` at the displayed origin. The default is the Fast fallback junction. Repeat with `?multiDraw=1`, `?quality=balanced`, `?shadows=0&reflections=0` and `?view=road-end`. Native mode requires `WEBGL_multi_draw`.
3. Compare each pair's draw and triangle counters and `rgbaSHA256` on the same browser and GPU. The page reports shadow, opaque, transparent and transmissive material submissions. Balanced's opaque count includes its transmission prepass. Web Crypto supplies the pixel digest on localhost or HTTPS.

### Automated verification

From `frontend/`, run `node --test tests/city-*.test.mjs tests/world-sky-lighting.test.mjs tests/capture-recording.test.mjs`. All 47 checks passed, including shadow toggles and offscreen casters, custom materials, texel equivalence, and comparator CLI exit codes. The comparator now checks arguments only during direct execution and rejects either cold input. Frontend typecheck and the standard production build passed.

The full frontend run (`node --test --test-concurrency=4 tests/*.test.mjs`) reported 76 failures and 58 skips. The same 76 failure names occurred on the baseline, which also failed to import the comparator. Examples include unmaterialized vehicle fixtures, the garage paint assertion and UI behavior tests. Full frontend lint reported 49 errors and 6 warnings on each revision. The physical-phone driving and thermal checks remain open for review.
