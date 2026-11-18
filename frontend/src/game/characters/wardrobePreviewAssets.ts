import type { Object3D } from "three";
import type { CharacterLook } from "./characterCatalog";
import { getWardrobeActorBody, getWardrobeBodyDonor, isWardrobeBodyDonor, WARDROBE_BODY_DONOR_URLS } from "./wardrobeBody";
import { hasAuthoredLacedBodiceFit, hasBindableStandaloneCorset, rebuiltUnderbustPart } from "./standaloneCorset";
import { corsetModelUrls, corsetRenderChoice, isRebuiltHighCollarUrl, isRebuiltLacedBodiceUrl, isRebuiltUnderbustUrl, wardrobeModelUrls } from "./wardrobe";
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

function isOutfitActor(scene: Object3D | null | undefined, bundledSet?: string) {
  if (scene === undefined) return true; // Request this candidate before trying a lower tier.
  if (!scene) return false;
  const body = getWardrobeActorBody(scene);
  if (!body || !isWardrobeBodyDonor(body, body.skeleton)) return false;
  // A donor-only or garment-only GLB may decode successfully without containing Vesper.
  if (!scene.getObjectByName("HEAD_FACE4")?.getObjectByProperty("type", "SkinnedMesh")
    || !scene.getObjectByName("CLOTH_BOTTOM_SKIRT")?.getObjectByProperty("type", "SkinnedMesh")) return false;
  return !bundledSet || hasBindableStandaloneCorset({ set: bundledSet, scene }, body.skeleton);
}

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
  const preferredPortrait = __VILLAGER_PORTRAIT_URL__;
  const portrait = preferredPortrait && sources[preferredPortrait] === null
    ? __CHARACTER_MODEL_FALLBACKS__[preferredPortrait] ?? preferredPortrait : preferredPortrait;
  const original = __VILLAGER_MODEL_URL__;
  const originalVillage = kind !== villageKind && portrait && original !== portrait && sources[portrait] === null ? original : null;
  // The Village layers live inside the actor. Resolve both roles to the same loaded scene.
  const villageUrl = (asset: string) => asset === preferredPortrait ? originalVillage ?? portrait ?? asset : asset;
  const bundles = wardrobeModelUrls(look.wardrobe, kind);
  let url = villageUrl(preferredUrl);
  let stockActor: string | undefined;
  if (bundles.includes(preferredUrl)) {
    const bundle = bundles.find(asset => isOutfitActor(sources[asset], look.wardrobe?.set));
    if (bundle) url = bundle;
    else {
      const authoredPortrait = preferredPortrait && __CHARACTER_MODEL_FALLBACKS__[preferredPortrait];
      const stock = villageKind === "garage" ? [original, preferredPortrait, authoredPortrait]
        : [preferredPortrait, authoredPortrait, kind === "garage" ? original : null];
      stockActor = stock.find((asset): asset is string => Boolean(asset && isOutfitActor(sources[asset])));
      if (!stockActor) return { scene: null, pendingUrls: [], unavailable: true, preview: previous };
      url = stockActor;
    }
  }
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
    const preferred = (item.villageNode && stockActor) || wardrobeGarmentModelUrl(item, tier);
    if (!preferred) return [];
    const loaded = sources[preferred];
    const brokenRevision = preferred === item.revisionUrl && loaded !== undefined
      && (!loaded || !hasWardrobeRevisionMesh(item, loaded) || !garmentFits(item, loaded));
    const url = (brokenRevision ? wardrobeGarmentModelUrl(item, tier, { useRevision: false }) : undefined) ?? villageUrl(preferred);
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
  let bodyUrl: string = fittingBodySource !== undefined && !fittingBody
    ? legacyBodyUrl : fittingBodyUrl;
  let garmentBody = bundledBody ?? (needsSeparateBody
    ? (bodyUrl === fittingBodyUrl ? fittingBody : compatibleBody(sources[bodyUrl])) : undefined);
  // A desktop-only install can have the complete High Collar outfit but neither common donor.
  if (needsSeparateBody && !garmentBody && corsetUrl && isRebuiltHighCollarUrl(corsetUrl)
    && bodyUrl === legacyBodyUrl && sources[legacyBodyUrl] !== undefined) {
    const fallback = wardrobeModelUrls(corset, kind).find(asset => sources[asset] === undefined || compatibleBody(sources[asset]));
    if (fallback) {
      bodyUrl = fallback;
      garmentBody = compatibleBody(sources[bodyUrl]);
    }
  }
  const urls = new Set([url, ...requested.map(item => item.url)]);
  if (needsSeparateBody) urls.add(bodyUrl);
  if (corsetUrl) urls.add(corsetUrl);
  const assetUrls = [...urls];
  const pendingUrls = assetUrls.filter(asset => sources[asset] === undefined);
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
