import type { Emote, Palm } from "./garageEmotes";
import { walkForward, walkPause, walkReturn } from "./walkingEmotes";

const quietHands = {
  leftHand: [1.06, -.55, .63], rightHand: [-1.06, -.55, .64],
  leftPalm: [[-1, .06, .28], [0, -1, 0]], rightPalm: [[1, .05, .26], [0, -1, 0]],
  fingers: ["open", "open"], rise: -.021,
} as const;
const grateful = {
  leftHand: [.22, -.27, .56], rightHand: [-.22, -.27, .56],
  leftPalm: [[-.035, 1, .15], [-1, 0, 0]], rightPalm: [[.035, 1, .15], [1, 0, 0]],
  fingers: ["open", "open"],
} as const;
const wavePalm: Palm = [[.07, 1, .16], [0, 0, 1]];
const coverMouth = {
  rightHand: [-.64, .18, .55], rightPalm: [[.82, .32, .31], [0, 0, -1]],
  fingers: [null, "open"],
} as const;
const offerPalm: Palm = [[.25, .13, .9], [0, 1, -.14]];
const halfWave = {
  leftHand: [-.23, -.05, .65], rightHand: [-1.24, .25, .48],
  leftPalm: [[-.8, .44, .32], [0, 0, 1]], rightPalm: wavePalm, fingers: ["open", "open"],
} as const;

export const SHY_EMOTES = [
  { id: "031", name: "Fingertip fidget", duration: 3.55, keys: [
    [.18, { ...quietHands, leftHand: [1.25, -.57, .59], rightHand: [-1.25, -.57, .59], head: [.16, -.06, .045], sway: -.022, face: [.21, .25] }],
    [.33, { ...quietHands, head: [.21, -.11, .065], sway: -.017, face: [.34, .27] }],
    [.44, { ...quietHands, leftHand: [1.08, -.51, .61], rightHand: [-1, -.58, .65], head: [.22, -.095, .056], sway: -.012, face: [.43, .29] }],
    [.55, { ...quietHands, leftHand: [1, -.58, .65], rightHand: [-1.08, -.51, .61], head: [.20, -.09, .04], sway: .013, face: [.47, .34] }],
    [.67, { ...quietHands, head: [.16, .04, -.065], sway: .02, face: [.48, .19] }],
    [.83, { ...quietHands, leftHand: [1.5, -.54, .57], rightHand: [-1.5, -.52, .58], head: [-.06, .13, -.085], sway: .017, face: [.65, .34] }],
  ] },
  { id: "032", name: "Shoetip shuffle", duration: 3.15, keys: [
    [.18, { sway: -.045, rise: -.022, head: [.19, .11, -.05], face: [.18, .24] }],
    [.32, { sway: -.055, rise: -.029, feet: { l: [.018, .016, .064, -.075, .11] }, head: [.25, .13, -.065], face: [.26, .26] }],
    [.46, { sway: -.052, rise: -.03, feet: { l: [.069, .013, .067, .12, .07] }, head: [.23, .15, -.06], face: [.32, .19] }],
    [.60, { sway: -.044, rise: -.027, feet: { l: [.093, .012, .014, .18, .04] }, head: [.19, .17, -.045], face: [.44, .25] }],
    [.76, { sway: -.031, rise: -.021, feet: { l: [.048, .024, -.008, .1, -.07] }, head: [.12, .13, -.032], face: [.56, .32] }],
    [.88, { rise: -.012, head: [-.04, .06, .035], face: [.55, .27] }],
  ] },
  { id: "033", name: "Half hidden greeting", duration: 3.05, keys: [
    [.18, { leftHand: [.72, -.38, .56], rightHand: [-1.3, -.26, .55], sway: -.023, rise: -.019, head: [.08, -.12, .12], face: [.26, .19] }],
    [.34, { ...halfWave, sway: -.033, rise: -.026, head: [.075, -.14, .14], wrist: -.16, face: [.52, .29] }],
    [.43, { ...halfWave, sway: -.031, rise: -.025, head: [.045, -.12, .13], wrist: .16, face: [.65, .33] }],
    [.53, { ...halfWave, sway: -.025, rise: -.022, head: [.025, -.08, .11], wrist: -.13, face: [.73, .32] }],
    [.67, { ...halfWave, rightHand: [-1.34, .06, .53], sway: -.014, rise: -.019, head: [.095, -.04, .07], wrist: .09, face: [.62, .23] }],
    [.84, { head: [.09, .05, -.04], face: [.43, .15] }],
  ] },
  { id: "034", name: "Compliment recoil", duration: 2.95, keys: [
    [.18, { torso: [-.14, -.06, .038], head: [-.16, .07, -.035], sway: -.042, rise: -.035, face: [.13, .8] }],
    [.36, { rightHand: [-.21, -.28, .4], rightPalm: [[.65, .56, .2], [0, 0, -1]], fingers: [null, "open"], torso: [-.06, -.045, .032], head: [.1, -.15, .07], sway: -.044, rise: -.028, face: [.57, .37] }],
    [.55, { rightHand: [-.24, -.29, .4], rightPalm: [[.64, .57, .22], [0, 0, -1]], fingers: [null, "open"], head: [.22, -.07, .1], sway: -.037, rise: -.023, face: [.81, .33] }],
    [.7, { rightHand: [-.56, -.42, .54], head: [-.038, .04, .035], sway: -.02, rise: -.019, face: [.74, .26] }],
    [.85, { head: [.075, .07, -.04], face: [.56, .21] }],
  ] },
  { id: "035", name: "Quiet thank you", duration: 3.3, keys: [
    [.17, { ...grateful, leftHand: [.91, -.32, .58], rightHand: [-.91, -.32, .58], rise: -.016, head: [-.04, .02, 0], face: [.51, .29] }],
    [.35, { ...grateful, rise: -.024, torso: [.06, 0, .008], head: [.13, .02, 0], face: [.71, .25] }],
    [.51, { ...grateful, rise: -.044, torso: [.16, 0, .013], head: [.23, .025, .016], face: [.59, .21] }],
    [.69, { ...grateful, rise: -.026, torso: [.035, .025, -.02], head: [-.02, .04, .06], face: [.76, .32] }],
    [.84, { ...grateful, leftHand: [1.27, -.42, .54], rightHand: [-1.27, -.43, .54], head: [.06, .06, .035], face: [.56, .22] }],
  ] },
  { id: "036", name: "Timid invitation", duration: 3.5, keys: [
    [.19, { rightHand: [-1.08, -.42, .58], rightPalm: offerPalm, fingers: [null, "open"], head: [.07, .14, -.08], sway: .023, rise: -.021, face: [.35, .37] }],
    [.34, { rightHand: [.49, -.37, .69], rightPalm: [[.69, .09, .65], [0, 1, -.14]], fingers: [null, "open"], head: [.05, .3, -.1], sway: .046, rise: -.024, face: [.56, .4] }],
    [.47, { rightHand: [-.44, -.38, .63], rightPalm: offerPalm, fingers: [null, "paw"], head: [.12, -.07, .07], sway: .02, rise: -.024, face: [.21, .31] }],
    [.63, { rightHand: [.52, -.34, .71], rightPalm: [[.69, .09, .65], [0, 1, -.14]], fingers: [null, "open"], head: [-.07, .26, -.115], sway: .04, rise: -.021, face: [.68, .42] }],
    [.8, { rightHand: [-1.03, -.41, .63], rightPalm: offerPalm, fingers: [null, "open"], head: [.02, .17, -.04], sway: .018, rise: -.016, face: [.58, .28] }],
  ] },
  { id: "037", name: "Suppressed giggle", duration: 3.25, keys: [
    [.18, { ...coverMouth, sway: -.019, rise: -.018, head: [.07, -.08, .06], face: [.56, .31] }],
    [.31, { ...coverMouth, sway: -.029, rise: -.033, torso: [.055, -.035, .048], head: [.13, -.1, .09], face: [.91, .47] }],
    [.42, { ...coverMouth, sway: -.021, rise: -.02, torso: [.01, -.02, .021], head: [.09, -.09, .06], face: [.95, .42] }],
    [.53, { ...coverMouth, sway: -.029, rise: -.035, torso: [.062, -.03, .049], head: [.135, -.09, .09], face: [1, .47] }],
    [.64, { ...coverMouth, sway: -.017, rise: -.022, torso: [.02, -.02, .029], head: [.08, -.04, .055], face: [.87, .35] }],
    [.79, { rightHand: [-1.15, -.27, .56], head: [.13, .08, -.032], rise: -.015, face: [.65, .27] }],
  ] },
  { id: "038", name: "Secret excitement", duration: 3.6, keys: [
    [.16, { head: [-.02, -.39, .07], sway: -.031, rise: -.022, face: [.28, .47] }],
    [.31, { head: [-.04, .34, -.07], sway: .032, rise: -.024, face: [.49, .59] }],
    [.46, { leftHand: [1.24, -.39, .56], rightHand: [-1.24, -.39, .56], fingers: ["fist", "fist"], torso: [.08, -.01, .024], head: [.11, -.05, .025], sway: .008, rise: -.048, face: [.75, .49] }],
    [.57, { leftHand: [1.12, -.06, .52], rightHand: [-1.12, -.09, .53], fingers: ["fist", "fist"], torso: [-.065, -.015, -.025], head: [-.1, .045, -.03], sway: -.016, rise: -.012, face: [1, .62] }],
    [.69, { leftHand: [1.28, -.41, .56], rightHand: [-1.28, -.43, .56], fingers: ["fist", "fist"], torso: [.055, .01, .025], head: [.085, -.07, .037], sway: .012, rise: -.035, face: [.81, .41] }],
    [.84, { head: [.035, .12, -.046], sway: .018, rise: -.018, face: [.57, .26] }],
  ] },
  { id: "039", name: "Gentle reassurance", duration: 3.1, keys: [
    [.19, { rightHand: [-1.38, -.5, .52], rightPalm: offerPalm, fingers: [null, "open"], head: [-.065, .07, .075], sway: -.021, rise: -.02, face: [.52, .29] }],
    [.37, { rightHand: [-.89, -.29, .69], rightPalm: offerPalm, fingers: [null, "open"], head: [.08, .07, .05], sway: -.032, rise: -.022, face: [.69, .37] }],
    [.51, { rightHand: [-.85, -.34, .72], rightPalm: offerPalm, fingers: [null, "open"], head: [.16, .07, .06], sway: -.032, rise: -.025, face: [.79, .36] }],
    [.68, { rightHand: [-1.07, -.42, .63], rightPalm: offerPalm, fingers: [null, "open"], head: [-.045, .02, .06], sway: -.025, rise: -.02, face: [.76, .26] }],
    [.84, { head: [.065, -.045, .041], face: [.51, .19] }],
  ] },
  { id: "040", name: "Awkward goodbye", duration: 5.15, keys: [
    ...walkForward,
    [.53, { ...walkPause, torso: [-.02, -.19, -.05], head: [-.07, -.34, .065], rightHand: [-1.31, .17, .49], rightPalm: wavePalm, fingers: [null, "open"], wrist: -.16, face: [.62, .52] }],
    [.59, { ...walkPause, torso: [-.035, -.15, -.038], head: [.008, -.27, .08], rightHand: [-1.31, .16, .49], rightPalm: wavePalm, fingers: [null, "open"], wrist: .16, face: [.77, .46] }],
    [.64, { ...walkPause, torso: [-.025, -.12, -.03], head: [.07, -.21, .065], rightHand: [-1.3, .12, .49], rightPalm: wavePalm, fingers: [null, "open"], wrist: -.13, face: [.61, .34] }],
    ...walkReturn,
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["032", "034", "036", "037", "039"];

export function availableShyEmotes(bag: boolean) {
  return bag ? SHY_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : SHY_EMOTES;
}
