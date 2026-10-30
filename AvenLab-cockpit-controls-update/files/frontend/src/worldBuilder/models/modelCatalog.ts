import data from "../../../../avenlab-server/src/assets/models/placement-colliders.json" with { type: "json" };
import type { Bounds, Vec3 } from "../roadKit/roadKitCore.ts";
import type { ModelRole } from "./modelRoles.ts";
export type ModelMask = {
  floor: boolean;
  walls: boolean;
  roof: boolean;
  details: boolean;
};
export type ModelPlacement = {
  asset: "selection_garage";
  source_sha256: string;
  visible: ModelMask;
  collision: { floor: boolean; walls: boolean; roof: boolean };
};
export type ModelAsset = {
  id: "selection_garage";
  label: string;
  lods: { url: string; sha256: string; lod: number }[];
  source_scale: number;
  origin: Vec3;
  size: Vec3;
  bounds: Bounds;
  colliders: {
    role: "floor" | "walls" | "roof";
    vertices: Vec3[];
    indices: [number, number, number][];
  }[];
};
export const MODEL_ASSETS = data.assets as unknown as ModelAsset[];
export const modelAsset = (id: string) => MODEL_ASSETS.find((a) => a.id === id);
export const newModel = (asset: ModelAsset): ModelPlacement => ({
  asset: asset.id,
  source_sha256: asset.lods[0].sha256,
  visible: { floor: true, walls: true, roof: true, details: true },
  collision: { floor: true, walls: true, roof: true },
});
export function validateModel(value: unknown): asserts value is ModelPlacement {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid prefab");
  const m = value as ModelPlacement,
    a = modelAsset(m.asset);
  if (!a || m.source_sha256 !== a.lods[0].sha256)
    throw Error("Prefab asset revision does not match its collision catalog");
  if (!m.visible || !m.collision) throw Error("Invalid prefab surface masks");
  for (const key of ["floor", "walls", "roof", "details"] as const)
    if (typeof m.visible[key] !== "boolean")
      throw Error("Invalid prefab visibility");
  for (const key of ["floor", "walls", "roof"] as const)
    if (typeof m.collision[key] !== "boolean")
      throw Error("Invalid prefab collision");
}
export function modelVisible(role: ModelRole, m: ModelPlacement) {
  if (role === "omit") return false;
  if (role === "floor-detail") return m.visible.floor && m.visible.details;
  if (role === "roof-detail") return m.visible.roof && m.visible.details;
  return m.visible[role];
}
export const modelSolid = (
  role: "floor" | "walls" | "roof",
  m: ModelPlacement,
) => m.visible[role] && m.collision[role];
