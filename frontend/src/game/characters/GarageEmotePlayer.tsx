import { MIRROR_CHECK_ID, mirrorCheckPose, type MirrorCheckFit } from "./mirrorCheck";
import { useFittingTurnStore } from "./fittingControlsStore";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AnimationMixer, LoopOnce, MathUtils, type AnimationAction, type Group, type Object3D } from "three";
import { usePreferencesStore } from "../../store/preferences/preferencesStore";
import { AUTOMATIC_GARAGE_EMOTE_IDS, buildEmoteClips, buildGarageEmotes, findGaragePreviewEmote, garageBreathing } from "./garageEmotes";
import { driverFaceTargets } from "./villagerFace";
import { failCockpitPreview, useCharacterPreviewStore } from "./characterPreviewStore";
import { DriverBag } from "./DriverBag";
import { availableVictoryEmotes, type VictoryEmoteId } from "./victoryEmotes";
import { GARAGE_LEAN_ID, garageLeanPose, type GarageLeanFit } from "./garageLean";
import { COCKPIT_TAKES, type CockpitTake } from "./cockpitEmotes";
import { createEmoteProp, type EmoteProp, type EmotePropModel } from "./emoteProps";
import { bindFlagPoleGrip } from "./flagPoleGrip";
import type { CockpitPlayback, GarageCockpit } from "../preview/garageCockpit";
import { DRIVE_OUT_DURATION, GARAGE_ENTRY_DURATION, sampleDriveOut } from "../preview/garageDriveMotion";
import { useGarageDrive } from "../preview/garageDriveStore";

import { personalityEmote, type CharacterPersonality } from "./characterPersonality";
import type { PieceColors } from "./clothingPieces";
import { keepHeldProp } from "./emotePropNotes";

const FADE_SECONDS = .52;

export type VictoryPlayback = { id: VictoryEmoteId; onFinish: () => void };

type CabinState = {
  cabin: CockpitPlayback | null;
  driveSeconds: number;
  take: { clip: CockpitTake; seconds: number } | null;
  preview: ReturnType<typeof useCharacterPreviewStore.getState>["emote"];
  idle: AnimationAction;
  rest: number;
};

function leaveCabin(current: CabinState | null, restSeconds: number) {
  if (!current?.cabin) return;
  current.cabin.stop();
  current.cabin = null;
  current.driveSeconds = 0;
  current.take = null;
  current.preview = null;
  current.idle.reset().setEffectiveWeight(1).play();
  current.rest = restSeconds;
}

function setBlinkWeight(targets: ReturnType<typeof driverFaceTargets>, weight: number) {
  for (const { mesh, index } of targets) mesh.morphTargetInfluences![index] = weight;
}

export function GarageEmotePlayer({ root, bag = false, previewPacks = false, leanFit, mirrorFit, victory, cockpit, personality = "friendly", bagColors, paused = false }: {
  root: Object3D; personality?: CharacterPersonality; bagColors?: PieceColors; bag?: boolean; previewPacks?: boolean; leanFit?: GarageLeanFit; mirrorFit?: MirrorCheckFit; victory?: VictoryPlayback; cockpit?: GarageCockpit; paused?: boolean;
}) {
  const invalidate = useThree(s => s.invalidate);
  const contextFit = useRef("");
  const lastInteraction = useRef<string | undefined>(undefined);
  const heldProp = useRef<Group>(null);
  const reducedMotion = usePreferencesStore(state => state.reducedMotion);
  const restSeconds = previewPacks ? 4.5 : 2.35;
  const player = useRef<CabinState & {
    mixer: AnimationMixer;
    actions: Map<string, AnimationAction>;
    props: Map<EmoteProp, EmotePropModel>;
    fitFlag?: () => void;
    automatic: AnimationAction[];
    active: AnimationAction | null;
    release: { elapsed: number; weight: number } | null;
    next: number;
    clicked: { id: string } | null;
    blink: ReturnType<typeof driverFaceTargets>;
    elapsed: number;
  }>(null);

  useLayoutEffect(() => {
    if (!cockpit || reducedMotion) return;
    if (previewPacks) {
      useCharacterPreviewStore.setState({ cockpitAvailable: true });
      return () => {
        leaveCabin(player.current, restSeconds);
        useCharacterPreviewStore.setState({ cockpitAvailable: false });
      };
    }
    useGarageDrive.setState({ ready: true });
    return () => {
      leaveCabin(player.current, restSeconds);
      useGarageDrive.getState().leaveVehicle();
    };
  }, [cockpit, bag, reducedMotion, previewPacks, restSeconds]);

  useLayoutEffect(() => {
    if (!previewPacks || !leanFit || reducedMotion) return;
    useCharacterPreviewStore.setState({ leanAvailable: true });
    return () => useCharacterPreviewStore.setState({ leanAvailable: false });
  }, [previewPacks, leanFit, reducedMotion]);

  useLayoutEffect(() => {
    if (!previewPacks || !mirrorFit || reducedMotion) return;
    useCharacterPreviewStore.setState({ mirrorAvailable: true });
    return () => useCharacterPreviewStore.setState({ mirrorAvailable: false });
  }, [previewPacks, mirrorFit, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const mixer = new AnimationMixer(root);
    const celebration = victory && availableVictoryEmotes(bag).find(emote => emote.id === victory.id);
    const [breathing, ...clips] = victory
      ? buildEmoteClips(root, celebration ? [garageBreathing(bag), celebration] : [garageBreathing(bag)])
      : buildGarageEmotes(root, bag);
    const idle = mixer.clipAction(breathing).play();
    if (previewPacks && useCharacterPreviewStore.getState().playbackPaused) mixer.update(0);
    const actions = new Map(clips.map(clip => [clip.name.split(" ")[0], mixer.clipAction(clip).setLoop(LoopOnce, 1)]));
    actions.set("001", mixer.clipAction(breathing.clone()).setLoop(LoopOnce, 1));
    const automatic = [...AUTOMATIC_GARAGE_EMOTE_IDS, ...(bag ? ["bag-lift", "bag-check"] : [])]
      .flatMap(id => actions.get(id) ?? []);
    const blink = driverFaceTargets(root, "blink");
    const active = celebration ? actions.get(celebration.id)!.reset().setEffectiveWeight(0).play() : null;
    const props = new Map<EmoteProp, EmotePropModel>();
    player.current = { mixer, idle, actions, props,
      automatic, active, release: null, cabin: null, driveSeconds: 0, take: null, rest: restSeconds, next: 0, clicked: null, blink, elapsed: 0, preview: null };
    return () => {
      player.current?.cabin?.stop();
      player.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      props.forEach(prop => prop.dispose());
      setBlinkWeight(blink, 0);
    };
  }, [reducedMotion, root, bag, victory, restSeconds]);

  useFrame((_, delta) => {
    const current = player.current;
    if (paused || !current || (previewPacks && useCharacterPreviewStore.getState().playbackPaused)) return;
    const step = Math.min(delta, .1);
    if (current.blink.length) {
      current.elapsed += step;
      const phase = current.elapsed % 8.2;
      const age = phase - (phase < 4 ? 2.4 : 6.15);
      const blink = MathUtils.smoothstep(age, 0, .066) * (1 - MathUtils.smoothstep(age, .075, .19));
      setBlinkWeight(current.blink, blink);
    }
    const view = useCharacterPreviewStore.getState();
    const drive = useGarageDrive.getState();
    const garageStation = !previewPacks && drive.stage !== "idle";
    const driveOut = garageStation && drive.stage !== "station";
    const preview = previewPacks ? view.emote : garageStation ? drive.steering : current.clicked;
    const driving = garageStation || (previewPacks && view.insideCar);
    if (heldProp.current) heldProp.current.visible = keepHeldProp(
      current.active?.getClip().name.split(" ")[0] ?? (preview !== current.preview ? preview?.id : null), driving);
    if (cockpit && (garageStation || (previewPacks && view.cockpitAvailable && view.insideCar)) && !victory) {
      if (!current.cabin) {
        current.active?.stop();
        current.active = null;
        current.release = null;
        current.idle.stop();
        current.clicked = null;
        current.preview = null;
        current.cabin = cockpit(root, previewPacks);
        if (!current.cabin) {
          current.idle.reset().setEffectiveWeight(1).play();
          const error = "This driver could not be fitted to the selected vehicle.";
          if (garageStation) useGarageDrive.setState({ stage: "idle", error });
          else failCockpitPreview(error);
          return;
        }
      }
      if (preview !== current.preview) {
        current.preview = preview;
        const clip = COCKPIT_TAKES.find(take => take.id === preview?.id);
        current.take = clip ? { clip, seconds: 0 } : null;
      }
      const enteringCharacter = previewPacks && current.cabin.hasDoor && current.driveSeconds < GARAGE_ENTRY_DURATION;
      const take = current.take;
      if (take && !enteringCharacter) {
        take.seconds += step;
        if (take.seconds >= take.clip.duration) current.take = null;
      }
      const duration = drive.sequence === "entry" || enteringCharacter ? GARAGE_ENTRY_DURATION : DRIVE_OUT_DURATION;
      const alreadyParked = current.driveSeconds >= duration && !take;
      if (driveOut && alreadyParked) return;
      const drivePose = driveOut || enteringCharacter
        ? sampleDriveOut(current.driveSeconds = Math.min(current.driveSeconds + step, duration)) : undefined;
      const stage = drive.sequence === "entry" && current.driveSeconds >= GARAGE_ENTRY_DURATION ? "station" : drivePose?.stage;
      if (!previewPacks && stage && stage !== drive.stage) useGarageDrive.setState({ stage });
      current.cabin.sample(enteringCharacter ? null : current.take?.clip.id ?? null,
        current.take ? current.take.seconds / current.take.clip.duration : 0, drivePose);
      return;
    }
    leaveCabin(current, restSeconds);
    const inspectingFace = previewPacks && (view.camera === "Face" || view.camera === "Selected item") && !preview;
    if (inspectingFace) {
      current.active?.stop();
      current.active = null;
      current.release = null;
      current.rest = restSeconds;
      current.idle.setEffectiveWeight(1);
    }
    if (!victory && preview !== current.preview && current.active) {
      current.release ??= { elapsed: 0, weight: current.active.getEffectiveWeight() };
    }
    if (!victory && preview !== current.preview && !current.active) {
      current.preview = preview;
      const nextFit = JSON.stringify([mirrorFit, leanFit]);
      if (nextFit !== contextFit.current) {
        for (const id of [MIRROR_CHECK_ID, GARAGE_LEAN_ID]) {
          const previous = current.actions.get(id);
          if (previous) { previous.stop(); current.mixer.uncacheAction(previous.getClip()); current.actions.delete(id); }
        }
        contextFit.current = nextFit;
      }
      let action = preview ? current.actions.get(preview.id) : undefined;
      if (!action && preview) {
        const emote = preview.id === MIRROR_CHECK_ID && mirrorFit ? mirrorCheckPose(mirrorFit) : preview.id === GARAGE_LEAN_ID && leanFit ? garageLeanPose(leanFit) : findGaragePreviewEmote(preview.id, bag);
        if (emote) {
          // The solver needs the rest skeleton. Release mixer bindings before
          // compiling one clip, then keep it for the rest of this preview.
          current.idle.stop();
          if (emote.prop && !current.props.has(emote.prop)) {
            const prop = createEmoteProp(emote.prop);
            current.props.set(emote.prop, prop);
            root.add(prop.root);
            if (emote.prop === "flag") current.fitFlag = bindFlagPoleGrip(root, prop);
          }
          action = current.mixer.clipAction(buildEmoteClips(root, [emote], current.props)[0]).setLoop(LoopOnce, 1);
          current.actions.set(preview.id, action);
          current.idle.reset().play();
        }
      }
      if (action) {
        current.active = action.reset().setEffectiveWeight(0).play();
        current.idle.setEffectiveWeight(1);
      }
    }
    if (current.active) {
      const { active, release } = current;
      const duration = active.getClip().duration;
      const time = active.time + step;
      if (release) release.elapsed += step;
      if (time >= duration || (release && release.elapsed >= FADE_SECONDS)) {
        active.stop();
        current.active = null;
        current.release = null;
        current.rest = restSeconds;
        current.idle.setEffectiveWeight(1);
        if (current.clicked === current.preview) current.clicked = null;
        victory?.onFinish();
      } else {
        const clipWeight = MathUtils.smoothstep(Math.min(time, duration - time), 0, FADE_SECONDS);
        const weight = release ? Math.min(clipWeight, release.weight * (1 - MathUtils.smoothstep(release.elapsed, 0, FADE_SECONDS))) : clipWeight;
        active.setEffectiveWeight(weight);
        current.idle.setEffectiveWeight(1 - weight);
      }
    } else if (!victory && !inspectingFace && (!previewPacks || view.automaticEmotes)) {
      current.rest -= step;
      if (current.rest <= 0) {
        const action = current.automatic[current.next];
        current.next = (current.next + 1) % current.automatic.length;
        current.active = action.reset().setEffectiveWeight(0).play();
      }
    }
    current.mixer.update(step);
    current.fitFlag?.();
  }, cockpit ? -.5 : -.125);

  return <group>
    <primitive object={root} dispose={null} onClick={(event: import("@react-three/fiber").ThreeEvent<MouseEvent>) => {
      if (paused || victory || reducedMotion || !player.current || player.current.cabin || event.delta > 3 || performance.now() < useFittingTurnStore.getState().suppressClickUntil) return;
      event.stopPropagation();
      const id = personalityEmote(personality, lastInteraction.current);
      lastInteraction.current = id;
      if (previewPacks) useCharacterPreviewStore.setState({ emote: { id }, playbackPaused: false });
      else player.current.clicked = { id };
      invalidate();
    }} />
    {bag && <group ref={heldProp}><DriverBag driver={root} colors={bagColors} /></group>}
  </group>;
}
