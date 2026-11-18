import type { MeshStandardMaterial } from "three";
import type { CharacterLook } from "./characterCatalog";
import type { PieceColors } from "./clothingPieces";
import { applyLacedBodiceFinish, LACED_BODICE_FINISHES } from "./lacedBodiceAppearance";
import { updateUnderbustDyeGain } from "./rebuiltUnderbustDye";
import { corsetModelUrl, corsetRenderChoice, isRebuiltHighCollarUrl, isRebuiltLacedBodiceUrl, isRebuiltUnderbustUrl,
  type WardrobeChoice } from "./wardrobe";

export type DyeColorKey = Exclude<keyof PieceColors, "finish">;
type DyeFallback = "outfitFabric" | "outfitAccent" | "accent";
export type CorsetDyeGroup = {
  key: DyeColorKey;
  label: string;
  original: string;
  theme?: "color" | "accent";
  fallback?: readonly DyeFallback[];
  overOnly?: true;
};

type CorsetDyeProfile = {
  groups: Record<string, CorsetDyeGroup>;
  supports: (fit: WardrobeChoice, url: string | null) => boolean;
  materialGroup: (source: MeshStandardMaterial, material: MeshStandardMaterial) => string | undefined;
  finishes?: typeof LACED_BODICE_FINISHES;
  applyFinish?: (source: MeshStandardMaterial, material: MeshStandardMaterial,
    group: CorsetDyeGroup, colors: PieceColors | undefined, dyed: boolean) => void;
};

const profiles: readonly CorsetDyeProfile[] = [
  {
    groups: {
      fabric: { key: "color", label: "Fabric", original: "#29282d", theme: "color", fallback: ["outfitFabric"] },
      laces: { key: "laces", label: "Front laces", original: "#928778", theme: "accent", fallback: ["accent", "outfitAccent"] },
      accent: { key: "panel", label: "Hip laces", original: "#928778", theme: "accent", fallback: ["accent", "outfitAccent"], overOnly: true },
      hardware: { key: "hardware", label: "Eyelets", original: "#706c73", theme: "accent", fallback: ["accent"] },
      closure: { key: "closure", label: "Front fasteners", original: "#706c73", theme: "accent", fallback: ["accent"] },
    },
    supports: fit => fit.set === "gothic-02",
    materialGroup: source => source.userData.authoredSweetheartDye === true ? source.userData.color_slot : undefined,
  },
  {
    groups: {
      fabric: { key: "color", label: "Fabric", original: "#797471", theme: "color", fallback: ["outfitFabric"] },
      panel: { key: "panel", label: "Trim", original: "#746e6c", theme: "color", fallback: ["outfitFabric"] },
      laces: { key: "laces", label: "Laces", original: "#cdb693", theme: "accent", fallback: ["accent", "outfitAccent"] },
      hardware: { key: "hardware", label: "Eyelets", original: "#b18e61" },
      closure: { key: "closure", label: "Zipper", original: "#a6906f", overOnly: true },
    },
    supports: (_, url) => url !== null && isRebuiltLacedBodiceUrl(url),
    materialGroup: (source, material) => material.userData.rebuiltLacedBodice ? source.userData.color_slot : undefined,
    finishes: LACED_BODICE_FINISHES,
    applyFinish: (source, material, group, colors, dyed) => {
      if (group.key === "color" || group.key === "panel") applyLacedBodiceFinish(source, material, colors?.finish, dyed);
    },
  },
  {
    groups: {
      color: { key: "color", label: "Main", original: "#30282a", theme: "color", fallback: ["outfitFabric"] },
      accent: { key: "accent", label: "Binding", original: "#362d2c", theme: "accent", fallback: ["outfitAccent"] },
      panel: { key: "panel", label: "Front panel", original: "#40302c", theme: "color", fallback: ["outfitFabric"] },
      lining: { key: "lining", label: "Lining", original: "#2a262b", theme: "color", fallback: ["outfitFabric"] },
      hardware: { key: "hardware", label: "Hardware", original: "#ad8451", theme: "accent" },
    },
    supports: (_, url) => url !== null && isRebuiltUnderbustUrl(url),
    materialGroup: source => source.userData.underbustDyeGroup,
    applyFinish: (source, material, _group, _colors, dyed) => updateUnderbustDyeGain(source, material, dyed),
  },
  {
    groups: {
      Brocade: { key: "color", label: "Fabric", original: "#acb181", theme: "color", fallback: ["outfitFabric"] },
      Ruffles: { key: "panel", label: "Ruffles", original: "#dbd6ca", theme: "accent", fallback: ["accent", "outfitAccent"] },
      Ribbon: { key: "laces", label: "Ribbon", original: "#ebe3d4", theme: "accent", fallback: ["accent"] },
    },
    supports: (fit, url) => fit.set === "gothic-03" && url !== null,
    materialGroup: source => /^MAT_CORSET_03_(Brocade|Ruffles|Ribbon)(?:\.\d+)?$/.exec(source.name)?.[1],
  },
  {
    groups: {
      Main: { key: "color", label: "Main", original: "#292731", theme: "color", fallback: ["outfitFabric"] },
      Inset: { key: "panel", label: "Inset", original: "#61313d", theme: "accent", fallback: ["accent", "outfitAccent"] },
      Laces: { key: "laces", label: "Laces", original: "#b8a793", theme: "accent", fallback: ["accent", "outfitAccent"] },
      Trim: { key: "lining", label: "Trim", original: "#39323d", theme: "color", fallback: ["outfitFabric"] },
      Metal: { key: "hardware", label: "Metal", original: "#99919c", theme: "accent", fallback: ["accent"] },
    },
    supports: (_, url) => url !== null && isRebuiltHighCollarUrl(url),
    materialGroup: source => /^Corset05_(Main|Inset|Laces|Trim|Metal)(?:\.\d+)?$/.exec(source.name)?.[1],
  },
];

export function getCorsetDyeProfile(look: CharacterLook) {
  const fit = corsetRenderChoice(look) ?? look.wardrobe;
  if (!fit) return;
  const url = corsetModelUrl(fit, "garage");
  const profile = profiles.find(entry => entry.supports(fit, url));
  if (!profile) return;
  const themeGroups = Object.values(profile.groups);
  const groups = themeGroups.filter(group => !group.overOnly || fit.waist === "over");
  return { groups, themeGroups, finishes: profile.finishes };
}

export function resolveCorsetDye(group: CorsetDyeGroup, colors: PieceColors | undefined,
  outfitFabric: string | undefined, outfitAccent: string | undefined) {
  const dye = colors?.[group.key];
  if (dye !== undefined) return dye;
  for (const fallback of group.fallback ?? []) {
    const inherited = fallback === "outfitFabric" ? outfitFabric : fallback === "outfitAccent" ? outfitAccent : colors?.accent;
    if (inherited !== undefined) return inherited;
  }
}

export function applyCorsetDye(source: MeshStandardMaterial, material: MeshStandardMaterial,
  colors: PieceColors | undefined, outfitFabric: string | undefined, outfitAccent: string | undefined) {
  for (const profile of profiles) {
    const slot = profile.materialGroup(source, material);
    if (!slot || !Object.hasOwn(profile.groups, slot)) continue;
    const group = profile.groups[slot];
    const dye = resolveCorsetDye(group, colors, outfitFabric, outfitAccent);
    if (dye) material.color.set(dye);
    profile.applyFinish?.(source, material, group, colors, Boolean(dye));
    return true;
  }
  return false;
}
