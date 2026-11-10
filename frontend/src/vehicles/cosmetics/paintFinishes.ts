export const PAINT_FINISHES = {
  factory: "Factory",
  gloss: "Gloss",
  satin: "Satin",
  matte: "Matte",
  "high-gloss": "High gloss",
  metallic: "Metallic",
} as const;

export type PaintFinish = keyof typeof PAINT_FINISHES;

export function isPaintFinish(value: unknown): value is PaintFinish {
  return typeof value === "string" && Object.hasOwn(PAINT_FINISHES, value);
}

export function normalizePaintFinish(value: unknown): PaintFinish {
  if (value === "soft") return "satin";
  return isPaintFinish(value) ? value : "gloss";
}
