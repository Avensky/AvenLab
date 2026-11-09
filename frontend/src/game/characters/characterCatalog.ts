import catalog from "../../../../avenlab-server/src/assets/characters.json";

export type CharacterChoice = { id: string; outfit: string };
export const CHARACTERS = catalog;

export function characterLook(choice: CharacterChoice | null | undefined) {
  const character = CHARACTERS.find(item => item.id === choice?.id);
  const outfit = character?.outfits.find(item => item.id === choice?.outfit);
  return character && outfit ? { character, outfit } : null;
}
