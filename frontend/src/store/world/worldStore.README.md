# useWorldStore

Owns installed world geometry metadata and local inspector choices.

**Expected updates** · Map and block lifecycle, plus inspector actions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `map` | Server map_snapshot or world/session cleanup. | Once on admission/restore, authored map change or clear. |
| `activeBlock` | Optional block collider file. The frontend currently exposes a setter with no active caller. | No scheduled writes. |
| `debugEnabled`, `debugMask`, `renderChassis`, `renderColliders`, `renderWheels`, `renderRays`, `renderAabbs`, `mode` | Requested overlays and local render mode. The driver sender reads debugMask. Diagnostic payloads go to the session store. | On toggle or mode action. |

[Implementation](worldStore.ts) · [All store update rates](../README.md)
