import type { MeshStandardMaterial } from "three";
import type { PieceColors } from "./clothingPieces";

export const SWEETHEART_DYE_GROUPS = {
  fabric: { key: "color", label: "Fabric", original: "#29282d" },
  laces: { key: "laces", label: "Front laces", original: "#928778" },
  // Keep the original accent field available as a fallback for saved colors.
  accent: { key: "panel", label: "Hip laces", original: "#928778" },
  hardware: { key: "hardware", label: "Eyelets", original: "#706c73" },
  closure: { key: "closure", label: "Front fasteners", original: "#706c73" },
} as const;

type SweetheartDyeSlot = keyof typeof SWEETHEART_DYE_GROUPS;
export const SWEETHEART_DYE_SLOTS = Object.keys(SWEETHEART_DYE_GROUPS) as SweetheartDyeSlot[];

export function sweetheartDyeColor(slot: SweetheartDyeSlot, colors: PieceColors | undefined,
  outfitColor: string | undefined, outfitAccent: string | undefined) {
  const color = colors?.[SWEETHEART_DYE_GROUPS[slot].key];
  if (color) return color;
  if (slot === "fabric") return outfitColor;
  return colors?.accent ?? (slot === "laces" || slot === "accent" ? outfitAccent : undefined);
}

export function applySweetheartDye(source: MeshStandardMaterial, material: MeshStandardMaterial,
  colors: PieceColors | undefined, outfitColor: string | undefined, outfitAccent: string | undefined) {
  const slot = source.userData.color_slot as SweetheartDyeSlot;
  if (source.userData.authoredSweetheartDye !== true || !Object.hasOwn(SWEETHEART_DYE_GROUPS, slot)) return false;
  const color = sweetheartDyeColor(slot, colors, outfitColor, outfitAccent);
  if (color) material.color.set(color);
  return true;
}
