import { Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { StylizedDriver } from "./StylizedDriver";
import { GarageEmotePlayer } from "./GarageEmotePlayer";
import { applyVillagerLook, prepareVillager, villagerModelUrl } from "./villagerModel";

function VillagerDriver({ url, look }: { url: string; look: CharacterLook }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => prepareVillager(scene), [scene]);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => model.dispose, [model]);
  useLayoutEffect(() => {
    applyVillagerLook(model, look);
    invalidate();
  }, [model, look, invalidate]);

  return <GarageEmotePlayer root={model.root} />;
}

export function GarageDriver({ choice }: { choice: CharacterChoice }) {
  const look = useMemo(() => characterLook(choice), [choice]);
  if (!look) return null;
  const fallback = <StylizedDriver look={look} />;
  const url = villagerModelUrl(look);
  return (
    <group name="garage-driver" rotation={[-.095, -.16, -.045]}>
      {url
        ? <AssetBoundary fallback={fallback}>
            <Suspense fallback={null}><VillagerDriver url={url} look={look} /></Suspense>
          </AssetBoundary>
        : fallback}
    </group>
  );
}
