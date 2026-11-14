import { Box3, Mesh, type Object3D } from "three";
import catalog from "../../../../avenlab-server/src/assets/character-clothing-pieces.json";
import { characterAppearance, characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { resolveWardrobe, UNDERBUST_WARDROBE_SET } from "./wardrobe";
import { getWardrobeGarment, wardrobeGarmentReplacements, wardrobeRemovalPieces } from "./wardrobeGarments";

export const UNDERWEAR_PIECES = ["bra", "briefs"] as const;
export type UnderwearPiece = typeof UNDERWEAR_PIECES[number];
export type ClothingPiece = "corset" | "shirt" | "skirt" | "sleeves" | "underskirt" | "shorts" | "shoes" | "hat" | "bow" | "belt" | "coat" | "pants" | "gloves" | "collar" | "pouches" | "glasses" | "bag" | "dress" | "socks" | "harness" | "armor" | "bracer" | UnderwearPiece;
export type PieceColors = { color?: string; accent?: string };
export const CLOTHING_PIECES = catalog as { id: ClothingPiece; label: string; center: number; span: number }[];
export const clothingPieceLabel = (piece: ClothingPiece) => CLOTHING_PIECES.find(item => item.id === piece)!.label;

export const isUnderwearPiece = (piece: ClothingPiece): piece is UnderwearPiece => piece === "bra" || piece === "briefs";
export const skirtUsesUnderwear = (id?: string) => id === "gothic-skirt-02";
export const DEFAULT_UNDERWEAR_COLORS = { color: "#826a9f", accent: "#d99eaf" };

export function clothingColorKey(choice: Pick<CharacterChoice, "outfit" | "wardrobe" | "wardrobeTrial" | "appearance" | "garments">, piece: ClothingPiece) {
  if (isUnderwearPiece(piece)) return `underwear:${piece}`;
  const garment = Object.values(choice.garments ?? {}).map(getWardrobeGarment).find(item => item?.piece === piece);
  const corset = resolveWardrobe(choice.wardrobeTrial, { includeRetired: true });
  const corsetSet = piece === "corset" ? corset?.set : undefined;
  const variant = garment?.id ?? (piece === "glasses" ? choice.appearance?.glasses ?? "none" : piece === "bag" ? "shop-bag"
    : corsetSet ?? resolveWardrobe(choice.wardrobe)?.set ?? choice.outfit);
  return `${variant}:${piece}`;
}
export function clothingColors(look: CharacterLook, piece: ClothingPiece) {
  return look.appearance.item_colors?.[clothingColorKey({
    outfit: look.outfit.id, wardrobe: look.wardrobe, appearance: look.appearance, garments: look.garments,
    wardrobeTrial: look.corset,
  }, piece)];
}

export function underwearColors(look: CharacterLook, piece: UnderwearPiece): Required<PieceColors> {
  const dye = clothingColors(look, piece);
  const skirtDye = piece === "briefs" && skirtUsesUnderwear(look.garments?.skirt) ? clothingColors(look, "skirt") : undefined;
  return {
    color: dye?.color ?? skirtDye?.color ?? (look.appearance.color !== "original" ? look.fabric : DEFAULT_UNDERWEAR_COLORS.color),
    accent: dye?.accent ?? skirtDye?.accent ?? look.appearance.accent ?? DEFAULT_UNDERWEAR_COLORS.accent,
  };
}

export function withClothingColors(choice: CharacterChoice, piece: ClothingPiece, colors?: PieceColors): CharacterChoice {
  const item_colors = { ...choice.appearance?.item_colors };
  const key = clothingColorKey(choice, piece);
  if (colors) item_colors[key] = { ...item_colors[key], ...colors };
  else delete item_colors[key];
  return { ...choice, appearance: { ...characterAppearance(choice), item_colors: Object.keys(item_colors).length ? item_colors : undefined } };
}
export function wornClothing(choice: CharacterChoice): ClothingPiece[] {
  const female = choice.id === "mara-vega";
  const look = characterLook(choice);
  const wardrobe = look?.wardrobe;
  const removed = look?.removedClothing ?? [];
  const corset = look?.corset;
  let pieces: ClothingPiece[] = female ? wardrobe
    ? ["corset", "skirt", "shoes", "hat"]
    : ["corset", "skirt", "sleeves", "underskirt", "shoes", "hat", "belt", ...((choice.appearance?.accent || choice.outfit === "shop-crew") ? ["bow" as const] : [])]
    : ["coat", "pants", "shoes", "gloves", "collar", "belt", "pouches"];
  if (corset) {
    pieces = pieces.filter(piece => !wardrobeGarmentReplacements.top.some(replaced => replaced === piece));
    pieces.unshift("corset");
  }
  const visible = look?.garments;
  if (visible) {
    const garments = Object.values(visible).map(getWardrobeGarment).filter(item => item !== undefined);
    const replaced = new Set<ClothingPiece>(garments.flatMap(item => wardrobeGarmentReplacements[item.slot]));
    if (corset) replaced.delete("corset");
    pieces = [...new Set([...pieces.filter(piece => !replaced.has(piece)), ...garments.map(item => item.piece)])];
  }
  if (!female && choice.appearance?.headwear === "hat") pieces.push("hat");
  if (choice.appearance?.glasses && choice.appearance.glasses !== "none") pieces.push("glasses");
  if (choice.prop === "shop-bag") pieces.push("bag");
  const hidden = new Set<ClothingPiece>(removed.flatMap(slot => wardrobeRemovalPieces[slot]));
  const shown = pieces.filter(piece => !hidden.has(piece));
  if (female) {
    const coveredTop = shown.some(piece => piece === "shirt" || piece === "dress" || piece === "armor"
      || (piece === "corset" && corset?.set !== UNDERBUST_WARDROBE_SET));
    const coveredBottom = shown.some(piece => piece === "skirt" || piece === "dress" || piece === "shorts");
    if (!coveredTop && (removed.includes("top") || removed.includes("corset"))) shown.push("bra");
    if (!coveredBottom && removed.includes("skirt")) shown.push("briefs");
  }
  return shown;
}

export function clothingPieceFor(object: Object3D): ClothingPiece | undefined {
  const explicit = object.userData.clothingPiece;
  if (CLOTHING_PIECES.some(piece => piece.id === explicit)) return explicit;
  const role = String(object.userData.wardrobeRole ?? "");
  if (role.startsWith("corset")) return "corset";
  if (role.startsWith("shirt")) return "shirt";
  if (role.startsWith("bottom")) return "skirt";
  if (role === "shorts") return "shorts";
  const name = object.name;
  if (/^CLOTH_BOTTOM_SKIRT/.test(name)) return "skirt";
  if (/^CLOTH_(?:TOP_CORSET|CORSET_)/.test(name)) return "corset";
  if (/^CLOTH_SHIRT_/.test(name)) return "shirt";
  if (/^CLOTH_UNDER_MODESTY/.test(name)) return "shorts";
  if (/^CLOTH_ARMS/.test(name)) return "sleeves";
  if (/^CLOTH_UNDER_UNDERSKIRT/.test(name)) return "underskirt";
  if (/^CLOTH_FEET/.test(name)) return "shoes";
  if (/^CLOTH_TOP_COAT/.test(name)) return "coat";
  if (/^CLOTH_BOTTOM_TROUSERS/.test(name)) return "pants";
  if (/^CLOTH_HANDS/.test(name)) return "gloves";
  if (/^CLOTH_NECK/.test(name)) return "collar";
  if (/^ACC_HAT/.test(name)) return "hat";
  if (/^ACC_BOW/.test(name)) return "bow";
  if (/^ACC_BELT/.test(name)) return "belt";
  if (/^ACC_POUCH/.test(name)) return "pouches";
  if (name === "villager-glasses") return "glasses";
  if (name === "driver-shop-bag") return "bag";
  // GLTFLoader turns a multi-material garment into a tagged Group whose
  // primitive Mesh children do not carry the node's extras.
  if (object.parent) return clothingPieceFor(object.parent);
}

/** Called on selection/reframe, not on every animation frame. Hidden layers cannot enlarge the shot. */
export function clothingBounds(root: Object3D, piece: ClothingPiece, bounds = new Box3()) {
  bounds.makeEmpty();
  root.updateWorldMatrix(true, true);
  function visit(object: Object3D, inherited?: ClothingPiece) {
    if (!object.visible) return;
    const item = clothingPieceFor(object) ?? inherited;
    if (object instanceof Mesh && item === piece) bounds.expandByObject(object, true);
    object.children.forEach(child => visit(child, item));
  }
  visit(root);
  return bounds;
}
