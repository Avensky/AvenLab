import {
  AnimationClip, Bone, Euler, NumberKeyframeTrack, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack,
  type Object3D,
} from "three";
import { driverFaceTargets } from "./villagerFace";
import { availableVictoryEmotes } from "./victoryEmotes";
import { availablePlayfulEmotes } from "./playfulEmotes";
import { availableShyEmotes, QUIET_THANK_YOU } from "./shyEmotes";
import { availableTsundereEmotes } from "./tsundereEmotes";
import { availableExpressionEmotes } from "./expressionEmotes";
import { availableRoadsideEmotes } from "./roadsideEmotes";
import { availableRivalryEmotes } from "./rivalryEmotes";
import { availablePitCrewEmotes } from "./pitCrewEmotes";
import { availableAfterHoursEmotes } from "./afterHoursEmotes";
import { WALK_EMOTES } from "./walkingEmotes";
import { garageLeanPose, type GarageLeanFit } from "./garageLean";

export type XYZ = readonly [number, number, number];
type Arm = readonly [upper: XYZ, lower: XYZ];
type HandShape = "fist" | "peace" | "heart" | "open" | "paw" | "cup" | "point" | "three" | "finger-heart" | "finger-gun" | "thumb-up" | "pinch" | "frame" | "shaka";
export type Palm = readonly [fingerDirection: XYZ, normal: XYZ];
// Offsets from the resting ankle in stage meters, with optional toe yaw.
type Foot = readonly [across: number, lift: number, forward: number, pivot?: number, pitch?: number];
type Pose = {
  torso?: XYZ;
  head?: XYZ;
  left?: Arm;
  right?: Arm;
  leftHand?: XYZ;
  rightHand?: XYZ;
  leftPalm?: Palm;
  rightPalm?: Palm;
  rightAtLips?: boolean;
  joinIndexTips?: boolean;
  fingers?: readonly [HandShape | null, HandShape | null];
  wristLeft?: number;
  wrist?: number;
  turn?: number;
  rise?: number;
  sway?: number;
  travel?: number;
  feet?: { l?: Foot; r?: Foot };
  elbowsBack?: boolean;
  face?: readonly [smile: number, brow: number];
  wetEyes?: number;
};
export type Emote = { id: string; name: string; duration: number; keys: readonly (readonly [time: number, pose: Pose])[] };

// Arm targets are model-space directions. Positive Z is forward. The same
// poses are retargeted to the imported skeleton and the built-in driver rigs.
const behind = { leftHand: [.31, -.75, -.51], rightHand: [-.31, -.73, -.55], elbowsBack: true } as const;
const releaseBehind = { leftHand: [1.25, -.87, -.34], rightHand: [-1.25, -.87, -.34], elbowsBack: true } as const;
const faceCar = { turn: 1.77, rise: -.027, feet: { l: [.025, 0, .015, 1.66], r: [-.018, 0, -.028, 1.82] } } as const;
const startPivot = { turn: .62, rise: -.018, feet: { l: [.015, .038, .024, .96] } } as const;
const finishPivot = { turn: 1.31, rise: -.025, feet: { l: faceCar.feet.l, r: [-.01, .045, -.022, 1.18] } } as const;
const claspLeft: Arm = [[1, -4, 1.2], [-2.4, 1.3, 3.5]];
const claspRight: Arm = [[-1, -4, 1.2], [2.4, 1.3, 3.5]];
const wave: Arm = [[-1, -.55, .28], [-.24, 1, .28]];

export const EMOTE_GROUPS = ["Garage", "Victory", "Playful", "Shy", "Tsundere", "Expressions", "Roadside", "Rivalry", "Pit Crew", "After Hours"] as const;
export type EmoteGroup = typeof EMOTE_GROUPS[number];

export const GARAGE_EMOTES = [
  { id: "001", name: "Relaxed breathing", duration: 3.6, keys: [
    [0, {}], [.25, { torso: [-.018, 0, .012], head: [0, -.027, 0], face: [.12, .08] }],
    [.5, {}], [.77, { torso: [.014, 0, -.012], head: [.012, .027, 0] }], [1, {}],
  ] },
  { id: "002", name: "Comfortable weight shift", duration: 2.7, keys: [
    [.23, { sway: -.043, rise: -.023, feet: { l: [.025, .035, .032] }, torso: [.018, -.07, .08] }],
    [.39, { sway: .068, rise: -.038, feet: { l: [.065, 0, .065, .16] }, torso: [.018, -.07, .115], head: [0, .06, -.072] }],
    [.64, { sway: .081, rise: -.037, feet: { l: [.065, 0, .065, .16] }, torso: [.02, -.04, .09], head: [-.02, .04, -.055] }],
    [.83, { sway: -.027, rise: -.018, feet: { l: [.027, .031, .025, .08] }, torso: [0, .03, -.035] }],
  ] },
  { id: "003", name: "Curious head tilt", duration: 2.6, keys: [
    [.26, { sway: .034, rise: -.021, torso: [.045, -.08, .025], head: [-.08, .1, -.2], face: [.24, .9] }],
    [.55, { sway: .044, rise: -.024, torso: [.045, -.05, .025], head: [-.06, .13, -.17], face: [.28, .65] }],
    [.79, { head: [.02, -.25, -.04] }],
  ] },
  { id: "004", name: "Hands behind back", duration: 3.2, keys: [
    [.16, { ...releaseBehind, sway: -.025, rise: -.019, feet: { l: [.015, .032, -.035] } }],
    [.32, { ...behind, sway: -.041, rise: -.025, feet: { l: [.021, 0, -.064] }, torso: [-.035, 0, .04], head: [.04, -.12, 0] }],
    [.62, { ...behind, sway: .021, rise: -.033, feet: { l: [.021, 0, -.064] }, torso: [-.025, .065, -.045], head: [.025, .1, .03], face: [.45, .2] }],
    [.77, { ...behind, sway: -.029, rise: -.021, feet: { l: [.021, 0, -.064] }, torso: [0, .04, 0] }],
    [.9, { ...releaseBehind, sway: -.02, rise: -.018, feet: { l: [.01, .026, -.031] } }],
  ] },
  { id: "005", name: "Admire the car", duration: 3.1, keys: [
    [.13, { ...startPivot, head: [.04, .31, 0] }],
    [.22, { ...finishPivot, torso: [.02, .09, 0], head: [.09, .34, 0] }],
    [.35, { ...faceCar, torso: [.045, 0, 0], head: [-.08, .03, -.03], face: [.55, .4] }],
    [.66, { ...faceCar, sway: .021, head: [.16, -.06, 0], face: [.6, .2] }],
    [.79, { ...finishPivot, head: [-.035, -.1, 0] }],
    [.9, startPivot],
  ] },
  { id: "006", name: "Inspect the wheel", duration: 3.2, keys: [
    [.13, { ...startPivot, head: [.1, .15, 0] }],
    [.25, { ...finishPivot, head: [.15, .1, 0] }],
    [.47, { ...faceCar, rise: -.092, sway: .052, torso: [.32, .19, 0], head: [.26, .13, -.045], left: claspLeft, right: claspRight, face: [0, -.55] }],
    [.67, { ...faceCar, rise: -.079, sway: .043, torso: [.28, .14, 0], head: [.2, -.03, .03], left: claspLeft, right: claspRight, face: [.15, -.4] }],
    [.8, { ...finishPivot, torso: [.07, 0, 0], head: [.08, 0, 0] }],
    [.91, startPivot],
  ] },
  { id: "007", name: "Tiny happy bounce", duration: 2.35, keys: [
    [.23, { torso: [.09, 0, 0], left: claspLeft, right: claspRight, rise: -.034 }],
    [.35, { torso: [-.08, 0, -.04], left: claspLeft, right: claspRight, rise: .031, feet: { l: [0, .037, 0], r: [0, .035, 0] }, face: [.95, .7] }],
    [.47, { torso: [.075, 0, .035], left: claspLeft, right: claspRight, rise: -.04 }],
    [.59, { torso: [-.06, 0, .035], left: claspLeft, right: claspRight, rise: .023, feet: { l: [0, .026, 0], r: [0, .024, 0] }, face: [.95, .5] }],
    [.74, { head: [.065, -.08, .04], left: claspLeft, right: claspRight, face: [.6, .25] }],
  ] },
  { id: "008", name: "Shoulder stretch", duration: 3.1, keys: [
    [.22, { torso: [-.065, .1, .035], head: [.04, -.06, 0], right: [[-1, -3, 2], [2, 1.5, 1.8]] }],
    [.46, { sway: .043, rise: -.031, torso: [-.08, .16, -.075], head: [.05, -.18, .04], right: [[1, -.5, 2], [3, 0, 1]], left: [[1, -2, 1], [-3, 2, 1]] }],
    [.72, { sway: .052, rise: -.026, torso: [-.05, .13, -.05], head: [.025, -.12, 0], right: [[1, -.6, 2], [3, -.2, 1]], left: [[1, -2, 1], [-3, 2, 1]] }],
  ] },
  { id: "009", name: "Straighten the outfit", duration: 2.8, keys: [
    [.24, { torso: [.055, 0, 0], head: [.19, 0, 0], left: claspLeft, right: claspRight }],
    [.43, { sway: -.036, rise: -.025, head: [.22, -.12, 0], left: [[1, -4, 1.2], [-2, .65, 3.5]], right: claspRight, face: [.12, -.3] }],
    [.62, { sway: .038, rise: -.024, head: [.2, .12, 0], left: [[1, -4, 1.2], [-2, -.25, 3.5]], right: [[-1, -4, 1.2], [2, .65, 3.5]], face: [.22, -.3] }],
    [.78, { head: [.12, 0, 0], right: [[-1, -4, 1.2], [2, -.25, 3.5]], face: [.38, .12] }],
  ] },
  { id: "010", name: "Friendly wave", duration: 2, keys: [
    [.22, { sway: -.027, rise: -.023, right: wave, head: [-.045, .1, .09], wrist: -.23, face: [.9, .55] }],
    [.35, { sway: -.042, rise: -.019, right: wave, head: [-.045, .1, .09], wrist: .28, face: [1, .45] }],
    [.46, { sway: -.045, rise: -.018, right: wave, head: [-.025, .08, .065], wrist: -.27, face: [1, .42] }],
    [.58, { sway: -.038, rise: -.022, right: wave, head: [-.025, .08, .065], wrist: .25, face: [.88, .32] }],
    [.7, { sway: -.027, rise: -.015, right: wave, head: [.025, .06, .04], wrist: -.15, face: [.7, .25] }],
  ] },
] satisfies readonly Emote[];

export const BAG_EMOTES = [
  { id: "bag-lift", name: "Lift the bag", duration: 2.7, keys: [
    [.25, { sway: -.026, rise: -.021, left: [[1.8, -3.2, .7], [1.1, .4, 1.7]], head: [.1, .18, -.03] }],
    [.53, { sway: -.041, rise: -.023, left: [[2, -3, .6], [.7, .9, 1.9]], head: [.12, .17, -.04], face: [.44, .26] }],
    [.73, { left: [[1.8, -3.2, .7], [.8, -.1, 1.7]], face: [.35, .12] }],
  ] },
  { id: "bag-check", name: "Check the bag", duration: 2.9, keys: [
    [.28, { sway: .025, rise: -.025, left: [[1.6, -3, .9], [.7, .15, 1.8]], torso: [.09, .14, -.03], head: [.18, .22, 0] }],
    [.62, { sway: .042, rise: -.026, left: [[1.6, -3, .9], [.7, .3, 1.8]], head: [.24, .17, -.08], face: [.05, -.35] }],
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

export function alignJointNormal(joint: Object3D, axis: Vector3, localNormal: Vector3, target: Vector3) {
  const world = joint.getWorldQuaternion(new Quaternion());
  const current = localNormal.clone().applyQuaternion(world);
  current.addScaledVector(axis, -current.dot(axis)).normalize();
  target.addScaledVector(axis, -target.dot(axis)).normalize();
  const twist = Math.atan2(axis.dot(current.clone().cross(target)), current.dot(target));
  joint.rotateOnAxis(axis.clone().applyQuaternion(world.invert()), twist);
}

export function aimLimb(first: Object3D, second: Object3D, end: Object3D, goal: Vector3, pole: Vector3, hinge?: Vector3) {
  const start = first.getWorldPosition(new Vector3());
  const middle = second.getWorldPosition(new Vector3());
  const upper = start.distanceTo(middle);
  const lower = middle.distanceTo(end.getWorldPosition(new Vector3()));
  const direction = goal.sub(start);
  const distance = Math.max(Math.abs(upper - lower) + .0001, Math.min(upper + lower - .0001, direction.length()));
  direction.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const upperDirection = direction.clone().multiplyScalar(along).addScaledVector(pole, Math.sqrt(Math.max(0, upper * upper - along * along)));
  const lowerDirection = direction.multiplyScalar(distance).sub(upperDirection);
  aimDriverJoint(first, second, upperDirection.clone());
  if (hinge) {
    // Roll the upper arm so the forearm closes around its anatomical hinge.
    const axis = upperDirection.clone().normalize();
    alignJointNormal(first, axis, hinge, axis.clone().cross(lowerDirection));
  }
  aimDriverJoint(second, end, lowerDirection);
}

export function driverHand(root: Object3D, side: "l" | "r") {
  const bone = (name: string) => root.getObjectByName(`${name}_${side}`);
  const hand = bone("hand"), index = bone("index_01"), middle = bone("middle_01"), pinky = bone("pinky_01");
  if (!hand || !index || !middle || !pinky) return null;
  const across = index.getWorldPosition(new Vector3()).sub(pinky.getWorldPosition(new Vector3()));
  const palm = middle.getWorldPosition(new Vector3()).sub(hand.getWorldPosition(new Vector3()))
    .cross(across).normalize().multiplyScalar(side === "l" ? 1 : -1);
  const fingers = ["index", "middle", "ring", "pinky", "thumb"].flatMap(name => {
    const chain = [1, 2, 3].map(segment => bone(`${name}_0${segment}`));
    return chain.flatMap((joint, segment) => {
      const adjacent = chain[segment + 1] ?? chain[segment - 1];
      if (!joint || !adjacent) return [];
      const axis = adjacent.getWorldPosition(new Vector3()).sub(joint.getWorldPosition(new Vector3()))
        .multiplyScalar(chain[segment + 1] ? 1 : -1).cross(palm).normalize()
        .applyQuaternion(joint.getWorldQuaternion(new Quaternion()).invert());
      return [{ joint, axis, name, segment }];
    });
  });
  const thumb = [bone("thumb_01"), bone("thumb_02"), bone("thumb_03")];
  const indexChain = [index, bone("index_02"), bone("index_03")];
  return {
    hand, middle, fingers, thumb: thumb.every((joint): joint is Object3D => !!joint) ? thumb : null,
    index: indexChain.every((joint): joint is Object3D => !!joint) ? indexChain : null,
    fingertip: bone("middle_03"),
    palm: palm.applyQuaternion(hand.getWorldQuaternion(new Quaternion()).invert()),
  };
}

export function buildEmoteClips(root: Object3D, emotes: readonly Emote[]) {
  const torso = root.getObjectByName("spine_02");
  const head = root.getObjectByName("head");
  const left = driverArm(root, "l");
  const right = driverArm(root, "r");
  const legs = (["l", "r"] as const).flatMap(side => {
    const thigh = root.getObjectByName("thigh_" + side);
    const calf = root.getObjectByName("calf_" + side);
    const foot = root.getObjectByName("foot_" + side);
    if (!thigh || !calf || !foot) return [];
    return [{ side, thigh, calf, foot, anchor: root.worldToLocal(foot.getWorldPosition(new Vector3())),
      orientation: foot.getWorldQuaternion(new Quaternion()) }];
  });
  const body = [root, torso, head, left?.shoulder, left?.elbow, left?.hand,
    right?.shoulder, right?.elbow, right?.hand, ...legs.flatMap(({ thigh, calf, foot }) => [thigh, calf, foot])]
    .filter((joint): joint is Object3D => !!joint);
  const handRigs = emotes.some(emote => emote.keys.some(([, pose]) => pose.fingers || pose.leftPalm || pose.rightPalm))
    ? [driverHand(root, "l"), driverHand(root, "r")] : [];
  const joints = [...body, ...handRigs.flatMap(hand => hand?.fingers.map(finger => finger.joint) ?? [])];
  const rest = joints.map(joint => joint.quaternion.clone());
  const basePosition = root.position.clone();
  const modelRotation = root.getWorldQuaternion(new Quaternion());
  const modelMatrix = root.matrixWorld.clone();
  const inverseModelRotation = modelRotation.clone().invert();
  let lipAnchor: Vector3 | undefined;
  if (head && emotes.some(emote => emote.keys.some(([, pose]) => pose.rightAtLips))) {
    const restHead = root.worldToLocal(head.getWorldPosition(new Vector3()));
    const lips = root.localToWorld(new Vector3(0, restHead.y - .014, .105));
    lipAnchor = head.worldToLocal(lips);
  }
  const lipClearance = new Vector3().setFromMatrixColumn(modelMatrix, 2).multiplyScalar(.026);
  const up = new Vector3(0, 1, 0);
  const across = new Vector3(1, 0, 0);
  const faceTargets = (["smile", "brow"] as const).map(shape => driverFaceTargets(root, shape));
  const tears = root.getObjectByName("villager-tearline");
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
  const hands = (limb: ReturnType<typeof driverArm>, opposite: ReturnType<typeof driverArm>, target: XYZ | undefined,
    side: number, behindBack?: boolean, articulated?: boolean, contact?: Vector3) => {
    if (!limb || !opposite || !target) return;
    const shoulder = limb.shoulder.getWorldPosition(new Vector3());
    const other = opposite.shoulder.getWorldPosition(new Vector3());
    const elbow = limb.elbow.getWorldPosition(new Vector3());
    const wrist = limb.hand.getWorldPosition(new Vector3());
    const reach = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist);
    // Resolve the wrists against a shared shoulder frame so contact poses fit
    // the different arm lengths on the imported rigs and the built-in rig.
    const goal = contact ?? new Vector3(target[0] * shoulder.distanceTo(other) * .5, target[1] * reach, target[2] * reach)
      .applyQuaternion(modelRotation).add(shoulder.clone().lerp(other, .5));
    const pole = new Vector3(side, -.8, behindBack ? -.57 : -.14).applyQuaternion(modelRotation);
    // The imported Villager elbows flex around local -Z on both mirrored bones.
    const hinge = !behindBack && !articulated ? undefined : limb.shoulder instanceof Bone ? new Vector3(0, 0, -1)
      : elbow.clone().sub(shoulder).cross(wrist.sub(elbow)).normalize()
        .applyQuaternion(limb.shoulder.getWorldQuaternion(new Quaternion()).invert());
    aimLimb(limb.shoulder, limb.elbow, limb.hand, goal, pole, hinge);
  };
  const orientPalm = (rig: ReturnType<typeof driverHand> | undefined, target: Palm | undefined) => {
    if (!rig || !target) return;
    const [fingers, normal] = target;
    const direction = new Vector3(...fingers).applyQuaternion(modelRotation).normalize();
    aimDriverJoint(rig.hand, rig.middle, direction.clone());
    alignJointNormal(rig.hand, direction, rig.palm, new Vector3(...normal).applyQuaternion(modelRotation));
  };

  const clips = emotes.map(emote => {
    const keys: Emote["keys"] = [
      ...(emote.keys[0]?.[0] === 0 ? [] : [[0, {}] as const]),
      ...emote.keys,
      ...(emote.keys.at(-1)?.[0] === 1 ? [] : [[1, {}] as const]),
    ];
    const animated = keys.some(([, pose]) => pose.fingers) ? joints : body;
    const times = keys.map(([time]) => time * emote.duration);
    const rotations = animated.map((): number[] => []);
    const positions: number[] = [];
    for (const [, pose] of keys) {
      joints.forEach((joint, index) => joint.quaternion.copy(rest[index]));
      root.position.copy(basePosition);
      tilt(torso, pose.torso);
      tilt(head, pose.head);
      arms(left, pose.left);
      arms(right, pose.right);
      hands(left, right, pose.leftHand, 1, pose.elbowsBack, !!pose.leftPalm);
      hands(right, left, pose.rightHand, -1, pose.elbowsBack, !!pose.rightPalm);
      orientPalm(handRigs[0], pose.leftPalm);
      orientPalm(handRigs[1], pose.rightPalm);
      tilt(left?.hand, pose.wristLeft === undefined ? undefined : [0, 0, pose.wristLeft]);
      tilt(right?.hand, pose.wrist === undefined ? undefined : [0, 0, pose.wrist]);
      pose.fingers?.forEach((shape, side) => {
        if (!shape) return;
        const rig = handRigs[side];
        if (!rig) return;
        for (const { joint, axis, name, segment } of rig.fingers) {
          const extended = shape === "open" || (name === "index" && ["point", "peace", "three", "finger-gun", "frame"].includes(shape))
            || (name === "thumb" && ["finger-gun", "thumb-up", "frame", "shaka"].includes(shape))
            || (name === "middle" && (shape === "peace" || shape === "three")) || (name === "ring" && shape === "three")
            || (name === "pinky" && shape === "shaka");
          const curved = (shape === "heart" && (name === "index" || name === "thumb"))
            || ((shape === "finger-heart" || shape === "pinch") && name === "index");
          const bend = extended ? -.16 : curved ? .39 : shape === "paw" ? .66 : .96;
          const curl = shape === "thumb-up" && name !== "thumb" ? [1.04, 1.34, .67][segment]
            : shape === "cup" ? [.49, .85, .51][segment]
            : bend * [1, .95, .57][segment];
          joint.rotateOnAxis(axis, curl * (name === "thumb" ? .36 : 1));
        }
        if ((shape === "finger-heart" || shape === "pinch") && rig.thumb && rig.index) {
          const { thumb, index: [indexBase, middleIndex, endIndex] } = rig;
          const mid = middleIndex.getWorldPosition(new Vector3());
          const tip = endIndex.getWorldPosition(new Vector3());
          const palm = rig.palm.clone().applyQuaternion(rig.hand.getWorldQuaternion(new Quaternion()));
          const scale = rig.hand.getWorldScale(new Vector3()).x;
          const target = shape === "pinch" ? tip.clone().addScaledVector(palm, .006 * scale) : mid.lerp(tip, .7).addScaledVector(palm, .01 * scale);
          aimLimb(thumb[0], thumb[1], thumb[2], target, palm);
          if (shape === "pinch") {
            // Flex the index toward the thumb after accounting for its reach.
            const contact = thumb[2].getWorldPosition(new Vector3()).lerp(tip, .17);
            const arc = mid.sub(indexBase.getWorldPosition(new Vector3()));
            aimLimb(indexBase, middleIndex, endIndex, contact, arc);
          }
        }
        if ((shape === "thumb-up" || shape === "finger-gun" || shape === "frame" || shape === "shaka") && rig.thumb) {
          const [base, middle, tip] = rig.thumb;
          const inward = side === 0 ? -1 : 1;
          const direction = (shape === "shaka" ? new Vector3(inward, .62, .15)
            : shape === "frame" ? new Vector3(inward, .19, .09) : new Vector3(inward * .13, 1, .08)).applyQuaternion(modelRotation);
          aimDriverJoint(base, middle, direction.clone());
          aimDriverJoint(middle, tip, direction);
        }
      });
      const [leftRig, rightRig] = handRigs;
      if (pose.fingers?.[0] === "heart" && pose.fingers[1] === "heart" && leftRig?.thumb && rightRig?.thumb) {
        const meeting = leftRig.thumb[2].getWorldPosition(new Vector3()).lerp(rightRig.thumb[2].getWorldPosition(new Vector3()), .5);
        for (const rig of [leftRig, rightRig]) {
          const [base, middle, end] = rig.thumb!;
          aimLimb(base, middle, end, meeting.clone(), rig.palm.clone().applyQuaternion(rig.hand.getWorldQuaternion(new Quaternion())));
        }
        if (leftRig.index && rightRig.index) {
          const notch = leftRig.index[2].getWorldPosition(new Vector3())
            .lerp(rightRig.index[2].getWorldPosition(new Vector3()), .5)
            .addScaledVector(new Vector3().setFromMatrixColumn(modelMatrix, 1), -.021);
          for (const [side, [base, middle, tip]] of [leftRig.index, rightRig.index].entries()) {
            const curve = new Vector3(side === 0 ? .5 : -.5, 1, 0).applyQuaternion(modelRotation);
            aimLimb(base, middle, tip, notch.clone(), curve);
          }
        }
      }
      if (pose.joinIndexTips && left && right && leftRig?.index && rightRig?.index) {
        const leftTip = leftRig.index[2].getWorldPosition(new Vector3());
        const rightTip = rightRig.index[2].getWorldPosition(new Vector3());
        const meeting = leftTip.clone().lerp(rightTip, .5);
        // Bring the fingertips together while keeping the authored elbow arc.
        for (const [arm, rig, palm, tip] of [[left, leftRig, pose.leftPalm, leftTip], [right, rightRig, pose.rightPalm, rightTip]] as const) {
          const goal = arm.hand.getWorldPosition(new Vector3()).add(meeting).sub(tip);
          const pole = arm.elbow.getWorldPosition(new Vector3()).sub(arm.shoulder.getWorldPosition(new Vector3()));
          aimLimb(arm.shoulder, arm.elbow, arm.hand, goal, pole);
          orientPalm(rig, palm);
        }
      }
      if (pose.rightAtLips && head && lipAnchor && rightRig?.fingertip) {
        // Offset the wrist by the posed finger length so the kiss meets the head
        // at the same point on both imported rigs.
        const tipOffset = rightRig.fingertip.getWorldPosition(new Vector3()).sub(rightRig.hand.getWorldPosition(new Vector3()));
        const goal = head.localToWorld(lipAnchor.clone()).add(lipClearance).sub(tipOffset);
        hands(right, left, pose.rightHand, -1, false, true, goal);
        orientPalm(rightRig, pose.rightPalm);
      }
      root.position.add(new Vector3(pose.sway ?? 0, pose.rise ?? 0, pose.travel ?? 0).applyQuaternion(rest[0]));
      if (pose.turn) root.rotateY(pose.turn);
      if (pose.rise || pose.sway || pose.travel || pose.turn || pose.feet) for (const leg of legs) {
        const [sideOffset, lift, forward, pivot = 0, pitch = 0] = pose.feet?.[leg.side] ?? [0, 0, 0];
        const yaw = new Quaternion().setFromAxisAngle(up, pivot);
        const goal = leg.anchor.clone().applyQuaternion(yaw).add(new Vector3(sideOffset, lift, forward)).applyMatrix4(modelMatrix);
        const knee = new Vector3(leg.side === "l" ? .16 : -.16, 0, 1).applyQuaternion(yaw).applyQuaternion(modelRotation);
        aimLimb(leg.thigh, leg.calf, leg.foot, goal, knee);
        // Counter the shin's rotation, then pitch only the swinging shoe.
        const shoe = yaw.multiply(new Quaternion().setFromAxisAngle(across, pitch));
        leg.foot.quaternion.copy(leg.calf.getWorldQuaternion(new Quaternion()).invert()
          .multiply(modelRotation).multiply(shoe).multiply(inverseModelRotation).multiply(leg.orientation));
      }
      animated.forEach((joint, index) => rotations[index].push(...joint.quaternion.toArray()));
      positions.push(...root.position.toArray());
    }
    return new AnimationClip(emote.id + " " + emote.name, emote.duration, [
      ...animated.map((joint, index) => new QuaternionKeyframeTrack(joint.uuid + ".quaternion", times, rotations[index])),
      new VectorKeyframeTrack(root.uuid + ".position", times, positions),
      ...faceTargets.flatMap((targets, channel) => targets.map(({ mesh, index }) =>
        new NumberKeyframeTrack(mesh.uuid + ".morphTargetInfluences[" + index + "]", times,
          keys.map(([, pose]) => pose.face?.[channel] ?? 0)))),
      ...(tears && keys.some(([, pose]) => pose.wetEyes) ? [new NumberKeyframeTrack(tears.uuid + ".material.opacity", times,
        keys.map(([, pose]) => pose.wetEyes ?? 0))] : []),
    ]);
  });
  joints.forEach((joint, index) => joint.quaternion.copy(rest[index]));
  root.position.copy(basePosition);
  root.updateMatrixWorld(true);
  return clips;
}

export function emoteCollection(group: EmoteGroup, bag: boolean, includeWalks = true): readonly Emote[] {
  if (group === "Victory") return availableVictoryEmotes(bag);
  if (group === "Playful") return availablePlayfulEmotes(bag);
  if (group === "Shy") return availableShyEmotes(bag);
  if (group === "Tsundere") return availableTsundereEmotes(bag);
  if (group === "Expressions") return availableExpressionEmotes(bag);
  if (group === "Roadside") return availableRoadsideEmotes(bag);
  if (group === "Rivalry") return availableRivalryEmotes(bag);
  if (group === "Pit Crew") return availablePitCrewEmotes(bag);
  if (group === "After Hours") return availableAfterHoursEmotes(bag);
  if (bag) return [...GARAGE_EMOTES.filter(item => compatibleGarageEmotes(item.id)), ...BAG_EMOTES];
  return includeWalks ? [...GARAGE_EMOTES, ...WALK_EMOTES] : GARAGE_EMOTES;
}

export function buildGarageEmotes(root: Object3D, bag = false, previewPacks = false, leanFit?: GarageLeanFit) {
  const emotes = previewPacks ? EMOTE_GROUPS.flatMap(group => emoteCollection(group, bag)) : emoteCollection("Garage", bag, false);
  if (bag || previewPacks) return buildEmoteClips(root, emotes);
  return buildEmoteClips(root, [...emotes, QUIET_THANK_YOU, ...(leanFit ? [garageLeanPose(leanFit)] : [])]);
}
