import type { CharacterChoice } from "./characterCatalog";
import type { ClothingPiece } from "./clothingPieces";
import type { Object3D, SkinnedMesh } from "three";
import importedItems from "../../../../avenlab-server/src/assets/character-garments.json";

export const wardrobeGarmentReplacements = {
  top: ["corset", "shirt", "sleeves", "bow"],
  skirt: ["skirt", "underskirt", "shorts", "belt", "bow"],
  dress: ["corset", "shirt", "skirt", "underskirt", "shorts", "sleeves", "belt", "bow"],
  hat: ["hat"],
  bow: ["bow"],
  socks: [],
  coat: [],
  harness: [],
} satisfies Record<string, ClothingPiece[]>;

export type WardrobeGarmentSlot = keyof typeof wardrobeGarmentReplacements;
export type WardrobeGarmentChoice = Partial<Record<WardrobeGarmentSlot, string>>;
export const wardrobeRemovalPieces = {
  top: ["shirt", "sleeves"], corset: ["corset"], skirt: ["skirt", "underskirt", "shorts", "belt"],
  shoes: ["shoes"], socks: ["socks"], hat: ["hat"], bow: ["bow"], harness: ["harness"], "bonnet-bow": [],
} satisfies Record<string, ClothingPiece[]>;
export type WardrobeRemoval = keyof typeof wardrobeRemovalPieces;
const noRemovedClothing: readonly WardrobeRemoval[] = [];

export function removedWardrobeLayers(choice?: Pick<CharacterChoice, "id" | "removedClothing"> | null): readonly WardrobeRemoval[] {
  return choice?.id === "mara-vega" ? choice.removedClothing ?? noRemovedClothing : noRemovedClothing;
}

export function visibleWardrobeGarments(choice?: Pick<CharacterChoice, "id" | "removedClothing" | "garments"> | null) {
  const garments = choice?.garments;
  const removed = removedWardrobeLayers(choice);
  if (!garments || !removed.some(slot => slot in garments)) return garments;
  const visible = Object.fromEntries(Object.entries(garments).filter(([slot]) => !removed.some(layer => layer === slot)));
  return Object.keys(visible).length ? visible as WardrobeGarmentChoice : undefined;
}

export function setWardrobeRemoval(choice: CharacterChoice, slot: WardrobeRemoval, remove: boolean): CharacterChoice {
  const removed = removedWardrobeLayers(choice);
  if (removed.includes(slot) === remove) return choice;
  const next = remove ? [...removed, slot] : removed.filter(item => item !== slot);
  return { ...choice, removedClothing: next.length ? next : undefined };
}
type WardrobeGarment = {
  id: string; label: string; section: string; category: string; slot: WardrobeGarmentSlot;
  piece: ClothingPiece; url: string; mobileUrl?: string; revisionUrl?: string; retired?: boolean;
  tucksHair?: boolean;
  scalpCap?: boolean;
};

export const importedWardrobeItems = (importedItems as WardrobeGarment[]).filter(item => !item.retired);

export function getWardrobeGarment(id?: string) {
  return importedWardrobeItems.find(item => item.id === id);
}

export function wardrobeGarmentModelUrl(item: WardrobeGarment, kind: "garage" | "portrait", { useRevision = true } = {}) {
  if (!__DRESSING_ROOM_IMPORTED_IDS__.includes(item.id)) return undefined;
  if (useRevision && item.revisionUrl && __DRESSING_ROOM_REVISION_IDS__.includes(item.id)) return item.revisionUrl;
  if (kind === "portrait" && item.mobileUrl && __DRESSING_ROOM_MOBILE_IDS__.includes(item.id)) return item.mobileUrl;
  return item.url;
}

/** A local export can be replaced after Vite last checked its GLB metadata. */
export function hasWardrobeRevisionMesh(item: WardrobeGarment, scene: Object3D) {
  const name = `CLOTH_${item.id.replaceAll("-", "_").toUpperCase()}`;
  const matches = (node: Object3D) => String(node.userData.name ?? node.name).replace(/\.\d{3}$/, "") === name;
  let matching = 0, total = 0;
  scene.traverse(part => {
    const mesh = part as SkinnedMesh;
    if (!mesh.isMesh) return;
    total++;
    if (mesh.isSkinnedMesh && (matches(mesh) || (mesh.parent && matches(mesh.parent)))) matching++;
  });
  return matching > 0 && matching === total;
}

export function setWardrobeGarment(choice: CharacterChoice, slot: WardrobeGarmentSlot, id?: string): CharacterChoice {
  if (id && getWardrobeGarment(id)?.slot !== slot) return choice;
  const garments = { ...choice.garments };
  if (id) {
    garments[slot] = id;
    if (slot === "dress") {
      delete garments.top;
      delete garments.skirt;
    } else if (slot === "top" || slot === "skirt") delete garments.dress;
  } else delete garments[slot];
  const replacesBodice = id && slot === "dress";
  const removed = choice.removedClothing?.filter(layer => !id || layer !== slot);
  return { ...choice, garments: Object.keys(garments).length ? garments : undefined,
    removedClothing: removed?.length ? removed : undefined, wardrobeTrial: replacesBodice ? undefined : choice.wardrobeTrial,
    wardrobeEase: replacesBodice || (id && slot === "top" && !choice.wardrobeTrial) ? undefined : choice.wardrobeEase };
}
