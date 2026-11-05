# useSelectionStore

Owns selected indexes into the vehicle and map catalogs.

**Expected updates** · On setup/selection and recovery actions.

| State fields | Writer and lifetime | Expected update |
| --- | --- | --- |
| `vehicleIndex`, `mapIndex` | Menu, hero selection and recovery actions choose catalog entries. | On selection or reset. Catalog lookups read the chosen entry. |

[Implementation](selectionStore.ts) · [All store update rates](../README.md)
