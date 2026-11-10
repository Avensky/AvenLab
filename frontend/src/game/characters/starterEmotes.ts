import type { Emote } from "./garageEmotes";
import { WALK_TO_MARK } from "./walkingEmotes";

const signal = {
  leftHand: [1.63, .12, .55], leftPalm: [[.11, .9, .41], [-.94, -.04, .33]],
  fingers: ["thumb-up", null],
} as const;

export const FLAG_DROP_PHASE = .48;
export const flagRest = { offset: [-.205, -.36, .29], angles: [.07, -.27, .22], fold: 1.08 } as const;
const ready = { offset: [-.225, .17, .28], angles: [.08, -.21, .18], fold: .26, ripple: .3 } as const;
const lowered = { offset: [-.236, -.29, .328], angles: [.49, -.28, 1.25], fold: .53, ripple: .87 } as const;
const rightReady = {
  rightHand: [-1.58, .13, .59], rightPalm: [[-.11, .89, .44], [.95, -.05, .3]],
  fingers: [null, "thumb-up"],
} as const;
const clear = {
  rightHand: [-1.69, -.09, .68], rightPalm: [[-.23, .4, .88], [.15, .91, -.36]],
  fingers: [null, "open"],
} as const;
const count = {
  leftHand: [1.58, .18, .54], leftPalm: [[.055, .94, .34], [-.02, -.32, .95]],
} as const;
const stepBack = [-.036, 0, -.168, -.14] as const;
const stepLeft = [.128, 0, -.134, .16] as const;

const STARTER_EMOTES = [
  WALK_TO_MARK,
  { id: "172", name: "Check the left driver", duration: 3.85, keys: [
    [.17, { turn: .1, sway: -.02, rise: -.016, head: [.045, .26, -.048], torso: [.046, .109, -.029], face: [.18, .41] }],
    [.33, { ...signal, leftHand: [1.57, -.04, .59], turn: .19, sway: .031, rise: -.025,
      torso: [.064, .143, -.047], head: [.07, .38, -.061], face: [.39, .52] }],
    [.49, { ...signal, turn: .18, sway: .035, rise: -.02, torso: [.033, .127, -.034],
      head: [-.049, .314, -.046], face: [.81, .52] }],
    [.65, { ...signal, leftHand: [1.49, .058, .57], turn: .1, sway: .019, torso: [.04, .063, -.023],
      head: [.125, .195, -.027], face: [.85, .47] }],
    [.83, { leftHand: [1.44, -.43, .47], head: [.039, .054, -.014], face: [.62, .26] }],
  ] },
  { id: "173", name: "Check the right driver", duration: 3.65, keys: [
    [.17, { turn: -.11, sway: .018, rise: -.017, torso: [.057, -.126, .031], head: [.041, -.273, .049], face: [.19, .39] }],
    [.34, { ...rightReady, turn: -.19, sway: -.036, rise: -.028,
      torso: [.065, -.144, .043], head: [.081, -.397, .062], face: [.42, .53] }],
    [.51, { ...rightReady, rightHand: [-1.64, .18, .55], turn: -.17, sway: -.032,
      torso: [.025, -.108, .039], head: [-.048, -.324, .058], face: [.8, .49] }],
    [.66, { ...rightReady, rightHand: [-1.44, -.035, .57], turn: -.09, sway: -.018,
      torso: [.051, -.058, .025], head: [.129, -.185, .043], face: [.84, .44] }],
    [.83, { rightHand: [-1.39, -.43, .45], head: [.044, -.04, .018], face: [.61, .28] }],
  ] },
  { id: "174", name: "Clear the lane", duration: 4.0, keys: [
    [.17, { ...clear, rightHand: [-.59, -.12, .6], turn: .12, sway: .02, torso: [.088, .106, -.037], head: [.084, .225, -.04] }],
    [.32, { ...clear, rightHand: [-1.07, -.01, .77], sway: -.019, rise: -.031,
      torso: [.127, -.064, .035], head: [.038, -.1, .045], face: [.25, .57] }],
    [.5, { ...clear, rightHand: [-2.47, -.12, .51], turn: -.22, sway: -.051, rise: -.02,
      rightPalm: [[-.8, .21, .59], [.06, .96, -.25]], torso: [.056, -.179, .058], head: [-.059, -.26, .067], face: [.46, .57] }],
    [.65, { ...clear, rightHand: [-2.12, -.22, .57], turn: -.15, sway: -.04, torso: [.035, -.109, .045],
      head: [.08, -.18, .05], face: [.56, .41] }],
    [.82, { rightHand: [-1.44, -.49, .45], torso: [.033, -.034, .012], head: [.038, -.039, .015], face: [.58, .29] }],
  ] },
  { id: "175", name: "Raise the flag", duration: 4.35, prop: "flag", keys: [
    [.16, { prop: { ...flagRest, show: 0 }, head: [.104, -.144, .043], torso: [.06, -.059, .02] }],
    [.29, { prop: flagRest, sway: .026, rise: -.018, torso: [.056, -.026, -.032], head: [.061, -.076, -.04], face: [.26, .4] }],
    [.44, { prop: { ...ready, offset: [-.235, .072, .305], fold: .58, ripple: -.51 }, sway: -.019, rise: -.029,
      torso: [-.036, -.063, .032], head: [-.103, -.14, .051], face: [.52, .53] }],
    [.56, { prop: { ...ready, offset: [-.23, .214, .267], angles: [.075, -.21, .25], ripple: .72 },
      sway: -.034, rise: -.02, torso: [-.064, -.07, .038], head: [-.132, -.151, .059], face: [.78, .61] }],
    [.69, { prop: { ...ready, ripple: -.55 }, sway: -.022, torso: [-.028, -.046, .024], head: [.044, .057, -.031], face: [.87, .5] }],
    [.82, { prop: { ...flagRest, ripple: .46 }, torso: [.035, -.024, .017], head: [.077, -.054, .021], face: [.71, .34] }],
    [.91, { prop: { ...flagRest, show: 0 }, face: [.49, .19] }],
  ] },
  { id: "176", name: "Hold the tension", duration: 5.3, prop: "flag", keys: [
    [.14, { prop: { ...flagRest, show: 0 }, torso: [.076, -.079, .027], head: [.093, -.12, .038] }],
    [.27, { prop: { ...ready, offset: [-.215, .083, .285], fold: .67 }, torso: [.042, -.083, .024],
      head: [-.057, -.193, .05], rise: -.026, sway: -.023, face: [.27, .57] }],
    [.39, { prop: { ...ready, ripple: -.54 }, torso: [-.04, -.025, .027], head: [-.087, -.08, .045], face: [.47, .52] }],
    [.51, { prop: { ...ready, offset: [-.228, .179, .284], angles: [.09, -.204, .196], ripple: .48 },
      torso: [-.026, .015, -.02], head: [.049, .236, -.035], sway: .021, rise: -.024, face: [.48, .6] }],
    [.63, { prop: { ...ready, offset: [-.218, .153, .3], angles: [.12, -.17, .22], ripple: -.6 },
      torso: [.019, .071, -.027], head: [-.024, .09, -.049], sway: .023, rise: -.019, face: [.59, .57] }],
    [.74, { prop: { ...ready, offset: [-.23, .14, .28], fold: .4, ripple: .59 }, torso: [-.035, -.026, .02],
      head: [.056, -.144, .043], sway: -.018, face: [.68, .47] }],
    [.84, { prop: flagRest, head: [.091, -.1, .042], torso: [.06, -.045, .024], face: [.6, .34] }],
    [.93, { prop: { ...flagRest, show: 0 }, face: [.43, .2] }],
  ] },
  { id: "177", name: "Countdown gesture", duration: 4.9, prop: "flag", keys: [
    [.14, { prop: { ...flagRest, show: 0 }, head: [.092, .069, -.026], face: [.2, .39] }],
    [.27, { ...count, prop: { ...ready, offset: [-.23, .046, .293] }, fingers: ["three", "fist"],
      head: [-.059, .127, -.048], torso: [-.037, .059, -.039], face: [.52, .55] }],
    [.38, { ...count, prop: { ...ready, ripple: -.54 }, fingers: ["three", "fist"],
      head: [.083, .125, -.04], torso: [.038, .045, -.03], sway: .018, face: [.6, .6] }],
    [.51, { ...count, prop: { ...ready, ripple: .62 }, fingers: ["peace", "fist"],
      leftHand: [1.52, .15, .56], head: [.021, .071, -.032], torso: [.03, .035, -.018], face: [.66, .57] }],
    [.65, { ...count, prop: { ...ready, ripple: -.44 }, fingers: ["point", "fist"],
      leftHand: [1.6, .225, .56], head: [-.08, .044, -.025], torso: [-.049, .008, .014], face: [.84, .62] }],
    [.78, { prop: flagRest, leftHand: [1.44, -.24, .55], head: [.087, -.026, .016], torso: [.048, -.02, .021], face: [.81, .45] }],
    [.9, { prop: { ...flagRest, show: 0 }, face: [.6, .28] }],
  ] },
  { id: "178", name: "Decisive flag drop", duration: 4.1, prop: "flag", keys: [
    [.14, { prop: { ...flagRest, show: 0 }, head: [.101, -.074, .045], face: [.22, .45] }],
    [.27, { prop: { ...ready, offset: [-.23, .208, .269] }, sway: .022, torso: [-.055, .04, -.032],
      head: [-.119, .072, -.035], face: [.58, .62] }],
    [.37, { prop: { ...ready, ripple: -.48 }, sway: -.016, torso: [-.044, -.063, .029],
      head: [-.029, -.113, .043], face: [.72, .67] }],
    [FLAG_DROP_PHASE, { prop: lowered, sway: -.039, rise: -.05, travel: .038, torso: [.177, -.091, .047],
      head: [.105, -.058, .038], face: [.89, .64] }],
    [.59, { prop: { ...lowered, angles: [.43, -.25, 1.06], ripple: -.73 }, sway: -.026, rise: -.031, travel: .022,
      torso: [.083, -.043, .023], head: [-.074, .081, -.035], face: [.94, .56] }],
    [.75, { prop: { ...flagRest, ripple: .49 }, torso: [.025, .021, -.015], head: [.057, .05, -.022], face: [.76, .42] }],
    [.88, { prop: { ...flagRest, show: 0 }, face: [.57, .24] }],
  ] },
  { id: "179", name: "Step clear of the launch", duration: 4.25, keys: [
    [.15, { sway: .031, rise: -.017, feet: { r: [-.018, .032, -.079, -.1] }, torso: [.069, -.108, -.037],
      head: [.062, -.195, .039], face: [.24, .48] }],
    [.3, { sway: -.027, rise: -.037, travel: -.106, turn: -.15, feet: { r: stepBack }, torso: [-.034, -.079, .043],
      head: [.031, -.281, .06], rightHand: [-1.72, -.45, .55], face: [.38, .54] }],
    [.43, { sway: .019, rise: -.027, travel: -.128, turn: -.12, feet: { r: stepBack, l: [.072, .038, -.075, .06] },
      torso: [-.019, -.07, -.031], head: [-.065, -.2, -.04], face: [.65, .53] }],
    [.56, { sway: .08, rise: -.038, travel: -.11, turn: .14, feet: { r: stepBack, l: stepLeft },
      torso: [.042, .092, -.05], head: [-.034, .292, -.057], face: [.79, .5] }],
    [.68, { sway: -.012, rise: -.027, travel: -.09, turn: .086, feet: { r: stepBack, l: [.06, .028, -.063, .08] },
      torso: [.053, .08, .021], head: [.078, .231, -.026], face: [.8, .38] }],
    [.82, { sway: .017, rise: -.019, travel: -.035, feet: { r: [-.015, .03, -.067, -.04] }, head: [.04, .107, -.015], face: [.63, .3] }],
  ] },
  { id: "180", name: "Cheer the passing cars", duration: 4.55, prop: "flag", keys: [
    [.15, { prop: { ...flagRest, show: 0 }, head: [.084, -.209, .06], torso: [.074, -.105, .026], face: [.22, .46] }],
    [.28, { prop: { ...ready, offset: [-.245, .124, .285], angles: [.04, -.13, .48], ripple: -.78 },
      sway: -.045, torso: [-.065, -.117, .061], head: [-.095, -.24, .08], face: [.89, .65] }],
    [.42, { prop: { ...ready, offset: [-.162, .226, .294], angles: [.13, .078, -.36], ripple: .83 }, sway: .028, rise: -.023,
      torso: [.02, .078, -.043], head: [.067, .195, -.063], face: [1, .62] }],
    [.55, { prop: { ...ready, offset: [-.243, .163, .287], angles: [.052, -.07, .52], ripple: -.84 },
      sway: -.037, torso: [-.062, -.09, .049], head: [-.092, .104, -.025], face: [1, .68] }],
    [.68, { prop: { ...ready, offset: [-.18, .155, .293], angles: [.13, .09, -.29], ripple: .72 }, sway: .026,
      torso: [.035, .075, -.032], head: [.084, .293, -.067], face: [1, .59] }],
    [.81, { prop: flagRest, torso: [.043, .05, -.017], head: [.036, .172, -.043], face: [.87, .43] }],
    [.91, { prop: { ...flagRest, show: 0 }, face: [.61, .28] }],
  ] },
] as const satisfies readonly Emote[];

export function availableStarterEmotes(bag: boolean) {
  return bag ? STARTER_EMOTES.filter(emote => emote.id !== "172" && emote.id !== "177") : STARTER_EMOTES;
}
