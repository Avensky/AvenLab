import { Box3, Mesh, type Object3D } from "three";
import catalog from "../../../../avenlab-server/src/assets/character-clothing-pieces.json";
import { characterAppearance, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { resolveCharacterWardrobe, UNDERBUST_WARDROBE_SET } from "./wardrobe";
import { getWardrobeGarment, wardrobeGarmentReplacements } from "./wardrobeGarments";

export type ClothingPiece = "corset" | "shirt" | "skirt" | "sleeves" | "underskirt" | "shorts" | "shoes" | "hat" | "bow" | "belt" | "coat" | "pants" | "gloves" | "collar" | "pouches" | "glasses" | "bag" | "dress" | "socks" | "harness";
export type PieceColors = { color?: string; accent?: string };
export const CLOTHING_PIECES = catalog as { id: ClothingPiece; label: string; center: number; span: number }[];
export const clothingPieceLabel = (piece: ClothingPiece) => CLOTHING_PIECES.find(item => item.id === piece)!.label;

export function clothingColorKey(choice: Pick<CharacterChoice, "outfit" | "wardrobe" | "wardrobeTrial" | "appearance" | "garments">, piece: ClothingPiece) {
  const garment = Object.values(choice.garments ?? {}).map(getWardrobeGarment).find(item => item?.piece === piece);
  const variant = garment?.id ?? (piece === "glasses" ? choice.appearance?.glasses ?? "none" : piece === "bag" ? "shop-bag"
    : resolveCharacterWardrobe(choice)?.set ?? choice.outfit);
  return `${variant}:${piece}`;
}
export function clothingColors(look: CharacterLook, piece: ClothingPiece) {
  return look.appearance.item_colors?.[clothingColorKey({
    outfit: look.outfit.id, wardrobe: look.wardrobe, appearance: look.appearance, garments: look.garments,
    wardrobeTrial: look.wardrobe?.set === UNDERBUST_WARDROBE_SET ? look.wardrobe : undefined,
  }, piece)];
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
  const wardrobe = female ? resolveCharacterWardrobe(choice) : undefined;
  let pieces: ClothingPiece[] = female ? wardrobe
    ? ["corset", "skirt", "shoes", "hat"]
    : ["corset", "skirt", "sleeves", "underskirt", "shoes", "hat", "belt", ...((choice.appearance?.accent || choice.outfit === "shop-crew") ? ["bow" as const] : [])]
    : ["coat", "pants", "shoes", "gloves", "collar", "belt", "pouches"];
  if (wardrobe?.set === UNDERBUST_WARDROBE_SET) pieces.splice(1, 0, "shirt");
  if (female && choice.garments) {
    const garments = Object.values(choice.garments).map(getWardrobeGarment).filter(item => item !== undefined);
    const replaced = new Set<ClothingPiece>(garments.flatMap(item => wardrobeGarmentReplacements[item.slot]));
    pieces = [...new Set([...pieces.filter(piece => !replaced.has(piece)), ...garments.map(item => item.piece)])];
  }
  if (!female && choice.appearance?.headwear === "hat") pieces.push("hat");
  if (choice.appearance?.glasses && choice.appearance.glasses !== "none") pieces.push("glasses");
  if (choice.prop === "shop-bag") pieces.push("bag");
  return pieces;
}

export function clothingPieceFor(object: Object3D): ClothingPiece | undefined {
  const explicit = object.userData.clothingPiece;
  if (CLOTHING_PIECES.some(piece => piece.id === explicit)) return explicit;
  const role = String(object.userData.wardrobeRole ?? "");
  if (role.startsWith("corset")) return "corset";
  if (role.startsWith("shirt")) return "shirt";
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
