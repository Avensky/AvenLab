import {
  AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack,
  type Object3D,
} from "three";

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
};
type Emote = { id: string; name: string; duration: number; keys: readonly (readonly [time: number, pose: Pose])[] };

// Arm targets are model-space directions. Positive Z is forward. The same
// poses are retargeted to the imported skeleton and the built-in driver rigs.
const behindLeft: Arm = [[1, -4, -2], [-3, -2, -1]];
const behindRight: Arm = [[-1, -4, -2], [3, -2, -1]];
const claspLeft: Arm = [[1, -5, .5], [-3, 1, 3]];
const claspRight: Arm = [[-1, -5, .5], [3, 1, 3]];
const wave: Arm = [[-1, -.55, .28], [-.24, 1, .28]];

export const GARAGE_EMOTES = [
  { id: "001", name: "Relaxed breathing", duration: 3.6, keys: [
    [0, {}], [.25, { torso: [-.018, 0, .012], head: [0, -.027, 0] }],
    [.5, {}], [.77, { torso: [.014, 0, -.012], head: [.012, .027, 0] }], [1, {}],
  ] },
  { id: "002", name: "Comfortable weight shift", duration: 2.7, keys: [
    [.29, { torso: [.018, -.07, .115], head: [0, .06, -.072] }],
    [.62, { torso: [.02, -.04, .09], head: [-.02, .04, -.055] }],
    [.8, { torso: [0, .03, -.035] }],
  ] },
  { id: "003", name: "Curious head tilt", duration: 2.6, keys: [
    [.26, { torso: [.045, -.08, .025], head: [-.08, .1, -.2] }],
    [.55, { torso: [.045, -.05, .025], head: [-.06, .13, -.17] }],
    [.79, { head: [.02, -.25, -.04] }],
  ] },
  { id: "004", name: "Hands behind back", duration: 3.2, keys: [
    [.3, { left: behindLeft, right: behindRight, torso: [-.035, 0, .04], head: [.04, -.12, 0] }],
    [.62, { left: behindLeft, right: behindRight, torso: [-.025, .065, -.045], head: [.025, .1, .03] }],
    [.78, { left: behindLeft, right: behindRight, torso: [0, .04, 0] }],
  ] },
  { id: "005", name: "Admire the car", duration: 3.1, keys: [
    [.25, { turn: 1.72, torso: [.02, .09, 0], head: [.09, .34, 0] }],
    [.52, { turn: 1.88, torso: [.045, 0, 0], head: [-.08, .03, -.03] }],
    [.65, { turn: 1.88, head: [.16, -.06, 0] }],
    [.77, { turn: 1.72, head: [-.035, -.1, 0] }],
  ] },
  { id: "006", name: "Inspect the wheel", duration: 3.2, keys: [
    [.25, { turn: 1.92, head: [.15, .1, 0] }],
    [.47, { turn: 2.15, torso: [.32, .07, 0], head: [.26, .13, -.045], left: claspLeft, right: claspRight }],
    [.67, { turn: 2.15, torso: [.28, .03, 0], head: [.2, -.03, .03], left: claspLeft, right: claspRight }],
    [.81, { turn: 1.8, torso: [.07, 0, 0], head: [.08, 0, 0] }],
  ] },
  { id: "007", name: "Tiny happy bounce", duration: 2.35, keys: [
    [.23, { torso: [.09, 0, 0], left: claspLeft, right: claspRight, rise: -.014, knees: .18 }],
    [.35, { torso: [-.08, 0, -.04], left: claspLeft, right: claspRight, rise: .025, knees: .04 }],
    [.47, { torso: [.075, 0, .035], left: claspLeft, right: claspRight, rise: -.014, knees: .18 }],
    [.59, { torso: [-.06, 0, .035], left: claspLeft, right: claspRight, rise: .018, knees: .035 }],
    [.74, { head: [.065, -.08, .04], left: claspLeft, right: claspRight }],
  ] },
  { id: "008", name: "Shoulder stretch", duration: 3.1, keys: [
    [.22, { torso: [-.065, .1, .035], head: [.04, -.06, 0], right: [[-1, -3, 2], [2, -2, 1]] }],
    [.46, { torso: [-.08, .16, -.075], head: [.05, -.18, .04], right: [[1, -.5, 2], [3, 0, 1]], left: [[1, -2, 1], [-3, 2, 1]] }],
    [.72, { torso: [-.05, .13, -.05], head: [.025, -.12, 0], right: [[1, -.6, 2], [3, -.2, 1]], left: [[1, -2, 1], [-3, 2, 1]] }],
  ] },
  { id: "009", name: "Straighten the outfit", duration: 2.8, keys: [
    [.24, { torso: [.055, 0, 0], head: [.19, 0, 0], left: claspLeft, right: claspRight }],
    [.43, { head: [.22, -.12, 0], left: [[1, -5, 1], [-2, -2, 2]], right: claspRight }],
    [.62, { head: [.2, .12, 0], left: [[1, -5, 1], [-2, -3, 2]], right: [[-1, -5, 1], [2, -2, 2]] }],
    [.78, { head: [.12, 0, 0], right: [[-1, -5, 1], [2, -3, 2]] }],
  ] },
  { id: "010", name: "Friendly wave", duration: 2, keys: [
    [.22, { right: wave, head: [-.045, .1, .09], wrist: -.23 }],
    [.35, { right: wave, head: [-.045, .1, .09], wrist: .28 }],
    [.46, { right: wave, head: [-.025, .08, .065], wrist: -.27 }],
    [.58, { right: wave, head: [-.025, .08, .065], wrist: .25 }],
    [.7, { right: wave, head: [.025, .06, .04], wrist: -.15 }],
  ] },
] satisfies readonly Emote[];

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

export function buildGarageEmotes(root: Object3D) {
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

  const clips = GARAGE_EMOTES.map((emote, index) => {
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
    ]);
  });
  joints.forEach((joint, index) => joint.quaternion.copy(rest[index]));
  root.updateMatrixWorld(true);
  return clips;
}
