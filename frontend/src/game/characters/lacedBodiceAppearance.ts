import { MeshPhysicalMaterial, type MeshStandardMaterial } from "three";
import type { PieceColors } from "./clothingPieces";

export const LACED_BODICE_FINISHES = [
  { id: "original", label: "Original", roughness: undefined, coat: undefined },
  { id: "matte", label: "Matte", roughness: .89, coat: 0 },
  { id: "satin", label: "Satin", roughness: .42, coat: .06 },
  { id: "glossy", label: "Glossy", roughness: .19, coat: .18 },
] as const;
export type LacedBodiceFinish = typeof LACED_BODICE_FINISHES[number]["id"];

const lacedBodiceGroups = {
  fabric: "color",
  panel: "panel",
  laces: "laces",
  hardware: "hardware",
  closure: "closure",
} as const;

export function applyLacedBodiceAppearance(source: MeshStandardMaterial, material: MeshStandardMaterial,
  colors: PieceColors | undefined, outfitColor: string | undefined, outfitAccent: string | undefined) {
  if (!material.userData.rebuiltLacedBodice) return false;
  const slot = source.userData.color_slot as keyof typeof lacedBodiceGroups;
  if (!Object.hasOwn(lacedBodiceGroups, slot)) return false;
  const group = lacedBodiceGroups[slot];
  const cloth = slot === "fabric" || slot === "panel";
  const color = colors?.[group] ?? (cloth ? outfitColor
    : slot === "laces" ? colors?.accent ?? outfitAccent : undefined);
  if (color) material.color.set(color);
  if (cloth) {
    const finish = LACED_BODICE_FINISHES.find(({ id }) => id === colors?.finish);
    material.roughness = finish?.roughness ?? source.roughness;
    if (source instanceof MeshPhysicalMaterial && material instanceof MeshPhysicalMaterial) {
      material.clearcoat = finish?.coat ?? source.clearcoat;
    }
  }
  return true;
}
