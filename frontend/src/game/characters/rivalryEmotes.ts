import type { Emote } from "./garageEmotes";

const count = {
  rightHand: [-1.46, .28, .59], rightPalm: [[.04, 1, .14], [0, 0, 1]],
  sway: -.027, rise: -.02,
} as const;
const salute = {
  rightHand: [-1.25, .43, .38], rightPalm: [[.94, .28, -.18], [0, -.77, .64]],
  fingers: [null, "peace"],
} as const;
const challenge = {
  leftHand: [1.56, -.29, .64], rightHand: [-1.56, -.29, .64],
  leftPalm: [[.14, .14, 1], [0, 1, -.12]], rightPalm: [[-.14, .14, 1], [0, 1, -.12]],
  fingers: ["open", "open"],
} as const;
const pullIn = {
  ...challenge, leftHand: [1.23, -.11, .54], rightHand: [-1.23, -.11, .54],
  leftPalm: [[.07, .57, .82], [0, .82, -.57]], rightPalm: [[-.07, .57, .82], [0, .82, -.57]],
  fingers: ["cup", "cup"],
} as const;
const closeCall = {
  rightHand: [-1.17, .28, .66], rightPalm: [[.14, .94, .31], [0, 0, 1]],
  fingers: [null, "pinch"],
} as const;
const trace = {
  rightPalm: [[.14, .01, 1], [0, -1, 0]], fingers: [null, "peace"],
} as const;
const pass = {
  leftHand: [.89, -.25, .62], rightHand: [-.76, -.29, .53],
  leftPalm: [[.015, .1, 1], [0, -1, .09]], rightPalm: [[-.015, .1, 1], [0, -1, .09]],
  fingers: ["open", "open"],
} as const;
const gridStance = {
  l: [.07, 0, .118, .16], r: [-.023, 0, -.066, -.14],
} as const;
const viewfinder = {
  leftHand: [1.1, .23, .57], rightHand: [-1.1, .17, .63],
  leftPalm: [[-.12, .97, .18], [0, 0, 1]], rightPalm: [[.15, .96, .19], [0, 0, 1]],
  fingers: ["frame", "frame"],
} as const;
const dust = {
  rightPalm: [[.83, .46, .31], [0, -.6, -.8]], fingers: [null, "open"],
} as const;
const respect = {
  rightHand: [-.45, -.25, .39], rightPalm: [[.87, .37, -.12], [0, 0, -1]], fingers: [null, "open"],
} as const;

const RIVALRY_EMOTES = [
  { id: "071", name: "Grid countdown", duration: 4.25, keys: [
    [.13, { ...count, rightHand: [-1.48, -.07, .59], fingers: [null, "three"], head: [.055, -.06, -.025], face: [.33, .27] }],
    [.25, { ...count, fingers: [null, "three"], torso: [-.025, -.07, .035], head: [-.045, .02, -.05], face: [.66, .39] }],
    [.37, { ...count, fingers: [null, "three"], torso: [-.02, -.06, .03], head: [-.045, .015, -.038], face: [.7, .39] }],
    [.42, { ...count, fingers: [null, "peace"], wrist: .07, head: [.06, -.01, -.03], face: [.65, .32] }],
    [.52, { ...count, fingers: [null, "peace"], wrist: .07, head: [0, -.02, -.03], face: [.71, .39] }],
    [.57, { ...count, fingers: [null, "point"], wrist: -.035, head: [.075, .01, -.025], face: [.77, .43] }],
    [.67, { ...count, fingers: [null, "point"], head: [0, .01, -.025], face: [.82, .41] }],
    [.74, { rightHand: [-1.06, .09, .9], rightPalm: [[-.08, .14, 1], [0, -.91, .16]], fingers: [null, "point"],
      torso: [.09, -.1, .025], head: [.09, .05, -.02], sway: -.043, rise: -.036, face: [.93, .61] }],
    [.87, { rightHand: [-1.36, -.25, .61], head: [.02, .04, .03], rise: -.012, face: [.64, .29] }],
  ] },
  { id: "072", name: "Two-finger salute", duration: 2.85, keys: [
    [.16, { ...salute, rightHand: [-1.18, .07, .59], head: [.02, .045, -.04], face: [.34, .27] }],
    [.35, { ...salute, sway: -.027, rise: -.019, torso: [-.042, -.075, .03], head: [-.04, .04, -.06], face: [.7, .44] }],
    [.49, { ...salute, sway: -.027, rise: -.019, torso: [-.042, -.075, .03], head: [-.03, .05, -.06], face: [.76, .44] }],
    [.61, { ...salute, rightHand: [-1.53, .53, .63], rightPalm: [[-.41, .79, .47], [0, .59, -.81]],
      sway: -.036, rise: -.021, torso: [-.064, .015, .044], head: [.01, .09, .03], face: [.95, .58] }],
    [.81, { ...salute, rightHand: [-1.38, -.12, .56], rightPalm: [[-.16, .57, .81], [0, .85, -.52]], head: [.07, .055, .015], face: [.68, .26] }],
  ] },
  { id: "073", name: "Bring it on", duration: 3.6, keys: [
    [.16, { ...challenge, leftHand: [1.59, -.43, .6], rightHand: [-1.58, -.43, .59],
      feet: { l: [.055, .029, .052, .11] }, sway: -.031, rise: -.02, face: [.22, .31] }],
    [.31, { ...challenge, feet: { l: [.076, 0, .087, .18] }, sway: .046, rise: -.04, torso: [.065, -.055, -.05], head: [-.045, .02, -.08], face: [.54, .63] }],
    [.43, { ...pullIn, feet: { l: [.076, 0, .087, .18] }, sway: .046, rise: -.031, torso: [-.035, -.02, -.06], head: [.08, .04, -.06], face: [.79, .47] }],
    [.52, { ...challenge, feet: { l: [.076, 0, .087, .18] }, sway: .048, rise: -.04, torso: [.035, -.06, -.055], head: [-.015, .05, -.08], face: [.79, .53] }],
    [.64, { ...pullIn, feet: { l: [.076, 0, .087, .18] }, sway: .044, rise: -.033, torso: [-.031, .01, -.052], head: [.11, .065, -.06], face: [.92, .51] }],
    [.79, { ...challenge, leftHand: [1.49, -.38, .62], rightHand: [-1.54, -.4, .62],
      feet: { l: [.05, .027, .05, .09] }, sway: .018, rise: -.021, face: [.72, .29] }],
  ] },
  { id: "074", name: "Photo finish", duration: 3.2, keys: [
    [.17, { ...closeCall, rightHand: [-1.38, -.17, .63], head: [.085, -.2, .03], face: [.14, .36] }],
    [.36, { ...closeCall, sway: -.047, rise: -.025, torso: [.065, -.115, .052], head: [.095, -.26, .12], face: [-.18, -.2] }],
    [.61, { ...closeCall, sway: -.041, rise: -.025, torso: [.041, -.07, .04], head: [-.035, .06, .08], face: [.79, .44] }],
    [.81, { ...closeCall, rightHand: [-1.36, -.1, .62], head: [.07, .085, .032], face: [.66, .28] }],
  ] },
  { id: "075", name: "Call the line", duration: 3.45, keys: [
    [.16, { ...trace, rightHand: [-1.52, -.22, .55], head: [.13, -.27, .026], face: [.16, .24] }],
    [.31, { ...trace, rightHand: [-1.37, -.19, .84], rightPalm: [[.73, .06, .68], [0, -1, 0]],
      sway: -.034, rise: -.022, torso: [.066, -.09, .034], head: [.16, -.22, .035], face: [.35, .32] }],
    [.47, { ...trace, rightHand: [-.1, -.12, .81], rightPalm: [[.95, .1, .29], [0, -1, .02]],
      torso: [.07, .1, -.025], head: [.155, .13, -.028], sway: .03, rise: -.027, face: [.5, .42] }],
    [.61, { ...trace, rightHand: [.53, -.24, .78], rightPalm: [[.49, -.15, .86], [0, -1, .03]],
      torso: [.075, .19, -.045], head: [.165, .34, -.045], sway: .044, rise: -.025, face: [.67, .49] }],
    [.81, { rightHand: [-1.25, -.38, .56], head: [.02, .17, .026], rise: -.018, face: [.62, .23] }],
  ] },
  { id: "076", name: "Smooth overtake", duration: 3.55, keys: [
    [.17, { ...pass, leftHand: [1.18, -.42, .54], rightHand: [-1.24, -.4, .55], head: [.16, -.09, .032], face: [.28, .3] }],
    [.33, { ...pass, torso: [.07, -.04, .018], head: [.19, -.07, .03], rise: -.024, face: [.45, .35] }],
    [.48, { ...pass, rightHand: [-.98, -.17, .74], torso: [.08, -.1, .053], sway: -.029, rise: -.026, head: [.16, -.13, .055], face: [.62, .41] }],
    [.62, { ...pass, rightHand: [-.72, -.07, 1], torso: [.07, -.08, .04], sway: -.035, rise: -.028, head: [.12, -.095, .06], face: [.92, .54] }],
    [.79, { ...pass, leftHand: [1.27, -.4, .57], rightHand: [-1.18, -.25, .71], head: [-.018, .055, -.04], face: [.64, .28] }],
  ] },
  { id: "077", name: "Race face", duration: 3.75, keys: [
    [.16, { feet: { l: [.039, .035, .067, .1] }, sway: -.026, rise: -.02, head: [.075, -.25, .02], face: [.25, .21] }],
    [.3, { feet: { l: gridStance.l, r: [-.016, .029, -.034, -.08] }, sway: .043, rise: -.039,
      leftHand: [1.49, -.61, .44], rightHand: [-1.49, -.57, .47], torso: [.1, -.05, -.045], head: [.02, -.04, -.035], face: [.08, .29] }],
    [.46, { feet: gridStance, sway: .024, rise: -.058, travel: .03,
      leftHand: [1.56, -.59, .52], rightHand: [-1.56, -.57, .51], torso: [.173, -.018, -.018], head: [-.035, 0, .02], face: [-.21, -.28] }],
    [.68, { feet: gridStance, sway: .022, rise: -.052, travel: .035,
      leftHand: [1.53, -.62, .48], rightHand: [-1.54, -.59, .48], torso: [.153, 0, -.015], head: [-.023, .035, .01], face: [-.05, -.24] }],
    [.81, { feet: { l: gridStance.l, r: [-.013, .029, -.035, -.07] }, sway: .037, rise: -.031, head: [.03, .14, -.016], face: [.41, .27] }],
    [.92, { feet: { l: [.034, .025, .053, .075] }, sway: .019, rise: -.016, face: [.39, .18] }],
  ] },
  { id: "078", name: "Frame the shot", duration: 3.55, keys: [
    [.17, { ...viewfinder, leftHand: [1.43, -.14, .58], rightHand: [-1.41, -.16, .61], head: [.055, -.075, .032], face: [.49, .35] }],
    [.37, { ...viewfinder, sway: .028, rise: -.025, torso: [.035, -.075, -.048], head: [.02, -.11, -.08], face: [.8, .59] }],
    [.56, { ...viewfinder, leftHand: [1.14, .18, .61], rightHand: [-1.14, .24, .57],
      sway: -.025, rise: -.028, torso: [.045, .065, .042], head: [.015, .1, .072], face: [.91, .54] }],
    [.68, { ...viewfinder, leftHand: [1.17, .19, .6], rightHand: [-1.15, .22, .59], sway: -.023, rise: -.022,
      head: [-.028, .09, .062], face: [1, .64] }],
    [.85, { ...viewfinder, leftHand: [1.37, -.17, .61], rightHand: [-1.37, -.17, .62], head: [.028, .06, .03], face: [.67, .34] }],
  ] },
  { id: "079", name: "Brush it off", duration: 3.25, keys: [
    [.17, { ...dust, rightHand: [-1.07, -.17, .62], head: [.135, .17, -.045], face: [.24, .26] }],
    [.34, { ...dust, rightHand: [.33, -.04, .41], leftHand: [1.18, -.62, .61], torso: [.045, .135, -.07],
      head: [.13, .28, -.04], sway: .029, rise: -.027, face: [.39, .24] }],
    [.47, { ...dust, rightHand: [.96, -.14, .64], rightPalm: [[.88, -.23, .41], [0, -.81, -.57]], leftHand: [1.18, -.63, .63],
      torso: [.075, .14, -.085], head: [.1, .3, -.07], sway: .046, rise: -.034, face: [.63, .41] }],
    [.64, { ...dust, rightHand: [.43, -.27, .72], leftHand: [1.25, -.6, .61], torso: [.043, .08, -.047],
      head: [-.062, .07, -.045], sway: .024, rise: -.02, face: [.88, .51] }],
    [.83, { rightHand: [-1.25, -.37, .6], head: [.033, -.09, .041], face: [.63, .28] }],
  ] },
  { id: "080", name: "Good race", duration: 3.55, keys: [
    [.18, { ...respect, rightHand: [-1.13, -.39, .56], sway: -.016, head: [-.048, -.05, .025], face: [.46, .27] }],
    [.34, { ...respect, sway: -.026, rise: -.025, torso: [.08, -.035, .023], head: [.15, -.035, -.04], face: [.69, .27] }],
    [.51, { ...respect, sway: -.021, rise: -.035, torso: [.135, -.03, .02], head: [.195, -.025, -.035], face: [.75, .19] }],
    [.66, { ...respect, sway: -.017, rise: -.02, torso: [.025, -.02, .02], head: [-.045, .045, .02], face: [.9, .44] }],
    [.83, { rightHand: [-1.15, -.38, .57], head: [.033, .095, .03], face: [.66, .24] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["071", "072", "074", "075", "080"];

export function availableRivalryEmotes(bag: boolean) {
  return bag ? RIVALRY_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : RIVALRY_EMOTES;
}
