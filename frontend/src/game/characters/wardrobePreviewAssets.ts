import type { Object3D } from "three";
import type { CharacterLook } from "./characterCatalog";
import { FITTING_BODY_URL, hasAuthoredLacedBodiceFit, rebuiltUnderbustPart } from "./standaloneCorset";
import { corsetModelUrls, corsetRenderChoice, isRebuiltHighCollarUrl, isRebuiltLacedBodiceUrl, isRebuiltUnderbustUrl } from "./wardrobe";
import { removalNeedsVillagerBody, replacesVillagerBody, type WardrobeGarmentSource } from "./wardrobeGarmentFit";
import { getWardrobeGarment, hasWardrobeRevisionMesh, wardrobeGarmentModelUrl } from "./wardrobeGarments";

const LEGACY_FITTING_BODY_URL = "/models/characters/wardrobe/gothic-02.mobile.glb";

export type WardrobeAssetTier = "portrait" | "garage";
/** A missing entry is pending. A null entry is a settled failure. */
export type WardrobeAssetSources = Readonly<Partial<Record<string, Object3D | null>>>;
export type WardrobePreview = {
  look: CharacterLook;
  scene: Object3D;
  garments: WardrobeGarmentSource[];
  garmentBody?: Object3D;
  corsetScene?: Object3D;
  corsetSet?: string;
};

/** Resolve the next requests and the preview that can be displayed from the current sources. */
export function resolveWardrobePreview({
  preferredUrl, look, kind, villageKind, sources, previous,
}: {
  preferredUrl: string;
  look: CharacterLook;
  kind: WardrobeAssetTier;
  villageKind: WardrobeAssetTier;
  sources: WardrobeAssetSources;
  previous?: WardrobePreview;
}) {
  const portrait = __VILLAGER_PORTRAIT_URL__;
  const original = __VILLAGER_MODEL_URL__;
  const originalVillage = kind !== villageKind && portrait && original !== portrait && sources[portrait] === null ? original : null;
  const url = originalVillage && preferredUrl === portrait ? originalVillage : preferredUrl;
  const villageAssetKind = originalVillage ? kind : villageKind;
  const corset = corsetRenderChoice(look);
  const corsetUrls = corsetModelUrls(corset, kind);
  const corsetUrl = corsetUrls.find(asset => {
    const source = sources[asset];
    if (!source) return source !== null;
    if (isRebuiltUnderbustUrl(asset)) return Boolean(rebuiltUnderbustPart(source, corset?.waist));
    return !(isRebuiltHighCollarUrl(asset) || isRebuiltLacedBodiceUrl(asset)) || hasAuthoredLacedBodiceFit(source);
  });
  const requested = Object.values(look.garments ?? {}).flatMap(id => {
    const item = getWardrobeGarment(id);
    if (!item) return [];
    const tier = item.villageNode ? villageAssetKind : kind;
    const preferred = wardrobeGarmentModelUrl(item, tier);
    if (!preferred) return [];
    const loaded = sources[preferred];
    const brokenRevision = preferred === item.revisionUrl && loaded !== undefined
      && (!loaded || !hasWardrobeRevisionMesh(item, loaded));
    const url = brokenRevision ? wardrobeGarmentModelUrl(item, tier, { useRevision: false }) : preferred;
    return url ? [{ item, url }] : [];
  });

  const scene = sources[url];
  // Replacements can expose skin cut from the stock Village outfit.
  const needsBody = Boolean(scene && !scene.getObjectByName("BODY_WARDROBE")
    && (corsetUrl || requested.some(({ item }) => replacesVillagerBody(item.slot)) || look.removedClothing.some(removalNeedsVillagerBody)));
  const loadedCorset = corsetUrl ? sources[corsetUrl] : undefined;
  const bundledCorset = corsetUrl?.startsWith("/models/characters/wardrobe/");
  const bundledBody = bundledCorset ? loadedCorset?.getObjectByName("BODY_WARDROBE") : undefined;
  // Wait for a pending bundle that might supply its own donor.
  const needsSeparateBody = needsBody && !bundledBody && !(bundledCorset && loadedCorset === undefined);
  const fittingBody = sources[FITTING_BODY_URL];
  const bodyUrl = fittingBody !== undefined && !fittingBody?.getObjectByName("BODY_WARDROBE")
    ? LEGACY_FITTING_BODY_URL : FITTING_BODY_URL;
  const urls = new Set([url, ...requested.map(item => item.url)]);
  if (needsSeparateBody) urls.add(bodyUrl);
  if (corsetUrl) urls.add(corsetUrl);
  const assetUrls = [...urls];
  const pendingUrls = assetUrls.filter(asset => sources[asset] === undefined);
  const garmentBody = needsBody ? bundledBody ?? sources[bodyUrl]?.getObjectByName("BODY_WARDROBE") : undefined;
  const unavailable = (corsetUrls.length > 0 && !corsetUrl) || assetUrls.some(asset => sources[asset] === null)
    || (needsSeparateBody && sources[bodyUrl] !== undefined && !garmentBody);

  // Keep the last complete preview while a new selection is pending or unavailable.
  if (!scene || pendingUrls.length || (unavailable && previous)) return { scene, pendingUrls, unavailable, preview: previous };

  const corsetScene = !needsBody || garmentBody ? loadedCorset ?? undefined : undefined;
  const corsetSet = corsetScene ? corset?.set : undefined;
  const garments = requested.flatMap(({ item, url }): WardrobeGarmentSource[] => {
    const source = sources[url];
    if (!source || (needsBody && !garmentBody && replacesVillagerBody(item.slot))) return [];
    return [{ item, scene: source, authoredFit: url === item.revisionUrl }];
  });
  // Preserve the garment array for a dye-only edit so the renderer keeps its rig.
  const sameGarments = previous?.garments.length === garments.length && garments.every((garment, index) => {
    const loaded = previous.garments[index];
    return loaded.item === garment.item && loaded.scene === garment.scene && loaded.authoredFit === garment.authoredFit;
  });
  const preview = sameGarments && previous.look === look && previous.scene === scene && previous.garmentBody === garmentBody
    && previous.corsetScene === corsetScene && previous.corsetSet === corsetSet
    ? previous
    : { look, scene, garments: sameGarments ? previous.garments : garments, garmentBody, corsetScene, corsetSet };
  return { scene, pendingUrls, unavailable, preview };
}
