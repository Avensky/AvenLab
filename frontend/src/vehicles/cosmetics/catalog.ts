import { normalizePaintFinish, type PaintFinish } from "./paintFinishes";

/** Presentation catalog only. Future live ownership must be verified by the
 * server; these local previews never grant entitlements or charge money. */
export const COSMETIC_BUNDLES = {
  factory: { label: "Factory", body: null, accent: null, items: [] },
  "theme-match": { label: "Match app theme", body: "theme", accent: "theme", items: ["body-paint", "wheel-stitch"] },
  "white-red": { label: "White / red concept", body: "#f4f5f7", accent: "#be2545", items: ["body-white", "camaro-red-stripes", "frs-black-seats", "frs-red-stitch", "wheel-red-stitch"] },
} as const;
export type CosmeticBundle = keyof typeof COSMETIC_BUNDLES;
export type VehicleCosmetics = { bundle: CosmeticBundle; finish: PaintFinish; matchCockpit: boolean };
export const DEFAULT_VEHICLE_COSMETICS: VehicleCosmetics = { bundle: "factory", finish: "gloss", matchCockpit: true };
export const COSMETIC_SLOTS = {
  body: { status: "ready", models: ["ae86", "brz", "camaro", "supra", "cx30", "mini", "fortuner", "landcruiser", "sierra"] },
  stripes: { status: "needs-mask", models: ["camaro"] },
  seats: { status: "needs-material-mapping", models: ["brz"] },
  stitching: { status: "needs-mask", models: ["brz", "camaro"] },
  steeringWheel: { status: "hud-ready", models: ["ae86", "brz", "camaro", "supra", "cx30", "mini", "fortuner", "landcruiser", "sierra", "tank"] },
} as const;
export function sanitizeVehicleCosmetics(value: unknown): VehicleCosmetics {
  const v = (value && typeof value === "object" ? value : {}) as Partial<VehicleCosmetics>;
  return { bundle: v.bundle && Object.hasOwn(COSMETIC_BUNDLES, v.bundle) ? v.bundle : "factory",
    finish: normalizePaintFinish(v.finish),
    matchCockpit: typeof v.matchCockpit === "boolean" ? v.matchCockpit : true };
}

/** Stable individual item IDs can be included in multiple future store bundles.
 * No client boolean is an ownership check. A live equip endpoint must resolve
 * these IDs against server entitlements before sending appearance to peers. */
export const COSMETIC_ITEMS = {
  "body-paint": { slot: "body", entitlement: "paint.theme", previewOnly: true },
  "body-white": { slot: "body", entitlement: "paint.white", previewOnly: true },
  "camaro-red-stripes": { slot: "stripes", entitlement: "camaro.stripes.red", previewOnly: true },
  "frs-black-seats": { slot: "seats", entitlement: "brz.seats.black", previewOnly: true },
  "frs-red-stitch": { slot: "stitching", entitlement: "brz.stitch.red", previewOnly: true },
  "wheel-red-stitch": { slot: "steeringWheel", entitlement: "wheel.stitch.red", previewOnly: true },
  "wheel-stitch": { slot: "steeringWheel", entitlement: "wheel.stitch.theme", previewOnly: true },
} as const;
