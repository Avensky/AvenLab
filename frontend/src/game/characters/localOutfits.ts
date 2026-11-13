import { CHARACTERS, type CharacterChoice } from "./characterCatalog";

export const LOCAL_OUTFITS_KEY = "avenlab-saved-outfits-v1";
const LOCAL_CHARACTER_KEY = "avenlab-local-character-v1";
type Outfits = Record<string, CharacterChoice>;

function isSavedChoice(value: unknown): value is CharacterChoice {
  if (!value || typeof value !== "object") return false;
  const { id, outfit } = value as Partial<CharacterChoice>;
  return CHARACTERS.some(character => character.id === id && character.outfits.some(item => item.id === outfit));
}

function readStoredOutfits(): Record<string, unknown> {
  const value: unknown = JSON.parse(window.localStorage.getItem(LOCAL_OUTFITS_KEY) ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid local outfits");
  return value as Record<string, unknown>;
}

function availableOutfits(outfits: Record<string, unknown>): Outfits {
  return Object.fromEntries(Object.entries(outfits).filter((entry): entry is [string, CharacterChoice] => isSavedChoice(entry[1])));
}

export function readLocalOutfits(): Outfits {
  try {
    return availableOutfits(readStoredOutfits());
  } catch {
    return {};
  }
}

export function writeLocalOutfit(name: string, choice?: CharacterChoice): Outfits {
  const outfits = readStoredOutfits();
  if (choice) Object.defineProperty(outfits, name, { value: choice, enumerable: true, configurable: true });
  else delete outfits[name];
  window.localStorage.setItem(LOCAL_OUTFITS_KEY, JSON.stringify(outfits));
  return availableOutfits(outfits);
}

export function readLocalCharacter(): CharacterChoice | undefined {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(LOCAL_CHARACTER_KEY) ?? "null");
    return isSavedChoice(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writeLocalCharacter(choice: CharacterChoice) {
  window.localStorage.setItem(LOCAL_CHARACTER_KEY, JSON.stringify(choice));
}
