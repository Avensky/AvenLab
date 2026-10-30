# Performance capture and comparison

PerformanceProbe.tsx records bounded numeric samples; measurements.ts owns capture rings/statistics. captureActions/captureArchive own export/persistence. PerformanceOverlay.tsx shows compact/detail panels at 4 Hz.

## How to edit

Use F3 for compact, Shift+F3 or controller View for details, F8 for capture. Compare the same car/map/route/range/quality after warmup. Check p95/p99 frame time, draw calls, triangles, packet bytes and server work separately. Menu/settings changes invalidate a capture. Do not claim target-machine FPS from headless/software WebGL.
