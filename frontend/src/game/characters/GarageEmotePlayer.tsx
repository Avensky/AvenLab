import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, LoopOnce, MathUtils, type AnimationAction, type Object3D } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { buildGarageEmotes } from "./garageEmotes";
import { driverFaceTargets } from "./villagerFace";
import { useCharacterPreviewStore } from "./characterPreviewStore";
import { DriverBag } from "./DriverBag";

const REST_SECONDS = 4.5;
const FADE_SECONDS = .24;

export function GarageEmotePlayer({ root, bag = false }: { root: Object3D; bag?: boolean }) {
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const player = useRef<{
    mixer: AnimationMixer;
    idle: AnimationAction;
    actions: Map<string, AnimationAction>;
    automatic: AnimationAction[];
    active: AnimationAction | null;
    rest: number;
    next: number;
    wave: boolean;
    blink: ReturnType<typeof driverFaceTargets>;
    elapsed: number;
    preview: ReturnType<typeof useCharacterPreviewStore.getState>["emote"];
  }>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const mixer = new AnimationMixer(root);
    const [breathing, ...clips] = buildGarageEmotes(root, bag);
    const idle = mixer.clipAction(breathing).play();
    const actions = new Map(clips.map(clip => [clip.name.split(" ")[0], mixer.clipAction(clip).setLoop(LoopOnce, 1)]));
    actions.set("001", mixer.clipAction(breathing.clone()).setLoop(LoopOnce, 1));
    const automatic = [...actions].filter(([id]) => bag ? id.startsWith("bag-") : id !== "001" && id !== "010").map(([, action]) => action);
    const blink = driverFaceTargets(root, "blink");
    player.current = { mixer, idle, actions, automatic, active: null, rest: REST_SECONDS, next: 0, wave: false, blink, elapsed: 0, preview: null };
    return () => {
      player.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      for (const { mesh, index } of blink) mesh.morphTargetInfluences![index] = 0;
    };
  }, [reducedMotion, root, bag]);

  useFrame((_, delta) => {
    const current = player.current;
    if (!current) return;
    const step = Math.min(delta, .1);
    const preview = useCharacterPreviewStore.getState().emote;
    if (preview !== current.preview) {
      current.preview = preview;
      const action = preview && current.actions.get(preview.id);
      if (action) {
        current.active?.stop();
        current.active = action.reset().setEffectiveWeight(0).play();
        current.idle.setEffectiveWeight(1);
      }
    }
    if (current.active) {
      const active = current.active;
      const duration = active.getClip().duration;
      const time = active.time + step;
      if (time >= duration) {
        active.stop();
        current.active = null;
        current.rest = REST_SECONDS;
        current.idle.setEffectiveWeight(1);
      } else {
        const weight = MathUtils.smoothstep(Math.min(time, duration - time), 0, FADE_SECONDS);
        active.setEffectiveWeight(weight);
        current.idle.setEffectiveWeight(1 - weight);
      }
    } else {
      current.rest -= step;
      if (current.wave || current.rest <= 0) {
        const action = current.wave ? current.actions.get("010")! : current.automatic[current.next];
        if (!current.wave) current.next = (current.next + 1) % current.automatic.length;
        current.wave = false;
        current.active = action.reset().setEffectiveWeight(0).play();
      }
    }
    current.mixer.update(step);
    if (current.blink.length) {
      current.elapsed += step;
      const phase = current.elapsed % 8.2;
      const age = phase - (phase < 4 ? 2.4 : 6.15);
      const blink = MathUtils.smoothstep(age, 0, .066) * (1 - MathUtils.smoothstep(age, .075, .19));
      for (const { mesh, index } of current.blink) mesh.morphTargetInfluences![index] = blink;
    }
  });

  return <group onClick={event => {
    if (!player.current || event.delta > 5) return;
    event.stopPropagation();
    player.current.wave = true;
  }}>
    <primitive object={root} dispose={null} />
    {bag && <DriverBag driver={root} />}
  </group>;
}
