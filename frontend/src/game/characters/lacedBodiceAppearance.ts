import { MeshPhysicalMaterial, type MeshStandardMaterial } from "three";

export const LACED_BODICE_FINISHES = [
  { id: "original", label: "Original", roughness: undefined, coat: undefined },
  { id: "matte", label: "Matte", roughness: .89, coat: 0 },
  { id: "satin", label: "Satin", roughness: .42, coat: .06 },
  { id: "glossy", label: "Glossy", roughness: .19, coat: .18 },
] as const;
export type LacedBodiceFinish = typeof LACED_BODICE_FINISHES[number]["id"];

export function applyLacedBodiceFinish(source: MeshStandardMaterial, material: MeshStandardMaterial,
  finishId: LacedBodiceFinish | undefined) {
  const finish = LACED_BODICE_FINISHES.find(({ id }) => id === finishId);
  material.roughness = finish?.roughness ?? source.roughness;
  if (source instanceof MeshPhysicalMaterial && material instanceof MeshPhysicalMaterial) {
    material.clearcoat = finish?.coat ?? source.clearcoat;
  }
}
