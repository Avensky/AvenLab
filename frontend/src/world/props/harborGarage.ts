import type { LayoutObject } from "../../worldBuilder/document/layoutDocument";
import { modelAsset, newModel } from "../../worldBuilder/models/modelCatalog";

const garage = newModel(modelAsset("selection_garage")!);
export const usesGarage = (id: string) =>
  ["garage", "fuel-station", "repair-shop", "service-center"].includes(id);
export function garageVisual(item: LayoutObject): LayoutObject {
  return { ...item, model: garage };
}
