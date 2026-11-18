import { Mesh, type BufferGeometry, type Object3D } from "three";
import catalog from "../../../../packages/wardrobe-catalog/character-wardrobe.json";
import { prepareLacedBodyMask } from "./lacedStrapFit";
import { prepareOverSkirtEase, type OverSkirtEase } from "./overSkirtEase";
import { hasAuthoredSweetheartFit } from "./sweetheartCorset";

export const WARDROBE_SETS = catalog.filter(set => !set.retired);
export const WARDROBE_CORSETS = catalog;
export const LACED_BODICE_WARDROBE_SET = "gothic-01";
const RUFFLED_WARDROBE_SET = "gothic-03";
export const REBUILT_LACED_BODICE_ASSET = "gothic-laced-bodice";
const HIGH_COLLAR_WARDROBE_SET = "gothic-05";
const REBUILT_HIGH_COLLAR_ASSET = "gothic-high-collar";
export const UNDERBUST_WARDROBE_SET = "gothic-04";
export const REBUILT_UNDERBUST_ASSET = "gothic-underbust-vest";
export const ORIGINAL_CUT_UNDERBUST_ASSET = "gothic-underbust-vest-original-cut";
export const TUCKED_UNDERBUST_ASSET = "gothic-underbust-vest-tucked";
export type WardrobeChoice = { set: string; shirt: "none" | "under" | "over"; waist: "tucked" | "over"; cut?: "original" };
type WardrobeSelection = {
  wardrobe?: WardrobeChoice; wardrobeTrial?: WardrobeChoice; wardrobeEase?: Exclude<OverSkirtEase, 0>;
  garments?: { top?: string; dress?: string };
};
export const WARDROBE_WAIST_OPTIONS = [
  { waist: "tucked", ease: 0, label: "Tucked into skirt" },
  { waist: "over", ease: 0, label: "Over skirt" },
  { waist: "over", ease: 1, label: "Roomy over skirt" },
  { waist: "over", ease: 2, label: "Wide over skirt" },
] as const;

/** Preserve the set and waist fit of older outfits that saved a separate shirt. */
export function resolveWardrobe(choice?: WardrobeChoice, { includeRetired = false } = {}): WardrobeChoice | undefined {
  const set = (includeRetired ? catalog : WARDROBE_SETS).find(item => item.id === choice?.set);
  if (!set || !choice) return undefined;
  const waist = choice.waist === "over" ? "over" : "tucked";
  const cut = set.id === UNDERBUST_WARDROBE_SET && waist === "over" && choice.cut === "original"
    ? { cut: choice.cut } : {};
  return { set: set.id, shirt: "none", waist, ...cut };
}

export function hasSeparateWardrobeTop(choice?: Pick<WardrobeSelection, "garments"> | null) {
  return Boolean(choice?.garments?.top || choice?.garments?.dress);
}

export function resolveCharacterWardrobe(choice: WardrobeSelection | null | undefined) {
  if (hasSeparateWardrobeTop(choice)) return;
  return resolveWardrobe(choice?.wardrobeTrial, { includeRetired: true }) ?? resolveWardrobe(choice?.wardrobe);
}

export function withWardrobeWaist<T extends WardrobeSelection>(choice: T, waist: WardrobeChoice["waist"], ease: OverSkirtEase = 0): T {
  const selected = resolveCharacterWardrobe(choice);
  if (!selected) return choice;
  const wardrobeEase = waist === "over" && ease ? ease : undefined;
  const next = resolveWardrobe({ ...selected, waist }, { includeRetired: true });
  return choice.wardrobeTrial?.set === selected.set
    ? { ...choice, wardrobeTrial: next, wardrobeEase }
    : { ...choice, wardrobe: next, wardrobeEase };
}

export function hasUnderbustCut(cut?: WardrobeChoice["cut"]) {
  const asset = cut === "original" ? ORIGINAL_CUT_UNDERBUST_ASSET : REBUILT_UNDERBUST_ASSET;
  const lods = __STANDALONE_CORSET_LODS__[asset];
  return Boolean(lods?.garage || lods?.mobile);
}

export function hasTuckedUnderbust() {
  const lods = __STANDALONE_CORSET_LODS__[TUCKED_UNDERBUST_ASSET];
  return Boolean(lods?.garage || lods?.mobile);
}

export function isRebuiltUnderbustUrl(url: string) {
  return [REBUILT_UNDERBUST_ASSET, ORIGINAL_CUT_UNDERBUST_ASSET, TUCKED_UNDERBUST_ASSET].some(asset => url.includes(`/${asset}.`));
}

export function isRebuiltLacedBodiceUrl(url: string) {
  return url.includes(`/${REBUILT_LACED_BODICE_ASSET}.`);
}

export function isRebuiltHighCollarUrl(url: string) {
  return url.includes(`/${REBUILT_HIGH_COLLAR_ASSET}.`);
}

export function hasRebuiltLacedBodice() {
  const lods = __STANDALONE_CORSET_LODS__[REBUILT_LACED_BODICE_ASSET];
  return Boolean(lods?.garage || lods?.mobile);
}

/** A matched Gothic outfit still uses its bundled skirt and only substitutes the rebuilt bodice. */
export function corsetRenderChoice(look: {
  corset?: WardrobeChoice;
  wardrobe?: WardrobeChoice;
  garments?: { top?: string; dress?: string; skirt?: string };
  removedClothing: readonly string[];
}) {
  if (look.removedClothing.includes("top") || look.removedClothing.includes("corset")) return;
  if (look.corset) return look.corset;
  if (look.wardrobe?.set === RUFFLED_WARDROBE_SET && look.garments?.skirt === "village-skirt"
    && !look.garments.top && !look.garments.dress) return look.wardrobe;
  if (look.wardrobe?.set === LACED_BODICE_WARDROBE_SET && !look.garments?.top && !look.garments?.dress
    && hasRebuiltLacedBodice()) return look.wardrobe;
  if (look.wardrobe?.set === HIGH_COLLAR_WARDROBE_SET && !look.garments?.top && !look.garments?.dress) {
    const lods = __STANDALONE_CORSET_LODS__[REBUILT_HIGH_COLLAR_ASSET];
    if (lods?.garage || lods?.mobile) return look.wardrobe;
  }
}

export function wardrobeOverEase(choice?: WardrobeSelection | null): OverSkirtEase {
  const ease = choice?.wardrobeEase;
  return (ease === 1 || ease === 2) && resolveCharacterWardrobe(choice)?.waist === "over" ? ease : 0;
}

function wardrobeTierUrls(id: string, directory: string, kind: "garage" | "portrait",
  available: { garage: boolean; mobile: boolean } | undefined, includeAlternate: boolean) {
  const preferred = kind === "portrait" ? "mobile" : "garage";
  const alternate = preferred === "mobile" ? "garage" : "mobile";
  const path = `/models/characters/${directory}/${id}`;
  const urls: string[] = [];
  if (available?.[preferred]) urls.push(`${path}.${preferred}.glb`);
  if (available?.[alternate] && (includeAlternate || !available[preferred])) urls.push(`${path}.${alternate}.glb`);
  return urls;
}

export function wardrobeModelUrls(choice: WardrobeChoice | undefined, kind: "garage" | "portrait") {
  const resolved = resolveWardrobe(choice);
  return resolved ? wardrobeTierUrls(resolved.set, "wardrobe", kind, __BUNDLED_WARDROBE_LODS__[resolved.set], true) : [];
}

export function wardrobeModelUrl(choice: WardrobeChoice | undefined, kind: "garage" | "portrait") {
  return wardrobeModelUrls(choice, kind)[0] ?? null;
}

export function corsetModelUrls(choice: WardrobeChoice | undefined, kind: "garage" | "portrait", { useStandalone = true } = {}) {
  const resolved = resolveWardrobe(choice, { includeRetired: true });
  if (!resolved) return [];
  const urls: string[] = [];
  const add = (id: string, directory: string, available: { garage: boolean; mobile: boolean } | undefined, includeAlternate = false) => {
    urls.push(...wardrobeTierUrls(id, directory, kind, available, includeAlternate));
  };
  if (useStandalone) {
    const directory = "female/wardrobe/corsets";
    if (resolved.set === HIGH_COLLAR_WARDROBE_SET) {
      add(REBUILT_HIGH_COLLAR_ASSET, directory, __STANDALONE_CORSET_LODS__[REBUILT_HIGH_COLLAR_ASSET], true);
    }
    if (resolved.set === LACED_BODICE_WARDROBE_SET) {
      add(REBUILT_LACED_BODICE_ASSET, directory, __STANDALONE_CORSET_LODS__[REBUILT_LACED_BODICE_ASSET], true);
    }
    if (resolved.set === UNDERBUST_WARDROBE_SET && resolved.waist === "over") {
      if (resolved.cut === "original") {
        add(ORIGINAL_CUT_UNDERBUST_ASSET, directory, __STANDALONE_CORSET_LODS__[ORIGINAL_CUT_UNDERBUST_ASSET]);
      }
      add(REBUILT_UNDERBUST_ASSET, directory, __STANDALONE_CORSET_LODS__[REBUILT_UNDERBUST_ASSET]);
    }
    if (resolved.set === UNDERBUST_WARDROBE_SET && resolved.waist === "tucked") {
      add(TUCKED_UNDERBUST_ASSET, directory, __STANDALONE_CORSET_LODS__[TUCKED_UNDERBUST_ASSET]);
    }
    add(resolved.set, directory, __STANDALONE_CORSET_LODS__[resolved.set]);
  }
  add(resolved.set, "wardrobe", __BUNDLED_WARDROBE_LODS__[resolved.set]);
  return urls;
}

export function corsetModelUrl(choice: WardrobeChoice | undefined, kind: "garage" | "portrait", options?: { useStandalone?: boolean }) {
  return corsetModelUrls(choice, kind, options)[0] ?? null;
}

/** A garment swap changes visibility and indices once, never vertex positions per frame. */
export function prepareWardrobe(root: Object3D) {
  const parts: Object3D[] = [];
  const masked: { mesh: Mesh; source: BufferGeometry; geometry: BufferGeometry; indices: Uint32Array[] }[] = [];
  const skirtCoversHips = Boolean(root.getObjectByName("CLOTH_BOTTOM_SKIRT"));
  const sweetheartSkin = hasAuthoredSweetheartFit(root, 2);
  root.traverse(part => {
    if (typeof part.userData.wardrobeRole === "string") {
      parts.push(part);
      // Keep unconfigured or failed loads covered until apply() selects a complete outfit.
      part.visible = ["bottom", "bottom-seam-tucked", "bottom-trim-tucked", "corset-tucked", "corset-facing", "corset-facing-tucked"]
        .includes(part.userData.wardrobeRole);
    }
    if (!(part instanceof Mesh)) return;
    const coverage = part.geometry.getAttribute("_aven_coverage");
    const index = part.geometry.getIndex();
    if (!coverage || !index) return;
    const source = part.geometry;
    // Own masked body and inner garments so previews can choose different layers.
    const geometry = source.clone();
    const body = part.userData.wardrobeRole === "body" ? geometry.getAttribute("position") : undefined;
    const indices = Array.from({ length: 2 }, (_, mode) => {
      const visible: number[] = [], bit = 1 << mode;
      const lacedMask = body && prepareLacedBodyMask(root, mode === 1 ? "over" : "tucked");
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        if (body) {
          const top = Math.max(body.getY(a), body.getY(b), body.getY(c));
          if (skirtCoversHips && Math.max(Math.abs(body.getX(a)), Math.abs(body.getX(b)), Math.abs(body.getX(c))) < .203) {
            const bottom = Math.min(body.getY(a), body.getY(b), body.getY(c));
            // Restore complete lower legs. Hide the surface inside the skirt at the hips.
            if (bottom < .736 && top < .758) { visible.push(a, b, c); continue; }
            if (bottom < 1.02 && top > .736) continue;
          }
          // The Sweetheart neckline and armholes need the full skinned torso.
          if (sweetheartSkin && top > 1.10) { visible.push(a, b, c); continue; }
        }
        if ((coverage.getX(a) & coverage.getX(b) & coverage.getX(c) & bit) === 0
          || (body && lacedMask?.retainsFace(body, a, b, c))) visible.push(a, b, c);
      }
      lacedMask?.dispose();
      return Uint32Array.from(visible);
    });
    part.geometry = geometry;
    masked.push({ mesh: part, source, geometry, indices });
  });
  const overSkirt = prepareOverSkirtEase(root);
  let lastMode = -1;
  return {
    sourceForMaskedGeometry(geometry: BufferGeometry) {
      return masked.find(part => part.geometry === geometry)?.source;
    },
    apply(choice?: WardrobeChoice, ease: OverSkirtEase = 0) {
      const selected = resolveWardrobe(choice, { includeRetired: true });
      if (!parts.length || !selected) return;
      const visible = new Set(["body", "bottom", "corset-facing", `corset-${selected.waist}`, `corset-facing-${selected.waist}`,
        `bottom-seam-${selected.waist}`, `bottom-trim-${selected.waist}`]);
      parts.forEach(part => { part.visible = visible.has(part.userData.wardrobeRole); });
      const mode = selected.waist === "over" ? 1 : 0;
      if (mode !== lastMode) {
        lastMode = mode;
        for (const { geometry, indices } of masked) {
          const index = geometry.getIndex()!;
          index.array.set(indices[mode]);
          index.needsUpdate = true;
          geometry.clearGroups();
          geometry.setDrawRange(0, indices[mode].length);
        }
      }
      overSkirt.apply(mode ? ease : 0);
    },
    dispose() {
      overSkirt.dispose();
      for (const { mesh, source, geometry } of masked) {
        mesh.geometry = source;
        geometry.dispose();
      }
    },
  };
}
