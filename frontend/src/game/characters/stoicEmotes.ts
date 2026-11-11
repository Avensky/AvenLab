import type { Emote } from "./garageEmotes";

const behindWaist = {
  leftHand: [.36, -.77, -.49], rightHand: [-.34, -.75, -.51], elbowsBack: true,
} as const;
const releaseWaist = {
  leftHand: [1.22, -.87, -.31], rightHand: [-1.2, -.87, -.32], elbowsBack: true,
} as const;
const dismiss = {
  rightHand: [-1.31, .01, .61], rightPalm: [[-.04, .98, .2], [.12, -.22, .96]],
  fingers: [null, "open"],
} as const;
const closingHand = {
  rightHand: [-1.42, -.51, .49], rightPalm: [[-.09, -.69, .71], [.55, .51, .56]],
} as const;
const approval = {
  rightHand: [-1.29, -.22, .62], rightPalm: [[.06, .46, .88], [.98, -.09, -.03]],
  fingers: [null, "thumb-up"],
} as const;
const wristCheck = {
  leftHand: [.53, -.24, .67], leftPalm: [[-.85, -.03, .52], [.05, -.98, .04]],
  fingers: ["cup", null],
} as const;
const salute = {
  rightHand: [-1.38, .5, .47], rightPalm: [[.87, .44, -.2], [.08, -.55, -.83]],
  fingers: [null, "open"],
} as const;

const STOIC_EMOTES = [
  { id: "131", name: "Measured acknowledgement", duration: 2.65, keys: [
    [.2, { sway: -.022, rise: -.014, torso: [-.03, -.023, .023], head: [-.068, -.052, .01], face: [.06, .25] }],
    [.42, { sway: -.025, rise: -.026, torso: [.055, -.019, .02], head: [.17, -.046, .021], face: [.13, .16] }],
    [.61, { sway: -.015, rise: -.018, torso: [.019, .02, -.01], head: [.058, .032, -.013], face: [.34, .21] }],
    [.8, { torso: [-.02, .012, -.013], head: [-.029, .036, -.02], face: [.27, .18] }],
  ] },
  { id: "132", name: "Scan the perimeter", duration: 3.7, keys: [
    [.17, { sway: -.017, rise: -.016, torso: [.019, -.09, .034], head: [-.037, -.32, .037], face: [.02, .31] }],
    [.34, { sway: -.039, rise: -.026, torso: [.026, -.17, .054], head: [.052, -.51, .055], face: [-.08, .47] }],
    [.49, { sway: -.015, rise: -.017, torso: [-.026, -.028, .016], head: [-.045, .014, -.006], face: [.03, .39] }],
    [.66, { sway: .035, rise: -.025, torso: [.025, .145, -.041], head: [.034, .49, -.057], face: [.06, .38] }],
    [.78, { sway: .019, rise: -.019, torso: [.016, .075, -.02], head: [.077, .2, -.032], face: [.17, .28] }],
    [.89, { head: [-.02, .045, -.012], face: [.22, .2] }],
  ] },
  { id: "133", name: "Arms behind waist", duration: 3.85, keys: [
    [.17, { ...releaseWaist, sway: .028, rise: -.019, feet: { r: [-.013, .026, -.029, -.044] }, head: [.034, -.09, -.045] }],
    [.34, { ...behindWaist, sway: .019, rise: -.032, feet: { r: [-.024, 0, -.061, -.09] },
      torso: [-.066, -.063, -.028], head: [-.037, -.15, .03], face: [.11, .24] }],
    [.53, { ...behindWaist, leftHand: [.37, -.73, -.48], rightHand: [-.35, -.76, -.48],
      sway: -.016, rise: -.025, feet: { r: [-.024, 0, -.061, -.09] },
      torso: [-.038, .029, .021], head: [.043, .19, -.029], face: [.21, .29] }],
    [.7, { ...releaseWaist, sway: .016, rise: -.024, feet: { r: [-.019, .028, -.034, -.048] },
      torso: [.021, .038, -.018], head: [.042, .09, -.016], face: [.28, .19] }],
    [.86, { torso: [-.024, .007, -.013], head: [-.029, .022, -.008], face: [.22, .17] }],
  ] },
  { id: "134", name: "Calm dismissal", duration: 2.95, keys: [
    [.19, { ...dismiss, rightHand: [-1.49, -.3, .61], head: [.064, -.11, .044], face: [.05, .31] }],
    [.38, { ...dismiss, torso: [.043, -.07, .022], head: [-.073, -.14, .061], sway: -.019, face: [-.06, .32] }],
    [.56, { ...dismiss, rightHand: [-1.73, -.045, .68], wrist: -.23, torso: [-.016, .025, .025],
      head: [.071, .12, .044], face: [.03, .24] }],
    [.77, { rightHand: [-1.56, -.42, .52], head: [.06, .12, .028], face: [.17, .2] }],
  ] },
  { id: "135", name: "Quiet determination", duration: 3.35, keys: [
    [.2, { ...closingHand, fingers: [null, "open"], torso: [.073, .04, -.026], head: [.13, -.1, .034],
      sway: .027, rise: -.027, face: [-.14, .28] }],
    [.39, { ...closingHand, fingers: [null, "cup"], rightHand: [-1.4, -.36, .52], torso: [.036, -.03, -.012],
      head: [.11, -.13, .021], sway: -.014, rise: -.033, face: [-.11, -.3] }],
    [.57, { ...closingHand, fingers: [null, "fist"], rightHand: [-1.53, -.29, .56],
      torso: [-.075, -.071, .019], head: [-.052, .037, .017], sway: -.033, face: [.07, -.42] }],
    [.73, { ...closingHand, fingers: [null, "cup"], torso: [-.043, -.022, .012], head: [.071, .032, .014], face: [.3, -.23] }],
    [.86, { torso: [.02, .008, -.012], head: [.014, .015, -.009], face: [.23, .16] }],
  ] },
  { id: "136", name: "Brief approval", duration: 3.5, keys: [
    [.17, { sway: -.031, rise: -.024, turn: -.19, torso: [.085, -.125, .035], head: [.145, -.29, .044], face: [.08, .22] }],
    [.33, { sway: -.036, rise: -.035, turn: -.25, torso: [.134, -.14, .04], head: [.225, -.28, .067], face: [.13, .36] }],
    [.49, { ...approval, sway: -.023, rise: -.025, turn: -.09, torso: [.028, -.06, .019],
      head: [-.054, .084, .032], face: [.55, .36] }],
    [.63, { ...approval, rightHand: [-1.26, -.21, .65], head: [.145, .072, .029], torso: [.061, -.022, .023],
      sway: -.018, face: [.7, .3] }],
    [.81, { rightHand: [-1.47, -.45, .53], head: [.025, .042, .008], face: [.46, .21] }],
  ] },
  { id: "137", name: "Unimpressed assessment", duration: 3.65, keys: [
    [.18, { turn: -.15, sway: .017, rise: -.023, feet: { r: [-.018, .023, .024, -.082] },
      torso: [.089, -.09, -.023], head: [.19, -.28, -.045], face: [-.12, .3] }],
    [.37, { turn: -.24, sway: -.031, travel: .04, rise: -.046, feet: { r: [-.034, 0, .051, -.16] },
      torso: [.147, -.16, .055], head: [.246, -.09, .103], face: [-.28, -.38] }],
    [.56, { turn: -.19, sway: -.027, travel: .037, rise: -.029, feet: { r: [-.034, 0, .051, -.16] },
      torso: [-.039, -.078, .036], head: [-.027, .145, .192], face: [-.29, .52] }],
    [.72, { turn: -.095, sway: .02, rise: -.025, feet: { r: [-.02, .03, .026, -.075] },
      torso: [-.039, -.014, -.027], head: [.08, .105, -.06], face: [-.11, -.2] }],
    [.86, { head: [.036, -.024, -.018], face: [.03, -.12] }],
  ] },
  { id: "138", name: "Patient wrist check", duration: 3.25, keys: [
    [.18, { ...wristCheck, leftHand: [1.04, -.45, .58], head: [.08, .105, -.043], face: [.06, .21] }],
    [.37, { ...wristCheck, head: [.265, .15, -.068], torso: [.096, .074, -.036], sway: .022, rise: -.024, face: [.03, .38] }],
    [.55, { ...wristCheck, leftHand: [.56, -.19, .69], wristLeft: -.12, head: [.22, .105, -.058],
      torso: [.073, .051, -.024], sway: .02, rise: -.021, face: [.19, .29] }],
    [.73, { leftHand: [1.21, -.45, .51], head: [-.05, -.051, -.025], torso: [-.025, -.019, -.014], face: [.26, .21] }],
    [.87, { head: [.027, -.024, -.015], face: [.22, .17] }],
  ] },
  { id: "139", name: "Respectful salute", duration: 3.25, keys: [
    [.17, { rightHand: [-1.51, -.22, .61], torso: [.033, -.018, .025], head: [.052, -.07, .039], rise: -.019 }],
    [.35, { ...salute, head: [-.039, .039, .026], torso: [-.051, -.016, .015], sway: -.013, face: [.24, .29] }],
    [.52, { ...salute, rightHand: [-1.42, .51, .46], head: [.042, .039, .029], torso: [-.027, -.019, .022], face: [.4, .32] }],
    [.68, { ...salute, rightHand: [-1.72, .27, .58], head: [.071, .029, .024], rise: -.017, face: [.39, .24] }],
    [.83, { rightHand: [-1.5, -.45, .5], head: [-.014, .046, .017], face: [.29, .18] }],
  ] },
  { id: "140", name: "Controlled triumph", duration: 3.3, keys: [
    [.18, { sway: .024, rise: -.018, torso: [.053, .061, -.037], head: [.091, -.17, -.05], face: [.13, -.15] }],
    [.34, { sway: .012, torso: [-.097, .042, -.022], head: [-.104, -.073, -.024], blink: .86, face: [.18, -.35] }],
    [.46, { sway: -.02, rise: -.021, torso: [.042, -.018, .017], head: [-.033, .027, .027], blink: .7, face: [.43, -.13] }],
    [.59, { sway: -.025, rise: -.031, torso: [.075, -.023, .027], head: [.179, .06, .023], face: [.68, .24] }],
    [.77, { sway: -.01, rise: -.017, torso: [-.028, -.007, -.006], head: [-.029, .031, -.014], face: [.56, .19] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["131", "132", "134", "135", "136", "137", "139", "140"];

export function availableStoicEmotes(bag: boolean) {
  return bag ? STOIC_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : STOIC_EMOTES;
}
