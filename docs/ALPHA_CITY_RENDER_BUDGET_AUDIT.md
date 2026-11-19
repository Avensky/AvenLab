# Alpha city render-budget audit — 2026-11-18

## Status
P0 city draw-call and triangle audit: comparison tooling and regression tests added. No renderer behavior changed. Physical GPU performance and CI test results are **not yet verified**. Isolated branch avoids wardrobe, hair and pose changes.

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
- Inspect opaque/transparent/shadow/reflection draw passes and city material buckets; verify repeated compatible meshes actually instance rather than merely group.
- Verify near/far building culling, junction geometry, stable instance buffers and authored collision transforms.
- Measure first-load texture/shader stalls separately from warmed driving.
- Compare Fast/Balanced/Original and 250/500/750m at identical settings on desktop and a physical phone.
- Perform a 15-minute mobile thermal run and verify visible building facades, road seams, shadows and glass.

## Acceptance
Do not close P0 until matched physical-device captures and visual checks exist. This comparator is deliberately strict: an increase in draws, triangles, p95 or p99 flags a regression; quality tradeoffs need separately documented approval. It does not measure GPU memory, per-pass overdraw, thermal behavior or input latency.
