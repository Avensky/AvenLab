import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils } from "three";
import { AssetBoundary } from "../../components/debugger/AssetBoundary";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { characterLook, type CharacterChoice, type CharacterLook } from "./characterCatalog";
import { StylizedDriver } from "./StylizedDriver";
import { applyVillagerLook, prepareVillager, villagerIdlePose, villagerModelUrl } from "./villagerModel";

const WAVE_DURATION = 1.6;

function VillagerDriver({ url, look }: { url: string; look: CharacterLook }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => prepareVillager(scene), [scene]);
  const pose = useMemo(() => villagerIdlePose(model.root), [model]);
  const reducedMotion = usePreferencesStore(s => s.reducedMotion);
  const clock = useThree(s => s.clock);
  const invalidate = useThree(s => s.invalidate);
  const waveStart = useRef(-Infinity);
  useEffect(() => model.dispose, [model]);
  useLayoutEffect(() => {
    applyVillagerLook(model, look);
    invalidate();
  }, [model, look, invalidate]);

  useFrame(({ clock: frameClock }) => {
    const time = frameClock.elapsedTime;
    const waveAge = reducedMotion ? Infinity : time - waveStart.current;
    const waveStrength = MathUtils.smoothstep(waveAge, 0, .32) * (1 - MathUtils.smoothstep(waveAge, 1.15, WAVE_DURATION));
    for (const { bone, rest, phase } of pose.idle) {
      const idle = reducedMotion ? 0 : .045 * Math.sin(time * 1.7 + phase);
      const wave = bone.name === "hand_r" && waveStrength > 0 ? .42 * waveStrength * Math.sin(waveAge * 15) : 0;
      bone.quaternion.copy(rest);
      bone.rotateZ(idle + wave);
    }
    for (const { bone, rest, target } of pose.wave) {
      // The forearm already has its idle rotation when the wave is at rest.
      if (bone.name === "upperarm_r") bone.quaternion.copy(rest);
      if (waveStrength > 0) bone.quaternion.slerp(target, waveStrength);
    }
  });

  return (
    <group onClick={event => {
      if (event.delta > 5 || reducedMotion || clock.elapsedTime - waveStart.current < WAVE_DURATION) return;
      event.stopPropagation();
      waveStart.current = clock.elapsedTime;
    }}>
      <primitive object={model.root} dispose={null} />
    </group>
  );
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
