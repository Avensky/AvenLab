import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, LoopOnce, MathUtils, type AnimationAction, type Object3D } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { buildGarageEmotes } from "./garageEmotes";

const REST_SECONDS = 4.5;
const FADE_SECONDS = .24;

export function GarageEmotePlayer({ root }: { root: Object3D }) {
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const player = useRef<{
    mixer: AnimationMixer;
    idle: AnimationAction;
    actions: AnimationAction[];
    active: AnimationAction | null;
    rest: number;
    next: number;
    wave: boolean;
  }>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const mixer = new AnimationMixer(root);
    const [breathing, ...clips] = buildGarageEmotes(root);
    const idle = mixer.clipAction(breathing).play();
    const actions = clips.map(clip => mixer.clipAction(clip).setLoop(LoopOnce, 1));
    player.current = { mixer, idle, actions, active: null, rest: REST_SECONDS, next: 0, wave: false };
    return () => {
      player.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    };
  }, [reducedMotion, root]);

  useFrame((_, delta) => {
    const current = player.current;
    if (!current) return;
    const step = Math.min(delta, .1);
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
        const index = current.wave ? current.actions.length - 1 : current.next;
        if (!current.wave) current.next = (current.next + 1) % (current.actions.length - 1);
        current.wave = false;
        current.active = current.actions[index].reset().setEffectiveWeight(0).play();
      }
    }
    current.mixer.update(step);
  });

  return <group onClick={event => {
    if (!player.current || event.delta > 5) return;
    event.stopPropagation();
    player.current.wave = true;
  }}>
    <primitive object={root} dispose={null} />
  </group>;
}
