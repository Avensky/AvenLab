import { FitBadge, FitReview } from "./FitReview";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CHARACTER_APPEARANCE_OPTIONS, ROOK_ID, VILLAGER_ID, characterLook, type CharacterChoice, type CharacterStyleField } from "./characterCatalog";
import { focusClothingPiece, useCharacterPreviewStore } from "./characterPreviewStore";
import { UNDERBUST_WARDROBE_SET, WARDROBE_CORSETS, WARDROBE_SETS, WARDROBE_WAIST_OPTIONS, corsetModelUrl, resolveWardrobe, withWardrobeWaist, type WardrobeChoice } from "./wardrobe";
import { ClothingColorToolbar } from "./ClothingColorToolbar";
import { clothingPieceLabel, wornClothing, type ClothingPiece } from "./clothingPieces";
import { importedWardrobeItems, setWardrobeGarment, setWardrobeRemoval, wardrobeGarmentModelUrl, type WardrobeGarmentSlot, type WardrobeRemoval } from "./wardrobeGarments";
import { SavedOutfits } from "./SavedOutfits";
import "./dressingRoom.css";

const CATEGORIES = [
  { id: "outfits", label: "Outfits", group: "Wardrobe", icon: "outfits" },
  { id: "saved", label: "Saved outfits", group: "Wardrobe", icon: "saved" },
  { id: "layers", label: "Layers", group: "Wardrobe", icon: "layers", femaleOnly: true },
  { id: "corsets", label: "Corsets", group: "Wardrobe", icon: "corsets", femaleOnly: true },
  { id: "tops", label: "Tops", group: "Wardrobe", icon: "tops", femaleOnly: true },
  { id: "bottoms", label: "Skirts", group: "Wardrobe", icon: "skirts", femaleOnly: true },
  { id: "footwear", label: "Shoes & socks", group: "Wardrobe", icon: "footwear" },
  { id: "headwear", label: "Headwear", group: "Finishing touches", icon: "headwear" },
  { id: "bows", label: "Bows", group: "Finishing touches", icon: "bows", femaleOnly: true },
  { id: "accessories", label: "Accessories", group: "Finishing touches", icon: "accessories" },
  { id: "props", label: "Handheld props", group: "Finishing touches", icon: "props" },
  { id: "hair", label: "Hair", group: "Character", icon: "hair" },
  { id: "face", label: "Face", group: "Character", icon: "face" },
  { id: "skin", label: "Skin tone", group: "Character", icon: "skin" },
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
  hair: "M5 19V10a7 7 0 0 1 14 0v9l-4 2 M5 19l4 2 M6 10c5 0 7-5 7-5s1 5 5 6 M8 12v3a4 4 0 0 0 8 0v-3",
  face: "M6 9a6 6 0 0 1 12 0v6a6 6 0 0 1-12 0z M8 11h1 M15 11h1 M10 17h4",
  skin: "M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12z M9 15c0 2 1 3 3 3",
};

function WardrobeIcon({ name }: { name: Icon }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

const LAYERS = ["Underwear", "Inner", "Middle", "Outer", "Overwear"] as const;
type ClothingLayer = typeof LAYERS[number];
const GARMENT_LAYERS: Record<WardrobeGarmentSlot, ClothingLayer> = {
  top: "Middle", skirt: "Outer", coat: "Overwear", dress: "Outer", hat: "Overwear", socks: "Inner", bow: "Overwear", harness: "Overwear",
};

type WardrobeFocus = ClothingPiece | "Face" | "Hands" | "Full body";
const REMOVAL_CARDS: { category: Category; slot: WardrobeRemoval; label: string; section: string; focus: WardrobeFocus; layer: ClothingLayer }[] = [
  { category: "corsets", slot: "corset", label: "corset", section: "Gothic corsets", focus: "corset", layer: "Outer" },
  { category: "tops", slot: "top", label: "top", section: "Tops", focus: "shirt", layer: "Middle" },
  { category: "bottoms", slot: "skirt", label: "skirt", section: "Skirts", focus: "skirt", layer: "Outer" },
  { category: "footwear", slot: "socks", label: "socks", section: "Socks", focus: "socks", layer: "Inner" },
  { category: "footwear", slot: "shoes", label: "shoes", section: "Shoes", focus: "shoes", layer: "Overwear" },
  { category: "headwear", slot: "bonnet-bow", label: "bonnet bow", section: "Headwear", focus: "Face", layer: "Overwear" },
  { category: "headwear", slot: "hat", label: "headwear", section: "Headwear", focus: "Face", layer: "Overwear" },
  { category: "bows", slot: "bow", label: "bow", section: "Bows", focus: "bow", layer: "Overwear" },
  { category: "accessories", slot: "harness", label: "harness", section: "Harnesses", focus: "harness", layer: "Overwear" },
];
type Item = {
  id: string; label: string; section: string; icon: Icon; description: string;
  selected?: boolean; detail?: string; unavailable?: "Pack not installed";
  color?: string; accent?: string; focus?: WardrobeFocus; choose?: () => void; remove?: () => void; trial?: boolean;
  pieces?: "outfit" | readonly ClothingPiece[]; included?: boolean; set?: string; layer?: ClothingLayer;
};

const OUTFIT_DESCRIPTIONS: Record<string, string> = {
  dockwear: "Vesper’s village outfit pairs a fitted bodice with a full skirt, petticoat and bonnet.",
  "shop-crew": "Vesper’s workshop colors pair blue fabric with pale trim and a matching bow.",
  "night-run": "Rook’s hill-run outfit pairs a dark coat and trousers with gloves and belt pouches.",
  "race-crew": "Rook’s race-crew outfit uses warm brown fabric and gold trim on his coat and accessories.",
};
const FITTED_PRESETS: Partial<Record<string, { waist: WardrobeChoice["waist"]; description: string }>> = {
  "gothic-02": { waist: "over", description: "A sweetheart-neckline corset with a layered, scalloped skirt." },
  "gothic-03": { waist: "over", description: "A ruffled corset with a matching skirt cut to clear its inner ruffles." },
  "gothic-05": { waist: "tucked", description: "A high-collar corset with a fitted upper back and a matching skirt. It supports tucked and over-skirt fits." },
};
const TRIAL_DESCRIPTIONS: Record<WardrobeGarmentSlot, string> = {
  top: "Replaces the current bodice. Try it with the outfit skirt or a separate skirt.",
  skirt: "Replaces the current skirt. Try it with a bodice or a separate top.",
  coat: "Try this coat over the current look.",
  dress: "Replaces the top and skirt with one piece.",
  hat: "Replaces the village bonnet.",
  socks: "Try these socks with the outfit shoes.",
  bow: "Adds a bow at the neckline.",
  harness: "Try this harness over the current look.",
};

function focusView(camera: "Face" | "Hands" | "Full body") {
  useCharacterPreviewStore.setState(s => ({ camera, zoom: 1, emote: null, focusRevision: s.focusRevision + 1 }));
}

function inspectWardrobe(focus: WardrobeFocus) {
  if (focus === "Face" || focus === "Hands" || focus === "Full body") focusView(focus);
  else focusClothingPiece(focus);
}

/** One live scene; browsing the catalog never changes or saves the equipped look. */
export function DressingRoom({ choice, onChange, onEquip = onChange, onTryOn, onLoad = onTryOn, onEndPreview, cameraTools }: {
  choice: CharacterChoice; onChange: (choice: CharacterChoice) => void;
  onEquip?: (choice: CharacterChoice) => void; onTryOn: (choice: CharacterChoice) => void;
  onLoad?: (choice: CharacterChoice) => void; onEndPreview?: () => void; cameraTools?: ReactNode;
}) {
  const [category, setCategory] = useState<Category>("outfits");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inspectedId, setInspectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [layer, setLayer] = useState<ClothingLayer>("Inner");
  const catalogId = useId(), detailsId = useId();
  const catalogRef = useRef<HTMLElement>(null);
  const categoryRef = useRef<HTMLElement>(null);
  const focusLayer = useRef(false);
  const { character, outfit, appearance, wardrobe, corset, garments, overEase, removedClothing } = characterLook(choice)!;
  const waistSelection = removedClothing.includes("corset") ? undefined : corset ?? wardrobe;
  const selectedPiece = useCharacterPreviewStore(s => s.selectedPiece);
  const camera = useCharacterPreviewStore(s => s.camera);
  const pieces = wornClothing(choice);
  const piece = pieces.includes(selectedPiece) ? selectedPiece : pieces[0];
  const female = choice.id === VILLAGER_ID;
  const categories = CATEGORIES.filter(item => female || !("femaleOnly" in item));
  const currentCategory = CATEGORIES.find(item => item.id === category)!;
  const hasAuthoredMale = choice.id === ROOK_ID && Boolean(__ROOK_MODEL_URL__);
  const upperPiece = female ? "corset" : "coat";
  const categoryFocus: Record<Category, WardrobeFocus> = {
    outfits: upperPiece, saved: "Full body", layers: "Full body", corsets: "corset", tops: "shirt", bottoms: "skirt", bows: "bow",
    footwear: "shoes", headwear: pieces.includes("hat") ? "hat" : "Face", accessories: pieces.includes("glasses") ? "glasses" : "Face",
    props: pieces.includes("bag") ? "bag" : "Hands", hair: "Face", face: "Face", skin: "Face",
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

  function edit(field: CharacterStyleField, value: string) {
    onChange({ ...choice, appearance: { ...appearance, [field]: value } });
  }
  function waistForSet(set: string): WardrobeChoice["waist"] {
    return wardrobe?.set === set && !garments ? wardrobe.waist : FITTED_PRESETS[set]?.waist ?? "tucked";
  }
  function wearSet(set: string) {
    onEquip({ ...choice, wardrobe: resolveWardrobe({ set, shirt: "none", waist: waistForSet(set) }), garments: undefined,
      wardrobeTrial: undefined, wardrobeEase: undefined, removedClothing: undefined });
  }
  function tryCorset(set: string) {
    const compatible = { ...choice.garments };
    delete compatible.dress;
    const current = choice.wardrobeTrial;
    const waist = current?.set === set ? current.waist : FITTED_PRESETS[set]?.waist ?? "over";
    onTryOn({ ...setWardrobeRemoval(choice, "corset", false), wardrobeTrial: { set, shirt: "none", waist },
      wardrobeEase: current?.set === set ? choice.wardrobeEase : undefined,
      garments: Object.keys(compatible).length ? compatible : undefined });
  }
  function options(field: CharacterStyleField, section: string, icon: Icon): Item[] {
    return CHARACTER_APPEARANCE_OPTIONS[field].map(option => ({
      id: `${field}:${option.id}`, label: option.label, section, icon,
      description: field === "glasses" ? (option.id === "none" ? "Remove the current glasses." : `Wear ${option.label.toLowerCase()} frames with the current outfit.`)
        : `Apply ${option.label.toLowerCase()} to the character’s ${section.toLowerCase()}.`,
      selected: appearance[field] === option.id || (!appearance[field] && option.id === (field === "glasses" ? "none" : "original")),
      color: "color" in option ? option.color : undefined,
      focus: field === "glasses" ? (option.id === "none" ? "Face" : "glasses")
        : field === "headwear" ? (option.id === "hat" ? "hat" : "Face") : undefined,
      pieces: field === "glasses" && option.id !== "none" ? ["glasses"] : field === "headwear" && option.id === "hat" ? ["hat"] : undefined,
      choose: () => edit(field, option.id),
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
      choose: installed ? () => wearSet(set.id) : undefined,
    }];
  }) : [];
  const allItems: Record<Category, Item[]> = {
    outfits: [
      ...character.outfits.map(item => ({ id: item.id, label: item.name, section: "Complete outfits", icon: "outfits" as const,
        description: OUTFIT_DESCRIPTIONS[item.id] ?? "A complete outfit for this character.", pieces: "outfit" as const,
        selected: !wardrobe && !corset && !garments && !removedClothing.length && outfit.id === item.id, color: item.jacket, accent: item.trim,
        choose: () => onEquip({ ...choice, outfit: item.id, wardrobe: undefined, garments: undefined, wardrobeTrial: undefined,
          wardrobeEase: undefined, removedClothing: undefined }) })),
      ...fittedSets,
    ],
    saved: [], layers: [],
    corsets: female ? WARDROBE_CORSETS.map((set): Item => {
      const installed = Boolean(corsetModelUrl({ set: set.id, shirt: "none", waist: "over" }, "garage"));
      const selected = corset?.set === set.id;
      const underbust = set.id === UNDERBUST_WARDROBE_SET;
      return {
        id: set.id, set: set.id, label: set.name, section: "Gothic corsets", icon: "corsets",
        trial: true, selected, detail: "Try-on", focus: "corset", pieces: selected && garments?.top ? ["corset", "shirt"] : ["corset"], layer: "Outer",
        unavailable: installed ? undefined : "Pack not installed",
        description: underbust
          ? "An open Underbust Vest. Try it on by itself or layer it over a fitted piece from Tops."
          : "Try this corset with your current skirt or choose another skirt from the wardrobe.",
        choose: installed ? () => tryCorset(set.id) : undefined,
        remove: selected ? () => onTryOn({ ...choice, wardrobeTrial: undefined, wardrobeEase: undefined }) : undefined,
      };
    }) : [],
    tops: [],
    bottoms: [],
    footwear: [{ id: "outfit-shoes", label: female ? "Village shoes" : "Outfit boots", section: "Shoes", icon: "footwear", selected: !removedClothing.includes("shoes"),
      description: "The footwear bundled with the equipped outfit.", pieces: ["shoes"], included: true, layer: "Overwear", focus: "shoes",
      choose: removedClothing.includes("shoes") ? () => onTryOn(setWardrobeRemoval(choice, "shoes", false)) : undefined }],
    headwear: female ? [{ id: "bonnet", label: "Village bonnet", section: "Headwear", icon: "headwear", selected: !garments?.hat && !removedClothing.includes("hat"),
      description: "Vesper’s bonnet pairs with her village and Gothic outfits.", pieces: ["hat"], included: true, layer: "Overwear", focus: "hat",
      choose: garments?.hat || removedClothing.includes("hat") ? () => onTryOn(setWardrobeGarment(setWardrobeRemoval(choice, "hat", false), "hat")) : undefined }]
      : hasAuthoredMale ? [] : options("headwear", "Headwear", "headwear"),
    bows: [],
    accessories: options("glasses", "Glasses", "face"),
    props: [
      { id: "empty-hands", label: "Empty hands", section: "Handheld props", icon: "props", focus: "Hands", description: "Remove the current handheld prop.", selected: !choice.prop, choose: () => onChange({ ...choice, prop: undefined }) },
      { id: "shop-bag", label: "Shop bag", section: "Handheld props", icon: "props", focus: "bag", description: "Carry a shop bag to use the bag emotes.", pieces: ["bag"], selected: choice.prop === "shop-bag", detail: "Unlocks bag emotes", choose: () => onChange({ ...choice, prop: "shop-bag" }) },
    ],
    hair: [...(hasAuthoredMale ? [] : options("hair", "Hairstyle", "hair")), ...options("hair_color", "Hair color", "hair")],
    face: [...options("eye_color", "Eye color", "face"), ...options("brow_color", "Eyebrow tint", "face")],
    skin: options("skin", "Skin tone", "skin"),
  };
  if (female) for (const item of importedWardrobeItems) {
    const category = CATEGORIES.find(category => category.id === item.category);
    if (!category) continue;
    const modelUrl = wardrobeGarmentModelUrl(item, "garage");
    const revised = modelUrl !== undefined && modelUrl === item.revisionUrl;
    const selected = garments?.[item.slot] === item.id;
    allItems[category.id].push({
      id: item.id, label: item.label, section: item.section, icon: category.icon,
      trial: true, selected, detail: revised ? "Revised model" : "Try-on", focus: item.piece, pieces: [item.piece], layer: GARMENT_LAYERS[item.slot],
      unavailable: modelUrl ? undefined : "Pack not installed",
      description: revised ? `${TRIAL_DESCRIPTIONS[item.slot]} Uses the revised mesh.` : TRIAL_DESCRIPTIONS[item.slot],
      choose: modelUrl ? () => onTryOn(setWardrobeGarment(choice, item.slot, item.id)) : undefined,
      remove: selected ? () => onTryOn(setWardrobeGarment(choice, item.slot)) : undefined,
    });
  }
  if (female) for (const { category, slot, label, section, focus, layer } of REMOVAL_CARDS) {
    if (slot === "bonnet-bow" && choice.garments?.hat) continue;
    const name = slot === "hat" && !choice.garments?.hat ? "bonnet" : label;
    const selected = removedClothing.includes(slot);
    allItems[category].unshift({
      id: `remove-${slot}`, label: selected ? `Restore ${name}` : `Remove ${name}`, section, focus, layer,
      icon: "remove", selected, description: "",
      choose: () => onTryOn(setWardrobeRemoval(choice, slot, !selected)),
    });
  }
  allItems.layers = Object.values(allItems).flat().filter(item => item.layer);
  const query = search.trim().toLocaleLowerCase();
  const items = allItems[category].filter(item => (category !== "layers" || item.layer === layer)
    && (!readyOnly || (!item.unavailable && !item.trial) || item.selected)
    && (!query || `${item.label} ${item.section}`.toLocaleLowerCase().includes(query)));
  const sections = [...new Set(items.map(item => item.section))];
  const inspected = catalogOpen ? allItems[category].find(item => item.id === inspectedId) : undefined;
  const itemPieces = inspected?.unavailable ? [] : inspected?.pieces === "outfit"
    ? pieces.filter(item => item !== "glasses" && item !== "bag") : inspected?.pieces?.filter(item => pieces.includes(item)) ?? [];

  function openCategory(next: Category) {
    focusLayer.current = true;
    setCategory(next);
    setCatalogOpen(true);
    setInspectedId(undefined);
    setSearch("");
    inspectWardrobe(categoryFocus[next]);
  }
  function closeCatalog() {
    focusLayer.current = true;
    setCatalogOpen(false);
    setInspectedId(undefined);
  }

  function controls(title: string, children: ReactNode, columns?: number) {
    return <section className="dressing-layer-group" aria-label={title}><h3>{title}</h3><div className="dressing-layer-options" data-controller-row data-controller-columns={columns}>{children}</div></section>;
  }

  return <>
    <header className="dressing-room-title">
      <small>Fitting room</small>
      <h2>{character.name}</h2>
    </header>
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
        <header className="dressing-catalog-heading" data-controller-row>
          <button type="button" className="menu-control" data-wardrobe-back aria-label="Back to wardrobe categories" title="Back to wardrobe categories" onClick={closeCatalog}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m0 0 6-6m-6 6 6 6" /></svg>
          </button>
          <h3>{currentCategory.label}</h3>
        </header>
        {category === "saved" ? <SavedOutfits choice={choice} onTryOn={onLoad} onEndPreview={onEndPreview} /> : <>
        {category === "layers" && <div className="dressing-layer-options" role="group" aria-label="Clothing layers" data-controller-row data-controller-columns="2">
          {LAYERS.map(option => <button key={option} type="button" className="menu-control" aria-pressed={layer === option}
            onClick={() => { setLayer(option); setInspectedId(undefined); }}>{option}</button>)}
        </div>}
        <div className="dressing-search" data-controller-row><input type="search" aria-label={`Search ${currentCategory.label}`} placeholder="Find an item…" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <div className="dressing-filter" role="group" aria-label="Item availability" data-controller-row>
          <button type="button" className="menu-control" aria-pressed={!readyOnly} onClick={() => setReadyOnly(false)}>All items</button>
          <button type="button" className="menu-control" aria-pressed={readyOnly} onClick={() => setReadyOnly(true)}>Ready to wear</button>
        </div>
        {sections.map(section => <section className="dressing-section" key={section} aria-label={section}>
          <h3>{section}</h3>
          <div className="dressing-items" data-controller-row data-controller-columns="1">
            {items.filter(item => item.section === section).map(item => <button key={item.id} type="button" data-wardrobe-item={item.id}
              data-inspected={inspected?.id === item.id || undefined} data-unavailable={item.unavailable ? true : undefined}
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
                {item.set && !item.unavailable && (!item.trial || item.selected) && <FitBadge choice={item.trial ? choice : {
                  ...choice, wardrobe: resolveWardrobe({ set: item.set, shirt: "none", waist: waistForSet(item.set) }), garments: undefined, wardrobeTrial: undefined, wardrobeEase: undefined,
                }} piece="corset" />}
                {item.icon !== "remove" && <small>{item.unavailable ?? (item.selected ? (item.trial ? "Trying on" : "Wearing") : item.detail ?? "Ready to wear")}</small>}
              </span>
            </button>)}
          </div>
        </section>)}
        {!items.length && <p className="dressing-empty" role="status">{query ? "No items match your search." : category === "layers" && layer === "Underwear" ? "No standalone underwear is available." : readyOnly ? "No separate pieces are ready in this category yet." : "No separate pieces for this character yet."}</p>}
        </>}
      </section>
    </aside>
    <aside className="dressing-details" id={detailsId} aria-label="Item details" hidden={!inspected}>
      {inspected && <>
        <header><small>{currentCategory.label}</small><h2>{inspected.label}</h2></header>
        <p>{inspected.description}</p>
        <dl><dt>Price</dt><dd>{inspected.unavailable ? "Not listed" : inspected.trial ? "Free try-on" : inspected.included ? "Included" : "0 credits"}</dd>
          {inspected.layer && <><dt>Layer</dt><dd>{inspected.layer}</dd></>}</dl>
        {inspected.unavailable && <p className="dressing-note">{inspected.unavailable}</p>}
        {inspected.remove && <div className="dressing-layer-options" data-controller-row>
          <button type="button" className="menu-control" data-remove-try-on onClick={() => {
            inspected.remove?.();
            inspectWardrobe(categoryFocus[category]);
            catalogRef.current?.querySelector<HTMLButtonElement>(readyOnly ? "[data-wardrobe-back]" : "[data-inspected]")?.focus();
          }}>Clear try-on</button>
        </div>}
        {itemPieces.length > 0 && controls(itemPieces.length > 1 ? "Outfit pieces" : "Piece", itemPieces.map(item => <button key={item} type="button" className="menu-control"
          data-dressing-piece={item} aria-pressed={camera === "Selected item" && piece === item} onClick={() => focusClothingPiece(item)}>
          {clothingPieceLabel(item)}</button>), 2)}
        {waistSelection && inspected.set === waistSelection.set && !inspected.unavailable &&
          controls("Waist layering", WARDROBE_WAIST_OPTIONS.map(({ waist, ease, label }) => <button key={label} type="button" className="menu-control"
            aria-pressed={waistSelection.waist === waist && overEase === ease}
            onClick={() => {
              const next = withWardrobeWaist(choice, waist, ease);
              if (ease) onTryOn(next);
              else onChange(next);
              focusClothingPiece("skirt");
            }}>{label}</button>), 2)}
        {itemPieces.length > 0 && <FitReview choice={choice} piece={itemPieces.includes(piece) ? piece : itemPieces[0]} />}
      </>}
    </aside>
    <div className="dressing-toolbar">
      {cameraTools}
      {piece && <ClothingColorToolbar choice={choice} piece={piece} onChange={onChange} />}
    </div>
  </>;
}
