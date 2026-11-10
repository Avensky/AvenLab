import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { ROOK_ID, VILLAGER_ID, characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { StylizedDriver } from "./StylizedDriver";
import { GarageEmotePlayer, type VictoryPlayback } from "./GarageEmotePlayer";
import { CharacterLoadingEffect } from "./CharacterLoadingEffect";
import { applyVillagerLook, prepareVillager, villagerModelUrl } from "./villagerModel";
import type { GarageLeanFit } from "./garageLean";
import type { GarageCockpit } from "../preview/garageCockpit";
import { PreviewLoadingSeal } from "../preview/PreviewLoadingSeal";
import { isCompactPreview } from "../preview/previewBudget";

function VillagerDriver({ url, look, bag, previewPacks, leanFit, victory, cockpit }: {
  url: string; look: CharacterLook; bag: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; victory?: VictoryPlayback; cockpit?: GarageCockpit;
}) {
  const { scene } = useGLTF(url);
  const femaleWithBag = look.female && bag;
  const wetEyes = !victory;
  const model = useMemo(() => prepareVillager(scene, { female: look.female, animateFace: true, bag: femaleWithBag, wetEyes }),
    [scene, look.female, femaleWithBag, wetEyes]);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => model.dispose, [model]);
  useLayoutEffect(() => {
    applyVillagerLook(model, look);
    invalidate();
  }, [model, look, invalidate]);

  return <GarageEmotePlayer root={model.root} bag={bag} previewPacks={previewPacks} leanFit={leanFit} victory={victory} cockpit={cockpit} />;
}

export function GarageDriver({ choice, previewPacks, leanFit, victory, cockpit }: {
  choice: CharacterChoice; previewPacks?: boolean; leanFit?: GarageLeanFit; victory?: VictoryPlayback; cockpit?: GarageCockpit;
}) {
  const look = useMemo(() => characterLook(choice), [choice]);
  const compact = useThree(s => isCompactPreview(s.size.width));
  if (!look) return null;
  const bag = choice.prop === "shop-bag";
  const coatFitsLean = choice.id === ROOK_ID && (choice.outfit === "night-run" || choice.outfit === "race-crew");
  const fallback = choice.id === VILLAGER_ID ? null : <StylizedDriver look={look} bag={bag} previewPacks={previewPacks} victory={victory} cockpit={cockpit} />;
  const url = villagerModelUrl(look, compact && choice.id === VILLAGER_ID && !victory ? "portrait" : "garage");
  return (
    <group name="garage-driver" rotation={[-.095, -.16, -.045]}>
      {url
        ? <AssetBoundary key={url} fallback={fallback}>
            <Suspense fallback={<><PreviewLoadingSeal label="Summoning driver" />{!compact && <CharacterLoadingEffect />}</>}><VillagerDriver url={url} look={look} bag={bag} previewPacks={previewPacks}
              leanFit={coatFitsLean ? leanFit : undefined} victory={victory} cockpit={cockpit} /></Suspense>
          </AssetBoundary>
        : fallback}
    </group>
  );
}
