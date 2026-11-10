import catalog from "../../../../avenlab-server/src/assets/characters.json";
import appearanceOptions from "../../../../avenlab-server/src/assets/character-appearance.json";

export const CHARACTERS = catalog.filter(item => item.id !== "niko-park");
export const CHARACTER_APPEARANCE_OPTIONS = appearanceOptions;
export type CharacterAppearance = { [Field in keyof typeof appearanceOptions]: string };
export type CharacterChoice = { id: string; outfit: string; appearance?: CharacterAppearance };

export const VILLAGER_ID = "mara-vega";
export const DEFAULT_CHARACTER: CharacterChoice = { id: VILLAGER_ID, outfit: CHARACTERS[0].outfits[0].id };

const DEFAULT_APPEARANCE: CharacterAppearance = {
  hair: "natural", hair_color: "original", skin: "original", headwear: "none", color: "original",
};

export function characterAppearance(choice: CharacterChoice | null | undefined): CharacterAppearance {
  const appearance = choice?.appearance ?? DEFAULT_APPEARANCE;
  return choice?.id === VILLAGER_ID && appearance.headwear !== "hat"
    ? { ...appearance, headwear: "hat" } : appearance;
}

export function sameCharacterChoice(first: CharacterChoice | null | undefined, second: CharacterChoice) {
  if (first?.id !== second.id || first.outfit !== second.outfit) return false;
  const a = characterAppearance(first), b = characterAppearance(second);
  return (Object.keys(a) as (keyof CharacterAppearance)[]).every(key => a[key] === b[key]);
}

export function characterLook(choice: CharacterChoice | null | undefined) {
  const character = catalog.find(item => item.id === choice?.id);
  const outfit = character?.outfits.find(item => item.id === choice?.outfit);
  if (!character || !outfit) return null;
  const appearance = characterAppearance(choice);
  const color = (field: "color" | "hair_color" | "skin", fallback: string) =>
    appearance[field] === "original" ? fallback
      : appearanceOptions[field].find(option => option.id === appearance[field])?.color ?? fallback;
  const female = character.id !== "jules-okafor";
  return {
    character, outfit, appearance, female,
    fabric: color("color", outfit.jacket),
    hair: color("hair_color", female ? "#7c573c" : "#2b2127"),
    skin: color("skin", female ? "#d49673" : "#95553d"),
  };
}

export type CharacterLook = NonNullable<ReturnType<typeof characterLook>>;
