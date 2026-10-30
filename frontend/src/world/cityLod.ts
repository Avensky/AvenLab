import type {
  LoadedChunkInstance,
  MapSnapshot,
  VisualAsset,
} from "../store/world/worldStore";
import type { VisualMode } from "../store/presentation/renderSettingsStore";
import type { CityBlockLevel } from "./cityBlocks";
import {
  resolveCityViewDistance,
  type CityViewDistance,
} from "./cityViewDistance.ts";

export type CityQuality = "fast" | "balanced" | "original";
export const CITY_QUALITIES: readonly CityQuality[] = [
  "fast",
  "balanced",
  "original",
];
export const CITY_QUALITY_LABELS = {
  fast: "Fast",
  balanced: "Balanced",
  original: "Original / A/B",
};
export const cityChunkKey = (chunk: LoadedChunkInstance) =>
  `${chunk.x},${chunk.z}`;
export type CityPlacement = {
  chunk: LoadedChunkInstance;
  visual: VisualAsset;
  blocks?: Record<string, CityBlockLevel>;
};

// Use the backend's actual cell dimensions and origins, never a guessed 200m grid.
// Horizontal distance keeps tall towers from forcing every tile to full detail.
// Keep the local tile, then spend the remaining slots toward the camera's view.
// Otherwise the short side of a rectangular tile crowds out the next street.
export function detailedCityChunks(
  map: MapSnapshot,
  x: number,
  z: number,
  quality: CityQuality,
  previous: readonly string[] = [],
  forward?: readonly [number, number],
  viewDistance: CityViewDistance = "auto",
) {
  if (quality === "original" || !map.collider_chunks)
    return map.chunks.map(cityChunkKey);
  const span = Math.max(1, ...map.cell);
  const distance =
    viewDistance === "auto"
      ? span * (quality === "fast" ? 1.25 : 2)
      : resolveCityViewDistance(quality, viewDistance);
  const lookAhead = span * (quality === "fast" ? 0.9 : 1.4);
  const limit =
    viewDistance === "auto" ? (quality === "fast" ? 2 : 4) : Infinity;
  const length = forward ? Math.hypot(...forward) : 0;
  const looking = Number.isFinite(length) && length > 0.001;
  const focusX = looking ? x + (forward![0] / length) * lookAhead : x;
  const focusZ = looking ? z + (forward![1] / length) * lookAhead : z;
  const distanceTo = (
    chunk: MapSnapshot["chunks"][number],
    px: number,
    pz: number,
  ) =>
    Math.hypot(
      Math.max(0, Math.abs(px - chunk.origin[0]) - map.cell[0] / 2),
      Math.max(0, Math.abs(pz - chunk.origin[2]) - map.cell[1] / 2),
    );
  const ranked = map.chunks
    .map((chunk) => {
      const key = cityChunkKey(chunk),
        d = distanceTo(chunk, x, z),
        retained = previous.includes(key);
      return {
        key,
        distance: d,
        score: d - (retained ? 12 : 0),
        aheadScore:
          distanceTo(chunk, focusX, focusZ) * 0.75 +
          d * 0.25 -
          (retained ? 12 : 0),
      };
    })
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
  // Always keep the closest available tile detailed, including outside the grid.
  const local = ranked[0];
  if (!local) return [];
  const candidates = ranked.filter(
    (entry) =>
      entry.key !== local.key &&
      entry.distance <= distance + (previous.includes(entry.key) ? 12 : 0),
  );
  if (looking)
    candidates.sort(
      (a, b) => a.aheadScore - b.aheadScore || a.key.localeCompare(b.key),
    );
  return [
    local.key,
    ...candidates.slice(0, limit - 1).map((entry) => entry.key),
  ];
}

export function cityAssetVisible(
  chunk: LoadedChunkInstance,
  visual: VisualAsset,
  environmentMode: VisualMode,
  chunkOverrides: Record<string, VisualMode>,
  assetGlbs: Record<string, boolean>,
) {
  const key = cityChunkKey(chunk),
    mode = chunkOverrides[key] ?? environmentMode;
  return (
    assetGlbs[`${key}/${visual.id}`] ?? (mode === "glb" || mode === "hybrid")
  );
}

// Only the authored city templates have generated texture variants. Custom maps
// retain their own paths; backend coordinates/asset IDs are never rewritten.
export function cityTextureAsset(path: string, quality: CityQuality) {
  if (quality === "original") return path;
  const known =
    /^\/models\/chuncks\/chunck_0,0_2x2_(blocks_centered|roads)\.glb$/;
  return known.test(path)
    ? path.replace(/\.glb$/, `_textures${quality === "fast" ? 512 : 1024}.glb`)
    : path;
}
