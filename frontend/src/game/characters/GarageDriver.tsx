import type { MirrorCheckFit } from "./mirrorCheck";
import { CharacterTurntable } from "./CharacterTurntable";
import { usesFittedAnimation } from "./animationFit";
import { clothingColors } from "./clothingPieces";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
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
import { useCommittedResource } from "./useCommittedResource";
import type { WardrobeRemoval } from "./wardrobeGarments";
import { resolveWardrobePreview, type WardrobeAssetSources, type WardrobeAssetTier, type WardrobePreview } from "./wardrobePreviewAssets";

const DRIVER_TILT: [number, number, number] = [-.095, -.16, -.045];
type WardrobeAssetListener = (url: string, scene: Object3D | null) => void;
type VillagerPlayback = {
  bag: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit;
  victory?: VictoryPlayback; cockpit?: GarageCockpit; paused: boolean; upright: boolean;
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

function VillagerDriver({ url: preferredUrl, look, kind, villageKind, fallback, ...playback }: VillagerPlayback & {
  url: string; look: CharacterLook; kind: WardrobeAssetTier; villageKind: WardrobeAssetTier; fallback: ReactNode;
}) {
  const [active, setActive] = useState<WardrobePreview>();
  const [sources, setSources] = useState<WardrobeAssetSources>({});
  const onReady = useCallback<WardrobeAssetListener>((asset, loaded) => setSources(current => current[asset] === loaded
    ? current : { ...current, [asset]: loaded }), []);
  const { scene, pendingUrls, unavailable, preview } = useMemo(() => resolveWardrobePreview({
    preferredUrl, look, kind, villageKind, sources, previous: active,
  }), [preferredUrl, look, kind, villageKind, sources, active]);
  if (preview !== active) setActive(preview);

  const status = scene === null ? "Character model unavailable"
    : pendingUrls.length ? "Loading garments" : unavailable ? "Garment unavailable" : undefined;
  return <>
    {pendingUrls.map(asset => <AssetBoundary key={asset} fallback={<MissingWardrobeAsset url={asset} onReady={onReady} />}>
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

function HighCollarMotion({ update }: { update: () => void }) {
  // The emote mixer and cockpit IK both run at a negative frame priority.
  useFrame(update, 0);
  return null;
}

function ReadyVillager({ preview, bag, previewPacks, leanFit, mirrorFit, victory, cockpit, paused, upright }: VillagerPlayback & { preview: WardrobePreview }) {
  const { look, scene, garments, garmentBody, corsetScene, corsetSet } = preview;
  const femaleWithBag = look.female && bag;
  const wetEyes = !victory;
  const fitted = usesFittedAnimation(look);
  // Appearance edits can recreate the removal array without changing the rig.
  const removalKey = [...look.removedClothing].sort().join(",");
  const removedClothing = useMemo(() => removalKey ? removalKey.split(",") as WardrobeRemoval[] : [], [removalKey]);
  const createModel = useCallback(() => prepareVillager(scene, {
    female: look.female, animateFace: true, bag: femaleWithBag, wetEyes, fitted, garments, garmentBody, removedClothing,
    corsetSource: corsetScene && corsetSet ? { set: corsetSet, scene: corsetScene } : undefined,
  }), [scene, look.female, removedClothing, femaleWithBag, wetEyes, fitted, garments, garmentBody, corsetScene, corsetSet]);
  const model = useCommittedResource(createModel);
  return model ? <PreparedVillager model={model} look={look} bag={bag} previewPacks={previewPacks}
    leanFit={leanFit} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} paused={paused} upright={upright} /> : null;
}

function PreparedVillager({ model, look, bag, previewPacks, leanFit, mirrorFit, victory, cockpit, paused, upright }:
  VillagerPlayback & { model: ReturnType<typeof prepareVillager>; look: CharacterLook }) {
  const invalidate = useThree(s => s.invalidate);
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
    {model.detachedCorset?.updateShoulders && <HighCollarMotion update={model.detachedCorset.updateShoulders} />}
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
  const kind = compact ? "portrait" : "garage";
  // The portrait export has the original mesh and rig with smaller textures.
  const villageKind = victory ? kind : "portrait";
  const url = villagerModelUrl(look, choice.id === VILLAGER_ID ? kind : "garage", villageKind);
  return (
    <CharacterTurntable enabled={Boolean(previewPacks)}>
      {url
        ? <VillagerDriver key={choice.id} url={url} look={look} kind={kind} villageKind={villageKind} fallback={fallback} bag={bag}
            previewPacks={previewPacks} leanFit={coatFitsLean ? leanFit : undefined} mirrorFit={mirrorFit}
            victory={victory} cockpit={cockpit} paused={paused} upright={upright} />
        : fallback}
    </CharacterTurntable>
  );
}
