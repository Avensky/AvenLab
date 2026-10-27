import type { MapSnapshot } from "../store/worldStore";
import type { CityQuality } from "./cityLod";

export type CityBlockLevel = "full" | "reduced" | "proxy";
export type CityBlockLevels = Record<string, CityBlockLevel>;
export type CityBlock = { key: string; chunk: string; name: string; minX: number; maxX: number; minZ: number; maxZ: number };
export const CITY_REDUCED_ASSET = "/models/chuncks/chunck_0,0_2x2_blocks_centered_reduced.glb";
export const cityBlockAsset = (path: string) => /^\/models\/chuncks\/chunck_0,0_2x2_blocks_centered(?:_textures(?:512|1024))?\.glb$/.test(path);
export const cityBlockName = (id: string) => {
  const match = /^block_([01])_([01])_/.exec(id);
  return match ? `Block_${match[1]}_${match[2]}` : null;
};
export const cityBlockKey = (x: number, z: number, name: string) => `${x},${z}/${name}`;

// The authored GLB is merged by material inside four named city blocks. Use
// those real groups and collider footprints; do not guess a building-to-mesh ID.
export function cityBlocks(map: MapSnapshot): CityBlock[] {
  if (!map.visuals.some(visual => cityBlockAsset(visual.asset))) return [];
  const result = new Map<string, CityBlock>();
  for (const chunk of map.collider_chunks ?? []) for (const box of chunk.boxes) {
    if (box.kind !== "building") continue;
    const name = cityBlockName(box.id);
    if (!name) return []; // Custom metadata retains the existing chunk renderer.
    const key = cityBlockKey(chunk.x, chunk.z, name);
    const bounds = result.get(key) ?? { key, chunk: `${chunk.x},${chunk.z}`, name, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    bounds.minX = Math.min(bounds.minX, box.center[0] - box.half_extents[0]);
    bounds.maxX = Math.max(bounds.maxX, box.center[0] + box.half_extents[0]);
    bounds.minZ = Math.min(bounds.minZ, box.center[2] - box.half_extents[2]);
    bounds.maxZ = Math.max(bounds.maxZ, box.center[2] + box.half_extents[2]);
    result.set(key, bounds);
  }
  return [...result.values()];
}

export function cityBlockLevels(blocks: readonly CityBlock[], x: number, z: number, quality: CityQuality, previous: CityBlockLevels = {}): CityBlockLevels {
  const full = quality === "fast" ? 80 : 140;
  const models = quality === "fast" ? 500 : 750;
  return Object.fromEntries(blocks.map(block => {
    const distance = Math.hypot(Math.max(block.minX - x, 0, x - block.maxX), Math.max(block.minZ - z, 0, z - block.maxZ));
    const old = previous[block.key];
    const level: CityBlockLevel = quality === "original" || distance <= full + (old === "full" ? 15 : 0) ? "full"
      : distance <= models + (old && old !== "proxy" ? 35 : 0) ? "reduced" : "proxy";
    return [block.key, level];
  }));
}
