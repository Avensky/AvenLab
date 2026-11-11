import type { MirrorCheckFit } from "./mirrorCheck";
import { CharacterTurntable } from "./CharacterTurntable";
import { usesFittedAnimation } from "./animationFit";
import { clothingColors } from "./clothingPieces";
import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { Html, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
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

const DRIVER_TILT: [number, number, number] = [-.095, -.16, -.045];

function MissingVillager({ cockpit }: { cockpit?: GarageCockpit }) {
  const waiting = useCharacterPreviewStore(s => Boolean(cockpit && s.insideCar));
  useEffect(() => {
    if (waiting) failCockpitPreview("The character model is unavailable.");
  }, [waiting]);
  return null;
}

function VillagerDriver({ url, look, bag, previewPacks, leanFit, mirrorFit, victory, cockpit }: {
  url: string; look: CharacterLook; bag: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit; victory?: VictoryPlayback; cockpit?: GarageCockpit;
}) {
  const { scene } = useGLTF(url);
  const femaleWithBag = look.female && bag;
  const wetEyes = !victory;
  const fitted = usesFittedAnimation(look);
  const model = useMemo(() => prepareVillager(scene, { female: look.female, animateFace: true, bag: femaleWithBag, wetEyes, fitted }),
    [scene, look.female, femaleWithBag, wetEyes, fitted]);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => model.dispose, [model]);
  useLayoutEffect(() => {
    applyVillagerLook(model, look);
    invalidate();
  }, [model, look, invalidate]);

  return <GarageEmotePlayer root={model.root} bag={bag} personality={look.appearance.personality} bagColors={clothingColors(look, "bag")} previewPacks={previewPacks} leanFit={leanFit} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} />;
}

export function GarageDriver({ choice, previewPacks, leanFit, mirrorFit, victory, cockpit, upright = false }: {
  choice: CharacterChoice; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit; victory?: VictoryPlayback; cockpit?: GarageCockpit; upright?: boolean;
}) {
  const look = useMemo(() => characterLook(choice), [choice]);
  const compact = useThree(s => isCompactPreview(s.size.width));
  if (!look) return null;
  const bag = choice.prop === "shop-bag";
  const coatFitsLean = choice.id === ROOK_ID && (choice.outfit === "night-run" || choice.outfit === "race-crew");
  const fallback = choice.id === VILLAGER_ID ? upright
    ? <Html center><p className="menu-control">Character model unavailable. Install the character assets with Git LFS.</p></Html>
    : <MissingVillager cockpit={cockpit} /> :
    <group name="garage-driver" rotation={upright ? [0, 0, 0] : DRIVER_TILT}><StylizedDriver look={look} bag={bag} previewPacks={previewPacks} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} /></group>;
  const url = villagerModelUrl(look, compact && choice.id === VILLAGER_ID ? "portrait" : "garage");
  return (
    <CharacterTurntable enabled={Boolean(previewPacks)}>
      {url
        ? <AssetBoundary key={url} fallback={fallback}>
            <Suspense fallback={victory ? <CharacterLoadingEffect /> : <PreviewLoadingStatus label="Loading driver" />}>
              <group name="garage-driver" rotation={upright ? [0, 0, 0] : DRIVER_TILT}>
                <VillagerDriver url={url} look={look} bag={bag} previewPacks={previewPacks}
                  leanFit={coatFitsLean ? leanFit : undefined} mirrorFit={mirrorFit} victory={victory} cockpit={cockpit} />
              </group>
            </Suspense>
          </AssetBoundary>
        : fallback}
    </CharacterTurntable>
  );
}
