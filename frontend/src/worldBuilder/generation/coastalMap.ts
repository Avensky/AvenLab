import { mapExport, parseMapText, type MapDocument } from "../document/mapDocument.ts";
import { parseLayoutText } from "../document/layoutDocument.ts";
import { coastalDistrict, type DistrictSize } from "./coastalDistrict.ts";

export const COASTAL_MAP_ID = "coastal_district";
/** An independent schema-2 world, never a renamed Road Precision source. */
export function coastalMap(seed = 1, size: DistrictSize = "chunk", landBridge = true): MapDocument {
  return parseMapText(mapExport({
    schema_version: 2, map_id: COASTAL_MAP_ID,
    coordinate_system: { units: "meters", up_axis: "y", forward_axis: "-z" },
    cell: [2000, 2000], surface: { road_y: 0 },
    layout: { kind: "fixed_grid", origin: [0, 0], size: [1, 1] },
    // The schema requires an installed visual asset; base=replace suppresses it.
    visuals: [{ id: "base", asset: "/models/world/garage.glb", position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }],
    metadata: { name: "Coastal District", description: "Editable coastal chase world" },
    roads: [], buildings: [], authored_layout: coastalDistrict(COASTAL_MAP_ID, seed, 0, size, landBridge),
  }));
}

/** Old coastal exports used the selected test world's ID. Recover the layout
 * without ever writing it back over that test world's browser draft. */
export function parseDistrictImport(text: string, expectedMap?: string) {
  const value = JSON.parse(text), raw = value?.authored_layout ?? value;
  const coastal = Array.isArray(raw?.objects) && raw.objects.some((o: { piece?: string } | null) => o?.piece === "coastal-land");
  const layout = parseLayoutText(JSON.stringify(coastal ? { ...raw, map_id: COASTAL_MAP_ID } : raw), coastal ? COASTAL_MAP_ID : expectedMap);
  return { layout, coastal };
}
