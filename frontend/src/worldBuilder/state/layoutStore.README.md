# useLayoutStore

Owns the authored district layout, placement tools, history and editor camera requests.

**Expected updates** · On editor interactions including pointer movement.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `doc`, `saved`, `past`, `future`, `selectedSpawn`, `selected`, `placing`, `navigation`, `status` | Document load/edit/save, history, selection and placement. | Per editor action. |
| `tool`, `focus`, `view`, `camera`, `cameraRevision`, `snap`, `angleSnap`, `magnet`, `snapBasis`, `magnetRadius`, `cursor`, `placementYaw`, `reference`, `wireframe` | Placement/camera controls, pointer movement and toggles. | At incoming editor interaction rate. Cursor/drag can update repeatedly. |

[Implementation](layoutStore.ts) · [All store update rates](../../store/README.md)
