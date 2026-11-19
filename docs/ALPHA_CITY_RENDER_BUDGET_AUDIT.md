# Alpha city render-budget audit — 2026-11-18

## Status
PR #38 covers the capture comparator, empty material batches and the city render passes measured below. The P0 audit remains open for first-entry measurements on the live map, physical-device frame times and sustained driving.

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
- Trace a first login on the live map with concurrent buildings, roads, vehicle and UI. Compare it with warmed driving on the same phone.
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

## First city load and GPU preparation

The streamed city prepares full and reduced buildings before replacing their proxies. On the Fast instanced fallback, the old upload phase drew 1,393,693 building triangles into a 1 × 1 target. The renderer can upload the same buffers with the meshes visible and their instance counts at zero. Three.js r181 binds the vertex, index and instance buffers before it checks how many instances to draw. The warmup keeps the representative bounding sphere that Three uses for sorting.

The shared work queue now groups up to four small meshes per offscreen render, with a combined 256 KiB budget for vertex and index arrays. Large meshes and transmissive materials get individual turns. After live shader compilation, a WebGL fence checks whether previously submitted commands have finished. Each poll uses a zero timeout and yields to the animation loop, so the proxy can stay on screen during that wait. Cancellation disposes the fence and the warmup target.

### Measurements

Each cell is the baseline → candidate median of three fresh Chromium/SwiftShader processes per revision. The four junction configurations produced 24 captures. Shadows and detailed reflections were enabled except in the basic-reflections row. The same locked Three.js version, assets, camera, lights, viewport and DPR ran on both revisions. Browser caches and WebGL contexts were fresh per run. The local files could remain in the OS cache.

| City rendering mode | Building geometry phase (ms) | Largest observed building-prep frame gap per run (ms) | First visible render + readback (ms) | Load to first visible (ms) | Warmed frame + readback (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fast fallback, shadows off, basic reflections | 924 → 465 | 50 → 50 | 1,267 → 391 | 3,923 → 3,757 | 151 → 143 |
| Fast, instanced fallback | 918 → 420 | 83 → 33 | 1,288 → 499 | 4,098 → 3,511 | 187 → 196 |
| Fast, native multi-draw | 570 → 384 | 67 → 50 | 1,557 → 713 | 4,026 → 4,082 | 210 → 213 |
| Balanced, instanced fallback | 1,044 → 504 | 117 → 67 | 5,156 → 1,680 | 8,896 → 8,987 | 755 → 802 |

The Fast fallback building upload used 206 offscreen renders instead of 566 and allocated the same 2,857 vertex/index buffers (87,622,732 bytes, including instance data). The native path used 89 renders instead of 212 with the same 930 buffers (84,688,104 bytes). In both paths, Three issued zero city geometry draws during the upload phase. The first visible frame allocated zero additional vertex/index buffers. Final draw counts, submitted triangles and RGBA hashes matched within each mode.

Fast fallback reached the first complete frame 166 ms sooner with basic reflections and 587 ms sooner with shadows and detailed reflections. Native and Balanced reached it 56 ms and 91 ms later in these samples. Much of the first-frame improvement came from letting the GPU finish submitted work while proxies were available. The median building fence waits were 975 ms (Fast), 1,016 ms (native Fast) and 3,863 ms (Balanced). Balanced texture upload also took 1,441 ms on the candidate. Warmed frame medians varied and this change only runs during preparation.

The per-run CSV records both assets, every preparation phase, buffer allocations and frame readbacks. Scene-level metrics repeat on the building and road rows of each capture. [Raw measurements](../performance/city-gpu-preparation-2026-11-18.csv)

### Repeat the cold capture

Use the WebGL fixture procedure above with baseline `bf2056a`. Copy both `city-render-passes.html` and `city-preparation.mjs` from the candidate into the baseline fixture directory. Also materialize `chunck_0,0_2x2_blocks_centered_reduced.glb`.

- Start a fresh browser process and WebGL context per capture. Open the fixture with `?prepare=1` for Fast fallback, `?prepare=1&multiDraw=1` for Fast native, `?prepare=1&quality=balanced` for Balanced fallback, or `?prepare=1&shadows=0&reflections=0` for Fast fallback with basic reflections. The harness uses the production preparation queue and prepares the building asset and road asset in sequence.
- Read the per-asset phase times, queue frame gaps, geometry draws and vertex/index buffer allocations. Asset preparation elapsed time includes queue yields and, on the candidate, the GPU wait. The load/decode field includes the reduced asset for buildings.
- A one-pixel readback synchronizes the first visible frame. Five more renders of the same view provide a warmed median. The load-to-visible timer starts just before the first GLB load and ends at the first readback. The fixture uses a single placed tile, the fixed junction camera and the same 480 × 270 software-WebGL setup as the render-pass audit.

### Verification for this milestone

All 55 focused city, capture and reflection checks passed, including eight new GPU preparation tests covering group limits, buffer eligibility, native batching, cancellation, renderer state restoration and fence cleanup. Frontend typecheck, lint on the changed runtime module and the production build passed.

The full frontend suite ran 873 tests with 738 passes, 77 failures and 58 skips. Of the failures, 76 also appeared in the preceding PR run. The additional prematch preview test file exited unsuccessfully during the full run and passed all eight tests when rerun alone.

### Next physical-device check

On the same iPhone and production route, start a browser performance trace before joining. Record time to the first proxy, the first detailed frame and the first steering input the game displays. Repeat with the same graphics settings on both revisions, then use F8 for a separate warmed driving capture. The remaining first-entry question is how concurrent city uploads, vehicle loading and UI affect those three points.
