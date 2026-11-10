import catalog from "../../../../avenlab-server/src/assets/characters.json";
import appearanceOptions from "../../../../avenlab-server/src/assets/character-appearance.json";

export const CHARACTERS = catalog.filter(item => item.id !== "niko-park");
export const CHARACTER_APPEARANCE_OPTIONS = appearanceOptions;
export type CharacterStyleField = keyof typeof appearanceOptions;
type FaceField = "eye_color" | "brow_color" | "glasses";
export type CharacterAppearance = Record<Exclude<CharacterStyleField, FaceField>, string>
  & Partial<Record<FaceField, string>> & { accent?: string };

export const OUTFIT_THEMES = [
  { name: "Gothic Pink", color: "#101015", accent: "#ff2d95" },
  { name: "Midnight Circuit", color: "#171d36", accent: "#56e9ff" },
  { name: "Harbor Crew", color: "#263a35", accent: "#efaf6a" },
] as const;
export type CharacterChoice = { id: string; outfit: string; appearance?: CharacterAppearance; prop?: "shop-bag" };

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
  return {
    character, outfit, appearance, female,
    fabric: /^#[\da-f]{6}$/i.test(appearance.color) ? appearance.color : color("color") ?? outfit.jacket,
    trim: appearance.accent ?? outfit.trim,
    hair: color("hair_color") ?? (female ? "#7c573c" : "#2b2127"),
    skin: color("skin") ?? (female ? "#d49673" : "#95553d"),
    iris: color("eye_color") ?? (female ? "#8a7347" : "#68422b"),
    brow: color("brow_color"),
  };
}

export type CharacterLook = NonNullable<ReturnType<typeof characterLook>>;
