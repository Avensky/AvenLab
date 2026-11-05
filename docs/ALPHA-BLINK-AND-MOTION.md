# Mechanic blink, HUD and motion checks

## Garage and cockpit

Hero selection keeps each 3v3 or 5v5 seat empty until that player chooses a hero. A showcase car or a stale local roster entry cannot fill an empty seat. Clearing your pick empties your seat. The centered team header gives the color and TEAM the same font size. At widths of 390, 844 and 1440 CSS pixels the futuristic console and pedals both measured 8 pixels above the viewport bottom. Safe-area insets can increase that gap on a phone.

The center console has a quiet perimeter seam. The two portrait tracks fill in opposite directions from the top. Full charge glows, and the corner reads ACTIVE during the barrage even after the charge is spent. The tracks respect reduced motion. On the mechanical parking brake the boot paints in front of the rotating shaft. The release tip is a separate input target. A Chromium pixel comparison checked the released, half-raised and upright positions, plus the alternate P-button appearance.

## Support mechanics

| Action | Starting values | Behavior |
| --- | --- | --- |
| Field service | 5 HP and 0.08 L per second, 12 m radius | CX-30, Mechanic and Logistics service themselves and living, visible allies. Two providers cannot stack the pulse on the same target. Only actual gains count in statistics. |
| Dive Shield | Up to 12 m forward, 2 s protection, 18 s cooldown | A chassis sweep shortens the blink for solid obstacles. Less than 0.5 m of safe travel cancels it before it costs cooldown. The server keeps vehicle momentum. A brief white radial burst marks arrival. |
| Blink strain | 6 s, 1.6× fuel use and 1.5× positive temperature rise | Cooling continues normally. The HUD reads the strain flag from the existing resource mask. |

## What the performance checks measured

The old presentation clock could discard interpolation history after 50 ms of accumulated drift between server time and packet arrival. It now makes bounded corrections. World changes, large gaps and confirmed blinks still reset the path. Flag markers reuse their previous readings when unchanged. Weapon and fleet batches write instance matrices only when a transform changes.

| Check | Previous grouped-store patch | This patch |
| --- | ---: | ---: |
| Distinct motion changes in 950 interpolated samples | 655 | 950 |
| Distinct motion changes in 950 raw samples | 238 | 238 |
| Warm interpolated browser sample, FPS | 59.7 | 59.8 |
| Warm interpolated browser sample, 95th-percentile frame time | 18.5 ms | 17.9 ms |

The replay sampled moving vehicles at 100 Hz with 25 Hz synthetic delivery. The browser used software graphics, ten lightweight vehicle stand-ins and the real camera sampler, driving HUD and flag-marker components. Timing varied between runs. An earlier sample in the patched run included a 608 ms frame after viewport changes. The reported desktop drop from 100 FPS to 50 FPS is still open. To isolate it, compare the same downtown route with the same resolution, device pixel ratio, graphics profile and 5v5 team load. Capture the render/physics diagnostics during a hitch, including draw calls and triangles.

Two simultaneous real localhost 5v5 worlds passed all eight transport, isolation, reconnect and backfill checks. Across the two worlds the server delivered 29.1 and 29.6 snapshots per client per second. The 95th-percentile arrival gaps were 47 and 45 ms. The largest were 246 and 302 ms. This used the production Rust server and headless clients.

The release build and frontend production build succeeded. Rust passed 329 tests with one manual test ignored. The targeted frontend suite passed 116 tests. A separate broad menu interaction suite has six failing subtests that also failed on the previous grouped-store patch. The logs and measurements are in the patch ZIP.
