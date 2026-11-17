import { useSyncExternalStore } from "react";
import { selectEquippedCharacter, useSocialStore } from "../../store/social/socialStore";
import { CHARACTERS, DEFAULT_CHARACTER, type CharacterChoice } from "./characterCatalog";

export const LOCAL_OUTFITS_KEY = "avenlab-saved-outfits-v1";
export const OUTFIT_NAME_CONFLICT = "That name belongs to another character's outfit.";
const LOCAL_CHARACTER_KEY = "avenlab-local-character-v1";
type Outfits = Record<string, CharacterChoice>;
const characterListeners = new Set<() => void>();
let localCharacter: { raw: string | null; choice: CharacterChoice | undefined } | undefined;

function isSavedChoice(value: unknown): value is CharacterChoice {
  if (!value || typeof value !== "object") return false;
  const { id, outfit } = value as Partial<CharacterChoice>;
  return CHARACTERS.some(character => character.id === id && character.outfits.some(item => item.id === outfit));
}

function parseStoredValue(raw: string | null): unknown {
  try {
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function readStoredOutfits(): Record<string, unknown> {
  const value = parseStoredValue(window.localStorage.getItem(LOCAL_OUTFITS_KEY));
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
  const existing = outfits[name];
  if (choice && isSavedChoice(existing) && existing.id !== choice.id) throw new Error(OUTFIT_NAME_CONFLICT);
  if (choice) Object.defineProperty(outfits, name, { value: choice, enumerable: true, configurable: true });
  else delete outfits[name];
  window.localStorage.setItem(LOCAL_OUTFITS_KEY, JSON.stringify(outfits));
  return availableOutfits(outfits);
}

export function readLocalCharacter(): CharacterChoice | undefined {
  try {
    const raw = window.localStorage.getItem(LOCAL_CHARACTER_KEY);
    if (localCharacter?.raw !== raw) {
      const value = parseStoredValue(raw);
      localCharacter = { raw, choice: isSavedChoice(value) ? value : undefined };
    }
    return localCharacter.choice;
  } catch {
    return undefined;
  }
}

export function writeLocalCharacter(choice: CharacterChoice) {
  window.localStorage.setItem(LOCAL_CHARACTER_KEY, JSON.stringify(choice));
  characterListeners.forEach(listener => listener());
}

function subscribeLocalCharacter(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCAL_CHARACTER_KEY) listener();
  };
  characterListeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    characterListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePlayerCharacter() {
  const equipped = useSocialStore(selectEquippedCharacter);
  const local = useSyncExternalStore(subscribeLocalCharacter, readLocalCharacter, () => undefined);
  return equipped ?? local ?? DEFAULT_CHARACTER;
}
