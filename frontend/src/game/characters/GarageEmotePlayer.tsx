import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, LoopOnce, MathUtils, type AnimationAction, type Object3D } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { AUTOMATIC_GARAGE_EMOTE_IDS, buildEmoteClips, buildGarageEmotes, GARAGE_EMOTES } from "./garageEmotes";
import { driverFaceTargets } from "./villagerFace";
import { useCharacterPreviewStore } from "./characterPreviewStore";
import { DriverBag } from "./DriverBag";
import { availableVictoryEmotes, type VictoryEmoteId } from "./victoryEmotes";
import { GARAGE_LEAN_ID, type GarageLeanFit } from "./garageLean";
import { COCKPIT_TAKES, type CockpitTake } from "./cockpitEmotes";
import type { CockpitPlayback, GarageCockpit } from "../preview/garageCockpit";
import { garageHoldEmotes } from "./garageHolds";

const REST_SECONDS = 4.5;
const FADE_SECONDS = .24;

export type VictoryPlayback = { id: VictoryEmoteId; onFinish: () => void };

type IdleRotation = { idle: AnimationAction; holds: AnimationAction[]; holdIndex: number };

function selectHold(rotation: IdleRotation, index: number) {
  if (rotation.holdIndex === index) return;
  rotation.idle.stop();
  rotation.holdIndex = index;
  rotation.idle = rotation.holds[index].reset().play();
}

function nextHold(rotation: IdleRotation) {
  selectHold(rotation, (rotation.holdIndex + 1) % rotation.holds.length);
}

function setBlinkWeight(targets: ReturnType<typeof driverFaceTargets>, weight: number) {
  for (const { mesh, index } of targets) mesh.morphTargetInfluences![index] = weight;
}

export function GarageEmotePlayer({ root, bag = false, previewPacks = false, leanFit, victory, cockpit }: {
  root: Object3D; bag?: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; victory?: VictoryPlayback; cockpit?: GarageCockpit;
}) {
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const player = useRef<IdleRotation & {
    mixer: AnimationMixer;
    actions: Map<string, AnimationAction>;
    automatic: AnimationAction[];
    active: AnimationAction | null;
    cabin: CockpitPlayback | null;
    take: { clip: CockpitTake; seconds: number } | null;
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
    const celebration = victory && availableVictoryEmotes(bag).find(emote => emote.id === victory.id);
    const [breathing, ...clips] = victory
      ? buildEmoteClips(root, celebration ? [GARAGE_EMOTES[0], celebration] : [GARAGE_EMOTES[0]])
      : buildGarageEmotes(root, bag, previewPacks, leanFit);
    const idle = mixer.clipAction(breathing).play();
    const holds = victory ? [idle] : [idle, ...buildEmoteClips(root, garageHoldEmotes(bag)).map(clip => mixer.clipAction(clip))];
    const actions = new Map(clips.map(clip => [clip.name.split(" ")[0], mixer.clipAction(clip).setLoop(LoopOnce, 1)]));
    actions.set("001", mixer.clipAction(breathing.clone()).setLoop(LoopOnce, 1));
    const automatic = bag ? [...actions].filter(([id]) => id.startsWith("bag-")).map(([, action]) => action)
      : AUTOMATIC_GARAGE_EMOTE_IDS.flatMap(id => actions.get(id) ?? []);
    const lean = actions.get(GARAGE_LEAN_ID);
    if (lean) automatic.splice(2, 0, lean);
    const blink = driverFaceTargets(root, "blink");
    const active = celebration ? actions.get(celebration.id)!.reset().setEffectiveWeight(0).play() : null;
    player.current = { mixer, idle, holds, holdIndex: 0, actions, automatic, active, cabin: null, take: null, rest: REST_SECONDS, next: 0, wave: false, blink, elapsed: 0, preview: null };
    return () => {
      player.current?.cabin?.stop();
      player.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      setBlinkWeight(blink, 0);
    };
  }, [reducedMotion, root, bag, previewPacks, leanFit, victory, cockpit]);

  useFrame((_, delta) => {
    const current = player.current;
    if (!current) return;
    const step = Math.min(delta, .1);
    if (current.blink.length) {
      current.elapsed += step;
      const phase = current.elapsed % 8.2;
      const age = phase - (phase < 4 ? 2.4 : 6.15);
      const blink = MathUtils.smoothstep(age, 0, .066) * (1 - MathUtils.smoothstep(age, .075, .19));
      setBlinkWeight(current.blink, blink);
    }
    const view = useCharacterPreviewStore.getState();
    const preview = previewPacks ? view.emote : null;
    if (cockpit && previewPacks && view.cockpitAvailable && view.insideCar && !bag && !victory) {
      if (!current.cabin) {
        current.active?.stop();
        current.active = null;
        current.idle.stop();
        current.wave = false;
        current.preview = null;
        current.cabin = cockpit(root);
        if (!current.cabin) {
          current.idle.reset().setEffectiveWeight(1).play();
          useCharacterPreviewStore.setState({ insideCar: false, emote: null });
          return;
        }
      }
      if (preview !== current.preview) {
        current.preview = preview;
        const clip = COCKPIT_TAKES.find(take => take.id === preview?.id);
        current.take = clip ? { clip, seconds: 0 } : null;
      }
      const take = current.take;
      if (take) {
        take.seconds += step;
        if (take.seconds >= take.clip.duration) current.take = null;
      }
      current.cabin.sample(current.take?.clip.id ?? null, current.take ? current.take.seconds / current.take.clip.duration : 0);
      return;
    }
    if (current.cabin) {
      current.cabin.stop();
      current.cabin = null;
      current.take = null;
      current.preview = null;
      current.idle.reset().setEffectiveWeight(1).play();
      current.rest = REST_SECONDS;
    }
    const inspectingFace = previewPacks && view.camera === "Face" && !preview;
    if (inspectingFace) {
      current.active?.stop();
      current.active = null;
      current.rest = REST_SECONDS;
      selectHold(current, 0);
      current.idle.setEffectiveWeight(1);
    }
    if (!victory && preview !== current.preview) {
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
      // Swap the held stance while the gesture owns the full pose, before fading out.
      if (!victory && active.time < duration - FADE_SECONDS && time >= duration - FADE_SECONDS) nextHold(current);
      if (time >= duration) {
        active.stop();
        current.active = null;
        current.rest = REST_SECONDS;
        current.idle.setEffectiveWeight(1);
        victory?.onFinish();
      } else {
        const weight = MathUtils.smoothstep(Math.min(time, duration - time), 0, FADE_SECONDS);
        active.setEffectiveWeight(weight);
        current.idle.setEffectiveWeight(1 - weight);
      }
    } else if (!victory && !inspectingFace) {
      current.rest -= step;
      if (current.wave || current.rest <= 0) {
        const action = current.wave ? current.actions.get("010")! : current.automatic[current.next];
        if (!current.wave) current.next = (current.next + 1) % current.automatic.length;
        current.wave = false;
        current.active = action.reset().setEffectiveWeight(0).play();
      }
    }
    current.mixer.update(step);
  }, cockpit ? -.5 : 0);

  return <group onClick={event => {
    if (victory || !player.current || player.current.cabin || event.delta > 5) return;
    event.stopPropagation();
    player.current.wave = true;
  }}>
    <primitive object={root} dispose={null} />
    {bag && <DriverBag driver={root} />}
  </group>;
}
