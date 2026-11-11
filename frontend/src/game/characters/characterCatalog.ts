import type { PieceColors } from "./clothingPieces";
import type { AnimationFit, CharacterPersonality } from "./characterPersonality";
import catalog from "../../../../avenlab-server/src/assets/characters.json";
import appearanceOptions from "../../../../avenlab-server/src/assets/character-appearance.json";
import { resolveWardrobe, wardrobeOverEase, type WardrobeChoice } from "./wardrobe";
import type { OverSkirtEase } from "./overSkirtEase";
import { removedWardrobeLayers, visibleWardrobeGarments, type WardrobeGarmentChoice, type WardrobeRemoval } from "./wardrobeGarments";

export const CHARACTERS = catalog.filter(item => item.id !== "niko-park");
export const CHARACTER_APPEARANCE_OPTIONS = appearanceOptions;
export type CharacterStyleField = keyof typeof appearanceOptions;
type FaceField = "eye_color" | "brow_color" | "glasses";
export type CharacterAppearance = Record<Exclude<CharacterStyleField, FaceField>, string>
  & Partial<Record<FaceField, string>> & { accent?: string; item_colors?: Record<string, PieceColors>; personality?: CharacterPersonality; animation_fit?: AnimationFit };

export const OUTFIT_THEMES = [
  { name: "Gothic Pink", color: "#101015", accent: "#ff2d95" },
  { name: "Pink", color: "#ef88b6", accent: "#7d315a" },
  { name: "Pastels", color: "#c7b8ec", accent: "#b5dece" },
  { name: "Vibrant", color: "#6f38df", accent: "#ff9434" },
  { name: "White", color: "#ffffff", accent: "#ffffff" },
  { name: "Yellow", color: "#edbf44", accent: "#fff1ad" },
  { name: "Blue", color: "#2566b3", accent: "#9ed6f1" },
  { name: "Red", color: "#b62235", accent: "#f0736f" },
  { name: "Red + Black", color: "#b62235", accent: "#101015" },
  { name: "Black + Red", color: "#101015", accent: "#b62235" },
  { name: "Ivory + Gold", color: "#f4e6cc", accent: "#b88636" },
  { name: "Navy + Silver", color: "#26395e", accent: "#bcc9d6" },
  { name: "Midnight Circuit", color: "#171d36", accent: "#56e9ff" },
  { name: "Harbor Crew", color: "#263a35", accent: "#efaf6a" },
  { name: "Black Cherry", color: "#2d1d28", accent: "#a84a70" },
  { name: "Night Harbor", color: "#1c2c39", accent: "#56868c" },
] as const;
export const CHARACTER_IDENTITIES = [
  { id: "male", label: "Male" }, { id: "female", label: "Female" }, { id: "nonbinary", label: "Nonbinary" },
] as const;
export type CharacterIdentity = typeof CHARACTER_IDENTITIES[number]["id"];
export type CharacterChoice = {
  id: string; outfit: string; identity?: CharacterIdentity; appearance?: CharacterAppearance; prop?: "shop-bag"; wardrobe?: WardrobeChoice;
  /** Session-only fitting room selections. */
  garments?: WardrobeGarmentChoice;
  wardrobeTrial?: WardrobeChoice;
  wardrobeEase?: Exclude<OverSkirtEase, 0>;
  removedClothing?: WardrobeRemoval[];
};

export const VILLAGER_ID = "mara-vega";
export const ROOK_ID = "jules-okafor";
export const DEFAULT_CHARACTER: CharacterChoice = { id: VILLAGER_ID, outfit: CHARACTERS[0].outfits[0].id };

const DEFAULT_APPEARANCE: CharacterAppearance = {
  hair: "natural", hair_color: "original", skin: "original", headwear: "none", color: "original",
};

export function characterAppearance(choice: CharacterChoice | null | undefined): CharacterAppearance {
  const appearance = choice?.appearance ?? DEFAULT_APPEARANCE;
  return choice?.id === VILLAGER_ID && appearance.headwear !== "hat"
    ? { ...appearance, headwear: "hat" } : appearance;
}

export function characterLook(choice: CharacterChoice | null | undefined) {
  const character = catalog.find(item => item.id === choice?.id);
  const outfit = character?.outfits.find(item => item.id === choice?.outfit);
  if (!character || !outfit) return null;
  const appearance = characterAppearance(choice);
  const color = (field: "color" | "hair_color" | "skin" | "eye_color" | "brow_color") => {
    const option = appearanceOptions[field].find(option => option.id === appearance[field] && option.id !== "original");
    return option && "color" in option ? option.color : undefined;
  };
  const female = character.id !== ROOK_ID;
  const removedClothing = removedWardrobeLayers(choice);
  const showCorset = character.id === VILLAGER_ID && !removedClothing.includes("corset");
  return {
    character, outfit, appearance, female, removedClothing,
    wardrobe: character.id === VILLAGER_ID ? resolveWardrobe(choice?.wardrobe) : undefined,
    corset: showCorset ? resolveWardrobe(choice?.wardrobeTrial, { includeRetired: true }) : undefined,
    overEase: showCorset ? wardrobeOverEase(choice) : 0 as const,
    garments: character.id === VILLAGER_ID ? visibleWardrobeGarments(choice) : undefined,
    fabric: /^#[\da-f]{6}$/i.test(appearance.color) ? appearance.color : color("color") ?? outfit.jacket,
    trim: appearance.accent ?? outfit.trim,
    hair: color("hair_color") ?? (female ? "#7c573c" : "#2b2127"),
    skin: color("skin") ?? (female ? "#d49673" : "#95553d"),
    iris: color("eye_color") ?? (female ? "#8a7347" : "#68422b"),
    brow: color("brow_color"),
  };
}

export type CharacterLook = NonNullable<ReturnType<typeof characterLook>>;
