import type { Emote, Palm } from "./garageEmotes";
import { FOLDED_ARMS } from "./garageLean";

const armsApart = { leftHand: [1.28, -.35, .59], rightHand: [-1.27, -.35, .61] } as const;
const huffFoot = [0.057, 0, .025, .12] as const;
const asideFoot = [-.036, 0, -.055, -.76] as const;
const aside = { turn: -.79, sway: -.048, rise: -.028, feet: { r: asideFoot, l: [.027, 0, .028, -.61] } } as const;
const thumbsUp: Palm = [[.83, .15, .37], [0, 0, -1]];
const protest = {
  leftHand: [1.41, .19, .59], rightHand: [-1.41, .21, .6],
  leftPalm: [[.24, 1, .1], [0, 0, 1]], rightPalm: [[-.24, 1, .1], [0, 0, 1]],
  fingers: ["open", "open"],
} as const;
const retreatFoot = [.071, 0, -.072, .15] as const;
const guard = {
  leftHand: [2.23, -.2, .66], rightHand: [-1.18, -.44, .57],
  leftPalm: [[.71, .47, .5], [0, 0, 1]], fingers: ["open", null],
  travel: .115, sway: .13, rise: -.035, feet: { l: [.188, 0, .154, .15], r: [.084, 0, .036, .09] },
} as const;
const flickPalm: Palm = [[-.28, .7, .61], [0, .66, -.75]];
const sleeveHold = {
  leftHand: [1.17, -.31, .66], rightHand: [.34, -.32, .66],
  leftPalm: [[.24, -.29, .92], [-1, 0, .26]], rightPalm: [[.96, .14, .23], [0, -1, .15]],
  fingers: ["open", "paw"],
} as const;
const handsOnHips = {
  leftHand: [1.62, -.48, .34], rightHand: [-1.62, -.48, .34],
  leftPalm: [[-.25, -.75, .58], [-.45, 0, -1]], rightPalm: [[.25, -.75, .58], [.45, 0, -1]],
  fingers: ["open", "open"],
} as const;
const proudStance = {
  ...handsOnHips, sway: .047, rise: -.036, turn: .59, feet: { l: [.076, 0, .036, .62], r: [-.027, 0, -.023, .34] },
} as const;

export const TSUNDERE_EMOTES = [
  { id: "041", name: "Arms crossed huff", duration: 3.55, keys: [
    [.13, { ...armsApart, sway: -.026, rise: -.021, head: [.07, -.12, .035], face: [-.15, -.24] }],
    [.25, { ...FOLDED_ARMS, sway: -.034, rise: -.027, feet: { l: [.037, .033, .022, .09] }, torso: [.08, -.055, -.035], head: [.14, -.18, .045], face: [-.24, -.46] }],
    [.38, { ...FOLDED_ARMS, sway: .062, rise: -.042, feet: { l: huffFoot }, torso: [-.08, .11, -.085], head: [-.09, .43, .073], face: [-.31, -.49] }],
    [.61, { ...FOLDED_ARMS, sway: .073, rise: -.035, feet: { l: huffFoot }, torso: [-.056, .1, -.075], head: [-.04, .48, .06], face: [-.16, -.23] }],
    [.73, { ...FOLDED_ARMS, sway: .061, rise: -.035, feet: { l: huffFoot }, torso: [-.035, .075, -.058], head: [.035, .19, .07], face: [.14, .09] }],
    [.87, { ...armsApart, sway: -.02, rise: -.022, feet: { l: [.028, .027, .013, .06] }, head: [.065, .05, .04], face: [.24, .14] }],
  ] },
  { id: "042", name: "Sideways check", duration: 3.45, keys: [
    [.13, { turn: -.17, sway: .021, rise: -.023, feet: { r: [-.021, .035, -.024, -.43] }, torso: [.02, -.045, .014], head: [.035, -.32, -.02], face: [-.08, .15] }],
    [.24, { turn: -.56, sway: -.041, rise: -.032, feet: { r: asideFoot, l: [.017, .035, .018, -.38] }, torso: [.015, -.04, .014], head: [.035, -.24, .05], face: [-.12, -.21] }],
    [.38, { ...aside, torso: [.019, .09, .045], head: [-.075, .75, -.11], face: [.48, .57] }],
    [.58, { ...aside, torso: [.021, .034, .013], head: [-.038, .68, -.105], face: [.33, .41] }],
    [.72, { ...aside, torso: [-.027, -.09, .014], head: [.065, -.18, .055], face: [.05, .14] }],
    [.82, { turn: -.46, sway: -.036, rise: -.026, feet: { r: asideFoot, l: [.02, .028, .015, -.28] }, head: [.06, -.08, .03], face: [.19, .15] }],
    [.93, { turn: -.15, sway: .014, rise: -.018, feet: { r: [-.016, .027, -.022, -.32] }, head: [.055, .02, .02] }],
  ] },
  { id: "043", name: "Reluctant thumbs up", duration: 3.25, keys: [
    [.16, { ...armsApart, sway: -.024, rise: -.022, torso: [-.035, -.07, .023], head: [.045, -.18, .066], face: [-.08, -.24] }],
    [.29, { ...FOLDED_ARMS, sway: .027, rise: -.029, torso: [-.055, .02, -.045], head: [.1, -.23, .078], face: [-.13, -.22] }],
    [.42, { leftHand: [-.16, -.36, .57], rightHand: [-1.4, -.53, .68], rightPalm: thumbsUp, fingers: [null, "thumb-up"], sway: -.031, rise: -.027, head: [.09, .15, .035], face: [.2, .14] }],
    [.59, { leftHand: [-.12, -.37, .58], rightHand: [-1.35, -.49, .7], rightPalm: thumbsUp, fingers: [null, "thumb-up"], sway: -.035, rise: -.026, head: [.075, .19, .04], face: [.52, .19] }],
    [.72, { leftHand: [1.38, -.49, .52], rightHand: [-1.51, -.56, .61], rightPalm: thumbsUp, fingers: [null, "thumb-up"], sway: -.02, rise: -.018, head: [.075, .32, .05], face: [.32, .11] }],
    [.85, { leftHand: [1.56, -.53, .54], head: [.042, .13, -.04], face: [.13, .07] }],
  ] },
  { id: "044", name: "Embarrassed retreat", duration: 3.3, keys: [
    [.16, { ...protest, leftHand: [1.55, -.03, .52], rightHand: [-1.55, -.015, .54], torso: [-.075, .015, -.045], head: [-.065, -.04, .08], sway: -.028, rise: -.02, face: [-.11, .75] }],
    [.27, { ...protest, travel: -.028, sway: -.015, rise: -.023, feet: { l: [.032, .042, -.042, .12, -.09] }, torso: [-.047, -.04, .06], head: [-.085, -.08, .12], face: [-.21, .84] }],
    [.39, { ...protest, travel: -.063, sway: .055, rise: -.046, feet: { l: retreatFoot }, torso: [.06, -.06, -.1], head: [.09, .15, .09], face: [.12, .66] }],
    [.55, { ...protest, leftHand: [1.49, .1, .55], rightHand: [-1.49, .09, .56], travel: -.067, sway: .05, rise: -.036, feet: { l: retreatFoot }, torso: [.075, -.035, -.07], head: [.17, .28, .076], face: [.36, .5] }],
    [.7, { leftHand: [1.73, -.28, .57], rightHand: [-1.63, -.32, .58], travel: -.041, sway: .016, rise: -.024, feet: { l: retreatFoot }, head: [.12, .22, .07], face: [.43, .3] }],
    [.85, { travel: -.013, sway: -.021, rise: -.02, feet: { l: [.038, .026, -.027, .075, .07] }, head: [.09, .12, .035], face: [.28, .23] }],
  ] },
  { id: "045", name: "Caught smiling", duration: 2.95, keys: [
    [.16, { sway: .036, rise: -.017, torso: [.055, .13, -.033], head: [-.095, .24, .06], face: [.67, .24] }],
    [.31, { sway: .046, rise: -.031, torso: [.059, .05, -.021], head: [.19, .23, .06], face: [1, .35] }],
    [.44, { sway: .041, rise: -.02, torso: [.067, .082, -.024], head: [-.048, .18, .025], face: [.93, .4] }],
    [.5, { sway: -.021, rise: .003, torso: [-.045, -.025, .026], head: [-.145, -.07, -.026], face: [.12, .76] }],
    [.64, { sway: -.022, rise: -.018, torso: [-.017, .022, .035], head: [.055, -.38, .086], face: [-.08, .14] }],
    [.82, { sway: -.012, rise: -.016, torso: [.016, -.016, .021], head: [.09, -.28, .069], face: [.2, .08] }],
  ] },
  { id: "046", name: "Protective step", duration: 3.85, keys: [
    [.14, { sway: -.038, rise: -.025, torso: [.037, .18, .044], head: [.09, .28, -.04], face: [-.05, .43] }],
    [.25, { leftHand: [1.79, -.37, .61], rightHand: [-1.36, -.44, .49], travel: .048, sway: .028, rise: -.028, feet: { l: [.096, .044, .081, .09, .09] }, torso: [.08, .13, -.075], head: [.056, .12, -.038], face: [-.18, -.37] }],
    [.37, { ...guard, travel: .098, sway: .112, feet: { l: guard.feet.l, r: [.036, .032, .018, .06] }, torso: [.055, .14, -.083], head: [.065, -.1, .028], face: [-.24, -.52] }],
    [.55, { ...guard, torso: [.058, .12, -.08], head: [.063, -.14, .033], face: [-.12, -.38] }],
    [.68, { ...guard, leftHand: [2.13, -.24, .66], torso: [.032, .17, -.064], head: [.046, .15, .028], face: [.1, -.09] }],
    [.8, { leftHand: [1.76, -.35, .58], rightHand: [-1.36, -.47, .49], travel: .077, sway: .092, rise: -.029, feet: { l: guard.feet.l, r: [.046, .028, .019, .06] }, head: [.034, .1, .045] }],
    [.93, { leftHand: [1.7, -.48, .53], rightHand: [-1.4, -.45, .54], travel: .032, sway: .027, rise: -.023, feet: { l: [.079, .029, .066, .07] }, head: [.022, .025, .024], face: [.21, .09] }],
  ] },
  { id: "047", name: "Dismissive hand flick", duration: 2.95, keys: [
    [.17, { rightHand: [-.66, -.27, .55], rightPalm: flickPalm, fingers: [null, "paw"], sway: -.022, rise: -.02, head: [.035, -.1, .064], face: [-.17, -.24] }],
    [.32, { rightHand: [-.91, -.11, .59], rightPalm: flickPalm, fingers: [null, "paw"], sway: -.031, rise: -.025, torso: [.018, -.09, .058], head: [.06, -.21, .095], face: [-.2, -.28] }],
    [.43, { rightHand: [-2.16, -.15, .68], rightPalm: [[-.85, .21, .47], [0, .76, -.63]], fingers: [null, "open"], sway: -.042, rise: -.026, torso: [.056, -.12, .078], head: [-.078, .25, .06], face: [.05, .36] }],
    [.58, { rightHand: [-1.73, -.37, .62], rightPalm: [[-.6, -.15, .79], [0, .9, .15]], fingers: [null, "open"], sway: -.023, rise: -.021, head: [.035, .38, .055], face: [.12, .17] }],
    [.77, { head: [.05, .19, -.075], torso: [.013, .05, -.024], sway: .019, rise: -.016, face: [.34, .25] }],
  ] },
  { id: "048", name: "Private fist pump", duration: 3.3, keys: [
    [.16, { rightHand: [-1.77, -.46, .39], fingers: [null, "fist"], sway: -.026, rise: -.024, torso: [.035, -.075, .03], head: [.047, -.33, .067], face: [.24, .28] }],
    [.29, { rightHand: [-1.89, -.43, -.24], fingers: [null, "fist"], elbowsBack: true, sway: -.031, rise: -.022, torso: [.043, -.16, .03], head: [.13, .12, -.046], face: [.62, .38] }],
    [.43, { rightHand: [-1.86, -.19, -.32], fingers: [null, "fist"], elbowsBack: true, sway: -.043, rise: -.039, torso: [.085, -.12, .056], head: [.083, .09, -.036], face: [.9, .48] }],
    [.52, { rightHand: [-1.85, -.46, -.28], fingers: [null, "fist"], elbowsBack: true, sway: -.027, rise: -.026, torso: [-.047, -.06, .033], head: [-.12, .035, .036], face: [.13, .81] }],
    [.67, { rightHand: [-2.05, -.42, -.31], fingers: [null, "fist"], elbowsBack: true, sway: -.031, rise: -.028, head: [.065, .28, .086], face: [-.04, .28] }],
    [.77, { rightHand: [-2.17, -.3, .25], fingers: [null, "fist"], sway: -.021, rise: -.018, head: [.059, .23, .058], face: [.13, .21] }],
    [.86, { rightHand: [-1.72, -.43, .43], head: [.06, .15, .043], face: [.28, .13] }],
  ] },
  { id: "049", name: "Almost a pat", duration: 3.65, keys: [
    [.17, { rightHand: [-1.51, -.39, .55], rightPalm: [[-.19, .34, .92], [0, -1, .36]], fingers: [null, "open"], head: [.015, -.18, .075], sway: -.022, rise: -.023, face: [.31, .28] }],
    [.32, { rightHand: [-1.08, -.03, .91], rightPalm: [[.03, -.16, .99], [0, -1, -.16]], fingers: [null, "open"], torso: [.075, -.065, .032], head: [-.044, -.14, .09], sway: -.032, rise: -.025, face: [.47, .48] }],
    [.45, { leftHand: [1.31, -.36, .57], rightHand: [-.67, -.13, .71], rightPalm: [[.41, .22, .88], [0, -1, .29]], fingers: [null, "paw"], torso: [-.045, -.047, -.03], head: [.12, .05, .045], sway: -.02, rise: -.023, face: [.13, .58] }],
    [.57, { ...sleeveHold, torso: [.035, .095, -.055], head: [.19, .28, -.09], sway: .024, rise: -.027, face: [.03, -.19] }],
    [.68, { ...sleeveHold, leftHand: [1.23, -.36, .66], rightHand: [.38, -.37, .65], torso: [.055, .087, -.049], head: [.23, .3, -.082], sway: .028, rise: -.027, face: [.11, -.24] }],
    [.82, { ...armsApart, head: [.08, .18, .039], sway: .016, rise: -.019, face: [.38, .26] }],
  ] },
  { id: "050", name: "Proud side turn", duration: 3.6, keys: [
    [.15, { ...armsApart, turn: .16, sway: -.025, rise: -.025, feet: { l: [.037, .03, .022, .29] }, head: [-.07, .18, -.042], face: [.22, .39] }],
    [.27, { ...handsOnHips, turn: .41, sway: .032, rise: -.034, feet: { l: proudStance.feet.l, r: [-.017, .028, -.012, .21] }, torso: [-.055, .13, -.045], head: [-.145, -.14, .05], face: [.42, .46] }],
    [.42, { ...proudStance, torso: [-.082, .105, -.08], head: [-.16, -.54, .07], face: [.55, .41] }],
    [.67, { ...proudStance, torso: [-.061, .08, -.065], head: [-.11, -.45, .063], face: [.46, .3] }],
    [.8, { ...armsApart, turn: .39, sway: .028, rise: -.03, feet: { l: proudStance.feet.l, r: [-.015, .027, -.012, .17] }, head: [-.061, -.27, .053], face: [.37, .23] }],
    [.92, { turn: .13, sway: -.015, rise: -.02, feet: { l: [.028, .026, .013, .25] }, head: [-.038, -.1, .037], face: [.23, .16] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["042", "045", "047", "048"];

export function availableTsundereEmotes(bag: boolean) {
  return bag ? TSUNDERE_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : TSUNDERE_EMOTES;
}
