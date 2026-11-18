import { FitBadge, FitReview } from "./FitReview";
import { MenuBackButton } from "../../components/menus/MenuFrame";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CHARACTER_APPEARANCE_OPTIONS, ROOK_ID, VILLAGER_ID, characterLook, type CharacterChoice, type CharacterStyleField } from "./characterCatalog";
import { focusClothingPiece, useCharacterPreviewStore } from "./characterPreviewStore";
import { UNDERBUST_WARDROBE_SET, WARDROBE_CORSETS, WARDROBE_SETS, WARDROBE_WAIST_OPTIONS, corsetModelUrl, hasSeparateWardrobeTop, hasTuckedUnderbust, hasUnderbustCut, resolveWardrobe, withWardrobeWaist, type WardrobeChoice } from "./wardrobe";
import { ClothingColorToolbar } from "./ClothingColorToolbar";
import { braFitsWith, CLOTHING_PIECES, clothingPieceLabel, UNDERWEAR_PIECES, underwearColors, wornClothing, type ClothingPiece, type UnderwearPiece } from "./clothingPieces";
import { FittingCameraSelect, FittingWearableShortcuts } from "./FittingCameraSelect";
import { getWardrobeGarment, importedWardrobeItems, setWardrobeGarment, setWardrobeRemoval, wardrobeGarmentModelUrl, villageWardrobeItems, wardrobeRemovalPieces, type WardrobeGarmentSlot, type WardrobeRemoval } from "./wardrobeGarments";
import { SavedOutfits } from "./SavedOutfits";
import "./dressingRoom.css";

const CATEGORIES = [
  { id: "outfits", label: "Outfits", group: "Wardrobe", icon: "outfits" },
  { id: "saved", label: "Saved outfits", group: "Wardrobe", icon: "saved" },
  { id: "layers", label: "Layers", group: "Wardrobe", icon: "layers", femaleOnly: true },
  { id: "underwear", label: "Underwear", group: "Wardrobe", icon: "layers", femaleOnly: true },
  { id: "corsets", label: "Corsets", group: "Wardrobe", icon: "corsets", femaleOnly: true },
  { id: "tops", label: "Tops", group: "Wardrobe", icon: "tops", femaleOnly: true },
  { id: "bottoms", label: "Skirts", group: "Wardrobe", icon: "skirts", femaleOnly: true },
  { id: "footwear", label: "Shoes & socks", group: "Wardrobe", icon: "footwear" },
  { id: "headwear", label: "Headwear", group: "Finishing touches", icon: "headwear" },
  { id: "bows", label: "Bows", group: "Finishing touches", icon: "bows", femaleOnly: true },
  { id: "accessories", label: "Accessories", group: "Finishing touches", icon: "accessories" },
  { id: "props", label: "Handheld props", group: "Finishing touches", icon: "props" },
] as const;
type Category = typeof CATEGORIES[number]["id"];
type Icon = typeof CATEGORIES[number]["icon"] | "remove";
const ICON_PATHS: Record<Icon, string> = {
  outfits: "M9 4h6l2 5-3 2 3 9H7l3-9-3-2z M9 4l3 3 3-3 M9 14h6",
  saved: "M7 4h10v16l-5-4-5 4z",
  remove: "M5 5l14 14M19 5 5 19",
  layers: "M12 4 3 8l9 4 9-4z M3 12l9 4 9-4 M3 16l9 4 9-4",
  corsets: "M5 5l3 2 4 1 4-1 3-2-2 9 1 5-6 2-6-2 1-5zm4 4 6 7m0-7-6 7",
  tops: "m8 4-5 3 2 5 3-1v9h8v-9l3 1 2-5-5-3 M8 4l4 4 4-4",
  skirts: "M8 5h8l5 15H3z M7 8h10 M10 8l-1 12 M14 8l1 12",
  footwear: "M5 4h7v8l7 3 2 3v3H3v-9h2z M3 18h18 M12 12l-2 3",
  headwear: "M6 14v-3a6 6 0 0 1 12 0v3 M3 16c4-3 14-3 18 0l-3 3H6z",
  bows: "m10 10-6-4v12l6-4m4-4 6-4v12l-6-4 M10 10h4v4h-4z",
  accessories: "m2 10 3-1 2 1h3l2 2 2-2h3l2-1 3 1 M4 10l1 6h5l2-4 2 4h5l1-6",
  props: "M5 8h14l1 13H4z M8 8V6a4 4 0 0 1 8 0v2",
};

function WardrobeIcon({ name }: { name: Icon }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

const LAYERS = ["Underwear", "Inner", "Middle", "Outer", "Overwear"] as const;
const OUTFIT_LAYERS: readonly WardrobeRemoval[] = ["dress", "top", "corset", "skirt", "hat", "shoes", "socks", "bow", "harness", "bracer", "coat", "sleeves", "underskirt", "belt"];
const wearableOrder = [...CLOTHING_PIECES].sort((a, b) => b.center - a.center).map(item => item.id);
type ClothingLayer = typeof LAYERS[number];
const GARMENT_LAYERS: Record<WardrobeGarmentSlot, ClothingLayer> = {
  top: "Middle", skirt: "Outer", coat: "Overwear", dress: "Outer", hat: "Overwear", socks: "Inner", bow: "Overwear", harness: "Overwear", bracer: "Overwear",
  sleeves: "Middle", belt: "Overwear", underskirt: "Inner", shoes: "Overwear",
};

type WardrobeFocus = ClothingPiece | "Face" | "Hands" | "Full body";
const REMOVAL_CARDS: { category: Category; slot: WardrobeRemoval; label: string; section: string; focus: WardrobeFocus; layer: ClothingLayer }[] = [
  { category: "corsets", slot: "corset", label: "corset", section: "Gothic corsets", focus: "corset", layer: GARMENT_LAYERS.top },
  { category: "tops", slot: "top", label: "top", section: "Tops", focus: "shirt", layer: "Middle" },
  { category: "bottoms", slot: "skirt", label: "skirt", section: "Skirts", focus: "skirt", layer: "Outer" },
  { category: "footwear", slot: "socks", label: "socks", section: "Socks", focus: "socks", layer: "Inner" },
  { category: "footwear", slot: "shoes", label: "shoes", section: "Shoes", focus: "shoes", layer: "Overwear" },
  { category: "headwear", slot: "bonnet-bow", label: "bonnet bow", section: "Headwear", focus: "Face", layer: "Overwear" },
  { category: "headwear", slot: "hat", label: "headwear", section: "Headwear", focus: "Face", layer: "Overwear" },
  { category: "bows", slot: "bow", label: "bow", section: "Bows", focus: "bow", layer: "Overwear" },
  { category: "accessories", slot: "harness", label: "harness", section: "Harnesses", focus: "harness", layer: "Overwear" },
  { category: "accessories", slot: "bracer", label: "bracer", section: "Bracers", focus: "bracer", layer: "Overwear" },
];
type Item = {
  id: string; label: string; section: string; icon: Icon; description?: string;
  selected?: boolean; detail?: string; unavailable?: "Pack not installed";
  color?: string; accent?: string; focus?: WardrobeFocus; choose?: () => void; remove?: () => void; clear?: (choice: CharacterChoice) => CharacterChoice; trial?: boolean;
  pieces?: "outfit" | readonly ClothingPiece[]; included?: boolean; set?: string; layer?: ClothingLayer;
  underwear?: UnderwearPiece; alphaStatus?: AlphaStatus;
};
const ALPHA_STATUSES = {
  "near-pass": { label: "Alpha — Nearly Passing", description: "The fit is close to passing for alpha; final visual review remains." },
  passed: { label: "Alpha Pass", description: "Passing for alpha for now." },
  development: { label: "Under Development", description: "Available for fitting while development continues." },
} as const;
type AlphaStatus = keyof typeof ALPHA_STATUSES;

function alphaStatus(pieces: Item["pieces"]): AlphaStatus | undefined {
  if (!pieces || pieces.length === 0) return undefined;
  if (pieces === "outfit") return "development";
  if (pieces.every(piece => piece === "socks")) return "passed";
  if (pieces.every(piece => piece === "skirt" || piece === "underskirt")) return "near-pass";
  return "development";
}

const OUTFIT_DESCRIPTIONS: Record<string, string> = {
  dockwear: "Vesper’s village outfit pairs a fitted bodice with a full skirt, petticoat and bonnet.",
  "shop-crew": "Vesper’s workshop colors pair blue fabric with pale trim and a matching bow.",
  "night-run": "Rook’s hill-run outfit pairs a dark coat and trousers with gloves and belt pouches.",
  "race-crew": "Rook’s race-crew outfit uses warm brown fabric and gold trim on his coat and accessories.",
};
const FITTED_PRESETS: Partial<Record<string, { waist: WardrobeChoice["waist"]; description: string }>> = {
  "gothic-02": { waist: "tucked", description: "A sweetheart-neckline corset with a layered, scalloped skirt." },
  "gothic-03": { waist: "over", description: "A ruffled corset with a matching skirt cut to clear its inner ruffles." },
  "gothic-05": { waist: "tucked", description: "A high-collar corset with a fitted upper back and a matching skirt. It supports tucked and over-skirt fits." },
};
function focusView(camera: "Face" | "Hands" | "Full body") {
  useCharacterPreviewStore.setState(s => ({ camera, zoom: 1, emote: null, focusRevision: s.focusRevision + 1 }));
}

function inspectWardrobe(focus: WardrobeFocus) {
  if (focus === "Face" || focus === "Hands" || focus === "Full body") focusView(focus);
  else focusClothingPiece(focus);
}

/** One live scene; browsing the catalog never changes or saves the equipped look. */
export function DressingRoom({ choice, onChange, onEquip = onChange, onTryOn, onLoad = onTryOn, onEndPreview, cameraTools, onColors = onChange }: {
  choice: CharacterChoice; onChange: (choice: CharacterChoice) => void;
  onEquip?: (choice: CharacterChoice) => void; onTryOn: (choice: CharacterChoice) => void;
  onLoad?: (choice: CharacterChoice) => void; onEndPreview?: () => void; cameraTools?: ReactNode;
  onColors?: (choice: CharacterChoice) => void;
}) {
  const [category, setCategory] = useState<Category>("outfits");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inspectedId, setInspectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [alphaOnly, setAlphaOnly] = useState(false);
  const [layer, setLayer] = useState<ClothingLayer>("Inner");
  const catalogId = useId(), detailsId = useId();
  const catalogRef = useRef<HTMLElement>(null);
  const categoryRef = useRef<HTMLElement>(null);
  const focusLayer = useRef(false);
  const shortcutTarget = useRef<string | undefined>(undefined);
  const look = characterLook(choice)!;
  const { character, outfit, appearance, wardrobe, corset, garments, overEase, outfitRemovals, removedClothing } = look;
  const waistSelection = removedClothing.includes("corset") || removedClothing.includes("top") || hasSeparateWardrobeTop(choice) ? undefined : corset ?? wardrobe;
  const selectedPiece = useCharacterPreviewStore(s => s.selectedPiece);
  const camera = useCharacterPreviewStore(s => s.camera);
  const pieces = wornClothing(choice);
  const sleevesRemoved = removedClothing.includes("sleeves");
  const stockSleeves = pieces.includes("sleeves")
    || (sleevesRemoved && wornClothing(setWardrobeRemoval(choice, "sleeves", false)).includes("sleeves"));
  const sleeveSource = getWardrobeGarment(garments?.dress)?.detachableSleeves ? garments?.dress
    : stockSleeves ? choice.garments?.sleeves ?? outfit.id : undefined;
  const sleeveToggle = <button type="button" className="menu-control" data-wardrobe-remove="sleeves"
    onClick={() => onTryOn(setWardrobeRemoval(choice, "sleeves", !sleevesRemoved))}>
    {sleevesRemoved ? "Restore sleeves" : "Remove sleeves"}
  </button>;
  const canWearBra = braFitsWith(pieces, corset?.set);
  const piece = pieces.includes(selectedPiece) ? selectedPiece : pieces[0];
  const female = choice.id === VILLAGER_ID;
  const categories = CATEGORIES.filter(item => female || !("femaleOnly" in item));
  const currentCategory = CATEGORIES.find(item => item.id === category)!;
  const hasAuthoredMale = choice.id === ROOK_ID && Boolean(__ROOK_MODEL_URL__);
  const upperPiece = female ? "corset" : "coat";
  const categoryFocus: Record<Category, WardrobeFocus> = {
    outfits: garments?.dress ? "Full body" : upperPiece, saved: "Full body", layers: "Full body", underwear: "Full body",
    corsets: "corset", tops: "shirt", bottoms: "skirt", bows: "bow",
    footwear: "shoes", headwear: pieces.includes("hat") ? "hat" : "Face", accessories: pieces.includes("glasses") ? "glasses" : "Face",
    props: pieces.includes("bag") ? "bag" : "Hands",
  };

  useLayoutEffect(() => {
    const { camera, zoom, selectedPiece } = useCharacterPreviewStore.getState();
    focusView("Full body");
    return () => useCharacterPreviewStore.setState({ camera, zoom, selectedPiece });
  }, []);
  useLayoutEffect(() => {
    if (!focusLayer.current) return;
    focusLayer.current = false;
    if (catalogOpen) {
      const catalog = catalogRef.current;
      catalog?.scrollTo?.({ top: 0 });
      (catalog?.querySelector<HTMLButtonElement>("[data-wardrobe-item]:not([data-unavailable])")
        ?? catalog?.querySelector<HTMLButtonElement>("[data-wardrobe-back]"))?.focus({ preventScroll: true });
    } else categoryRef.current?.querySelector<HTMLButtonElement>(`[data-category=${category}]`)?.focus();
  }, [catalogOpen, category]);

  useLayoutEffect(() => {
    if (!shortcutTarget.current) return;
    const card = catalogRef.current?.querySelector<HTMLButtonElement>("[data-inspected]");
    if (card?.dataset.wardrobeItem === shortcutTarget.current) {
      card.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      shortcutTarget.current = undefined;
    }
  });

  function edit(field: CharacterStyleField, value: string) {
    onChange({ ...choice, appearance: { ...appearance, [field]: value } });
  }
  function waistForSet(set: string): WardrobeChoice["waist"] {
    return wardrobe?.set === set && !garments ? wardrobe.waist : FITTED_PRESETS[set]?.waist ?? "tucked";
  }
  function wearOutfit(outfit: string, wardrobe?: WardrobeChoice) {
    onEquip({ ...choice, outfit, wardrobe, garments: undefined,
      wardrobeTrial: undefined, wardrobeEase: undefined, removedClothing: undefined, bra: undefined });
  }
  function tryCorset(set: string) {
    const compatible = { ...choice.garments };
    delete compatible.dress;
    delete compatible.top;
    const current = hasSeparateWardrobeTop(choice) ? undefined : choice.wardrobeTrial;
    const waist = current?.set === set ? current.waist : FITTED_PRESETS[set]?.waist ?? "over";
    const cut = current?.set === set ? current.cut : undefined;
    onTryOn({ ...setWardrobeRemoval(setWardrobeRemoval(choice, "top", false), "corset", false), wardrobeTrial: resolveWardrobe({ set, shirt: "none", waist, cut }, { includeRetired: true }),
      wardrobeEase: current?.set === set ? choice.wardrobeEase : undefined,
      bra: corset?.set === set ? choice.bra : undefined,
      garments: Object.keys(compatible).length ? compatible : undefined });
  }
  function revealUnderwear(piece: UnderwearPiece) {
    let next = garments?.dress ? setWardrobeRemoval(choice, "dress", true) : choice;
    if (piece === "bra") {
      next = { ...setWardrobeRemoval(setWardrobeRemoval(next, "top", true), "corset", true), bra: true };
    } else {
      next = setWardrobeRemoval(next, "skirt", true);
    }
    if (next !== choice) onTryOn(next);
    setInspectedId(`underwear-${piece}`);
    focusClothingPiece(piece);
  }
  function options(field: CharacterStyleField, section: string, icon: Icon): Item[] {
    const defaultOption = CHARACTER_APPEARANCE_OPTIONS[field][0].id;
    return CHARACTER_APPEARANCE_OPTIONS[field].map(option => ({
      id: `${field}:${option.id}`, label: option.label, section, icon,
      selected: (appearance[field] ?? defaultOption) === option.id,
      color: "color" in option ? option.color : undefined,
      focus: field === "glasses" ? (option.id === "none" ? "Face" : "glasses")
        : field === "headwear" ? (option.id === "hat" ? "hat" : "Face") : undefined,
      pieces: field === "glasses" && option.id !== "none" ? ["glasses"] : field === "headwear" && option.id === "hat" ? ["hat"] : undefined,
      choose: () => edit(field, option.id),
      clear: option.id === defaultOption && (appearance[field] ?? defaultOption) !== defaultOption
        ? next => ({ ...next, appearance: { ...(next.appearance ?? appearance), [field]: defaultOption } }) : undefined,
    }));
  }
  const fittedSets = female ? WARDROBE_SETS.flatMap((set): Item[] => {
    const preset = FITTED_PRESETS[set.id];
    if (!preset) return [];
    const installed = __WARDROBE_SET_IDS__.includes(set.id);
    return [{
      id: set.id, label: set.name, section: "Gothic collection", icon: "outfits", selected: !garments && !corset && !removedClothing.length && wardrobe?.set === set.id, set: set.id,
      description: preset.description, pieces: "outfit",
      detail: "Matched corset + skirt", unavailable: installed ? undefined : "Pack not installed",
      choose: installed ? () => wearOutfit(outfit.id, resolveWardrobe({ set: set.id, shirt: "none", waist: waistForSet(set.id) })) : undefined,
      clear: wardrobe?.set === set.id ? next => ({ ...next, wardrobe: undefined,
        wardrobeEase: next.wardrobeTrial ? next.wardrobeEase : undefined }) : undefined,
    }];
  }) : [];
  const completeOutfits = character.outfits.map((item): Item => {
    const garment = getWardrobeGarment(item.id);
    const preset = garment?.outfit ? garment : undefined;
    const installed = !preset || Boolean(wardrobeGarmentModelUrl(preset, "garage"));
    const selected = !wardrobe && !corset && !choice.garments && !choice.removedClothing?.length && outfit.id === item.id;
    return {
      id: item.id, label: item.name, section: preset?.section ?? "Complete outfits", icon: "outfits",
      description: preset?.outfit?.description ?? OUTFIT_DESCRIPTIONS[item.id], pieces: "outfit",
      selected: installed && selected, color: item.jacket, accent: item.trim, focus: preset ? "Full body" : undefined,
      unavailable: installed ? undefined : "Pack not installed",
      remove: selected && preset ? () => onTryOn(setWardrobeRemoval(choice, "dress", true)) : undefined,
      choose: installed ? () => wearOutfit(item.id) : undefined,
      clear: !wardrobe && outfit.id === item.id && outfit.id !== character.outfits[0].id
        ? next => ({ ...next, outfit: character.outfits[0].id }) : undefined,
    };
  });
  const outfitRemoved = OUTFIT_LAYERS.every(slot => choice.removedClothing?.includes(slot));
  function removeOutfit() {
    onTryOn({ ...choice, removedClothing: [...new Set([...(choice.removedClothing ?? []), ...OUTFIT_LAYERS])] });
    setInspectedId(undefined);
    focusView("Full body");
  }

  const allItems: Record<Category, Item[]> = {
    outfits: [
      ...completeOutfits.filter(item => item.section === "Complete outfits"),
      ...fittedSets,
      ...completeOutfits.filter(item => item.section !== "Complete outfits"),
    ],
    saved: [], layers: [],
    underwear: female ? UNDERWEAR_PIECES.map((item): Item => {
      const revealed = pieces.includes(item);
      return {
        id: `underwear-${item}`, label: item === "briefs" && appearance.briefs_style === "boxer-briefs" ? "Short boxer briefs" : clothingPieceLabel(item), section: "Underwear", icon: "layers",
        description: item === "bra" ? "Can also be worn under the Gothic Underbust Vest." : undefined,
        focus: item, layer: "Underwear", underwear: item, pieces: [item], included: true,
        selected: revealed, detail: "Base layer", ...underwearColors(look, item),
        clear: revealed || (item === "bra" && choice.bra !== undefined) ? next => {
          const covered = setWardrobeRemoval(next, "dress", false);
          return item === "bra"
            ? { ...setWardrobeRemoval(setWardrobeRemoval(covered, "top", false), "corset", false), bra: undefined }
            : setWardrobeRemoval(covered, "skirt", false);
        } : undefined,
      };
    }) : [],
    corsets: female ? WARDROBE_CORSETS.map((set): Item => {
      const installed = Boolean(corsetModelUrl({ set: set.id, shirt: "none", waist: "over" }, "garage"));
      const selected = corset?.set === set.id;
      const underbust = set.id === UNDERBUST_WARDROBE_SET;
      return {
        id: set.id, set: set.id, label: underbust ? "Gothic Underbust Vest" : set.name, section: "Gothic corsets", icon: "corsets",
        trial: true, selected, detail: "Try-on", focus: "corset", pieces: ["corset"], layer: GARMENT_LAYERS.top,
        unavailable: installed ? undefined : "Pack not installed",
        description: underbust
          ? (hasTuckedUnderbust()
            ? "Choose Tucked into skirt or Over skirt. The vest replaces the current top and can be worn with a bra."
            : "The rebuilt vest appears in Over skirt. Tucked into skirt uses the original fit. The vest replaces the current top and can be worn with a bra.")
          : undefined,
        choose: installed ? () => tryCorset(set.id) : undefined,
        remove: selected ? () => onTryOn(setWardrobeRemoval(choice, "corset", true)) : undefined,
        clear: choice.wardrobeTrial?.set === set.id
          ? next => ({ ...next, wardrobeTrial: undefined, wardrobeEase: undefined }) : undefined,
      };
    }) : [],
    tops: [],
    bottoms: [],
    footwear: female ? [] : [{ id: "outfit-shoes", label: "Outfit boots", section: "Shoes", icon: "footwear", selected: !removedClothing.includes("shoes"),
      pieces: ["shoes"], included: true, layer: "Overwear", focus: "shoes",
      choose: removedClothing.includes("shoes") ? () => onTryOn(setWardrobeRemoval(choice, "shoes", false)) : undefined }],
    headwear: female ? []
      : hasAuthoredMale ? [] : options("headwear", "Headwear", "headwear"),
    bows: [],
    accessories: options("glasses", "Glasses", "accessories"),
    props: [
      { id: "empty-hands", label: "Empty hands", section: "Handheld props", icon: "props", focus: "Hands", selected: !choice.prop, choose: () => onChange({ ...choice, prop: undefined }) },
      { id: "shop-bag", label: "Shop bag", section: "Handheld props", icon: "props", focus: "bag", description: "Carry a shop bag to use the bag emotes.", pieces: ["bag"], selected: choice.prop === "shop-bag", detail: "Unlocks bag emotes", choose: () => onChange({ ...choice, prop: "shop-bag" }),
        clear: choice.prop ? next => ({ ...next, prop: undefined }) : undefined },
    ],
  };
  if (female) for (const item of importedWardrobeItems) {
    if (item.outfit) continue;
    const category = CATEGORIES.find(category => category.id === item.category);
    if (!category) continue;
    const modelUrl = wardrobeGarmentModelUrl(item, "garage");
    const revised = modelUrl !== undefined && modelUrl === item.revisionUrl;
    const selected = garments?.[item.slot] === item.id;
    allItems[category.id].push({
      id: item.id, label: item.label, section: item.section, icon: category.icon,
      trial: true, selected, detail: revised ? "Revised model" : "Try-on", focus: item.piece, pieces: [item.piece],
      layer: item.piece === "armor" ? "Outer" : GARMENT_LAYERS[item.slot],
      unavailable: modelUrl ? undefined : "Pack not installed",
      description: item.description,
      choose: modelUrl ? () => onTryOn(setWardrobeGarment(choice, item.slot, item.id)) : undefined,
      remove: selected ? () => onTryOn(item.slot === "dress" || item.slot === "top" || item.slot === "skirt"
        ? setWardrobeRemoval(choice, item.slot, true) : setWardrobeGarment(choice, item.slot)) : undefined,
      clear: choice.garments?.[item.slot] === item.id ? next => {
        const cleared = setWardrobeGarment(next, item.slot);
        return selected && (item.slot === "top" || item.slot === "skirt") ? setWardrobeRemoval(cleared, item.slot, true) : cleared;
      } : undefined,
    });
  }
  if (female) for (const item of villageWardrobeItems) {
    const category = CATEGORIES.find(entry => entry.id === item.category)!;
    const removal = item.id === "village-bodice" ? "corset" : item.slot;
    const stock = !wardrobe && !(corset && item.slot === "top") && pieces.includes(item.piece) && !garments?.[item.slot];
    const sharedStock = (item.slot === "shoes" || item.slot === "hat") && pieces.includes(item.piece) && !garments?.[item.slot];
    const selected = garments?.[item.slot] === item.id || stock || sharedStock;
    const installed = Boolean(wardrobeGarmentModelUrl(item, "garage"));
    allItems[category.id].push({
      id: item.id, label: item.label, section: item.section, icon: category.icon, selected,
      pieces: [item.piece], focus: item.piece,
      included: true, layer: GARMENT_LAYERS[item.slot], unavailable: installed ? undefined : "Pack not installed",
      choose: installed && !selected ? () => onTryOn(setWardrobeGarment(choice, item.slot, item.id)) : undefined,
      remove: selected ? () => onTryOn(setWardrobeRemoval(choice, removal, true)) : undefined,
    });
  }
  const wearsBonnet = !removedClothing.includes("hat") && (!garments?.hat || garments.hat === "village-bonnet");
  if (female) for (const { category, slot, label, section, focus, layer } of REMOVAL_CARDS) {
    if (outfitRemovals.includes(slot) || (slot === "bonnet-bow" && !wearsBonnet)) continue;
    if (slot === "bracer" && !choice.garments?.bracer) continue;
    const name = slot === "hat" && !choice.garments?.hat ? "bonnet" : label;
    const selected = removedClothing.includes(slot);
    const wornInOtherSection = Object.values(garments ?? {}).some(id => {
      const garment = getWardrobeGarment(id);
      return garment?.slot === slot && garment.section !== section;
    });
    const hasBundledLayer = slot === "corset" || slot === "top" || slot === "skirt" || slot === "shoes"
      || slot === "hat" || slot === "bow";
    allItems[category].unshift({
      id: `remove-${slot}`, label: selected ? `Restore ${name}` : `Remove ${name}`, section, focus, layer,
      icon: "remove", selected, description: "",
      choose: () => onTryOn(setWardrobeRemoval(choice, slot, !selected)),
      clear: hasBundledLayer && !selected && !wornInOtherSection && wardrobeRemovalPieces[slot].some(piece => pieces.includes(piece))
        ? next => setWardrobeRemoval(next, slot, true) : undefined,
    });
  }
  for (const item of Object.values(allItems).flat()) item.alphaStatus = alphaStatus(item.pieces);
  allItems.layers = Object.values(allItems).flat().filter(item => item.layer);
  const categoryItems = catalogOpen ? allItems[category].filter(item => category !== "layers" || item.layer === layer) : [];
  const query = search.trim().toLocaleLowerCase();
  const items = categoryItems.filter(item => (!alphaOnly || !item.alphaStatus || (!item.unavailable && item.alphaStatus !== "development"))
    && (!query || `${item.label} ${item.section}`.toLocaleLowerCase().includes(query)));
  const sections = [...new Set(items.map(item => item.section))];
  const inspected = catalogOpen ? allItems[category].find(item => item.id === inspectedId) : undefined;
  const underwearColor = inspected?.underwear;
  const underbust = corset?.set === UNDERBUST_WARDROBE_SET && inspected?.set === corset.set;
  const underbustOver = underbust && corset.waist === "over";
  const itemPieces = inspected?.unavailable ? [] : inspected?.pieces === "outfit"
    ? pieces.filter(item => item !== "glasses" && item !== "bag") : inspected?.pieces?.filter(item => pieces.includes(item)) ?? [];

  const reviewPieces = inspected?.pieces === "outfit" ? itemPieces : inspected?.pieces ?? [];
  const reviewPiece = reviewPieces.includes(piece) ? piece : reviewPieces[0];
  const inspectedSleeves = sleeveSource && (inspected?.id === sleeveSource || (inspected?.selected && inspected.pieces !== "outfit"
    && inspected.pieces?.some(piece => piece === "corset" || piece === "shirt" || piece === "sleeves")));

  function clearedSection(section: string) {
    return categoryItems.reduce((next, item) => item.section === section ? item.clear?.(next) ?? next : next, choice);
  }

  function clearSection(next: CharacterChoice) {
    setInspectedId(undefined);
    if (next.appearance !== choice.appearance || next.prop !== choice.prop || next.outfit !== choice.outfit || next.wardrobe !== choice.wardrobe) onChange(next);
    else onTryOn(next);
    inspectWardrobe(categoryFocus[category]);
  }

  function showCatalog(next: Category, item?: Item) {
    setCategory(next);
    setCatalogOpen(true);
    setInspectedId(item?.id);
    setSearch("");
  }
  function openCategory(next: Category) {
    focusLayer.current = true;
    showCatalog(next);
    inspectWardrobe(categoryFocus[next]);
  }
  function closeCatalog() {
    focusLayer.current = true;
    setCatalogOpen(false);
    setInspectedId(undefined);
  }

  function revealCameraItem(category: Category, item: Item) {
    shortcutTarget.current = item.id;
    showCatalog(category, item);
    if (item.unavailable || item.alphaStatus === "development") setAlphaOnly(false);
    // The same shortcut can bring an already inspected card back into view.
    const current = catalogRef.current?.querySelector<HTMLButtonElement>("[data-inspected]");
    if (current?.dataset.wardrobeItem === item.id) current.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  function inspectWornPiece(piece: ClothingPiece) {
    const garment = Object.values(garments ?? {}).map(getWardrobeGarment).find(item => item?.piece === piece);
    for (const { id } of categories) {
      if (id === "layers") continue;
      const item = allItems[id].find(candidate => garment ? candidate.id === garment.id
        : candidate.selected && candidate.icon !== "remove" && candidate.pieces !== "outfit" && candidate.pieces?.includes(piece));
      if (item) {
        revealCameraItem(id, item);
        return;
      }
    }
    // Bundled pieces such as a Gothic skirt or Rook's gloves belong to the outfit card.
    const source = allItems.outfits.find(item => item.id === (wardrobe?.set ?? outfit.id));
    if (source) revealCameraItem("outfits", source);
  }

  function selectWornPiece(piece: ClothingPiece) {
    focusClothingPiece(piece);
    inspectWornPiece(piece);
  }

  function selectCameraView(view: "Full body" | "Face" | "Hands") {
    focusView(view);
    if (view === "Full body") {
      const dress = getWardrobeGarment(garments?.dress);
      const worn = allItems.outfits.find(item => dress ? item.id === dress.id : item.selected);
      if (worn) revealCameraItem("outfits", worn);
      else if (dress) inspectWornPiece(dress.piece);
      else setInspectedId(undefined);
      return;
    }
    const targets: ClothingPiece[] = view === "Face" ? ["glasses", "hat"] : ["bag", "bracer", "gloves"];
    const worn = targets.find(item => pieces.includes(item));
    if (worn) inspectWornPiece(worn);
    else setInspectedId(undefined);
  }

  function controls(title: string, children: ReactNode, columns?: number) {
    return <section className="dressing-layer-group" aria-label={title}><h3>{title}</h3><div className="dressing-layer-options" data-controller-row data-controller-columns={columns}>{children}</div></section>;
  }

  return <>
    <aside className="dressing-wardrobe" aria-label="Wardrobe">
      <h2>Wardrobe</h2>
      <nav ref={categoryRef} className="dressing-categories" aria-label="Dressing room categories" hidden={catalogOpen}>
        {categories.map((item, index) => <div key={item.id}>
          {index > 0 && item.group !== categories[index - 1].group && <h3 className="dressing-group-label">{item.group}</h3>}
          <div data-controller-row><button type="button" className="dressing-category menu-control" data-category={item.id}
            aria-controls={catalogId} aria-expanded={catalogOpen && category === item.id} onClick={() => openCategory(item.id)}>
            <WardrobeIcon name={item.icon} /><span>{item.label}</span>{item.id !== "saved" && <small>{allItems[item.id].length}</small>}
          </button></div>
        </div>)}
      </nav>
      <section ref={catalogRef} className="dressing-catalog" id={catalogId} aria-label={currentCategory.label} hidden={!catalogOpen}>
        <div className="dressing-catalog-toolbar">
          <header className="dressing-catalog-heading" data-controller-row>
            <MenuBackButton data-wardrobe-back label="Back to wardrobe categories" onClick={closeCatalog} />
            <h3>{currentCategory.label}</h3>
          </header>
          {catalogOpen && category !== "saved" && <div className="dressing-search" data-controller-row><input type="search" aria-label={`Search ${currentCategory.label}`} placeholder="Find an item…" value={search} onChange={event => setSearch(event.target.value)} /></div>}
        </div>
        {category === "saved" ? <SavedOutfits choice={choice} onTryOn={onLoad} onEndPreview={onEndPreview} clearPreview /> : catalogOpen && <>
        {category === "outfits" && female && <div className="dressing-layer-options" data-controller-row>
          <button type="button" className="menu-control" data-remove-outfit disabled={outfitRemoved} onClick={removeOutfit}>Remove outfit</button>
        </div>}
        {category === "layers" && <div className="dressing-layer-options" role="group" aria-label="Clothing layers" data-controller-row data-controller-columns="2">
          {LAYERS.map(option => <button key={option} type="button" className="menu-control" aria-pressed={layer === option}
            onClick={() => { setLayer(option); setInspectedId(undefined); }}>{option}</button>)}
        </div>}
        {(category === "underwear" || category === "layers" && layer === "Underwear") &&
          <div className="dressing-layer-options" role="group" aria-label="Underwear preview" data-controller-row>
            <button type="button" className="menu-control" data-wardrobe-remove="top" disabled={!pieces.some(piece =>
              ["corset", "shirt", "dress", "armor"].includes(piece))} onClick={() => revealUnderwear("bra")}>Remove tops</button>
            {sleeveSource && sleeveToggle}
            <button type="button" className="menu-control" data-wardrobe-remove="bottom" disabled={pieces.includes("briefs") && !pieces.includes("underskirt")} onClick={() => revealUnderwear("briefs")}>Remove skirt / pants</button>
          </div>}
        {(category === "corsets" || category === "tops") && sleeveSource &&
          <div className="dressing-layer-options" role="group" aria-label="Sleeve controls" data-controller-row>{sleeveToggle}</div>}
        <div className="dressing-filter" role="group" aria-label="Alpha readiness" data-controller-row>
          <button type="button" className="menu-control" aria-pressed={!alphaOnly} onClick={() => setAlphaOnly(false)}>All items</button>
          <button type="button" className="menu-control" aria-pressed={alphaOnly} onClick={() => setAlphaOnly(true)}>Alpha items</button>
        </div>
        {sections.map(section => {
          const cleared = clearedSection(section);
          return <section className="dressing-section" key={section} aria-label={section}>
            <header className="dressing-section-heading" data-controller-row>
              <h3>{section}</h3>
              <button type="button" className="dressing-section-clear menu-control" data-clear-section
                aria-label={`Clear ${section}`} disabled={cleared === choice} onClick={event => {
                  const firstItem = event.currentTarget.closest("section")?.querySelector<HTMLButtonElement>("[data-wardrobe-item]:not([data-unavailable])");
                  const target = alphaOnly || query ? catalogRef.current?.querySelector("[data-wardrobe-back]") : firstItem;
                  if (target instanceof HTMLElement) target.focus({ preventScroll: true });
                  clearSection(cleared);
                }}>Clear</button>
            </header>
            <div className="dressing-items" data-controller-row data-controller-columns="1">
              {items.filter(item => item.section === section).map(item => <button key={item.id} type="button" data-wardrobe-item={item.id}
                data-inspected={inspected?.id === item.id || undefined} data-unavailable={item.unavailable ? true : undefined}
                data-alpha-status={item.alphaStatus}
                className={`dressing-item menu-control${item.icon === "remove" ? " dressing-item--remove" : ""}`} aria-pressed={item.selected ?? false}
                aria-controls={item.icon === "remove" ? undefined : detailsId} onClick={() => {
                  setInspectedId(item.icon === "remove" ? undefined : item.id);
                  item.choose?.();
                  inspectWardrobe(item.focus ?? categoryFocus[category]);
                }}>
                <span className="dressing-item-art" style={{ "--item-color": item.color ?? "var(--app-muted)", "--item-accent": item.accent ?? item.color ?? "var(--app-accent)" } as CSSProperties}>
                  <WardrobeIcon name={item.icon} />{item.color && <i className="dressing-swatch" />}
                </span>
                <span className="dressing-item-copy">
                  <span className="dressing-item-name">{item.label}</span>
                  {item.alphaStatus && <span className="dressing-alpha-badge" data-alpha-status={item.alphaStatus}>{ALPHA_STATUSES[item.alphaStatus].label}</span>}
                  {item.set && !item.unavailable && (!item.trial || item.selected) && <FitBadge choice={item.trial ? choice : {
                    ...choice, wardrobe: resolveWardrobe({ set: item.set, shirt: "none", waist: waistForSet(item.set) }), garments: undefined, wardrobeTrial: undefined, wardrobeEase: undefined,
                  }} piece="corset" itemId={item.id} />}
                  {item.icon !== "remove" && <small>{item.unavailable ?? (item.selected ? (item.trial ? "Trying on" : "Wearing") : item.detail ?? "Available to try on")}</small>}
                </span>
              </button>)}
            </div>
          </section>;
        })}
        {!items.length && <p className="dressing-empty" role="status">{query ? "No items match your search." : alphaOnly ? "No alpha items in this category yet." : "No separate pieces for this character yet."}</p>}
        </>}
      </section>
    </aside>
    <div className="dressing-camera-block">
      <header className="dressing-room-title">
        <small>Fitting room</small>
        <h2>{character.name}</h2>
      </header>
      <aside className="dressing-camera-shortcuts fitting-camera-toolbar" aria-label="Fitting room camera shortcuts">
        <FittingCameraSelect views={["Full body", "Face", "Hands"] as const} vertical allowReselect
          view={camera} onViewChange={view => {
            if (view === "Full body" || view === "Face" || view === "Hands") selectCameraView(view);
          }} />
        <FittingWearableShortcuts vertical pieces={wearableOrder.filter(item => pieces.includes(item))}
          active={camera === "Selected item" ? selectedPiece : undefined} onSelect={selectWornPiece} />
      </aside>
    </div>
    <aside className="dressing-details" id={detailsId} aria-label="Item details" hidden={!inspected}>
      {inspected && <>
        <header><h2>{inspected.label}</h2></header>
        {inspected.alphaStatus && <p className="dressing-alpha-summary"><span className="dressing-alpha-badge" data-alpha-status={inspected.alphaStatus}>{ALPHA_STATUSES[inspected.alphaStatus].label}</span><span>{ALPHA_STATUSES[inspected.alphaStatus].description}</span></p>}
        {inspected.description && <p className="dressing-item-description">{inspected.description}</p>}
        {underbustOver && !hasUnderbustCut(corset.cut) &&
          <p className="dressing-note" role="status">This vest cut is missing. Pull the wardrobe models with Git LFS and restart AvenLab.</p>}
        <dl><dt>Price</dt><dd>{inspected.unavailable ? "Not listed" : inspected.trial ? "Free try-on" : inspected.included ? "Included" : "0 credits"}</dd>
          <dt>Item ID</dt><dd className="dressing-item-id">{inspected.id}</dd>
          {inspected.layer && <><dt>Layer</dt><dd>{inspected.layer}</dd></>}</dl>
        {inspected.unavailable && <p className="dressing-note">{inspected.unavailable}</p>}
        {inspected.remove && <div className="dressing-layer-options" data-controller-row>
          <button type="button" className="menu-control" data-remove-try-on onClick={() => {
            inspected.remove?.();
            inspectWardrobe(categoryFocus[category]);
            catalogRef.current?.querySelector<HTMLButtonElement>(alphaOnly ? "[data-wardrobe-back]" : "[data-inspected]")?.focus();
          }}>{inspected.focus === "shirt" || inspected.focus === "armor" ? "Remove top" : inspected.focus === "corset" ? "Remove corset" : inspected.focus === "skirt" ? "Remove skirt" : inspected.included ? "Remove piece" : inspected.focus === "dress" || inspected.pieces === "outfit" ? "Remove dress" : "Clear try-on"}</button>
        </div>}
        {(underwearColor === "bra" || underbust) && <div data-controller-row>
          <button type="button" className="menu-control" data-wardrobe-toggle="bra" disabled={!canWearBra}
            onClick={() => onTryOn({ ...choice, bra: !pieces.includes("bra") })}>
            {pieces.includes("bra") ? "Remove bra" : "Put on bra"}
          </button>
        </div>}
        {(underwearColor === "bra" || underbust) && controls("Bra style", ([undefined, "push-up"] as const).map(style =>
          <button key={style ?? "classic"} type="button" className="menu-control" disabled={!canWearBra}
            aria-pressed={pieces.includes("bra") && appearance.bra_style === style} onClick={() => {
              onTryOn({ ...choice, bra: true, appearance: { ...appearance, bra_style: style } });
            }}>{style === "push-up" ? "Push-up" : "Classic"}</button>), 2)}
        {underwearColor === "briefs" && controls("Briefs style", (["briefs", "boxer-briefs"] as const).map(style =>
          <button key={style} type="button" className="menu-control"
            aria-pressed={(appearance.briefs_style ?? "briefs") === style} onClick={() => {
              onTryOn({ ...choice, appearance: { ...appearance, briefs_style: style === "briefs" ? undefined : style } });
            }}>{style === "briefs" ? "V-cut briefs" : "Short boxer briefs"}</button>), 2)}
        {inspectedSleeves && <div data-controller-row>{sleeveToggle}</div>}
        {underwearColor && <ClothingColorToolbar choice={choice} piece={underwearColor} onChange={onColors} />}
        {inspected.pieces === "outfit" && itemPieces.length > 0 && controls("Outfit pieces", itemPieces.map(item => <button key={item} type="button" className="menu-control"
          data-dressing-piece={item} aria-pressed={camera === "Selected item" && selectedPiece === item} onClick={() => selectWornPiece(item)}>
          {clothingPieceLabel(item)}</button>), 2)}
        {waistSelection && inspected.set === waistSelection.set && !inspected.unavailable &&
          controls("Waist layering", WARDROBE_WAIST_OPTIONS.map(({ waist, ease, label }) => <button key={label} type="button" className="menu-control"
            aria-pressed={waistSelection.waist === waist && overEase === ease}
            onClick={() => {
              const next = withWardrobeWaist(choice, waist, ease);
              if (ease) onTryOn(next);
              else onChange(next);
              focusClothingPiece("corset");
            }}>{label}</button>), 2)}
        {underbustOver && (hasUnderbustCut("original") || corset.cut === "original") &&
          controls("Vest cut", ([undefined, "original"] as const).map(cut => <button key={cut ?? "restored"} type="button" className="menu-control"
            aria-pressed={corset.cut === cut} onClick={() => {
              if (corset.cut !== cut) onTryOn({ ...choice, wardrobeTrial: { ...corset, cut } });
            }}>{cut === "original" ? "Original Cut" : "Restored Cut"}</button>), 2)}
        <FitReview key={inspected.id} compact choice={choice} piece={reviewPiece}
          note={underbustOver ? "Changing linked dye groups together still needs testing." : undefined}
          subject={{ id: inspected.id, label: inspected.label, kind: "garment" }} />
      </>}
    </aside>
    <div className="dressing-toolbar">
      {cameraTools}
      {!underwearColor && piece && <ClothingColorToolbar choice={choice} piece={piece} onChange={onColors} />}
    </div>
  </>;
}
