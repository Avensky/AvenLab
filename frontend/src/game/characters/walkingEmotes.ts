import type { Emote, XYZ } from "./garageEmotes";

const leftStep = { leftHand: [1.6, -.65, .22], rightHand: [-1.46, -.54, .48], torso: [.03, -.062, .016] } as const;
const rightStep = { leftHand: [1.46, -.54, .48], rightHand: [-1.6, -.65, .22], torso: [.03, .062, -.016] } as const;
const leftForward = [0, 0, .155, .035] as const;
const rightForward = [0, 0, .27, -.035] as const;

export const walkForward = [
  [.10, { ...leftStep, travel: .028, sway: -.026, rise: -.025, feet: { l: [0, .037, .073, .02, .17] } }],
  [.22, { ...leftStep, travel: .085, sway: -.014, rise: -.036, feet: { l: leftForward } }],
  [.33, { ...rightStep, travel: .126, sway: .025, rise: -.022, feet: { l: leftForward, r: [0, .048, .127, -.02, .13] } }],
  [.44, { ...rightStep, travel: .191, sway: .013, rise: -.037, feet: { l: leftForward, r: rightForward } }],
] as const satisfies Emote["keys"];

export const walkPause = {
  travel: .201, sway: -.007, rise: -.025, feet: { l: leftForward, r: rightForward },
} as const;

export const walkReturn = [
  [.69, { ...rightStep, travel: .164, sway: .023, rise: -.027, feet: { l: leftForward, r: [0, .042, .128, -.02, -.14] } }],
  [.78, { ...rightStep, travel: .103, sway: .006, rise: -.04, feet: { l: leftForward } }],
  [.88, { ...leftStep, travel: .061, sway: -.023, rise: -.022, feet: { l: [0, .037, .074, .015, -.13] } }],
  [.96, { travel: .012, rise: -.012 }],
] as const satisfies Emote["keys"];

type Plant = readonly [across: number, forward: number, yaw: number];
const phases = [.15, .3, .46, .64, .82, 1];
const softPhases = [.15, .3, .46, .64, .82, .93, 1];
const fullTurn = Math.PI * 2;
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

function garageWalk(pathHeading: number, stride: number, glance: number, style?: "soft" | "dress-clearance"): Emote["keys"] {
  const heading = Math.abs(pathHeading);
  const direction = Math.sign(pathHeading) || 1;
  const soft = style === "soft";
  const clearDress = style === "dress-clearance";
  // Successive foot contacts and pelvis positions in the floor frame.
  const stops = [
    [[-.012, .19, heading], [0, .084, heading * .68]],
    [[0, .43, heading + .08], [0, .29, heading + .04]],
    [[.035, .51, heading + .92], [.026, .427, heading + .64]],
    [[.105, .44, heading + 2.16], [.074, .447, heading + 1.78]],
    [[.085, .27, heading + 3.08], [.085, .359, heading + 2.87]],
    [[.068, .13, heading + 3.29], [.067, .204, heading + 3.16]],
    [[.026, .019, heading + 4.54], [.035, .079, heading + 4.21]],
    [[0, 0, fullTurn], [.008, .014, 5.51 + heading * .35]],
    [[0, 0, fullTurn], [0, 0, fullTurn]],
  ] as const satisfies readonly (readonly [Plant, Plant])[];
  const cos = Math.cos(heading), sin = Math.sin(heading);
  const onFloor = ([across, forward, yaw]: Plant): Plant => [
    (cos * across + sin * forward) * stride * direction, (cos * forward - sin * across) * stride, yaw * direction,
  ];
  const origin = [0, 0, 0] as const;
  const plants = { l: origin as Plant, r: origin as Plant };
  let pelvis: Plant = origin;
  const keys: Emote["keys"][number][] = [];

  for (const [index, [nextContact, nextPelvis]] of stops.entries()) {
    const stepping = index % 2 === (direction < 0 ? 1 : 0) ? "l" : "r";
    const stance = stepping === "l" ? "r" : "l";
    const side = stepping === "l" ? 1 : -1;
    const from = plants[stepping];
    const to = onFloor(nextContact);
    const next = onFloor(nextPelvis);
    const planted = plants[stance];
    for (const phase of soft ? softPhases : phases) {
      const progress = (index + phase) / stops.length;
      const roll = phase * phase * (3 - 2 * phase);
      const lift = Math.sin(phase * Math.PI);
      const activity = Math.min(index + phase, stops.length - index - phase, 1);
      const yaw = mix(pelvis[2], next[2], phase);
      const weight = -side * .026 * lift * activity;
      const counter = -side * Math.cos(phase * Math.PI) * activity;
      const arm = (sign: number): readonly [XYZ, XYZ] => [
        [.25 * sign, -1, counter * sign * .25 + .04], [.12 * sign, -1, .25 + counter * sign * .19],
      ];
      const hands = (sign: number): XYZ => [sign * 2.03, -.62, .66 + counter * sign * .09];
      const look = Math.max(0, 1 - Math.abs(progress - .25) / .19);
      const shoeLift = soft ? .034 * lift * lift : .054 * lift;
      const toeRoll = (soft ? .095 * lift : .14) * Math.sin(2 * Math.PI * phase);
      keys.push([progress, {
        ...(clearDress ? { leftHand: hands(1), rightHand: hands(-1) } : { left: arm(1), right: arm(-1) }),
        sway: mix(pelvis[0], next[0], phase) + weight * Math.cos(yaw),
        travel: mix(pelvis[1], next[1], phase) - weight * Math.sin(yaw),
        rise: (soft ? -.033 + .015 * lift : -.043 + .026 * lift) * activity,
        turn: yaw,
        feet: {
          [stepping]: [mix(from[0], to[0], roll), shoeLift, mix(from[1], to[1], roll), mix(from[2], to[2], roll), toeRoll],
          [stance]: [planted[0], 0, planted[1], planted[2]],
        },
        torso: [.039 * activity, counter * .095, weight * 2.35],
        head: [-.018 * lift * activity, glance * look - counter * .04, weight * -.6],
        face: [.2 * activity, look * Math.abs(glance) * .53],
      }]);
    }
    plants[stepping] = to;
    pelvis = next;
  }
  // Leave the final shoe contacts in place until the idle stance takes over.
  keys[keys.length - 1] = [1, {}];
  return keys;
}

export const SIDEWAYS_CHECK: Emote = {
  id: "042", name: "Sideways check", duration: 4.9, keys: garageWalk(.57, .86, -.86),
};

export const WALK_EMOTES = [
  { id: "walk-casual", name: "Casual walk", duration: 5.3, keys: garageWalk(0, 1, .12, "soft") },
  { id: "walk-glance", name: "Side step and glance", duration: 4.85, keys: garageWalk(-.69, .88, -.57, "dress-clearance") },
] as const satisfies readonly Emote[];
