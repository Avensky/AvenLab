import { FitBadge, FitReview } from "./FitReview";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CHARACTER_APPEARANCE_OPTIONS, ROOK_ID, VILLAGER_ID, characterLook, type CharacterChoice, type CharacterStyleField } from "./characterCatalog";
import { focusClothingPiece, useCharacterPreviewStore } from "./characterPreviewStore";
import { WARDROBE_SETS, resolveWardrobe, type WardrobeChoice } from "./wardrobe";
import { ClothingColorToolbar } from "./ClothingColorToolbar";
import { clothingPieceLabel, wornClothing, type ClothingPiece } from "./clothingPieces";
import importedItems from "./dressingRoomImports.json";
import "./dressingRoom.css";

const CATEGORIES = [
  { id: "outfits", label: "Outfits", group: "Wardrobe", icon: "outfits" },
  { id: "tops", label: "Tops & corsets", group: "Wardrobe", icon: "tops" },
  { id: "bottoms", label: "Skirts & pants", group: "Wardrobe", icon: "bottoms" },
  { id: "dresses", label: "Dresses", group: "Wardrobe", icon: "dresses" },
  { id: "outerwear", label: "Outerwear", group: "Wardrobe", icon: "outerwear" },
  { id: "footwear", label: "Shoes & socks", group: "Wardrobe", icon: "footwear" },
  { id: "headwear", label: "Headwear", group: "Finishing touches", icon: "headwear" },
  { id: "accessories", label: "Accessories", group: "Finishing touches", icon: "accessories" },
  { id: "props", label: "Handheld props", group: "Finishing touches", icon: "props" },
  { id: "hair", label: "Hair", group: "Character", icon: "hair" },
  { id: "face", label: "Face", group: "Character", icon: "face" },
  { id: "skin", label: "Skin tone", group: "Character", icon: "skin" },
] as const;
type Category = typeof CATEGORIES[number]["id"];
type Icon = typeof CATEGORIES[number]["icon"];
const ICON_PATHS: Record<Icon, string> = {
  outfits: "M9 4h6l2 5-3 2 3 9H7l3-9-3-2z M9 4l3 3 3-3 M9 14h6",
  tops: "M8 4 3 7l2 5 3-1v9h8v-9l3 1 2-5-5-3c0 4-8 4-8 0z",
  bottoms: "M8 4h8l4 16H4z M7 8h10 M10 9l-1 11 M14 9l1 11",
  dresses: "M9 3h6l1 6-2 3 6 9H4l6-9-2-3z M9 3l3 4 3-4 M10 12h4",
  outerwear: "M8 3h8l5 6-3 3-2-2v11H8V10l-2 2-3-3z M8 3l4 6 4-6 M12 9v12",
  footwear: "M5 4h7v8l7 3 2 3v3H3v-9h2z M3 18h18 M12 12l-2 3",
  headwear: "M6 14v-3a6 6 0 0 1 12 0v3 M3 16c4-3 14-3 18 0l-3 3H6z",
  accessories: "M12 10 4 6v12l8-4 8 4V6z M10 10h4v4h-4z",
  props: "M5 8h14l1 13H4z M8 8V6a4 4 0 0 1 8 0v2",
  hair: "M5 19V10a7 7 0 0 1 14 0v9l-4 2 M5 19l4 2 M6 10c5 0 7-5 7-5s1 5 5 6 M8 12v3a4 4 0 0 0 8 0v-3",
  face: "M6 9a6 6 0 0 1 12 0v6a6 6 0 0 1-12 0z M8 11h1 M15 11h1 M10 17h4",
  skin: "M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12z M9 15c0 2 1 3 3 3",
};

function WardrobeIcon({ name }: { name: Icon }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

type WardrobeFocus = ClothingPiece | "Face" | "Hands";
type Item = {
  id: string; label: string; section: string; icon: Icon; description: string;
  selected?: boolean; detail?: string; unavailable?: "Pack not installed" | "Fitting pending";
  color?: string; accent?: string; focus?: WardrobeFocus; choose?: () => void;
  pieces?: "outfit" | readonly ClothingPiece[]; included?: boolean; set?: string;
};

const OUTFIT_DESCRIPTIONS: Record<string, string> = {
  dockwear: "Vesper’s village outfit pairs a fitted bodice with a full skirt, petticoat and bonnet.",
  "shop-crew": "Vesper’s workshop colors pair blue fabric with pale trim and a matching bow.",
  "night-run": "Rook’s hill-run outfit pairs a dark coat and trousers with gloves and belt pouches.",
  "race-crew": "Rook’s race-crew outfit uses warm brown fabric and gold trim on his coat and accessories.",
};
const GOTHIC_DESCRIPTIONS: Record<string, string> = {
  "gothic-01": "A lace-up bodice with a matching skirt and modesty shorts. Add a shirt or wear the bodice on its own.",
  "gothic-02": "A sweetheart-neckline corset with a matching skirt and modesty shorts.",
  "gothic-03": "A ruffled corset with a matching skirt and modesty shorts. The shirt layer is optional.",
  "gothic-04": "An open underbust vest with a matching skirt and modesty shorts. This set requires a shirt layer.",
  "gothic-05": "A high-collar corset with a matching skirt and modesty shorts. It supports tucked and over-skirt fits.",
};

function focusView(camera: "Face" | "Hands" | "Full body") {
  useCharacterPreviewStore.setState(s => ({ camera, zoom: 1, emote: null, focusRevision: s.focusRevision + 1 }));
}

function inspectWardrobe(focus: WardrobeFocus) {
  if (focus === "Face" || focus === "Hands") focusView(focus);
  else focusClothingPiece(focus);
}

/** One live scene; browsing the catalog never changes or saves the equipped look. */
export function DressingRoom({ choice, onChange, modelControls, cameraTools }: {
  choice: CharacterChoice; onChange: (choice: CharacterChoice) => void; modelControls?: ReactNode; cameraTools?: ReactNode;
}) {
  const [category, setCategory] = useState<Category>("outfits");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inspectedId, setInspectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const catalogId = useId(), detailsId = useId();
  const catalogRef = useRef<HTMLElement>(null);
  const categoryRef = useRef<HTMLElement>(null);
  const focusLayer = useRef(false);
  const { character, outfit, appearance, wardrobe } = characterLook(choice)!;
  const selectedPiece = useCharacterPreviewStore(s => s.selectedPiece);
  const camera = useCharacterPreviewStore(s => s.camera);
  const pieces = wornClothing(choice);
  const piece = pieces.includes(selectedPiece) ? selectedPiece : pieces[0];
  const female = choice.id === VILLAGER_ID;
  const selectedSet = WARDROBE_SETS.find(item => item.id === wardrobe?.set);
  const currentCategory = CATEGORIES.find(item => item.id === category)!;
  const hasAuthoredMale = choice.id === ROOK_ID && Boolean(__ROOK_MODEL_URL__);
  const upperPiece = female ? "corset" : "coat";
  const categoryFocus: Record<Category, WardrobeFocus> = {
    outfits: upperPiece, tops: upperPiece, bottoms: female ? "skirt" : "pants", dresses: upperPiece, outerwear: upperPiece,
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
  function wearSet(set: string, change: Partial<WardrobeChoice> = {}) {
    onChange({ ...choice, wardrobe: resolveWardrobe({ set, shirt: wardrobe?.shirt ?? "none", waist: wardrobe?.waist ?? "tucked", ...change }) });
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
  const sets = (section: string, icon: Icon): Item[] => female ? WARDROBE_SETS.map(set => {
    const installed = __WARDROBE_SET_IDS__.includes(set.id);
    return {
      id: set.id, label: set.name, section, icon, selected: wardrobe?.set === set.id, set: set.id,
      description: GOTHIC_DESCRIPTIONS[set.id] ?? "A matching corset and skirt with modesty shorts.", pieces: "outfit",
      detail: "Matched corset + skirt", unavailable: installed ? undefined : "Pack not installed",
      choose: installed ? () => wearSet(set.id) : undefined,
    };
  }) : [];
  const allItems: Record<Category, Item[]> = {
    outfits: [
      ...character.outfits.map(item => ({ id: item.id, label: item.name, section: "Complete outfits", icon: "outfits" as const,
        description: OUTFIT_DESCRIPTIONS[item.id] ?? "A complete outfit for this character.", pieces: "outfit" as const,
        selected: !wardrobe && outfit.id === item.id, color: item.jacket, accent: item.trim,
        choose: () => onChange({ ...choice, outfit: item.id, wardrobe: undefined }) })),
      ...sets("Gothic collection", "outfits"),
    ],
    tops: sets("Corsets · matched sets", "tops"),
    bottoms: sets("Gothic skirts · matched sets", "bottoms"),
    dresses: [], outerwear: [],
    footwear: [{ id: "outfit-shoes", label: female ? "Village shoes" : "Outfit boots", section: "Shoes", icon: "footwear", selected: true,
      description: "The footwear bundled with the equipped outfit.", pieces: ["shoes"], included: true }],
    headwear: female ? [{ id: "bonnet", label: "Village bonnet", section: "Headwear", icon: "headwear", selected: true,
      description: "Vesper’s bonnet pairs with her village and Gothic outfits.", pieces: ["hat"], included: true }]
      : hasAuthoredMale ? [] : options("headwear", "Headwear", "headwear"),
    accessories: options("glasses", "Glasses", "face"),
    props: [
      { id: "empty-hands", label: "Empty hands", section: "Handheld props", icon: "props", focus: "Hands", description: "Remove the current handheld prop.", selected: !choice.prop, choose: () => onChange({ ...choice, prop: undefined }) },
      { id: "shop-bag", label: "Shop bag", section: "Handheld props", icon: "props", focus: "bag", description: "Carry a shop bag to use the bag emotes.", pieces: ["bag"], selected: choice.prop === "shop-bag", detail: "Unlocks bag emotes", choose: () => onChange({ ...choice, prop: "shop-bag" }) },
    ],
    hair: [...(hasAuthoredMale ? [] : options("hair", "Hairstyle", "hair")), ...options("hair_color", "Hair color", "hair")],
    face: [...options("eye_color", "Eye color", "face"), ...options("brow_color", "Eyebrow tint", "face")],
    skin: options("skin", "Skin tone", "skin"),
  };
  if (female) for (const item of importedItems) {
    if (!__DRESSING_ROOM_IMPORTED_IDS__.includes(item.id)) continue;
    const target = item.category as Category;
    allItems[target].push({ id: item.id, label: item.label, section: item.section, icon: CATEGORIES.find(c => c.id === target)!.icon,
      unavailable: "Fitting pending", description: "This imported piece still needs fitting before it can be worn." });
  }
  const query = search.trim().toLocaleLowerCase();
  const items = allItems[category].filter(item => (!readyOnly || !item.unavailable || item.selected)
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
      {modelControls}
      <nav ref={categoryRef} className="dressing-categories" aria-label="Dressing room categories" hidden={catalogOpen}>
        {CATEGORIES.map((item, index) => <div key={item.id}>
          {index > 0 && item.group !== CATEGORIES[index - 1].group && <h3 className="dressing-group-label">{item.group}</h3>}
          <div data-controller-row><button type="button" className="dressing-category menu-control" data-category={item.id}
            aria-controls={catalogId} aria-expanded={catalogOpen && category === item.id} onClick={() => openCategory(item.id)}>
            <WardrobeIcon name={item.icon} /><span>{item.label}</span><small>{allItems[item.id].length}</small>
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
        <div className="dressing-search" data-controller-row><input type="search" aria-label={`Search ${currentCategory.label}`} placeholder="Find an item…" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <div className="dressing-filter" role="group" aria-label="Item availability" data-controller-row>
          <button type="button" className="menu-control" aria-pressed={!readyOnly} onClick={() => setReadyOnly(false)}>All items</button>
          <button type="button" className="menu-control" aria-pressed={readyOnly} onClick={() => setReadyOnly(true)}>Ready to wear</button>
        </div>
        {sections.map(section => <section className="dressing-section" key={section} aria-label={section}>
          <h3>{section}</h3>
          <div className="dressing-items" data-controller-row data-controller-columns="2">
            {items.filter(item => item.section === section).map(item => <button key={item.id} type="button" data-wardrobe-item={item.id}
              data-inspected={inspected?.id === item.id || undefined} data-unavailable={item.unavailable ? true : undefined}
              className="dressing-item menu-control" aria-pressed={item.selected ?? false} aria-controls={detailsId} onClick={() => {
                setInspectedId(item.id);
                item.choose?.();
                inspectWardrobe(item.focus ?? categoryFocus[category]);
              }}>
              <span className="dressing-item-art" style={{ "--item-color": item.color ?? "var(--app-muted)", "--item-accent": item.accent ?? item.color ?? "var(--app-accent)" } as CSSProperties}>
                <WardrobeIcon name={item.icon} />{item.color && <i className="dressing-swatch" />}
              </span>
              <span className="dressing-item-name">{item.label}</span>
              {item.set && !item.unavailable && <FitBadge choice={{ ...choice, wardrobe: resolveWardrobe({ set: item.set, shirt: wardrobe?.shirt ?? "none", waist: wardrobe?.waist ?? "tucked" }) }} piece={category === "bottoms" ? "skirt" : "corset"} />}
              <small>{item.unavailable ?? (item.selected ? "Wearing" : item.detail ?? "Ready to wear")}</small>
            </button>)}
          </div>
        </section>)}
        {!items.length && <p className="dressing-empty" role="status">{query ? "No items match your search." : readyOnly ? "No separate pieces are ready in this category yet." : "No separate pieces for this character yet."}</p>}
      </section>
    </aside>
    <aside className="dressing-details" id={detailsId} aria-label="Item details" hidden={!inspected}>
      {inspected && <>
        <header><small>{currentCategory.label}</small><h2>{inspected.label}</h2></header>
        <p>{inspected.description}</p>
        <dl><dt>Price</dt><dd>{inspected.unavailable ? "Not listed" : inspected.included ? "Included" : "0 credits"}</dd></dl>
        {inspected.unavailable && <p className="dressing-note">{inspected.unavailable}</p>}
        {itemPieces.length > 0 && controls(itemPieces.length > 1 ? "Outfit pieces" : "Piece", itemPieces.map(item => <button key={item} type="button" className="menu-control"
          data-dressing-piece={item} aria-pressed={camera === "Selected item" && piece === item} onClick={() => focusClothingPiece(item)}>{clothingPieceLabel(item)}</button>), 2)}
        {wardrobe && inspected.set === wardrobe.set && !inspected.unavailable && <>
          {controls("Shirt layer", (["none", "under", "over"] as const).map(shirt => <button key={shirt} type="button" className="menu-control"
            aria-pressed={wardrobe.shirt === shirt} disabled={shirt === "none" && selectedSet?.requiresShirt}
            onClick={() => { wearSet(wardrobe.set, { shirt }); focusClothingPiece(shirt === "none" ? "corset" : "shirt"); }}>{shirt === "none" ? "Corset only" : shirt === "under" ? "Under corset" : "Over corset"}</button>))}
          {controls("Waist layering", (["tucked", "over"] as const).map(waist => <button key={waist} type="button" className="menu-control" aria-pressed={wardrobe.waist === waist}
            onClick={() => { wearSet(wardrobe.set, { waist }); focusClothingPiece("skirt"); }}>{waist === "tucked" ? "Tucked into skirt" : "Over skirt"}</button>))}
        </>}
        {itemPieces.length > 0 && <FitReview choice={choice} piece={itemPieces.includes(piece) ? piece : itemPieces[0]} />}
      </>}
    </aside>
    <div className="dressing-toolbar">
      {cameraTools}
      <ClothingColorToolbar choice={choice} piece={piece} onChange={onChange} />
    </div>
  </>;
}
