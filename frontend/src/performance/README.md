# Performance capture and comparison

PerformanceProbe.tsx records bounded numeric samples; measurements.ts owns capture rings/statistics. captureActions/captureArchive own export/persistence. PerformanceOverlay.tsx shows compact/detail panels at 4 Hz.

## How to edit

Use F3 for compact, Shift+F3 or controller View for details, F8 for capture. Compare the same car/map/route/range/quality after warmup. Check p95/p99 frame time, draw calls, triangles, packet bytes and server work separately. Menu/settings changes invalidate a capture. Do not claim target-machine FPS from headless/software WebGL.

Compact climate has a separate tiny frame readout fed by the existing R3F probe.
`frameReadout.ts` averages frames and publishes at most twice per second; it does
not turn on diagnostic recording or start a RAF/timer. Hidden/paused/closed HUD
states clear its accumulator. `CabinPerformance` alone subscribes to those values
and the existing connection ping, leaving HVAC controls out of measurement renders.
Unavailable readings show a dash; this is not a GPU-time measurement.
