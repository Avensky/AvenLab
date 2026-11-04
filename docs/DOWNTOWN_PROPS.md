# Downtown props and vehicle detail

## Build a block

Open World Builder, select Road Precision, and import [Downtown_Curb_Study.json](examples/Downtown_Curb_Study.json) as a layout. Use a spare draft. The sample contains three posts with separate signal heads, four cones, three metal barriers and a plastic barrier. The posts follow the relative spacing of TrafficPoles_107, _108 and _109. The barrier run adapts MetallicBarrier006–008 to the kit’s width. This sample uses a flat floor for placement experiments.

Under **Props**, the five Downtown pieces can be selected, rotated and resized individually. Traffic cone and signal head are decorative. The post collides at its shaft. The two barriers have simple solid collision shapes. A signal head can be repositioned independently of its pole. It currently has no traffic-cycle logic. A block with 25 placements across all five types produced five instanced draw calls in the isolated browser check. Editor selection outlines and debug shapes have their own draws.

## Inspect the source layout

Open the separately supplied **DowntownObj_Props.runtime.glb** to see the full layout in Blender. It retains the original GLB world units and transforms. The [placement index](examples/Downtown_Placements.json) maps every original object name to the optimized batch and its bounds center. The original pivots were identical across all 1,833 nodes, so the centers provide more useful references for curb spacing. For the editor sample, a source pole was scaled to seven metres.

| Full layout | Original | Optimized reference |
|---|---:|---:|
| File bytes | 90,585,184 | 49,293,908 |
| Geometry primitives | 1,833 | 522 |
| Triangles | 15,693,260 | 6,345,137 |

The primitive counts describe the entire file before visibility culling. The optimized copy reduces triangles and combines static scenery within spatial cells by family and material. Signal heads, cones and movable barriers retain individual nodes. All 38 original materials requested full optical transmission, including litter and metal. The runtime copy removes that setting and retains the texture maps. Keep the source GLB for adjustments that require its individual meshes or original materials. The driving scene loads only the small roadworks kit when its pieces are present.

## Vehicle LOD priorities

These are counts from the playable vehicle GLBs before culling, with one count per node-referenced primitive. They are source budgets, not measured frame rates.

| Vehicle | Triangles | Primitives |
|---|---:|---:|
| AE86 | 706,225 | 37 |
| Vanguard tank | 308,198 | 25 |
| CX-30 | 275,896 | 54 |
| Supra 2020 | 239,520 | 295 |
| Fortuner | 213,860 | 120 |
| Sierra | 209,740 | 83 |
| BRZ | 204,815 | 259 |
| Land Cruiser | 203,004 | 71 |
| Mini | 110,938 | 52 |
| Camaro | 45,944 | 103 |

All ten playable vehicles have near, medium and far exterior models. The baker collapses edges within authored parts and preserves the source normals on the near tier. Body paint, trim and glazing share at most three draws per model and tier. The tank keeps its articulated turret and barrel. The local driver uses the original rig.

In normal detail, every visible vehicle within 14 m of the driver or at least 68 CSS pixels tall can use the near tier. Low Detail uses 8 m or 110 pixels. Hysteresis prevents rapid switching. Models outside the padded camera frustum do not draw. A small exterior derived from each actual model is bundled for cold joins. Until a requested tier is ready, the renderer keeps the best available model on screen. Only two detailed assets load concurrently.

Run the server with `--capacity-bench --combat --players 6 --ticks 1500` for the mixed-roster firing scenario. The report gives p95, p99 and ticks over the 16.67 ms budget. In the game's performance recorder, saved captures also include frames of 100 ms or longer, total time spent in those frames and longest frame. These distinguish intermittent client stalls from high average server work.

## Physics and UI

The server reconciles fixed map tiles after map or tile changes. A reloaded tile reapplies destruction to its new bodies. The first join serializes the current map data; later clients reuse those bytes until the tile set changes. Each player still receives a complete map on join. The live vehicle roster compares IDs, models, teams and collider dimensions, so changing poses no longer requires serializing an entire roster to JSON.
