# City and authored world rendering

CityScene.tsx composes floor/environment/map geometry. CityStreaming.tsx chooses full/reduced/proxy bands. cityBlocks/cityLod/cityViewDistance derive plans. cityDrawBatches/cityInstances share GPU work. AuthoredWorld.tsx draws installed authored layouts.

## How to edit

Use store/presentation for graphics preferences and store/world for installed map metadata. Change collision source under avenlab-server/src/world, not GLB visibility. City upload jobs share cityWorkQueue.ts; keep warmup separate from steady-state performance captures. See docs/CITY_PERFORMANCE.md.
