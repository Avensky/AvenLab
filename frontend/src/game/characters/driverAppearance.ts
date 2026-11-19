import cast from "../../../../packages/wardrobe-catalog/characters.json" with { type: "json" };
import options from "../../../../packages/wardrobe-catalog/character-appearance.json" with { type: "json" };
import wardrobe from "../../../../packages/wardrobe-catalog/character-wardrobe.json" with { type: "json" };
import type { CharacterChoice } from "./characterCatalog";

/** Gameplay LOD: only the silhouette and its broad color regions cross the wire. */
export type DriverAppearance = {
  body: "female" | "male" | "neutral";
  skin: string;
  hair: string;
  hairStyle: "short" | "long" | "none";
  headwear: "none" | "hat";
  headwearColor: string;
  top: string;
  bottom: string;
};

const hex = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);

/** Validate once when accepting a snapshot, never in the animation loop. */
export function isDriverAppearance(value: unknown): value is DriverAppearance {
  if (!value || typeof value !== "object") return false;
  const item = value as DriverAppearance;
  return ["female", "male", "neutral"].includes(item.body)
    && ["short", "long", "none"].includes(item.hairStyle)
    && ["none", "hat"].includes(item.headwear)
    && [item.skin, item.hair, item.headwearColor, item.top, item.bottom].every(hex);
}

/** Match equipped profile colors without importing the fitting/GLB pipeline.
 * The server uses the same catalog and rules in alpha/character/driver.rs.
 */
export function driverAppearance(choice: CharacterChoice | null | undefined): DriverAppearance | null {
  const character = cast.find(item => item.id === choice?.id);
  const outfit = character?.outfits.find(item => item.id === choice?.outfit);
  if (!choice || !character || !outfit) return null;
  const female = character.id !== "jules-okafor";
  const appearance = choice.appearance;
  const optionColor = (field: "color" | "skin" | "hair_color", fallback: string) => {
    const id = appearance?.[field];
    if (field === "color" && hex(id)) return id;
    return options[field].find(item => item.id === id && id !== "original")?.color ?? fallback;
  };
  const fabric = optionColor("color", outfit.jacket);
  const original = !appearance || appearance.color === "original";
  const authored = wardrobe.find(item => item.id === choice.wardrobe?.set)?.gameplayColors;
  const variant = choice.wardrobe?.set ?? choice.outfit;
  const pieceColor = (piece: string, fallback = fabric) => {
    const color = appearance?.item_colors?.[`${variant}:${piece}`]?.color;
    return hex(color) ? color : fallback;
  };
  const dress = female && !choice.wardrobe && !["dockwear", "shop-crew"].includes(choice.outfit);
  const hat = !dress && (character.id === "mara-vega" || appearance?.headwear === "hat");
  return {
    body: female ? "female" : "male",
    skin: optionColor("skin", female ? "#d49673" : "#95553d"),
    hair: optionColor("hair_color", female ? "#7c573c" : "#2b2127"),
    hairStyle: female && appearance?.hair !== "cropped" ? "long" : "short",
    headwear: hat ? "hat" : "none",
    headwearColor: pieceColor("hat", "#e7cda0"),
    top: pieceColor(dress ? "dress" : female ? "corset" : "coat", original ? authored?.top ?? fabric : fabric),
    bottom: pieceColor(dress ? "dress" : female ? "skirt" : "pants", original ? authored?.bottom ?? fabric : fabric),
  };
}
