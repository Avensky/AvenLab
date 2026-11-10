import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { StylizedDriver } from "./StylizedDriver";
import { GarageEmotePlayer } from "./GarageEmotePlayer";
import { CharacterLoadingEffect } from "./CharacterLoadingEffect";
import { applyVillagerLook, prepareVillager, villagerModelUrl } from "./villagerModel";

function VillagerDriver({ url, look, bag }: { url: string; look: CharacterLook; bag: boolean }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => prepareVillager(scene, { female: look.female, animateFace: true }), [scene, look.female]);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => model.dispose, [model]);
  useLayoutEffect(() => {
    applyVillagerLook(model, look);
    invalidate();
  }, [model, look, invalidate]);

  return <GarageEmotePlayer root={model.root} bag={bag} />;
}

export function GarageDriver({ choice }: { choice: CharacterChoice }) {
  const look = useMemo(() => characterLook(choice), [choice]);
  if (!look) return null;
  const bag = choice.prop === "shop-bag";
  const fallback = <StylizedDriver look={look} bag={bag} />;
  const url = villagerModelUrl(look);
  return (
    <group name="garage-driver" rotation={[-.095, -.16, -.045]}>
      {url
        ? <AssetBoundary fallback={fallback}>
            <Suspense fallback={<CharacterLoadingEffect />}><VillagerDriver url={url} look={look} bag={bag} /></Suspense>
          </AssetBoundary>
        : fallback}
    </group>
  );
}
