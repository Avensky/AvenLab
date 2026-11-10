import type { Emote } from "./garageEmotes";

const fingertips = {
  leftHand: [.86, -.24, .62], rightHand: [-.86, -.24, .62],
  leftPalm: [[-.94, .29, .21], [0, -.48, .87]], rightPalm: [[.94, .29, .21], [0, -.48, .87]],
  fingers: ["point", "point"], joinIndexTips: true,
} as const;
const handOnChest = {
  rightHand: [-.26, -.22, .5], rightPalm: [[.77, .42, -.1], [0, 0, -1]], fingers: [null, "open"],
} as const;
const shrug = {
  leftHand: [1.68, -.17, .49], rightHand: [-1.68, -.17, .49],
  leftPalm: [[.62, .2, .72], [0, 1, -.1]], rightPalm: [[-.62, .2, .72], [0, 1, -.1]], fingers: ["open", "open"],
} as const;
const chin = {
  rightHand: [-.63, .075, .47], rightPalm: [[.53, .82, .19], [-.8, .39, -.45]], fingers: [null, "point"],
} as const;
const peek = {
  leftHand: [1.06, .13, .54], leftPalm: [[.02, 1, -.07], [0, 0, -1]], fingers: ["open", null],
} as const;
const flutter = {
  rightHand: [-1.35, .14, .62], rightPalm: [[-.06, .97, .16], [0, 0, 1]], fingers: [null, "open"],
} as const;

const EXPRESSION_EMOTES = [
  { id: "051", name: "Fingertip plea", duration: 3.9, keys: [
    [.16, { leftHand: [1.36, -.45, .57], rightHand: [-1.36, -.44, .57], head: [.13, -.07, -.035], rise: -.016, face: [-.11, .28] }],
    [.33, { ...fingertips, torso: [.07, 0, .015], head: [.075, -.045, -.065], sway: -.023, rise: -.025, face: [-.09, .76], wetEyes: .68 }],
    [.46, { ...fingertips, leftHand: [.84, -.26, .65], rightHand: [-.83, -.23, .66], head: [-.055, -.02, -.035], sway: -.016, rise: -.029, face: [.02, 1], wetEyes: .92 }],
    [.58, { ...fingertips, joinIndexTips: false, leftHand: [1.12, -.26, .63], rightHand: [-1.1, -.23, .62], head: [-.077, .045, .045], rise: -.023, face: [.15, .86], wetEyes: .9 }],
    [.69, { ...fingertips, head: [-.105, .045, .066], sway: .02, rise: -.024, face: [.51, .65], wetEyes: .73 }],
    [.85, { leftHand: [1.31, -.42, .57], rightHand: [-1.29, -.42, .57], head: [.095, .045, .04], rise: -.016, face: [.64, .35], wetEyes: .24 }],
  ] },
  { id: "052", name: "Relieved exhale", duration: 3.4, keys: [
    [.18, { ...handOnChest, torso: [-.12, 0, -.024], head: [-.07, 0, .03], rise: .009, face: [-.12, .59] }],
    [.41, { ...handOnChest, torso: [.15, 0, .035], head: [.24, .045, -.065], rise: -.043, sway: -.029, face: [.27, -.08] }],
    [.64, { ...handOnChest, torso: [.045, .045, -.036], head: [.075, -.08, -.034], rise: -.027, face: [.83, .31] }],
    [.82, { rightHand: [-1.15, -.47, .61], head: [-.045, -.065, -.035], face: [.58, .21] }],
  ] },
  { id: "053", name: "Little double take", duration: 2.9, keys: [
    [.15, { head: [.025, -.48, .03], torso: [.035, -.12, .03], sway: -.036, face: [.22, .13] }],
    [.3, { head: [.05, .15, -.04], torso: [.014, .06, -.025], rise: -.02, face: [.21, .22] }],
    [.4, { head: [-.14, -.52, .075], torso: [-.125, -.16, .085], sway: .055, rise: -.03, face: [-.1, 1] }],
    [.66, { head: [-.075, -.36, .1], torso: [-.055, -.09, .05], sway: .04, face: [.54, .59] }],
    [.83, { head: [.04, -.04, -.055], face: [.48, .25] }],
  ] },
  { id: "054", name: "Who, me?", duration: 3.1, keys: [
    [.17, { rightHand: [-1.22, -.34, .59], head: [-.115, .04, .065], face: [.22, .72] }],
    [.37, { rightHand: [-.88, -.16, .54], rightPalm: [[.94, .25, -.23], [0, .15, -1]], fingers: [null, "point"], torso: [-.085, -.05, -.03], head: [-.07, .03, .1], rise: -.018, face: [.5, .9] }],
    [.58, { rightHand: [-.88, -.19, .51], rightPalm: [[.95, .22, -.21], [0, .15, -1]], fingers: [null, "point"], head: [.045, -.085, -.04], sway: -.032, rise: -.026, face: [.78, .57] }],
    [.81, { rightHand: [-1.19, -.4, .57], head: [.09, .025, -.025], face: [.63, .24] }],
  ] },
  { id: "055", name: "Playful shrug", duration: 3.05, keys: [
    [.15, { leftHand: [1.44, -.42, .55], rightHand: [-1.44, -.42, .55], head: [.04, .045, .07], face: [.38, .25] }],
    [.34, { ...shrug, torso: [-.095, .08, -.08], head: [-.045, -.035, .145], sway: .039, rise: .012, face: [.77, .94] }],
    [.52, { ...shrug, torso: [-.08, -.06, .06], head: [-.055, .085, -.11], sway: -.044, rise: .008, face: [.9, .73] }],
    [.71, { ...shrug, leftHand: [1.63, -.41, .5], rightHand: [-1.58, -.44, .48], rise: -.024, head: [.075, .025, -.035], face: [.81, .4] }],
  ] },
  { id: "056", name: "Thinking it over", duration: 3.65, keys: [
    [.18, { rightHand: [-1.21, -.27, .54], head: [.095, -.07, .065], face: [-.11, -.15] }],
    [.35, { ...chin, torso: [.064, -.06, .034], head: [.14, -.11, .105], sway: -.037, rise: -.028, face: [-.18, -.34] }],
    [.57, { ...chin, head: [.14, -.06, .08], sway: -.039, rise: -.025, face: [-.12, -.18] }],
    [.73, { rightHand: [-.95, .12, .59], rightPalm: [[-.02, .96, .17], [0, 0, 1]], fingers: [null, "point"], torso: [-.065, .025, -.04], head: [-.085, .035, -.05], face: [.81, .88] }],
    [.87, { rightHand: [-1.33, -.27, .59], head: [.02, .01, -.025], face: [.54, .39] }],
  ] },
  { id: "057", name: "Peek past the palm", duration: 3.45, keys: [
    [.17, { leftHand: [1.29, -.21, .58], head: [.15, -.11, -.06], face: [-.09, .53] }],
    [.35, { ...peek, leftHand: [.56, .15, .54], head: [.105, -.17, -.07], torso: [.085, -.06, .045], sway: .036, rise: -.035, face: [.14, .66] }],
    [.54, { ...peek, head: [-.06, .13, .12], torso: [-.04, .09, -.065], sway: -.044, rise: -.024, face: [.82, .87] }],
    [.73, { ...peek, leftHand: [1.29, -.13, .53], head: [.045, .04, .035], face: [.72, .43] }],
  ] },
  { id: "058", name: "Tiny flutter wave", duration: 3.05, keys: [
    [.16, { ...flutter, rightHand: [-1.3, -.24, .6], head: [.05, -.06, .065], face: [.55, .37] }],
    [.3, { ...flutter, wrist: -.21, sway: -.021, rise: -.015, head: [-.04, .07, .12], face: [.86, .62] }],
    [.4, { ...flutter, wrist: .24, head: [-.05, .06, .095], face: [1, .61] }],
    [.5, { ...flutter, wrist: -.22, head: [.01, .07, .07], face: [.97, .52] }],
    [.6, { ...flutter, wrist: .18, head: [.04, .04, .11], face: [.94, .49] }],
    [.77, { ...flutter, rightHand: [-1.41, -.31, .6], head: [.068, -.03, .045], face: [.72, .28] }],
  ] },
  { id: "059", name: "Bashful heel twist", duration: 3.55, keys: [
    [.18, { sway: .027, rise: -.026, feet: { r: [-.03, .026, .041, -.12] }, head: [.14, .06, .035], face: [.31, .25] }],
    [.35, { sway: .045, rise: -.043, feet: { r: [.017, 0, .071, .29, .07] }, torso: [.085, .11, -.08], head: [.22, -.19, -.07], face: [.53, .47] }],
    [.58, { sway: .053, rise: -.038, feet: { r: [.015, .011, .071, -.27, .105] }, torso: [.055, -.06, -.045], head: [.045, .11, .07], face: [.87, .46] }],
    [.79, { sway: -.019, rise: -.019, feet: { r: [-.02, .027, .033, -.08] }, torso: [.02, .01, .035], head: [-.025, .07, .04], face: [.69, .29] }],
  ] },
  { id: "060", name: "You got this", duration: 3.25, keys: [
    [.18, { rightHand: [-1.36, -.36, .59], head: [.035, -.04, .065], face: [.35, .33] }],
    [.36, { rightHand: [-.93, .1, .67], rightPalm: [[.08, .36, 1], [1, 0, -.07]], fingers: [null, "thumb-up"], torso: [.065, -.06, .045], head: [.15, .025, .03], sway: -.037, rise: -.024, face: [.87, .63] }],
    [.48, { rightHand: [-.89, .12, .74], rightPalm: [[.1, .31, 1], [1, 0, -.08]], fingers: [null, "thumb-up"], head: [-.085, .065, .075], sway: -.045, rise: -.018, face: [1, .62] }],
    [.62, { rightHand: [-.93, .06, .72], rightPalm: [[.08, .36, 1], [1, 0, -.07]], fingers: [null, "thumb-up"], head: [.11, .05, .04], sway: -.037, rise: -.025, face: [.96, .52] }],
    [.83, { rightHand: [-1.33, -.35, .6], head: [.035, .04, .045], face: [.68, .31] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["053", "057", "059"];

export function availableExpressionEmotes(bag: boolean) {
  return bag ? EXPRESSION_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : EXPRESSION_EMOTES;
}
