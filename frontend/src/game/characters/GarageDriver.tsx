import type { MirrorCheckFit } from "./mirrorCheck";
import { CharacterTurntable } from "./CharacterTurntable";
import { usesFittedAnimation } from "./animationFit";
import { clothingColors } from "./clothingPieces";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
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
import { replacesVillagerBody, type WardrobeGarmentSource } from "./wardrobeGarmentFit";
import { getWardrobeGarment, wardrobeGarmentModelUrl } from "./wardrobeGarments";
import { corsetModelUrl } from "./wardrobe";
import { FITTING_BODY_URL } from "./standaloneCorset";

const DRIVER_TILT: [number, number, number] = [-.095, -.16, -.045];
const LEGACY_FITTING_BODY_URL = "/models/characters/wardrobe/gothic-02.mobile.glb";
type WardrobeAssetListener = (url: string, scene: Object3D | null) => void;

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

function VillagerDriver({ url, look, compact, bag, previewPacks, leanFit, mirrorFit, victory, cockpit, paused }: {
  url: string; look: CharacterLook; compact: boolean; bag: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit; victory?: VictoryPlayback; cockpit?: GarageCockpit; paused?: boolean;
}) {
  const { scene } = useGLTF(url);
  const [sources, setSources] = useState<Partial<Record<string, Object3D | null>>>({});
  const onReady = useCallback<WardrobeAssetListener>((asset, loaded) => setSources(current => current[asset] === loaded
    ? current : { ...current, [asset]: loaded }), []);
  const corsetUrl = corsetModelUrl(look.corset, compact ? "portrait" : "garage");
  const requested = useMemo(() => Object.values(look.garments ?? {}).flatMap(id => {
    const item = getWardrobeGarment(id);
    const url = item && wardrobeGarmentModelUrl(item, compact ? "portrait" : "garage");
    return item && url ? [{ item, url }] : [];
  }), [look.garments, compact]);
  // The Village outfit cuts away skin under its clothes. Use the full skin only
  // for replacements that expose a different part of the body.
  const needsBody = !scene.getObjectByName("BODY_WARDROBE") && (Boolean(corsetUrl) || requested.some(({ item }) => replacesVillagerBody(item.slot)));
  const bodyUrl = sources[FITTING_BODY_URL] === null ? LEGACY_FITTING_BODY_URL : FITTING_BODY_URL;
  const assetUrls = requested.map(item => item.url);
  if (needsBody) assetUrls.push(bodyUrl);
  if (corsetUrl) assetUrls.push(corsetUrl);
  const garmentBody = needsBody ? sources[bodyUrl]?.getObjectByName("BODY_WARDROBE") : undefined;
  const corsetScene = corsetUrl && (!needsBody || garmentBody) ? sources[corsetUrl] : undefined;
  const corsetSet = look.corset?.set;
  const garments = useMemo(() => requested.flatMap(({ item, url }): WardrobeGarmentSource[] => {
    const source = sources[url];
    if (!source || (needsBody && !garmentBody && replacesVillagerBody(item.slot))) return [];
    return [{ item, scene: source }];
  }), [requested, sources, needsBody, garmentBody]);
  const femaleWithBag = look.female && bag;
  const wetEyes = !victory;
  const fitted = usesFittedAnimation(look);
  const model = useMemo(() => prepareVillager(scene, {
    female: look.female, animateFace: true, bag: femaleWithBag, wetEyes, fitted, garments, garmentBody,
    corsetSource: corsetScene && corsetSet ? { set: corsetSet, scene: corsetScene } : undefined,
  }), [scene, look.female, femaleWithBag, wetEyes, fitted, garments, garmentBody, corsetScene, corsetSet]);
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

  const status = assetUrls.some(asset => sources[asset] === null) ? "Garment unavailable"
    : assetUrls.some(asset => sources[asset] === undefined) ? "Loading garments" : undefined;
  return <>
    {assetUrls.map(asset => <AssetBoundary key={asset} fallback={<MissingWardrobeAsset url={asset} onReady={onReady} />}>
      <Suspense fallback={null}><WardrobeAsset url={asset} onReady={onReady} /></Suspense>
    </AssetBoundary>)}
    <GarageEmotePlayer root={model.root} bag={bag} personality={look.appearance.personality} bagColors={clothingColors(look, "bag")} previewPacks={previewPacks} leanFit={leanFit} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} paused={paused} />
    {status && <PreviewLoadingStatus label={status} />}
  </>;
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
        ? <AssetBoundary key={url} fallback={fallback}>
            <Suspense fallback={victory ? <CharacterLoadingEffect /> : <PreviewLoadingStatus label="Loading driver" />}>
              <group name="garage-driver" rotation={upright ? [0, 0, 0] : DRIVER_TILT}>
                <VillagerDriver url={url} look={look} compact={compact} bag={bag} previewPacks={previewPacks}
                  leanFit={coatFitsLean ? leanFit : undefined} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} paused={paused} />
              </group>
            </Suspense>
          </AssetBoundary>
        : fallback}
    </CharacterTurntable>
  );
}
