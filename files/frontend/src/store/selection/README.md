# Setup catalog and selected indexes

Import the public API from `store/selection/index.ts`. Modules inside this section use direct sibling imports to avoid cycles.

| File | Owns |
| --- | --- |
| [vehicleCatalog.ts](vehicleCatalog.ts) | Vehicle labels, stats and CAN identities; data only, no model component imports. |
| [worldCatalog.ts](worldCatalog.ts) | World IDs and labels shared by setup and editor. |
| [selectionStore.ts](selectionStore.ts) | Selected vehicle/world indexes and cycling actions. |

## Editing recipe

Add vehicle metadata here, its renderer under vehicles, and physical configuration in Rust vehicle_setup.rs. A label/preview alone does not register a driveable vehicle. The former unused Component field was removed so importing state no longer imports all vehicle models.

See [all state owners](../README.md) and the [project guide](../../../../docs/PROJECT_GUIDE.md).
