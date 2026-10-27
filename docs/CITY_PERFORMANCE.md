# City chunk performance

The supplied ten-second city capture averaged 41.23 ms per frame (about 24 FPS), 4,187 draw calls and 19.70 million submitted triangles. Its CPU submission measurement averaged 26.90 ms; server physics averaged 17.94 ms. The collider capture was much faster, but also changed the vehicle rendering, reflections and driving conditions. It is evidence of a rendering bottleneck, not a controlled measurement of this patch's FPS improvement.

The centered building GLB contains 1,035,438 triangles and 273 mesh primitives. All 103 building materials, including concrete and brick, have transmission enabled. All 11 road materials do too. Repeating the source across nine chunks and rendering solid surfaces through the transmission pass is expensive even with shadows disabled.

## Controls

Use **Settings → Display → Apply mobile performance preset**, or the same action under **Debugger → Environment**. It enables Fast city detail, DPR 1 and distance fog, and disables shadows, reflections, stars and vehicle lights. It clears per-chunk/asset overrides and debug visualizers. HUD, controller, input and interpolation preferences are preserved.

The **City detail** row supports mouse, keyboard and the existing controller menu navigation:

| Mode | Nearby geometry | Distant geometry | Materials |
| --- | --- | --- | --- |
| Fast | Original geometry within 80 m of a block footprint; 512 px textures | Reduced textured GLB to the selected range (Auto: 500 m), skyline beyond | Solid opaque surfaces; inexpensive transparent glass |
| Balanced | Original geometry within 140 m; 1024 px textures | Reduced textured GLB to the selected range (Auto: 750 m), skyline beyond | Solid opaque surfaces; native transmission on Glass |
| Original / A/B | All loaded chunks | Original models | Original export, with the existing optional opaque-material diagnostic |

Road models remain visible across the loaded map. Missing building collider metadata retains full models for that chunk. Physics, collisions, map coordinates, spawn points and vehicle handling are unchanged. The source GLB has four named city blocks per 2×2 chunk, with geometry merged by material inside each block. Distance bands now follow those blocks independently, rather than filling a fixed number of whole-chunk slots. The distant skyline is an inexpensive approximation. Original mode remains available for visual comparisons.

## View distance and interpolation settings

**Settings → Display → View distance** and the shared Debugger controls offer **Auto, 250 m, 500 m, 750 m and 1,000 m**. Auto retains the existing quality-specific range. Explicit distances are independent of the Fast/Balanced texture and nearby-geometry choices. The source city's four blocks use horizontal collider footprints; skyline proxies remain beyond the selected range. Normal movement keeps the existing 35 m retention band. Changing the range resets selection hysteresis immediately, without remounting/preparing the active city assets. Custom chunk metadata uses the explicit radius too; Auto retains its existing bounded fallback. Missing metadata retains the safe full-model fallback.

Original / A/B deliberately renders all loaded models, and its View distance row is disabled. Distances are limited to the map the server has loaded; this control does not generate or request additional city chunks. The shared canvas far plane is 2,000 m so the longest option is not cut off by the old default 1,000 m camera plane. Distance fog remains a separate setting.

**Vehicle interpolation defaults to On**, using the existing **50 ms** display buffer. Display and Debugger share one toggle. An explicit Off choice is saved across reloads; only this preference is persisted, while diagnostic player scope still starts Local. Graphics presets and Sandbox entry keep the interpolation choice. The mobile performance preset restores Fast / Auto distance. Render-preset actions no longer silently turn interpolation off.

View distance is validated and saved with display preferences. Old settings without this field use Auto. Captures include `cityViewDistance` and `cityViewDistanceMeters` (null for Original's all-loaded mode), so distance changes invalidate a recording just like other graphics changes.

Validation covers mouse, arrow keys, controller D-pad/A, reload persistence, shared Debugger values and 844×390, 390×844 and 568×320 browser layouts. Real city GLBs were cycled through every distance and back to Auto: model/skyline coverage matched the selected radius, the 223 model geometry allocations and 432 texture allocations stayed stable, no asset preparation repeated, and no JavaScript/shader/WebGL errors occurred. The single optional skyline-box geometry is added/removed when proxies appear/disappear. At the fixed city-only test view, submitted triangles were 1,837,631 at 250 m, 2,385,463 at 500 m and 3,292,914 at 750/1,000 m. The latter two cover the same available city from that position. These software-GPU counters do not establish phone FPS. All **127 frontend tests** and the production build passed.

The latest uploaded CSV, ending `2026-10-27T20-51-46-796Z.csv`, contains two runs. The newer Windows/Edge-labeled Camaro run at 1256×624 averaged **10.77 ms** per frame (about **93 FPS**), p95 **14 ms**, p99 **14.1 ms**, roughly **301 draws / 2.76 million triangles**, input acknowledgement **13.83 ms**, server physics **0.338 ms**, and zero sampled frames over 17.17 ms. It used a development build with interpolation and the listed graphics effects enabled. The older row is a Safari-labeled AE86 run at 956×440; device, car, route, viewport and model coverage differ, so their difference is not a controlled patch speedup. Both predate this new distance setting and lack its explicit metadata.

## Compact recorder and shadows-off capture

The latency overlay now starts with only Name, Start/Stop, Export, Open and Close.
Its three expanded tabs separate Position, Network / Physics and City Assets.
The compact readout skips live metric-ring sorting for invisible summaries;
capture sampling and validation remain active. View/Select focuses the inspector
for controller navigation, and starting a capture returns to driving. Blank
labels describe the vehicle/quality/range/shadow setting. Manual Stop can retain
a valid partial run with its actual duration and an explicit early-stop flag.
See `performance-recording.md` for controls and export details.

The upload ending `2026-10-27T22-28-12-371Z.csv` adds two ten-second Windows/Edge,
BRZ, Fast/Auto 500 m, DPR 1 runs with shadows off and interpolation on. The
near-stationary run averaged **13.97 ms** per frame (about **72 FPS**), p95
**14.8 ms**, p99 **21 ms**, CPU submit **5.04 ms**, 492 draws and 3.66 million
triangles. The driving run averaged **12.85 ms** (about **78 FPS**), p95 **14.1 ms**,
p99 **14.5 ms**, CPU submit **4.13 ms**, about 500 draws and 3.12 million triangles.
Neither had pending city preparation. Their preceding shadows-on runs averaged
13.11 and 13.53 ms. Routes, camera movement and model coverage differ; these runs
do not establish a consistent shadow speedup. Repeat a fixed route/camera in a
production build, changing only shadows, before attributing a performance gain.

## Rendering and loading

- Repeated chunk models share instanced draw calls, geometry and textures. Each original mesh's authored transform is preserved, then the visual transform and chunk origin are applied exactly once.
- Each mesh instance is culled against the camera frustum. When shadows are enabled, nearby opaque geometry remains available as off-screen shadow casters only where a live light's shadow camera needs it. Roads, transparent glass and reduced distant models receive shadows without casting opaque slabs. Stable visibility does not re-upload instance matrices every frame.
- Distance bands use authoritative horizontal block footprints from collider metadata. Tower height, camera heading and the old two-chunk Fast cap cannot leave a nearby block as a silhouette. Detail selection updates at 10 Hz. Original geometry has 15 m of retention hysteresis; reduced models have 35 m. Unknown/custom assets retain the existing chunk renderer, including the earlier camera lookahead improvement.
- The optimized modes remove transmission from solid city surfaces using owned material clones. Cached GLB geometry, textures and original materials are not edited. Unsupported animated/skinned assets retain the original renderer.
- One shared animation-frame queue stages mesh creation, texture uploads and vertex-buffer uploads, targeting 3 ms or 12 jobs per frame. A single driver upload or shader compilation can exceed that soft budget. Draco decoding uses the bundled decoder with at most two workers for these assets.
- Shaders are prepared before native meshes become visible. Temporary road/building boxes cover asset preparation. Cancellation and disposal release owned instance buffers and materials while retaining shared GLB resources.
- Optional optimized reflections use a small generated local environment instead of downloading a preset HDR environment.

The source contains 57 building images at 4096×4096, 43 at 2048×2048 and 16 at 1024×1024. Just the decoded building RGBA images total approximately **4,614 MB**, before mipmaps and other copies. This exhausted the software-browser validation environment during native texture upload.

Four generated GLBs preserve every original mesh, node, material definition and non-image buffer byte while limiting image resolution. Originals remain untouched. Fast reduces decoded building images to **121.6 MB** and the building download from 20.81 MB to **9.64 MB**; roads become 3.1 MB decoded / 0.32 MB downloaded. Balanced uses 486.5 MB of decoded building images / 13.52 MB downloaded. These are image-data calculations, not measurements of total runtime GPU memory. Lower texture resolution trades fine surface detail for memory headroom; Original keeps the full textures.

Install the generated model files included with the patch. To regenerate, materialize both original GLBs with Git LFS, install Python Pillow, and run `python scripts/optimize-city-textures.py` from the repository root. The script verifies all geometry/node data is retained. Only the two known city templates are remapped; custom map paths are preserved.

GLB parsing and atomic uploads still have costs. Further geometry simplification, GPU-compressed textures and smaller per-building assets are further options if first entry remains slow on the target phone. The queue reduces scheduling contention; it cannot guarantee a hard frame-time ceiling.

## Server and measurement

Run `npm run dev:fast` from the repository root to use the existing development services with `cargo run --release`. Alternatively run `npm run dev:rust:fast` or `npm run start:rust` for just the Rust server. The original commands remain available. Release compilation takes longer initially. No Rust physics source is changed, and no server speedup is claimed without a new capture.

For fair frontend measurements use `npm --prefix frontend run build` followed by `npm --prefix frontend run preview`. Use the same car, camera, route, speed, viewport, DPR and effects for Original versus Fast. Keep interpolation settings fixed. Wait for city preparation to finish before recording with F8, then export JSON/CSV from the existing performance overlay. Change one setting at a time when isolating a bottleneck.

Captures include city quality, optimized detailed/proxy chunk counts, pending preparation count and long-task measurements. The chunk counters describe the optimized renderer; Original has no optimized batches. A chunk may contain both GLB models and far silhouettes, so the model/silhouette chunk counts can overlap. Long tasks require browser PerformanceObserver support; absence on a browser does not imply that no stalls occurred. Capture readiness now also waits for city GPU preparation, beyond network asset loading.

## Validation

The automated suite covers bounded detail selection, rectangular cells, hysteresis, visibility overrides, transform composition, frustum packing, shadow casters, stable instance uploads, capacity checks, material ownership, fallback assets, queue budgets/cancellation and preparation readiness. Production build, ESLint and the full frontend suite are run for this patch. See the package's APPLY.md for final results and actual-asset browser checks.

A physical mobile GPU benchmark is still required to establish achievable FPS and input latency. The Rust toolchain is unavailable in the patch environment, so the new release command is not executed here.

Actual-asset Chromium/WebGL checks at 480×270, fixed chase camera and identical effects reported:

| Renderer | Draw calls | Submitted triangles |
| --- | ---: | ---: |
| Original material/rendering path | 4,385 | 19,418,060 |
| Fast | 233 | 3,120,463 |
| Fast after an Original → Fast switch | 233 | 3,120,463 |

Both rendering paths used the same generated 512 px textures for this controlled draw-count comparison; native full-resolution textures exceeded the software browser's memory capacity. Fast itself was initially loaded from the native map URLs and correctly selected its generated variants. City geometry is unchanged in those files. No vehicle was included in this isolated city check. The camera, DPR, fog, lights and effects were held fixed. There were no JavaScript, shader or WebGL errors, preparation completed, and the quality switch retained shared source resources. This is a rendering-work comparison on a software GPU, not a mobile FPS benchmark. All **108 frontend tests**, production build and full ESLint passed.

## Distance bands and reduced geometry

The new `chunck_0,0_2x2_blocks_centered_reduced.glb` is required for this update. It contains **357,447 triangles**, compared with **1,035,438** in the source template, and is about 2.6 MiB. All 279 source nodes, 273 meshes and authored transforms were retained. It contains no textures: runtime pairs its mesh names with the source meshes and shares the existing material/texture instances. The originals remain intact. This is lossy geometry simplification; nearby models keep the original geometry.

Install the actual GLB bytes from the package alongside its code. Reduced geometry is prefetched with the main model and joins the shared staged upload/shader queue. A missing reduced mesh uses its original geometry, and a failed reduced-model load falls back to source geometry instead of leaving a missing city. Capture readiness still reports asset-load failures until a clean reload.

To regenerate, materialize the existing 512 px building GLB, run `npm ci --prefix scripts/city-lod` and then `npm run --prefix scripts/city-lod build`. The pinned build tool uses glTF Transform, Draco and meshoptimizer with normal/UV attributes in its simplification error. It verifies node transforms and a triangle budget and writes `city-reduced-manifest.json` with the source hash and actual output counts. These tools are only for asset generation; the shipped model needs no new frontend runtime dependency.

Actual-GLB browser checks at the recorded junction and during an approach/crossing found no silhouettes for any block within Fast's 500 m model range, no simultaneous full/reduced instances for the same mesh placement, no repeated preparation and stable geometry/texture allocations while moving. All 273 meshes found their reduced counterpart. Turning has no effect on these distance bands. Internal views were visually inspected.

A city-only, fixed-camera Chromium/software-GPU comparison at the junction, with shadows/reflections enabled, reported:

| Renderer | Chunks containing GLB models | Submitted triangles | Draw calls |
| --- | ---: | ---: | ---: |
| Previous whole-chunk selection | 2 | 3,659,316 | 288 |
| New block distance bands | 9, some with far silhouettes | 3,654,350 | 561 |

The additional coverage has a similar triangle count at this view, with more draw calls. Geometry allocations rise because the reduced geometry is cached too; texture allocation does not duplicate the city maps. This comparison does not establish mobile FPS. Without effects the new junction view submitted 2,483,441 triangles in 394 calls; counts vary by position and view.

## Latest uploaded capture

`avenlab-performance-glb-fast-mode-interpolation-off-2026-10-27T07-19-08-344Z.csv` contains a ten-second Fast-mode run. Mean frame time is **21.67 ms** (about 46 FPS), p95 **28 ms**, CPU submit **1.89 ms**, mean input acknowledgement **9.59 ms**, and server physics **0.321 ms**. There were exactly two detailed/seven proxy chunks and zero pending preparations throughout. This supports a selection-policy explanation for nearby silhouettes rather than a waiting download. CPU submit and server time do not establish a GPU bottleneck on their own.

That run used a development build, DPR 1, shadows/reflections/stars/vehicle lights enabled, fog disabled and interpolation off. It is not a controlled comparison to the older capture or to the new patch. Repeat the same route/settings on the target device after installing; use a production frontend when assessing final frame time. Missing Safari long-task samples do not prove absence of stalls.

## Draw batching and transition costs

This follow-up is based on GitHub main `33814e8ba317716f1a803cb0f9c8388dda9fa4c4` (improved view distance). It keeps the existing 80/500 m Fast and 140/750 m Balanced distance bands, retention hysteresis and source geometry. There are no new model files or frontend dependencies.

- City placement transforms are compared by their numeric values. A new React plan or changed detail dictionary no longer rebuilds every static instance matrix and bounding box. An actual map/visual transform edit, placement reorder or count change still rebuilds them. Only changed visible instance packs are uploaded.
- With native `WEBGL_multi_draw`, compatible opaque meshes share Three.js `BatchedMesh` draws by material, vertex layout, detail level, render order, layer and shadow policy. Authored transforms, individual visibility and per-block detail remain independent. Source textures are shared. Transparent/transmissive materials, partial draw ranges, wireframe and incompatible layouts keep their existing instanced draws.
- Without native multi-draw, the renderer keeps `InstancedMesh`. Three's emulated multi-draw would otherwise turn each repeated placement into another draw. Both paths receive the transform cache and shadow-culling improvement.
- Visible directional, spot and point lights contribute their actual shadow frusta. Offscreen city casters remain only where those lights need them. Flat road models and transparent glass receive lighting/shadows without casting opaque shadows. Reduced buildings already skipped shadow casting.
- Material packing joins the existing shared preparation queue before uploads and shader preparation. Warmup hides its temporary representative instances before gameplay begins. Disposal releases packed geometry and transform/indirection tables while retaining cached source resources.

The ten-second interpolation-on capture shared before this follow-up averaged **15.55 ms** per frame (p95 **21 ms**, p99 **24.3 ms**), about **594 draws / 4.10 million triangles**, CPU submit **2.63 ms**, input acknowledgement **10.49 ms** and server physics **0.349 ms**. Its route, fog and interpolation differed from the preceding run. These captures are not a controlled before/after test. CPU submit alone does not measure GPU execution time. Interpolation settings are preserved.

Controlled city-only Chromium/WebGL checks at 480×270 used the same GLBs, camera route, DPR, lighting, fog and effects on all paths:

| Junction renderer | Draw calls | Submitted triangles |
| --- | ---: | ---: |
| Main before this follow-up, shadows/reflections enabled | 561 | 3,667,166 |
| Updated, native multi-draw deliberately disabled | 433 | 2,549,169 |
| Updated, native multi-draw enabled | 214 | 2,549,129 |

At this view the native path submits about **62% fewer draws and 30% fewer triangles**. With shadows/reflections disabled, calls changed from **433 to 214** at the junction, **288 to 121** on approach and **407 to 206** during the crossing. Model/silhouette coverage matched across all paths. Geometry/texture allocations remained stable as the camera moved, with no repeated asset preparation and no JavaScript, shader or WebGL errors. Extra texture objects on the batched path are small transform/indirection tables, rather than duplicated city images. These are rendering-work measurements on a software GPU; they do not establish the target phone's FPS.

Seven new automated tests cover plan-only changes, real transform edits, native batching, independent full/reduced visibility, unsupported-browser fallback, incompatible materials/layouts, light frusta, shadow eligibility, warmup and resource ownership. Repeat a production-build capture on the same route and effects after applying, keeping interpolation enabled, to measure frame-time impact.

Controlled junction screenshots matched pixel for pixel with effects both enabled and disabled. A further shader check used Balanced geometry/material behavior with the already-loaded 512 px test textures to avoid a separate high-memory texture benchmark: native transmissive glass stayed instanced, opaque materials stayed batched, and returning to Fast then hiding/remounting the city retained stable geometry/texture allocations. The 156 batches' transform/indirection arrays totaled 379,600 bytes (0.36 MiB) before driver overhead. No additional city images were loaded for those tables. All **121 frontend tests**, the production build and full ESLint passed.

## Debugger input isolation

Entering another menu now requires held controller navigation/activation controls to return to neutral. Only one controller action is routed per poll. Diagnostic On/Off rows require explicit A/Cross, Enter/Space or a pointer click; merely focusing a row or pressing left/right does not change streams. The All Streams action reads the current mask at activation time.

Tabbed menus reject a mouse click whose pointer press belonged to another panel, a Space/Enter release handed off from an earlier panel, and held-key activation repeats. This preserves normal pointer, keyboard and controller activation. Browser tests cover opening by Space, mouse and F2, held Enter, a held steering stick, and fresh A/mouse actions. Integration tests retain settings, controller routing, mission and leave-game behavior. Production build, full ESLint and **114 frontend tests passed** for this update. No Rust physics source changed.
