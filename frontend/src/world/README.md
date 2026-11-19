# City and authored world rendering

CityScene.tsx composes floor/environment/map geometry. CityStreaming.tsx chooses full/reduced/proxy bands. cityBlocks/cityLod/cityViewDistance derive plans. cityDrawBatches/cityInstances share GPU work. AuthoredWorld.tsx draws installed authored layouts.

## How to edit

Use store/presentation for graphics preferences and store/world for installed map metadata. Change collision source under avenlab-server/src/world, not GLB visibility. City upload jobs share cityWorkQueue.ts; keep warmup separate from steady-state performance captures. See docs/CITY_PERFORMANCE.md.

## Snapshot damage selection

`AuthoredWorld` uses `destroyedAssets.ts` to derive the sorted destroyed-ID key.
A shared weak cache computes that key once per immutable `asset_health` object,
including when several authored-world chunks consume the same snapshot. Weak
keys do not retain damage histories from previous worlds. The key format and
strict `hp === 0` visibility rule are unchanged.

The compact decoder shares an unchanged health map with its immutable keyframe.
Damage patches copy the map, whole-map replacements supply a new object, and
legacy JSON parsing supplies fresh objects. Snapshot delivery retains the packet
data; the network store only copies the snapshot root to add receipt timing.
World/session resets clear the snapshot. Synthetic producers must follow the
same contract: replace a changed health map rather than mutating an earlier
snapshot. `PhysicsSnapshot.asset_health` is typed readonly to make that explicit.

New keyframes still require a scan. A changed-since-keyframe map can also be a
fresh object on each delta until the keyframe rotates; those maps are recomputed.
The cache therefore avoids repeated work on shared maps, without assuming every
motion packet has the same map identity. Fresh legacy JSON remains correct and
can share one derived result across its own chunk consumers.

Run `node --test tests/destroyed-assets.test.mjs` from `frontend`. Tests exercise
actual compact decoding, damage/repair/removal, return to baseline, legacy JSON,
empty maps, world resets and snapshot immutability. A deterministic two-keyframe
fixture uses 30 packets per keyframe, six chunk consumers and 250 health entries:
360 selector calls perform two map scans instead of 360. This measures avoided
enumeration/allocation work, not browser frame time or FPS. The existing string
selector already suppressed React renders when the destroyed set was unchanged.
