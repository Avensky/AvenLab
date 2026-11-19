import { EMOTE_GROUPS, emoteCollection, type Emote } from "./garageEmotes";

import { MAKEHUMAN_POSE_GROUPS } from "./makehumanPoses";

export type CharacterPose = { id: string; name: string; author?: string; pose: Emote["keys"][number][1] };

const AVENLAB_POSES = [
  { id: "pose-neutral", name: "Neutral stand", pose: {} },
  { id: "pose-weight-shift", name: "Relaxed weight shift", pose: {
    sway: .035, rise: -.025, feet: { r: [-.025, 0, .04, -.12] },
    torso: [.015, -.075, .052], head: [-.035, .09, -.055],
  } },
  { id: "pose-attentive", name: "Attentive stand", pose: {
    torso: [.04, .055, -.025], head: [-.075, -.12, .05], face: [.22, .32],
  } },
  { id: "pose-greeting", name: "Raised-hand greeting", pose: {
    sway: -.022, rise: -.015, torso: [.01, -.06, .025], head: [-.04, .075, .07],
    right: [[-1, -.55, .28], [-.24, 1, .28]], wrist: -.15, face: [.65, .32],
  } },
] as const satisfies readonly CharacterPose[];

export const CHARACTER_POSE_GROUPS: readonly { group: string; poses: readonly CharacterPose[] }[] = [
  { group: "AvenLab", poses: AVENLAB_POSES },
  ...MAKEHUMAN_POSE_GROUPS.map(({ group, poses }) => ({
    group, poses: poses.map(pose => ({ ...pose, pose: { ...pose.pose, skirtClearanceWithPalm: true } })),
  })),
];
const characterPoses = new Map(CHARACTER_POSE_GROUPS.flatMap(({ poses }) => poses.map(pose => [pose.id, pose] as const)));

export const POSE_SEQUENCE_ID = "pose-sequence";
export const POSE_START_HOLD_SECONDS = .9;
export type PoseSequence = { from: string; motion: string; to: string };

function collectPoseMotions() {
  const seen = new Set<string>();
  return EMOTE_GROUPS.flatMap(group => {
    const motions = emoteCollection(group, false).filter(motion => {
      if (motion.prop || seen.has(motion.id)) return false;
      seen.add(motion.id);
      return true;
    });
    return motions.length ? [{ group, motions }] : [];
  });
}

export const POSE_MOTION_GROUPS = collectPoseMotions();
const poseMotions = new Map(POSE_MOTION_GROUPS.flatMap(({ motions }) => motions.map(motion => [motion.id, motion] as const)));

export function holdCharacterPose({ id, name, pose }: CharacterPose): Emote {
  return { id, name, duration: .7, keys: [[0, pose], [1, pose]] };
}

/** Compose in the rig-independent authoring format before solving any joints. */
export function composePoseSequence(from: CharacterPose, motion: Emote, to: CharacterPose): Emote {
  const hold = POSE_START_HOLD_SECONDS;
  const blend = .45;
  const motionStart = hold + blend;
  const motionEnd = motionStart + motion.duration;
  const duration = motionEnd + blend;
  const keys: Emote["keys"] = [
    [0, from.pose],
    [hold / duration, from.pose],
    ...(motion.keys[0]?.[0] === 0 ? [] : [[motionStart / duration, {}] as const]),
    ...motion.keys.map(([time, pose]) => [(motionStart + time * motion.duration) / duration, pose] as const),
    ...(motion.keys.at(-1)?.[0] === 1 ? [] : [[motionEnd / duration, {}] as const]),
    [1, to.pose],
  ];
  return { ...motion, id: POSE_SEQUENCE_ID, duration, keys };
}

export function posePackEmote(id: string, sequence?: PoseSequence): Emote | undefined {
  if (id === POSE_SEQUENCE_ID && sequence) {
    const from = characterPoses.get(sequence.from);
    const to = characterPoses.get(sequence.to);
    const motion = poseMotions.get(sequence.motion);
    if (from && motion && to) return composePoseSequence(from, motion, to);
    return;
  }
  const pose = characterPoses.get(id);
  if (pose) return holdCharacterPose(pose);
}
