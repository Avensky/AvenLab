import type { Object3D } from "three";
import type { CharacterLook } from "./characterCatalog";
import { getWardrobeActorBody, getWardrobeBodyDonor, WARDROBE_BODY_DONOR_URLS } from "./wardrobeBody";
import { hasAuthoredLacedBodiceFit, hasBindableStandaloneCorset, rebuiltUnderbustPart } from "./standaloneCorset";
import { corsetModelUrls, corsetRenderChoice, isRebuiltHighCollarUrl, isRebuiltLacedBodiceUrl, isRebuiltUnderbustUrl } from "./wardrobe";
import { hasBindableWardrobeGarment, removalNeedsVillagerBody, replacesVillagerBody, type WardrobeGarmentSource } from "./wardrobeGarmentFit";
import { getWardrobeGarment, hasWardrobeRevisionMesh, wardrobeGarmentModelUrl } from "./wardrobeGarments";

const [fittingBodyUrl, legacyBodyUrl] = WARDROBE_BODY_DONOR_URLS;

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
  const scene = sources[url];
  const skeleton = scene ? getWardrobeActorBody(scene)?.skeleton : undefined;
  const corset = corsetRenderChoice(look);
  const corsetUrls = corsetModelUrls(corset, kind);
  const corsetUrl = corset && corsetUrls.find(asset => {
    if (scene && !skeleton) return false;
    const source = sources[asset];
    if (!source) return source !== null;
    if (isRebuiltUnderbustUrl(asset) && !rebuiltUnderbustPart(source, corset.waist)) return false;
    if ((isRebuiltHighCollarUrl(asset) || isRebuiltLacedBodiceUrl(asset)) && !hasAuthoredLacedBodiceFit(source)) return false;
    return !skeleton || hasBindableStandaloneCorset({ scene: source, set: corset.set }, skeleton);
  });
  const removeSleeves = look.removedClothing.includes("sleeves");
  const garmentFits = (item: WardrobeGarmentSource["item"], source: Object3D) =>
    !scene || Boolean(skeleton && hasBindableWardrobeGarment({ item, scene: source }, skeleton, removeSleeves));
  const requested = Object.values(look.garments ?? {}).flatMap(id => {
    const item = getWardrobeGarment(id);
    if (!item) return [];
    const tier = item.villageNode ? villageAssetKind : kind;
    const preferred = wardrobeGarmentModelUrl(item, tier);
    if (!preferred) return [];
    const loaded = sources[preferred];
    const brokenRevision = preferred === item.revisionUrl && loaded !== undefined
      && (!loaded || !hasWardrobeRevisionMesh(item, loaded) || !garmentFits(item, loaded));
    const url = (brokenRevision ? wardrobeGarmentModelUrl(item, tier, { useRevision: false }) : undefined) ?? preferred;
    const source = sources[url];
    const rejected = url === item.revisionUrl ? brokenRevision : Boolean(source && !garmentFits(item, source));
    return [{ item, url, rejected }];
  });

  const compatibleBody = (source: Object3D | null | undefined) => skeleton ? getWardrobeBodyDonor(source, skeleton) : undefined;
  // Replacements can expose skin cut from the stock Village outfit.
  const needsBody = Boolean(scene && (corsetUrl || requested.some(({ item, rejected }) => !rejected && replacesVillagerBody(item.slot))
    || look.removedClothing.some(removalNeedsVillagerBody)) && !compatibleBody(scene));
  const loadedCorset = corsetUrl ? sources[corsetUrl] : undefined;
  const bundledCorset = corsetUrl?.startsWith("/models/characters/wardrobe/");
  const bundledBody = needsBody && bundledCorset ? compatibleBody(loadedCorset) : undefined;
  // Wait for a pending bundle that might supply its own donor.
  const needsSeparateBody = needsBody && Boolean(skeleton) && !bundledBody && !(bundledCorset && loadedCorset === undefined);
  const fittingBodySource = sources[fittingBodyUrl];
  const fittingBody = needsSeparateBody ? compatibleBody(fittingBodySource) : undefined;
  const bodyUrl = fittingBodySource !== undefined && !fittingBody
    ? legacyBodyUrl : fittingBodyUrl;
  const urls = new Set([url, ...requested.map(item => item.url)]);
  if (needsSeparateBody) urls.add(bodyUrl);
  if (corsetUrl) urls.add(corsetUrl);
  const assetUrls = [...urls];
  const pendingUrls = assetUrls.filter(asset => sources[asset] === undefined);
  const garmentBody = bundledBody ?? (needsSeparateBody
    ? (bodyUrl === fittingBodyUrl ? fittingBody : compatibleBody(sources[bodyUrl])) : undefined);
  const unavailable = (corsetUrls.length > 0 && !corsetUrl) || requested.some(({ rejected }) => rejected)
    || assetUrls.some(asset => sources[asset] === null)
    || (needsBody && !garmentBody && (!skeleton || (needsSeparateBody && sources[bodyUrl] !== undefined)));

  // Keep the last complete preview while a new selection is pending or unavailable.
  if (!scene || pendingUrls.length || (unavailable && previous)) return { scene, pendingUrls, unavailable, preview: previous };

  const corsetScene = !needsBody || garmentBody ? loadedCorset ?? undefined : undefined;
  const corsetSet = corsetScene ? corset?.set : undefined;
  const garments = requested.flatMap(({ item, url, rejected }): WardrobeGarmentSource[] => {
    const source = sources[url];
    if (!source || rejected || (needsBody && !garmentBody && replacesVillagerBody(item.slot))) return [];
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
