import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { VILLAGER_ID, characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { StylizedDriver } from "./StylizedDriver";
import { GarageEmotePlayer, type VictoryPlayback } from "./GarageEmotePlayer";
import { CharacterLoadingEffect } from "./CharacterLoadingEffect";
import { applyVillagerLook, prepareVillager, villagerModelUrl } from "./villagerModel";

function VillagerDriver({ url, look, bag, previewVictory, victory }: {
  url: string; look: CharacterLook; bag: boolean; previewVictory?: boolean; victory?: VictoryPlayback;
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => prepareVillager(scene, { female: look.female, animateFace: true }), [scene, look.female]);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => model.dispose, [model]);
  useLayoutEffect(() => {
    applyVillagerLook(model, look);
    invalidate();
  }, [model, look, invalidate]);

  return <GarageEmotePlayer root={model.root} bag={bag} previewVictory={previewVictory} victory={victory} />;
}

export function GarageDriver({ choice, previewVictory, victory }: {
  choice: CharacterChoice; previewVictory?: boolean; victory?: VictoryPlayback;
}) {
  const look = useMemo(() => characterLook(choice), [choice]);
  if (!look) return null;
  const bag = choice.prop === "shop-bag";
  const fallback = choice.id === VILLAGER_ID ? null : <StylizedDriver look={look} bag={bag} previewVictory={previewVictory} victory={victory} />;
  const url = villagerModelUrl(look);
  return (
    <group name="garage-driver" rotation={[-.095, -.16, -.045]}>
      {url
        ? <AssetBoundary key={url} fallback={fallback}>
            <Suspense fallback={<CharacterLoadingEffect />}><VillagerDriver url={url} look={look} bag={bag} previewVictory={previewVictory} victory={victory} /></Suspense>
          </AssetBoundary>
        : fallback}
    </group>
  );
}
