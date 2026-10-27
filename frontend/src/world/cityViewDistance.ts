import type { CityQuality } from "./cityLod.ts";

export const CITY_VIEW_DISTANCES = ["auto", 250, 500, 750, 1000] as const;
export type CityViewDistance = typeof CITY_VIEW_DISTANCES[number];

export const isCityViewDistance = (value: unknown): value is CityViewDistance =>
  CITY_VIEW_DISTANCES.some(option => option === value);

// Auto preserves the existing range for each quality. Texture/model quality and
// an explicit view distance can be changed independently. Original stays an A/B.
export function resolveCityViewDistance(quality: CityQuality, value: CityViewDistance = "auto") {
  if (quality === "original") return Infinity;
  return typeof value === "number" && isCityViewDistance(value) ? value : quality === "fast" ? 500 : 750;
}
