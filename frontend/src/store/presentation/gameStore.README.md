# useGameStore

Provides camera/editor controls and older presentation fields. Active routes are managed by useUIStore.

**Expected updates** · On camera, editor or legacy presentation actions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `screen`, `selectedVehicle`, `selectedMap`, `camera`, `debugBool`, `binding`, `editor`, `help`, `menu`, `cli`, `map`, `pickcolor`, `shadows`, `sound` | Local setters for presentation state. Camera modes can drive a per-frame camera without updating this store for each rendered pose. | On a setting or mode transition. |
| `rotatingCamera` | Gallery camera resume angle. The live orbit uses a rendering ref. | Written on gallery unmount if the angle changed. |

[Implementation](gameStore.ts) · [All store update rates](../README.md)
