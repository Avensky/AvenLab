import type { CharacterChoice } from "./characterCatalog";
import type { ClothingPiece } from "./clothingPieces";
import importedItems from "./dressingRoomImports.json";

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
type WardrobeGarment = {
  id: string; label: string; section: string; category: string; slot: WardrobeGarmentSlot;
  piece: ClothingPiece; url: string; mobileUrl?: string; revisionUrl?: string; retired?: boolean;
};

export const importedWardrobeItems = (importedItems as WardrobeGarment[]).filter(item => !item.retired);

export function getWardrobeGarment(id?: string) {
  return importedWardrobeItems.find(item => item.id === id);
}

export function wardrobeGarmentModelUrl(item: WardrobeGarment, kind: "garage" | "portrait") {
  if (!__DRESSING_ROOM_IMPORTED_IDS__.includes(item.id)) return undefined;
  if (item.revisionUrl && __DRESSING_ROOM_REVISION_IDS__.includes(item.id)) return item.revisionUrl;
  if (kind === "portrait" && item.mobileUrl && __DRESSING_ROOM_MOBILE_IDS__.includes(item.id)) return item.mobileUrl;
  return item.url;
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
  const replacesBodice = id && (slot === "top" || slot === "dress");
  return { ...choice, garments: Object.keys(garments).length ? garments : undefined, wardrobeTrial: replacesBodice ? undefined : choice.wardrobeTrial };
}
