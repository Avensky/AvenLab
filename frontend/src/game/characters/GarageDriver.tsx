import type { MirrorCheckFit } from "./mirrorCheck";
import { CharacterTurntable } from "./CharacterTurntable";
import { usesFittedAnimation } from "./animationFit";
import { clothingColors } from "./clothingPieces";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { Object3D } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { ROOK_ID, VILLAGER_ID, characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { StylizedDriver } from "./StylizedDriver";
import { GarageEmotePlayer, type VictoryPlayback } from "./GarageEmotePlayer";
import { CharacterLoadingEffect } from "./CharacterLoadingEffect";
import { applyVillagerLook, prepareVillager, villagerModelUrl } from "./villagerModel";
import type { GarageLeanFit } from "./garageLean";
import type { GarageCockpit } from "../preview/garageCockpit";
import { PreviewLoadingStatus } from "../preview/PreviewLoadingSeal";
import { isCompactPreview } from "../preview/previewBudget";
import { failCockpitPreview, useCharacterPreviewStore } from "./characterPreviewStore";
import { removalNeedsVillagerBody, replacesVillagerBody, type WardrobeGarmentSource } from "./wardrobeGarmentFit";
import { getWardrobeGarment, hasWardrobeRevisionMesh, wardrobeGarmentModelUrl } from "./wardrobeGarments";
import { corsetModelUrl } from "./wardrobe";
import { FITTING_BODY_URL } from "./standaloneCorset";

const DRIVER_TILT: [number, number, number] = [-.095, -.16, -.045];
const LEGACY_FITTING_BODY_URL = "/models/characters/wardrobe/gothic-02.mobile.glb";
type WardrobeAssetListener = (url: string, scene: Object3D | null) => void;
type VillagerPlayback = {
  bag: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit;
  victory?: VictoryPlayback; cockpit?: GarageCockpit; paused: boolean; upright: boolean;
};
type VillagerPreview = {
  look: CharacterLook; scene: Object3D; garments: WardrobeGarmentSource[]; garmentBody?: Object3D;
  corsetScene?: Object3D; corsetSet?: string;
};

function WardrobeAsset({ url, onReady }: { url: string; onReady: WardrobeAssetListener }) {
  const { scene } = useGLTF(url);
  useLayoutEffect(() => onReady(url, scene), [url, scene, onReady]);
  return null;
}

function MissingWardrobeAsset({ url, onReady }: { url: string; onReady: WardrobeAssetListener }) {
  useLayoutEffect(() => onReady(url, null), [url, onReady]);
  return null;
}

function MissingVillager({ cockpit }: { cockpit?: GarageCockpit }) {
  const waiting = useCharacterPreviewStore(s => Boolean(cockpit && s.insideCar));
  useEffect(() => {
    if (waiting) failCockpitPreview("The character model is unavailable.");
  }, [waiting]);
  return null;
}

function VillagerDriver({ url, look, compact, fallback, ...playback }: VillagerPlayback & {
  url: string; look: CharacterLook; compact: boolean; fallback: ReactNode;
}) {
  const [active, setActive] = useState<VillagerPreview>();
  const [sources, setSources] = useState<Partial<Record<string, Object3D | null>>>({});
  const onReady = useCallback<WardrobeAssetListener>((asset, loaded) => setSources(current => current[asset] === loaded
    ? current : { ...current, [asset]: loaded }), []);
  const kind = compact ? "portrait" : "garage";
  const preferredCorset = corsetModelUrl(look.corset, kind);
  const corsetUrl = preferredCorset && sources[preferredCorset] === null
    ? corsetModelUrl(look.corset, kind, { useStandalone: false }) ?? preferredCorset
    : preferredCorset;
  const requested = useMemo(() => Object.values(look.garments ?? {}).flatMap(id => {
    const item = getWardrobeGarment(id);
    if (!item) return [];
    const preferred = wardrobeGarmentModelUrl(item, kind);
    if (!preferred) return [];
    const loaded = sources[preferred];
    const brokenRevision = preferred === item.revisionUrl && loaded !== undefined
      && (!loaded || !hasWardrobeRevisionMesh(item, loaded));
    const url = brokenRevision ? wardrobeGarmentModelUrl(item, kind, { useRevision: false }) : preferred;
    return url ? [{ item, url }] : [];
  }), [look.garments, kind, sources]);
  const scene = sources[url];
  // The Village outfit cuts away skin under its clothes. Use the full skin only
  // for replacements that expose a different part of the body.
  const needsBody = Boolean(scene && !scene.getObjectByName("BODY_WARDROBE")
    && (corsetUrl || requested.some(({ item }) => replacesVillagerBody(item.slot)) || look.removedClothing.some(removalNeedsVillagerBody)));
  // A bundled fallback can supply the full body without a separate request.
  const loadedCorset = corsetUrl ? sources[corsetUrl] : undefined;
  const bundledCorset = corsetUrl?.startsWith("/models/characters/wardrobe/");
  const bundledBody = bundledCorset ? loadedCorset?.getObjectByName("BODY_WARDROBE") : undefined;
  const needsSeparateBody = needsBody && !bundledBody && !(bundledCorset && loadedCorset === undefined);
  const fittingBody = sources[FITTING_BODY_URL];
  const bodyUrl = fittingBody !== undefined && !fittingBody?.getObjectByName("BODY_WARDROBE")
    ? LEGACY_FITTING_BODY_URL : FITTING_BODY_URL;
  const urls = new Set([url, ...requested.map(item => item.url)]);
  if (needsSeparateBody) urls.add(bodyUrl);
  if (corsetUrl) urls.add(corsetUrl);
  const assetUrls = [...urls];
  const garmentBody = needsBody ? bundledBody ?? sources[bodyUrl]?.getObjectByName("BODY_WARDROBE") : undefined;
  const loading = assetUrls.some(asset => sources[asset] === undefined);
  const unavailable = assetUrls.some(asset => sources[asset] === null)
    || (needsSeparateBody && sources[bodyUrl] !== undefined && !garmentBody);

  // Keep the visible outfit mounted until the latest selection can replace it as a unit.
  // Resolutions for earlier selections can fill the cache without changing the preview.
  if (scene && !loading && (!unavailable || !active)) {
    const corsetScene = !needsBody || garmentBody ? loadedCorset ?? undefined : undefined;
    const corsetSet = corsetScene ? look.corset?.set : undefined;
    const garments = requested.flatMap(({ item, url }): WardrobeGarmentSource[] => {
      const source = sources[url];
      if (!source || (needsBody && !garmentBody && replacesVillagerBody(item.slot))) return [];
      return [{ item, scene: source, authoredFit: url === item.revisionUrl }];
    });
    const sameGarments = active?.garments.length === garments.length && garments.every((garment, index) => {
      const previous = active.garments[index];
      return previous.item === garment.item && previous.scene === garment.scene;
    });
    if (active?.look !== look || active.scene !== scene || active.garmentBody !== garmentBody
      || active.corsetScene !== corsetScene || active.corsetSet !== corsetSet || !sameGarments) {
      setActive({ look, scene, garments: sameGarments ? active.garments : garments, garmentBody, corsetScene, corsetSet });
    }
  }

  const status = scene === null ? "Character model unavailable"
    : loading ? "Loading garments" : unavailable ? "Garment unavailable" : undefined;
  return <>
    {assetUrls.map(asset => <AssetBoundary key={asset} fallback={<MissingWardrobeAsset url={asset} onReady={onReady} />}>
      <Suspense fallback={null}><WardrobeAsset url={asset} onReady={onReady} /></Suspense>
    </AssetBoundary>)}
    {active ? <>
      <AssetBoundary key={active.scene.uuid} fallback={fallback}>
        <ReadyVillager preview={active} {...playback} />
      </AssetBoundary>
      {status && <PreviewLoadingStatus label={status} />}
    </> : scene === null ? fallback : playback.victory ? <CharacterLoadingEffect />
      : <PreviewLoadingStatus label={scene ? "Loading garments" : "Loading driver"} />}
  </>;
}

function ReadyVillager({ preview, bag, previewPacks, leanFit, mirrorFit, victory, cockpit, paused, upright }: VillagerPlayback & { preview: VillagerPreview }) {
  const { look, scene, garments, garmentBody, corsetScene, corsetSet } = preview;
  const femaleWithBag = look.female && bag;
  const wetEyes = !victory;
  const fitted = usesFittedAnimation(look);
  const model = useMemo(() => prepareVillager(scene, {
    female: look.female, animateFace: true, bag: femaleWithBag, wetEyes, fitted, garments, garmentBody, removedClothing: look.removedClothing,
    corsetSource: corsetScene && corsetSet ? { set: corsetSet, scene: corsetScene } : undefined,
  }), [scene, look.female, look.removedClothing, femaleWithBag, wetEyes, fitted, garments, garmentBody, corsetScene, corsetSet]);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => model.dispose, [model]);
  useLayoutEffect(() => {
    applyVillagerLook(model, look);
    invalidate();
  }, [model, look, invalidate]);
  useLayoutEffect(() => {
    if (model.trialGarments && useCharacterPreviewStore.getState().camera === "Selected item") {
      useCharacterPreviewStore.setState(state => ({ focusRevision: state.focusRevision + 1 }));
    }
  }, [model]);

  return <group name="garage-driver" rotation={upright ? [0, 0, 0] : DRIVER_TILT}>
    <GarageEmotePlayer root={model.root} bag={bag} personality={look.appearance.personality} bagColors={clothingColors(look, "bag")} previewPacks={previewPacks} leanFit={leanFit} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} paused={paused} />
  </group>;
}

export function GarageDriver({ choice, previewPacks, leanFit, mirrorFit, victory, cockpit, upright = false, paused = false }: {
  choice: CharacterChoice; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit; victory?: VictoryPlayback; cockpit?: GarageCockpit; upright?: boolean; paused?: boolean;
}) {
  const look = useMemo(() => characterLook(choice), [choice]);
  const compact = useThree(s => isCompactPreview(s.size.width));
  if (!look) return null;
  const bag = choice.prop === "shop-bag";
  const coatFitsLean = choice.id === ROOK_ID && (choice.outfit === "night-run" || choice.outfit === "race-crew");
  const fallback = choice.id === VILLAGER_ID ? upright
    ? <Html center><p className="menu-control">Character model unavailable. Install the character assets with Git LFS.</p></Html>
    : <MissingVillager cockpit={cockpit} /> :
    <group name="garage-driver" rotation={upright ? [0, 0, 0] : DRIVER_TILT}><StylizedDriver look={look} bag={bag} previewPacks={previewPacks} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} paused={paused} /></group>;
  const url = villagerModelUrl(look, compact && choice.id === VILLAGER_ID ? "portrait" : "garage");
  return (
    <CharacterTurntable enabled={Boolean(previewPacks)}>
      {url
        ? <VillagerDriver key={choice.id} url={url} look={look} compact={compact} fallback={fallback} bag={bag}
            previewPacks={previewPacks} leanFit={coatFitsLean ? leanFit : undefined} mirrorFit={mirrorFit}
            victory={victory} cockpit={cockpit} paused={paused} upright={upright} />
        : fallback}
    </CharacterTurntable>
  );
}
