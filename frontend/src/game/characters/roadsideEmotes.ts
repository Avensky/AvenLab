import type { Emote } from "./garageEmotes";

const glove = {
  leftHand: [.34, -.31, .65], rightHand: [-.13, -.28, .69],
  leftPalm: [[-.54, .37, .76], [0, -.95, .18]], rightPalm: [[.91, .19, .37], [0, -.84, .35]],
  fingers: ["open", "cup"],
} as const;
const point = {
  rightHand: [-1.44, .06, .9], rightPalm: [[-.69, .15, .71], [0, -.9, .15]], fingers: [null, "point"],
} as const;
const hold = {
  rightHand: [-1.31, .13, .62], rightPalm: [[.045, .98, .16], [0, 0, 1]], fingers: [null, "open"],
} as const;
const beckon = {
  rightHand: [-1.16, -.02, .77], rightPalm: [[.04, .64, .77], [0, .76, -.65]], fingers: [null, "open"],
} as const;
const checkStep = { l: [.075, 0, .083, .18] } as const;

export const ROADSIDE_EMOTES = [
  { id: "061", name: "Glove check", duration: 3.3, keys: [
    [.17, { ...glove, leftHand: [.82, -.45, .6], rightHand: [-.55, -.4, .66], head: [.14, .06, .025], face: [.12, .1] }],
    [.35, { ...glove, rightHand: [-.07, -.36, .65], torso: [.06, -.02, -.034], head: [.22, .03, .058], rise: -.018 }],
    [.51, { ...glove, rightHand: [.39, -.23, .75], sway: .03, torso: [.045, .07, -.025], head: [.18, -.025, .05], face: [.36, .13] }],
    [.69, { ...glove, leftHand: [.69, -.31, .62], rightHand: [-.56, -.32, .61], head: [-.06, -.08, .025], face: [.62, .23] }],
    [.85, { head: [.02, -.05, .03], rise: -.013, face: [.38, .12] }],
  ] },
  { id: "062", name: "Ready nod", duration: 2.55, keys: [
    [.22, { torso: [-.041, .07, .023], head: [-.075, -.16, .05], sway: -.024, face: [.28, .35] }],
    [.39, { torso: [.025, .022, -.031], head: [.21, -.045, .021], sway: .025, rise: -.03, face: [.47, .16] }],
    [.52, { torso: [-.031, .014, -.02], head: [-.03, .035, -.06], rise: -.016, face: [.74, .28] }],
    [.72, { head: [.032, .09, -.034], sway: .019, face: [.59, .17] }],
  ] },
  { id: "063", name: "Point the way", duration: 3.05, keys: [
    [.18, { ...point, rightHand: [-1.35, -.26, .57], head: [.025, -.18, -.055], sway: -.025, face: [.29, .24] }],
    [.38, { ...point, turn: -.28, feet: { r: [-.042, 0, .036, -.29] }, torso: [.025, -.18, .06], head: [-.08, -.49, .026], rise: -.025, face: [.62, .49] }],
    [.61, { ...point, turn: -.22, feet: { r: [-.042, 0, .036, -.29] }, rightHand: [-1.49, .045, .88], head: [-.075, -.36, .034], sway: -.024, rise: -.023, face: [.7, .37] }],
    [.81, { rightHand: [-1.41, -.31, .61], head: [.04, -.15, .025], face: [.47, .21] }],
  ] },
  { id: "064", name: "Spotter hold", duration: 3.05, keys: [
    [.18, { ...hold, rightHand: [-1.34, -.2, .51], head: [.07, -.13, .052], face: [.08, .49] }],
    [.35, { ...hold, rightHand: [-1.26, .11, .85], torso: [.08, -.07, .024], rise: -.03, head: [-.07, .045, .018], face: [-.12, .64] }],
    [.62, { ...hold, rightHand: [-1.27, .1, .84], torso: [.055, -.06, .024], rise: -.029, head: [.01, .055, .035], face: [.11, .5] }],
    [.8, { ...hold, rightHand: [-1.35, -.35, .6], head: [.07, .1, .04], face: [.44, .26] }],
  ] },
  { id: "065", name: "Come forward", duration: 3.55, keys: [
    [.18, { ...beckon, rightHand: [-1.38, -.31, .64], head: [.08, -.11, .065], face: [.25, .24] }],
    [.31, { ...beckon, torso: [.06, -.07, .035], head: [.04, .06, .045], face: [.51, .42] }],
    [.42, { ...beckon, rightHand: [-1.0, .025, .57], fingers: [null, "cup"], head: [.1, .08, .06], face: [.73, .39] }],
    [.53, { ...beckon, torso: [.05, -.06, .032], head: [.02, -.03, .055], face: [.7, .33] }],
    [.63, { ...beckon, rightHand: [-1.0, .025, .57], fingers: [null, "cup"], head: [.12, .07, .04], face: [.81, .38] }],
    [.82, { rightHand: [-1.37, -.33, .61], face: [.53, .19] }],
  ] },
  { id: "066", name: "Check the tires", duration: 3.7, keys: [
    [.19, { feet: { l: [.055, .04, .047, .1] }, sway: -.026, torso: [.11, .06, .025], head: [.15, .15, -.055], rise: -.03 }],
    [.39, { feet: checkStep, sway: .054, rise: -.035, torso: [.26, .09, -.1], head: [.31, .2, -.045], face: [.02, .3] }],
    [.61, { feet: checkStep, sway: .055, rise: -.032, torso: [.23, .12, -.08], head: [.22, -.02, -.028], face: [.35, .25] }],
    [.81, { feet: { l: [.047, .028, .039, .09] }, sway: .03, rise: -.045, torso: [.1, .06, -.03], head: [-.04, -.12, .025], face: [.59, .31] }],
  ] },
  { id: "067", name: "Wave them through", duration: 3.2, keys: [
    [.19, { ...hold, rightHand: [-1.52, -.12, .57], head: [.05, -.25, .02], face: [.31, .31] }],
    [.34, { ...hold, rightHand: [-1.65, .22, .6], torso: [-.07, -.14, .055], head: [-.08, -.32, .045], sway: -.026, face: [.57, .46] }],
    [.5, { ...hold, rightHand: [-.09, .17, .81], rightPalm: [[.85, .36, .39], [0, .68, -.68]], torso: [.04, .16, -.035], head: [.05, .28, -.03], sway: .03, face: [.81, .37] }],
    [.68, { ...hold, rightHand: [.22, -.11, .65], rightPalm: [[.87, -.23, .42], [0, .76, -.6]], torso: [.035, .22, -.033], head: [.06, .42, -.05], sway: .031, face: [.77, .3] }],
    [.84, { rightHand: [-.75, -.39, .62], head: [.045, .25, -.027], face: [.48, .19] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["062", "063", "064", "065", "066", "067"];

export function availableRoadsideEmotes(bag: boolean) {
  return bag ? ROADSIDE_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : ROADSIDE_EMOTES;
}
