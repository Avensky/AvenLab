# Performance capture and comparison

PerformanceProbe.tsx records bounded numeric samples; measurements.ts owns capture rings/statistics. captureActions/captureArchive own export/persistence. PerformanceOverlay.tsx shows compact/detail panels at 4 Hz.

## How to edit

Use F3 for compact, Shift+F3 or controller View for details, F8 for capture. Compare the same car/map/route/range/quality after warmup. Check p95/p99 frame time, draw calls, triangles, packet bytes and server work separately. Menu/settings changes invalidate a capture. Do not claim target-machine FPS from headless/software WebGL.

The Network details distinguish JSON decode, synchronous snapshot store dispatch,
network RTT, and snapshot age. Store dispatch excludes later React/GPU work.
`publishMs` is included in new captures; older captures simply have no samples.
The coalesced counter is cumulative for the current world and counts obsolete
ordinary movement snapshots replaced before rendering, not packet loss. Death,
respawn, vehicle replacement and match boundaries still publish immediately.

Compact climate has a separate tiny frame readout fed by the existing R3F probe.
`frameReadout.ts` averages frames and publishes at most twice per second; it does
not turn on diagnostic recording or start a RAF/timer. Hidden/paused/closed HUD
states clear its accumulator. `CabinPerformance` alone subscribes to those values
and the existing connection ping, leaving HVAC controls out of measurement renders.
Unavailable readings show a dash; this is not a GPU-time measurement.

## Audit: capture coverage and whole-frame counters — 2026-11-18

Reviewed at `25988e120d8d8b3a84872aa34d51335b4fef073a`. These are source findings;
this audit does not change recording behavior. The
[full audit](../../../performance/audits/2026-11-18/README.md) records priorities,
reproduction commands, and the remaining browser/device checks.

### Preview coverage is still missing

`PerformanceProbe.tsx` installs its recording effects only for the sandbox screen.
`startPerformanceCapture` in `captureActions.ts` returns outside that screen, and
`context.ts` expects gameplay readiness, including current physics snapshots and
collider chunks. The existing recorder therefore cannot substantiate fitting-room
cold-selection, idle-frame, or repeated-browsing comparisons.

Add an explicit preview context before using capture exports for those claims.
Record the selected actor/garments and actual source URLs, garment and actor tiers
separately, viewport/DPR, camera, loading state, playback/held-pose state, and
reflection/bloom quality. The production desktop preview normally combines a
portrait base actor with garage garment assets; a fixture named `garage` is not
automatically an exact reproduction of that route. Keep asset transfer/decode,
synchronous preparation, first application, shader/upload work, and settled-frame
measurements distinct.

### Renderer counters currently have incomplete pass coverage

The probe reads `gl.info.render.calls` and `triangles` from an after-effect. No
application source currently disables `gl.info.autoReset` or owns a once-per-frame
reset. Installed Three r181 resets render statistics during each `render()` call;
its documentation explicitly requires custom accumulation for multiple passes.
See [WebGLRenderer.info](https://threejs.org/docs/pages/WebGLRenderer.html#info).

Garage bloom uses an EffectComposer, and planar reflectors render nested views.
With the existing reset behavior, a sampled counter can describe only the work
since the most recent reset and omit earlier passes/shadow work. It is not a
guaranteed whole-frame draw or triangle total. This limits interpretation of
existing counts; it does not invalidate independently measured CPU intervals.
`gl.info.memory` provides resource counts, not memory bytes, and CPU submission
time is not GPU execution time.

The next instrumentation change should give each renderer one explicit frame
accumulator/reset owner, include the intended shadow/reflection/composer passes,
restore previous settings on cleanup, and define what happens when canvases share
a renderer or no frame is requested. Avoid a global reset that mixes canvases.
Verify known multi-pass counts, nested reflections, shadows on/off, demand-mode
idle and wake, capture start/stop, and cleanup before comparing GPU workloads.

### Existing idle controls to preserve

The current `FullCanvas` already uses demand mode for paused, authoring, compact,
and application Reduced Motion paths. Covered previews use `frameloop="never"`;
the compact invalidation clock is disabled while covered or paused. This audit
does not establish an always-running paused preview bug. Remaining work concerns
correct wake-up, active reflection reuse, and the OS/application Reduced Motion
policy difference documented in the [world README](../world/README.md).
