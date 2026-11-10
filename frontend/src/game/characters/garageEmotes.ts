import {
  AnimationClip, Euler, NumberKeyframeTrack, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack,
  type Object3D,
} from "three";
import { driverFaceTargets } from "./villagerFace";

type XYZ = readonly [number, number, number];
type Arm = readonly [upper: XYZ, lower: XYZ];
type Pose = {
  torso?: XYZ;
  head?: XYZ;
  left?: Arm;
  right?: Arm;
  wrist?: number;
  turn?: number;
  rise?: number;
  knees?: number;
  face?: readonly [smile: number, brow: number];
};
type Emote = { id: string; name: string; duration: number; keys: readonly (readonly [time: number, pose: Pose])[] };

// Arm targets are model-space directions. Positive Z is forward. The same
// poses are retargeted to the imported skeleton and the built-in driver rigs.
const behindLeft: Arm = [[1.5, -3.5, -2.2], [-3, .45, -1.9]];
const behindRight: Arm = [[-1.5, -3.5, -2.2], [3, .45, -1.9]];
const liftLeft: Arm = [[1.5, -4, 0], [1, 1, 2]];
const liftRight: Arm = [[-1.5, -4, 0], [-1, 1, 2]];
const claspLeft: Arm = [[1, -4, 1.2], [-2.4, 1.3, 3.5]];
const claspRight: Arm = [[-1, -4, 1.2], [2.4, 1.3, 3.5]];
const wave: Arm = [[-1, -.55, .28], [-.24, 1, .28]];

export const GARAGE_EMOTES = [
  { id: "001", name: "Relaxed breathing", duration: 3.6, keys: [
    [0, {}], [.25, { torso: [-.018, 0, .012], head: [0, -.027, 0], face: [.12, .08] }],
    [.5, {}], [.77, { torso: [.014, 0, -.012], head: [.012, .027, 0] }], [1, {}],
  ] },
  { id: "002", name: "Comfortable weight shift", duration: 2.7, keys: [
    [.29, { torso: [.018, -.07, .115], head: [0, .06, -.072] }],
    [.62, { torso: [.02, -.04, .09], head: [-.02, .04, -.055] }],
    [.8, { torso: [0, .03, -.035] }],
  ] },
  { id: "003", name: "Curious head tilt", duration: 2.6, keys: [
    [.26, { torso: [.045, -.08, .025], head: [-.08, .1, -.2], face: [.24, .9] }],
    [.55, { torso: [.045, -.05, .025], head: [-.06, .13, -.17], face: [.28, .65] }],
    [.79, { head: [.02, -.25, -.04] }],
  ] },
  { id: "004", name: "Hands behind back", duration: 3.2, keys: [
    [.15, { left: liftLeft, right: liftRight }],
    [.3, { left: behindLeft, right: behindRight, torso: [-.035, 0, .04], head: [.04, -.12, 0] }],
    [.62, { left: behindLeft, right: behindRight, torso: [-.025, .065, -.045], head: [.025, .1, .03], face: [.45, .2] }],
    [.78, { left: behindLeft, right: behindRight, torso: [0, .04, 0] }],
    [.9, { left: liftLeft, right: liftRight }],
  ] },
  { id: "005", name: "Admire the car", duration: 3.1, keys: [
    [.25, { turn: 1.72, torso: [.02, .09, 0], head: [.09, .34, 0] }],
    [.52, { turn: 1.88, torso: [.045, 0, 0], head: [-.08, .03, -.03], face: [.55, .4] }],
    [.65, { turn: 1.88, head: [.16, -.06, 0], face: [.6, .2] }],
    [.77, { turn: 1.72, head: [-.035, -.1, 0] }],
  ] },
  { id: "006", name: "Inspect the wheel", duration: 3.2, keys: [
    [.25, { turn: 1.92, head: [.15, .1, 0] }],
    [.47, { turn: 2.15, torso: [.32, .07, 0], head: [.26, .13, -.045], left: claspLeft, right: claspRight, face: [0, -.55] }],
    [.67, { turn: 2.15, torso: [.28, .03, 0], head: [.2, -.03, .03], left: claspLeft, right: claspRight, face: [.15, -.4] }],
    [.81, { turn: 1.8, torso: [.07, 0, 0], head: [.08, 0, 0] }],
  ] },
  { id: "007", name: "Tiny happy bounce", duration: 2.35, keys: [
    [.23, { torso: [.09, 0, 0], left: claspLeft, right: claspRight, rise: -.014, knees: .18 }],
    [.35, { torso: [-.08, 0, -.04], left: claspLeft, right: claspRight, rise: .025, knees: .04, face: [.95, .7] }],
    [.47, { torso: [.075, 0, .035], left: claspLeft, right: claspRight, rise: -.014, knees: .18 }],
    [.59, { torso: [-.06, 0, .035], left: claspLeft, right: claspRight, rise: .018, knees: .035, face: [.95, .5] }],
    [.74, { head: [.065, -.08, .04], left: claspLeft, right: claspRight, face: [.6, .25] }],
  ] },
  { id: "008", name: "Shoulder stretch", duration: 3.1, keys: [
    [.22, { torso: [-.065, .1, .035], head: [.04, -.06, 0], right: [[-1, -3, 2], [2, 1.5, 1.8]] }],
    [.46, { torso: [-.08, .16, -.075], head: [.05, -.18, .04], right: [[1, -.5, 2], [3, 0, 1]], left: [[1, -2, 1], [-3, 2, 1]] }],
    [.72, { torso: [-.05, .13, -.05], head: [.025, -.12, 0], right: [[1, -.6, 2], [3, -.2, 1]], left: [[1, -2, 1], [-3, 2, 1]] }],
  ] },
  { id: "009", name: "Straighten the outfit", duration: 2.8, keys: [
    [.24, { torso: [.055, 0, 0], head: [.19, 0, 0], left: claspLeft, right: claspRight }],
    [.43, { head: [.22, -.12, 0], left: [[1, -4, 1.2], [-2, .65, 3.5]], right: claspRight, face: [.12, -.3] }],
    [.62, { head: [.2, .12, 0], left: [[1, -4, 1.2], [-2, -.25, 3.5]], right: [[-1, -4, 1.2], [2, .65, 3.5]], face: [.22, -.3] }],
    [.78, { head: [.12, 0, 0], right: [[-1, -4, 1.2], [2, -.25, 3.5]], face: [.38, .12] }],
  ] },
  { id: "010", name: "Friendly wave", duration: 2, keys: [
    [.22, { right: wave, head: [-.045, .1, .09], wrist: -.23, face: [.9, .55] }],
    [.35, { right: wave, head: [-.045, .1, .09], wrist: .28, face: [1, .45] }],
    [.46, { right: wave, head: [-.025, .08, .065], wrist: -.27, face: [1, .42] }],
    [.58, { right: wave, head: [-.025, .08, .065], wrist: .25, face: [.88, .32] }],
    [.7, { right: wave, head: [.025, .06, .04], wrist: -.15, face: [.7, .25] }],
  ] },
] satisfies readonly Emote[];

export const BAG_EMOTES = [
  { id: "bag-lift", name: "Lift the bag", duration: 2.7, keys: [
    [.25, { left: [[1.8, -3.2, .7], [1.1, .4, 1.7]], head: [.1, .18, -.03] }],
    [.53, { left: [[2, -3, .6], [.7, .9, 1.9]], head: [.12, .17, -.04], face: [.44, .26] }],
    [.73, { left: [[1.8, -3.2, .7], [.8, -.1, 1.7]], face: [.35, .12] }],
  ] },
  { id: "bag-check", name: "Check the bag", duration: 2.9, keys: [
    [.28, { left: [[1.6, -3, .9], [.7, .15, 1.8]], torso: [.09, .14, -.03], head: [.18, .22, 0] }],
    [.62, { left: [[1.6, -3, .9], [.7, .3, 1.8]], head: [.24, .17, -.08], face: [.05, -.35] }],
    [.78, { head: [.07, .1, .02], face: [.31, .2] }],
  ] },
] satisfies readonly Emote[];

export function compatibleGarageEmotes(id: string) {
  return ["001", "002", "003", "005", "010"].includes(id);
}

export function driverArm(root: Object3D, side: "l" | "r") {
  const shoulder = root.getObjectByName("upperarm_" + side);
  const elbow = root.getObjectByName("lowerarm_" + side);
  const hand = root.getObjectByName("hand_" + side);
  if (!shoulder || !elbow || !hand) return null;
  return { shoulder, elbow, hand };
}

/** Point a limb at a direction relative to the actor's unrotated model. */
export function aimDriverJoint(joint: Object3D, child: Object3D, direction: Vector3) {
  const from = child.getWorldPosition(new Vector3()).sub(joint.getWorldPosition(new Vector3())).normalize();
  const world = joint.getWorldQuaternion(new Quaternion());
  const parent = joint.parent!.getWorldQuaternion(new Quaternion()).invert();
  joint.quaternion.copy(parent.multiply(new Quaternion().setFromUnitVectors(from, direction.normalize())).multiply(world));
}

export function buildGarageEmotes(root: Object3D, bag = false) {
  const torso = root.getObjectByName("spine_02");
  const head = root.getObjectByName("head");
  const left = driverArm(root, "l");
  const right = driverArm(root, "r");
  const legs = ["l", "r"].map(side => ["thigh", "calf", "foot"].map(name => root.getObjectByName(name + "_" + side)));
  const joints = [root, torso, head, left?.shoulder, left?.elbow, left?.hand,
    right?.shoulder, right?.elbow, right?.hand, ...legs.flat()].filter((joint): joint is Object3D => !!joint);
  const rest = joints.map(joint => joint.quaternion.clone());
  const basePosition = root.position.clone();
  const modelRotation = root.getWorldQuaternion(new Quaternion());
  const inverseModelRotation = modelRotation.clone().invert();
  const faceTargets = (["smile", "brow"] as const).map(shape => driverFaceTargets(root, shape));
  const tilt = (joint: Object3D | undefined, angles: XYZ | undefined) => {
    if (!joint || !angles) return;
    // Imported bones and the procedural rig have different local axes.
    const parent = joint.parent!.getWorldQuaternion(new Quaternion());
    const rotation = modelRotation.clone().multiply(new Quaternion().setFromEuler(new Euler(...angles))).multiply(inverseModelRotation);
    joint.quaternion.premultiply(parent.clone().invert().multiply(rotation).multiply(parent));
  };
  const arms = (limb: ReturnType<typeof driverArm>, target: Arm | undefined) => {
    if (!limb || !target) return;
    aimDriverJoint(limb.shoulder, limb.elbow, new Vector3(...target[0]).applyQuaternion(modelRotation));
    aimDriverJoint(limb.elbow, limb.hand, new Vector3(...target[1]).applyQuaternion(modelRotation));
  };

  const emotes = bag ? [...GARAGE_EMOTES.filter(item => compatibleGarageEmotes(item.id)), ...BAG_EMOTES] : GARAGE_EMOTES;
  const clips = emotes.map((emote, index) => {
    const keys: Emote["keys"] = index === 0 ? emote.keys : [[0, {}], ...emote.keys, [1, {}]];
    const times = keys.map(([time]) => time * emote.duration);
    const rotations = joints.map((): number[] => []);
    const positions: number[] = [];
    for (const [, pose] of keys) {
      joints.forEach((joint, index) => joint.quaternion.copy(rest[index]));
      tilt(torso, pose.torso);
      tilt(head, pose.head);
      arms(left, pose.left);
      arms(right, pose.right);
      tilt(right?.hand, pose.wrist === undefined ? undefined : [0, 0, pose.wrist]);
      if (pose.knees) for (const [thigh, calf, foot] of legs) {
        tilt(thigh, [-pose.knees, 0, 0]);
        tilt(calf, [2 * pose.knees, 0, 0]);
        tilt(foot, [-pose.knees, 0, 0]);
      }
      if (pose.turn) root.rotateY(pose.turn);
      joints.forEach((joint, index) => rotations[index].push(...joint.quaternion.toArray()));
      positions.push(basePosition.x, basePosition.y + (pose.rise ?? 0), basePosition.z);
    }
    return new AnimationClip(emote.id + " " + emote.name, emote.duration, [
      ...joints.map((joint, index) => new QuaternionKeyframeTrack(joint.uuid + ".quaternion", times, rotations[index])),
      new VectorKeyframeTrack(root.uuid + ".position", times, positions),
      ...faceTargets.flatMap((targets, channel) => targets.map(({ mesh, index }) =>
        new NumberKeyframeTrack(mesh.uuid + ".morphTargetInfluences[" + index + "]", times,
          keys.map(([, pose]) => pose.face?.[channel] ?? 0)))),
    ]);
  });
  joints.forEach((joint, index) => joint.quaternion.copy(rest[index]));
  root.updateMatrixWorld(true);
  return clips;
}
