/** Presentation for the selection garage only. Driving keeps its own renderer. */
export type GarageEffects = {
  paint: "factory" | "hot-pink" | "pastel-pink";
  paintSoftness: number;
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  accentBrightness: number;
  exposure: number;
  environmentReflections: boolean;
  floorReflections: boolean;
  reflectionStrength: number;
  reflectionBlur: number;
};

export const DEFAULT_GARAGE_EFFECTS: GarageEffects = {
  paint: "factory",
  paintSoftness: .45,
  bloom: true,
  bloomStrength: 0.5,
  bloomRadius: 0.25,
  bloomThreshold: 1,
  accentBrightness: 1,
  exposure: 0.8,
  environmentReflections: true,
  floorReflections: true,
  reflectionStrength: 1,
  reflectionBlur: 0.25,
};

export function sanitizeGarageEffects(value: unknown): GarageEffects {
  const data =
    value && typeof value === "object" ? (value as Partial<GarageEffects>) : {};
  const number = (key: keyof GarageEffects, min: number, max: number) =>
    typeof data[key] === "number" && Number.isFinite(data[key])
      ? Math.min(max, Math.max(min, data[key] as number))
      : (DEFAULT_GARAGE_EFFECTS[key] as number);
  const flag = (key: keyof GarageEffects) =>
    typeof data[key] === "boolean"
      ? (data[key] as boolean)
      : (DEFAULT_GARAGE_EFFECTS[key] as boolean);
  return {
    paint: data.paint === "hot-pink" || data.paint === "pastel-pink" ? data.paint : "factory",
    paintSoftness: number("paintSoftness",0,1),
    bloom: flag("bloom"),
    bloomStrength: number("bloomStrength", 0, 1.5),
    bloomRadius: number("bloomRadius", 0, 1),
    bloomThreshold: number("bloomThreshold", 0, 3),
    accentBrightness: number("accentBrightness", 0, 3),
    exposure: number("exposure", 0.5, 1.5),
    environmentReflections: flag("environmentReflections"),
    floorReflections: flag("floorReflections"),
    reflectionStrength: number("reflectionStrength", 0, 1),
    reflectionBlur: number("reflectionBlur", 0, 1),
  };
}
