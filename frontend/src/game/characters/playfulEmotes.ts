import type { Emote, Palm } from "./garageEmotes";

const faceCoverLeft: Palm = [[-.08, 1, -.04], [0, 0, -1]];
const faceCoverRight: Palm = [[.08, 1, -.04], [0, 0, -1]];
const cheekLeft: Palm = [[-.035, 1, -.14], [-1, 0, .12]];
const cheekRight: Palm = [[.035, 1, -.14], [1, 0, .12]];
const pawLeft: Palm = [[.13, -.12, 1], [0, -1, -.12]];
const pawRight: Palm = [[-.13, -.12, 1], [0, -1, -.12]];
const forwardPoint: Palm = [[0, .18, 1], [0, -1, .18]];
const displayCount: Palm = [[-.08, 1, .12], [0, 0, 1]];
const palmUpLeft: Palm = [[.72, .08, .63], [0, 1, 0]];
const palmUpRight: Palm = [[.12, .32, 1], [0, 1, -.32]];
const marchNeutral = {
  leftHand: [2.04, -.53, .44], rightHand: [-2.04, -.53, .44],
  leftPalm: [[.15, -.6, .85], [-1, 0, 0]], rightPalm: [[-.15, -.6, .85], [1, 0, 0]],
} as const;
const marchLeftBack = {
  ...marchNeutral, leftHand: [2.35, -.48, -.13], leftPalm: [[.32, -.83, .16], [-1, 0, 0]], rightHand: [-1.65, -.4, .66],
} as const;
const marchRightBack = {
  ...marchNeutral, rightHand: [-2.35, -.48, -.13], rightPalm: [[-.32, -.83, .16], [1, 0, 0]], leftHand: [1.65, -.4, .66],
} as const;

const cover = {
  leftHand: [.33, .27, .51], rightHand: [-.33, .27, .51],
  leftPalm: faceCoverLeft, rightPalm: faceCoverRight, fingers: ["open", "open"],
} as const;
const paws = { leftPalm: pawLeft, rightPalm: pawRight, fingers: ["paw", "paw"] } as const;
const count = { rightPalm: displayCount, rightHand: [-1.37, .27, .58], sway: -.026, rise: -.021 } as const;
const point = { rightPalm: forwardPoint, fingers: [null, "point"], sway: -.032, rise: -.023 } as const;
const handsHidden = { leftHand: [.28, -.75, -.5], rightHand: [-.28, -.75, -.54], elbowsBack: true } as const;
const handsAtSides = {
  leftHand: [2.4, -.51, .35], rightHand: [-2.4, -.51, .35], leftPalm: marchNeutral.leftPalm, rightPalm: marchNeutral.rightPalm,
} as const;
const handsMovingBack = {
  leftHand: [2.3, -.49, -.44], rightHand: [-2.3, -.49, -.44], elbowsBack: true,
  leftPalm: [[.36, -.62, -.53], [-1, 0, 0]], rightPalm: [[-.36, -.62, -.53], [1, 0, 0]],
} as const;
const offer = {
  leftHand: [2.64, -.12, .52], rightHand: [.47, -.39, .65],
  leftPalm: palmUpLeft, rightPalm: [[.65, .05, .76], [0, 1, 0]], fingers: ["open", "open"],
  turn: .3, rise: -.029, sway: .044, feet: { l: [.062, 0, .045, .27] },
} as const;

const heartPath = [
  [.20, -1.13, .26], [.26, -1.42, .37], [.32, -1.77, .33], [.38, -1.78, .19],
  [.46, -1.48, .08], [.53, -1.12, -.045], [.61, -.72, .08], [.68, -.43, .20],
  [.74, -.45, .33], [.80, -.80, .37], [.86, -1.13, .26],
] as const;

export const PLAYFUL_EMOTES = [
  { id: "021", name: "Peekaboo", duration: 3.25, keys: [
    [.16, { ...cover, leftHand: [1.2, -.12, .63], rightHand: [-1.2, -.12, .63], rise: -.022, face: [.14, .2] }],
    [.33, { ...cover, sway: -.025, rise: -.055, head: [.055, 0, 0], face: [.13, .05] }],
    [.50, { ...cover, leftHand: [.82, .26, .53], rightHand: [-.63, .23, .55], sway: .031, rise: -.035, head: [-.09, -.04, -.13], face: [.85, .65] }],
    [.66, { ...cover, leftHand: [1.32, .16, .56], rightHand: [-1.32, .16, .56], sway: .045, rise: -.022, head: [-.1, .05, -.12], face: [1, .82] }],
    [.83, { sway: .021, rise: -.017, head: [-.05, 0, -.07], face: [.65, .24] }],
  ] },
  { id: "022", name: "Paw pose", duration: 2.9, keys: [
    [.19, { ...paws, leftHand: [1.5, -.01, .52], rightHand: [-1.5, -.01, .52], sway: -.025, rise: -.022, head: [0, .04, .1], face: [.52, .4] }],
    [.34, { ...paws, leftHand: [1.24, .24, .54], rightHand: [-1.3, .22, .54], sway: -.038, rise: -.022, head: [-.07, .06, .14], face: [.78, .5] }],
    [.44, { ...paws, leftHand: [1.2, .16, .71], rightHand: [-1.27, .14, .69], sway: -.034, rise: -.042, face: [.98, .63] }],
    [.54, { ...paws, leftHand: [1.29, .23, .53], rightHand: [-1.25, .25, .55], sway: .032, rise: -.027, head: [-.06, -.04, -.11], face: [.85, .42] }],
    [.65, { ...paws, leftHand: [1.25, .12, .7], rightHand: [-1.24, .15, .73], sway: .04, rise: -.042, head: [.025, -.03, -.1], face: [1, .67] }],
    [.8, { ...paws, leftHand: [1.44, -.06, .58], rightHand: [-1.44, -.06, .58], head: [0, -.03, -.07], face: [.7, .3] }],
  ] },
  { id: "023", name: "Air doodle", duration: 3.95, keys: [
    [.11, { ...point, rightHand: [-1.35, -.03, .53], head: [.1, -.18, .06], face: [.37, .22] }],
    ...heartPath.map(([time, x, y]) => [time, {
      ...point, rightHand: [x, y, .65], head: [.09 - y * .38, x * .16, .045], face: [.62, .38],
    }] as const),
    [.92, { ...point, rightHand: [-1.19, .15, .56], face: [.91, .46], head: [-.065, 0, .055] }],
  ] },
  { id: "024", name: "Balancing act", duration: 3.45, keys: [
    [.19, { leftHand: [2.41, -.29, .39], rightHand: [-2.41, -.29, .39], sway: -.065, rise: -.036, head: [.08, -.05, -.05], face: [.2, .35] }],
    [.37, { leftHand: [3.35, .03, .28], rightHand: [-3.32, .01, .28], sway: -.142, rise: -.036, feet: { l: [.082, .143, -.109, .15] }, torso: [.04, .01, .11], head: [0, .04, -.08], face: [.61, .4] }],
    [.53, { leftHand: [3.14, -.15, .31], rightHand: [-3.16, .15, .36], sway: -.136, rise: -.049, feet: { l: [.096, .131, -.119, .18] }, torso: [.06, 0, .19], head: [.04, -.05, -.12], face: [.4, .65] }],
    [.67, { leftHand: [3.19, .1, .34], rightHand: [-3.17, -.18, .32], sway: -.145, rise: -.032, feet: { l: [.071, .111, -.077, .11] }, torso: [.035, .025, .065], head: [0, 0, -.055], face: [.88, .27] }],
    [.83, { leftHand: [1.9, -.39, .42], rightHand: [-1.9, -.39, .42], sway: -.053, rise: -.047, feet: { l: [.024, 0, -.023] }, torso: [.08, 0, .025], face: [.69, .22] }],
  ] },
  { id: "025", name: "Finger count mistake", duration: 4.2, keys: [
    [.15, { ...count, fingers: [null, "point"], head: [.04, -.25, .1], face: [.37, .22] }],
    [.27, { ...count, fingers: [null, "peace"], head: [.025, -.25, .09], face: [.52, .28] }],
    [.38, { ...count, fingers: [null, "three"], head: [.015, -.23, .06], face: [.48, .28] }],
    [.51, { ...count, rightPalm: [[-.12, 1, .08], [0, 0, -1]], fingers: [null, "three"], head: [.12, -.29, .15], sway: -.052, rise: -.032, face: [-.15, -.53] }],
    [.64, { ...count, fingers: [null, "fist"], head: [-.07, .06, -.09], face: [.12, .81] }],
    [.74, { ...count, fingers: [null, "point"], head: [.04, -.18, .06], face: [.67, .4] }],
    [.85, { ...count, fingers: [null, "peace"], head: [0, -.1, .06], face: [.91, .54] }],
  ] },
  { id: "026", name: "Tiny marching feet", duration: 3.2, keys: [
    [.12, { ...handsAtSides, sway: -.057, rise: -.039, torso: [.05, -.065, .025], face: [.5, .33] }],
    [.23, { ...marchLeftBack, sway: -.078, rise: -.018, feet: { l: [.012, .117, .098, .06] }, torso: [-.03, -.13, .08], face: [.79, .38] }],
    [.32, { ...marchNeutral, sway: -.019, rise: -.046, feet: { l: [.008, 0, .035] }, torso: [.07, -.04, .045], face: [.86, .3] }],
    [.43, { ...marchRightBack, sway: .074, rise: -.017, feet: { l: [.008, 0, .035], r: [-.014, .126, .101, -.08] }, torso: [-.025, .13, -.07], face: [.87, .42] }],
    [.52, { ...marchNeutral, sway: .034, rise: -.049, feet: { l: [.008, 0, .035] }, torso: [.07, .055, -.035], face: [.82, .34] }],
    [.63, { ...marchLeftBack, sway: -.073, rise: -.017, feet: { l: [.012, .122, .091, .055] }, torso: [-.03, -.13, .068], face: [.93, .4] }],
    [.72, { ...marchNeutral, sway: -.028, rise: -.047, torso: [.07, -.055, .041], face: [.89, .32] }],
    [.83, { ...marchRightBack, sway: .064, rise: -.021, feet: { r: [-.013, .101, .079, -.06] }, torso: [-.03, .11, -.067], face: [.94, .42] }],
    [.91, { ...handsAtSides, sway: .025, rise: -.039, torso: [.065, .025, -.018], face: [.76, .24] }],
  ] },
  { id: "027", name: "Ta da reveal", duration: 3.55, keys: [
    [.11, { ...handsAtSides, rise: -.02, head: [.065, -.14, .04], face: [.24, .3] }],
    [.20, { ...handsMovingBack, rise: -.026, sway: -.027, head: [.045, -.04, -.03] }],
    [.34, { ...handsHidden, rise: -.034, sway: -.042, head: [.03, .08, -.065], face: [.48, .52] }],
    [.46, { ...handsMovingBack, sway: -.056, rise: -.035, feet: { l: [.027, .041, .026, .12] }, head: [-.04, .22, -.03] }],
    [.54, { ...handsAtSides, sway: -.014, rise: -.028, feet: { l: [.054, .028, .039, .23] }, head: [-.075, .23, -.045] }],
    [.64, { ...offer, torso: [-.04, .14, -.04], head: [-.1, .27, -.06], face: [1, .79] }],
    [.78, { ...offer, torso: [-.055, .13, -.065], head: [-.08, -.12, -.07], face: [.91, .46] }],
    [.90, { ...offer, leftHand: [1.7, -.46, .52], rightHand: [-1.24, -.45, .58], turn: .12, feet: { l: [.024, .028, .019, .11] }, sway: -.016, face: [.69, .21] }],
  ] },
  { id: "028", name: "Imaginary butterfly", duration: 3.65, keys: [
    [.15, { head: [-.17, -.39, .13], sway: -.04, rise: -.02, face: [.15, .81] }],
    [.28, { head: [-.28, -.12, -.07], torso: [-.07, -.075, .045], sway: -.026, rise: -.021, face: [.43, .66] }],
    [.43, { head: [-.15, .32, -.15], torso: [-.02, .045, -.015], sway: .036, rise: -.031, face: [.62, .53] }],
    [.61, { rightHand: [-.42, .22, .75], rightPalm: palmUpRight, fingers: [null, "open"], head: [-.1, .095, -.12], sway: .02, rise: -.026, face: [.85, .44] }],
    [.75, { rightHand: [-1.04, .33, .8], rightPalm: palmUpRight, fingers: [null, "open"], head: [-.19, -.22, .085], sway: -.048, rise: -.026, face: [.81, .63] }],
    [.88, { head: [-.23, -.36, .105], sway: -.038, rise: -.022, face: [.67, .4] }],
  ] },
  { id: "029", name: "Cheek framing pose", duration: 3.05, keys: [
    [.17, { leftHand: [1.58, -.18, .57], rightHand: [-1.58, -.18, .57], sway: -.018, rise: -.029, face: [.41, .24] }],
    [.37, { leftHand: [1.15, .13, .47], rightHand: [-1.15, .13, .47], leftPalm: cheekLeft, rightPalm: cheekRight, fingers: ["open", "open"], sway: -.031, rise: -.038, head: [-.045, -.02, -.16], face: [.95, .47] }],
    [.66, { leftHand: [1.15, .14, .47], rightHand: [-1.15, .13, .47], leftPalm: cheekLeft, rightPalm: cheekRight, fingers: ["open", "open"], sway: .025, rise: -.029, head: [-.055, .025, .135], face: [1, .56] }],
    [.84, { leftHand: [1.6, -.08, .58], rightHand: [-1.6, -.08, .58], sway: .014, rise: -.019, head: [-.02, .03, .065], face: [.67, .28] }],
  ] },
  { id: "030", name: "Almost a sneeze", duration: 3.25, keys: [
    [.18, { ...count, rightHand: [-1.2, .12, .61], fingers: [null, "point"], head: [.035, -.04, .025], face: [.15, .4] }],
    [.36, { ...count, rightHand: [-1.22, .16, .57], fingers: [null, "point"], torso: [-.09, -.055, .035], head: [-.2, -.02, .025], sway: -.044, rise: -.019, face: [-.16, .75] }],
    [.51, { rightHand: [-.67, -.09, .63], rightPalm: [[.24, .57, .78], [0, -.74, .57]], fingers: [null, "paw"], torso: [.17, -.07, .03], head: [.21, -.04, -.02], sway: -.06, rise: -.073, face: [-.24, -.42] }],
    [.62, { rightHand: [-.68, -.19, .6], torso: [.115, -.03, .02], head: [.155, -.04, 0], sway: -.042, rise: -.054, face: [-.14, -.27] }],
    [.81, { torso: [-.035, 0, -.024], head: [-.06, .04, .064], sway: -.018, rise: -.018, face: [.64, .33] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["023", "025", "028", "030"];

export function availablePlayfulEmotes(bag: boolean) {
  return bag ? PLAYFUL_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : PLAYFUL_EMOTES;
}
