import type { CharacterChoice } from "./characterCatalog";
import type { ClothingPiece } from "./clothingPieces";
import type { Object3D, SkinnedMesh } from "three";
import villageItems from "../../../../packages/wardrobe-catalog/character-village-pieces.json";
import importedItems from "../../../../packages/wardrobe-catalog/character-garments.json";
import discoveredManifest from "../../../../packages/wardrobe-catalog/discovered-wardrobe-garments.json";

export const wardrobeGarmentReplacements = {
  top: ["corset", "shirt", "sleeves", "bow"],
  skirt: ["skirt", "underskirt", "shorts", "belt", "bow"],
  dress: ["corset", "shirt", "skirt", "underskirt", "shorts", "sleeves", "belt", "bow"],
  hat: ["hat"],
  bow: ["bow"],
  socks: [],
  coat: [],
  harness: [],
  bracer: [],
  sleeves: ["sleeves"], belt: ["belt"], underskirt: ["underskirt"], shoes: ["shoes"],
} satisfies Record<string, ClothingPiece[]>;

export type WardrobeGarmentSlot = keyof typeof wardrobeGarmentReplacements;
export type WardrobeGarmentChoice = Partial<Record<WardrobeGarmentSlot, string>>;
export const wardrobeRemovalPieces = {
  dress: ["dress", "sleeves"],
  sleeves: ["sleeves"], belt: ["belt"], underskirt: ["underskirt"], "village-skirt": ["skirt"], coat: ["coat"],
  top: ["shirt", "sleeves"], corset: ["corset"], skirt: ["skirt", "underskirt", "shorts", "belt"],
  shoes: ["shoes"], socks: ["socks"], hat: ["hat"], bow: ["bow"], harness: ["harness"], bracer: ["bracer"], "bonnet-bow": [],
} satisfies Record<string, ClothingPiece[]>;
export type WardrobeRemoval = keyof typeof wardrobeRemovalPieces;
const noRemovedClothing: readonly WardrobeRemoval[] = [];

export function removedWardrobeLayers(choice?: Pick<CharacterChoice, "id" | "removedClothing"> | null): readonly WardrobeRemoval[] {
  return choice?.id === "mara-vega" ? choice.removedClothing ?? noRemovedClothing : noRemovedClothing;
}

export function visibleWardrobeGarments(choice?: Pick<CharacterChoice, "id" | "removedClothing" | "garments"> | null) {
  const garments = choice?.garments;
  const removed = removedWardrobeLayers(choice);
  if (!garments || !removed.length) return garments;
  const entries = Object.entries(garments);
  const visible = entries.filter(([slot, id]) => !removed.some(layer => layer === slot
    || (layer === "corset" && id === "village-bodice") || (layer === "village-skirt" && id === "village-skirt")));
  if (visible.length === entries.length) return garments;
  return visible.length ? Object.fromEntries(visible) as WardrobeGarmentChoice : undefined;
}

export function setWardrobeRemoval(choice: CharacterChoice, slot: WardrobeRemoval, remove: boolean): CharacterChoice {
  const removed = removedWardrobeLayers(choice);
  if (removed.includes(slot) === remove) return choice;
  const next = remove ? [...removed, slot] : removed.filter(item => item !== slot);
  return { ...choice, removedClothing: next.length ? next : undefined,
    ...(!remove && (slot === "top" || slot === "corset" || slot === "dress") && { bra: undefined }) };
}
export type WardrobeGarment = {
  id: string; label: string; section: string; category: string; slot: WardrobeGarmentSlot;
  piece: ClothingPiece; url?: string; villageNode?: string; mobileUrl?: string; revisionUrl?: string; retired?: boolean;
  tucksHair?: boolean;
  scalpCap?: boolean;
  detachableSleeves?: boolean;
  description?: string; hideLongHair?: boolean;
  outfit?: { description: string; barefoot?: boolean };
};

const discoveredItems = discoveredManifest as WardrobeGarment[];
const discoveredIds = new Set(discoveredItems.map(item => item.id));
export const importedWardrobeItems = [...(importedItems as WardrobeGarment[]).filter(item => !item.retired), ...discoveredItems];

export const villageWardrobeItems = villageItems as WardrobeGarment[];
const wardrobeItems = [...importedWardrobeItems, ...villageWardrobeItems];

export function getWardrobeGarment(id?: string) {
  return wardrobeItems.find(item => item.id === id);
}

export function wardrobeReplacedPieces(item: WardrobeGarment): readonly ClothingPiece[] {
  if (!item.villageNode) return wardrobeGarmentReplacements[item.slot];
  return item.slot === "top" ? ["corset", "shirt"] : [item.piece];
}

export function wardrobeGarmentModelUrl(item: WardrobeGarment, kind: "garage" | "portrait", { useRevision = true } = {}) {
  if (item.villageNode) return (kind === "portrait" ? __VILLAGER_PORTRAIT_URL__ : __VILLAGER_MODEL_URL__) ?? undefined;
  const mobile = item.mobileUrl && __DRESSING_ROOM_MOBILE_IDS__.includes(item.id) ? item.mobileUrl : undefined;
  if (!__DRESSING_ROOM_IMPORTED_IDS__.includes(item.id)) return discoveredIds.has(item.id) ? mobile : undefined;
  if (useRevision && item.revisionUrl && __DRESSING_ROOM_REVISION_IDS__.includes(item.id)) return item.revisionUrl;
  if (kind === "portrait" && mobile) return mobile;
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
  const item = getWardrobeGarment(id);
  if (id && item?.slot !== slot) return choice;
  const garments = { ...choice.garments };
  if (id) {
    garments[slot] = id;
    if (slot === "dress") {
      delete garments.top;
      delete garments.skirt;
    } else if (slot === "top" || slot === "skirt") delete garments.dress;
  } else delete garments[slot];
  const replacesBodice = (id || choice.garments?.[slot]) && (slot === "top" || slot === "dress");
  const removed = choice.removedClothing?.filter(layer => !id || (layer !== slot
    && (slot !== "dress" || (layer !== "top" && layer !== "corset" && layer !== "skirt"))
    && !(id === "village-bodice" && layer === "corset") && !(id === "village-skirt" && layer === "village-skirt")));
  return { ...choice, garments: Object.keys(garments).length ? garments : undefined,
    removedClothing: removed?.length ? removed : undefined, wardrobeTrial: replacesBodice ? undefined : choice.wardrobeTrial,
    ...(id && (slot === "top" || slot === "dress") && { bra: undefined }),
    wardrobeEase: replacesBodice ? undefined : choice.wardrobeEase };
}
