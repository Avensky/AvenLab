import type { LoadedChunkInstance, MapSnapshot, VisualAsset } from "../store/worldStore";
import type { VisualMode } from "../store/renderSettingsStore";

export type CityQuality = "fast" | "balanced" | "original";
export const CITY_QUALITIES: readonly CityQuality[] = ["fast", "balanced", "original"];
export const CITY_QUALITY_LABELS = { fast: "Fast", balanced: "Balanced", original: "Original / A/B" };
export const cityChunkKey = (chunk: LoadedChunkInstance) => `${chunk.x},${chunk.z}`;
export type CityPlacement = { chunk: LoadedChunkInstance; visual: VisualAsset };

// Use the backend's actual cell dimensions and origins, never a guessed 200m grid.
// Horizontal distance keeps tall towers from forcing every tile to full detail.
export function detailedCityChunks(map: MapSnapshot, x: number, z: number, quality: CityQuality, previous: readonly string[] = []) {
  if (quality === "original" || !map.collider_chunks) return map.chunks.map(cityChunkKey);
  const unit = Math.max(1, Math.min(...map.cell));
  const distance = quality === "fast" ? unit * 0.5 : unit;
  const limit = quality === "fast" ? 2 : 4;
  const ranked = map.chunks.map(chunk => {
    const dx = Math.max(0, Math.abs(x - chunk.origin[0]) - map.cell[0] / 2);
    const dz = Math.max(0, Math.abs(z - chunk.origin[2]) - map.cell[1] / 2);
    const key = cityChunkKey(chunk), d = Math.hypot(dx, dz);
    return { key, distance: d, score: d - (previous.includes(key) ? 12 : 0) };
  }).sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
  // Always keep the closest available tile detailed, including outside the grid.
  return ranked.filter((entry, index) => index === 0 || entry.distance <= distance + (previous.includes(entry.key) ? 12 : 0))
    .slice(0, limit).map(entry => entry.key);
}

export function cityAssetVisible(chunk: LoadedChunkInstance, visual: VisualAsset, environmentMode: VisualMode,
  chunkOverrides: Record<string, VisualMode>, assetGlbs: Record<string, boolean>) {
  const key = cityChunkKey(chunk), mode = chunkOverrides[key] ?? environmentMode;
  return assetGlbs[`${key}/${visual.id}`] ?? (mode === "glb" || mode === "hybrid");
}

// Only the authored city templates have generated texture variants. Custom maps
// retain their own paths; backend coordinates/asset IDs are never rewritten.
export function cityTextureAsset(path: string, quality: CityQuality) {
  if (quality === "original") return path;
  const known = /^\/models\/chuncks\/chunck_0,0_2x2_(blocks_centered|roads)\.glb$/;
  return known.test(path) ? path.replace(/\.glb$/, `_textures${quality === "fast" ? 512 : 1024}.glb`) : path;
}
