# City chunk performance

The supplied ten-second city capture averaged 41.23 ms per frame (about 24 FPS), 4,187 draw calls and 19.70 million submitted triangles. Its CPU submission measurement averaged 26.90 ms; server physics averaged 17.94 ms. The collider capture was much faster, but also changed the vehicle rendering, reflections and driving conditions. It is evidence of a rendering bottleneck, not a controlled measurement of this patch's FPS improvement.

The centered building GLB contains 1,035,438 triangles and 273 mesh primitives. All 103 building materials, including concrete and brick, have transmission enabled. All 11 road materials do too. Repeating the source across nine chunks and rendering solid surfaces through the transmission pass is expensive even with shadows disabled.

## Controls

Use **Settings → Display → Apply mobile performance preset**, or the same action under **Debugger → Environment**. It enables Fast city detail, DPR 1 and distance fog, and disables shadows, reflections, stars and vehicle lights. It clears per-chunk/asset overrides and debug visualizers. HUD, controller, input and interpolation preferences are preserved.

The **City detail** row supports mouse, keyboard and the existing controller menu navigation:

| Mode | Detailed building chunks | Distant chunks | Materials |
| --- | --- | --- | --- |
| Fast | Up to 2 nearby; 512 px textures | Box silhouettes with procedural window bands | Solid opaque surfaces; inexpensive transparent glass |
| Balanced | Up to 4 nearby; 1024 px textures | Same skyline | Solid opaque surfaces; native transmission on Glass |
| Original / A/B | All loaded chunks | Original models | Original export, with the existing optional opaque-material diagnostic |

Road models remain visible across the loaded map. Missing building collider metadata retains full models for that chunk. Physics, collisions, map coordinates, spawn points and vehicle handling are unchanged. The skyline is an inexpensive approximation, so architectural detail changes when a chunk becomes nearby. Original mode remains available for visual comparisons.

## Rendering and loading

- Repeated chunk models share instanced draw calls, geometry and textures. Each original mesh's authored transform is preserved, then the visual transform and chunk origin are applied exactly once.
- Each mesh instance is culled against the camera frustum. When shadows are enabled, off-screen instances remain available as shadow casters. Stable visibility does not re-upload instance matrices every frame.
- Detailed-chunk selection uses horizontal distance to the actual rectangular backend cells. Tall towers cannot force distant chunks into the detailed set. Selection updates at 10 Hz with boundary hysteresis, independently of the server tick rate.
- The optimized modes remove transmission from solid city surfaces using owned material clones. Cached GLB geometry, textures and original materials are not edited. Unsupported animated/skinned assets retain the original renderer.
- One shared animation-frame queue stages mesh creation, texture uploads and vertex-buffer uploads, targeting 3 ms or 12 jobs per frame. A single driver upload or shader compilation can exceed that soft budget. Draco decoding uses the bundled decoder with at most two workers for these assets.
- Shaders are prepared before native meshes become visible. Temporary road/building boxes cover asset preparation. Cancellation and disposal release owned instance buffers and materials while retaining shared GLB resources.
- Optional optimized reflections use a small generated local environment instead of downloading a preset HDR environment.

The source contains 57 building images at 4096×4096, 43 at 2048×2048 and 16 at 1024×1024. Just the decoded building RGBA images total approximately **4,614 MB**, before mipmaps and other copies. This exhausted the software-browser validation environment during native texture upload.

Four generated GLBs preserve every original mesh, node, material definition and non-image buffer byte while limiting image resolution. Originals remain untouched. Fast reduces decoded building images to **121.6 MB** and the building download from 20.81 MB to **9.64 MB**; roads become 3.1 MB decoded / 0.32 MB downloaded. Balanced uses 486.5 MB of decoded building images / 13.52 MB downloaded. These are image-data calculations, not measurements of total runtime GPU memory. Lower texture resolution trades fine surface detail for memory headroom; Original keeps the full textures.

Install the generated model files included with the patch. To regenerate, materialize both original GLBs with Git LFS, install Python Pillow, and run `python scripts/optimize-city-textures.py` from the repository root. The script verifies all geometry/node data is retained. Only the two known city templates are remapped; custom map paths are preserved.

GLB parsing and atomic uploads still have costs. Offline geometry simplification, GPU-compressed textures and smaller per-building assets are further options if first entry remains slow on the target phone. The queue reduces scheduling contention; it cannot guarantee a hard frame-time ceiling.

## Server and measurement

Run `npm run dev:fast` from the repository root to use the existing development services with `cargo run --release`. Alternatively run `npm run dev:rust:fast` or `npm run start:rust` for just the Rust server. The original commands remain available. Release compilation takes longer initially. No Rust physics source is changed, and no server speedup is claimed without a new capture.

For fair frontend measurements use `npm --prefix frontend run build` followed by `npm --prefix frontend run preview`. Use the same car, camera, route, speed, viewport, DPR and effects for Original versus Fast. Keep interpolation settings fixed. Wait for city preparation to finish before recording with F8, then export JSON/CSV from the existing performance overlay. Change one setting at a time when isolating a bottleneck.

Captures include city quality, optimized detailed/proxy chunk counts, pending preparation count and long-task measurements. The chunk counters describe the optimized renderer; Original has no optimized batches. Long tasks require browser PerformanceObserver support; absence on a browser does not imply that no stalls occurred. Capture readiness now also waits for city GPU preparation, beyond network asset loading.

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
