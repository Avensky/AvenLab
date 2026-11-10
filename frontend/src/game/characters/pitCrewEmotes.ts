import type { Emote } from "./garageEmotes";

const radio = {
  rightHand: [-1.45, .33, .27], rightPalm: [[.39, .91, -.16], [.9, -.36, -.04]],
  fingers: [null, "cup"],
} as const;
const watch = {
  leftHand: [.68, -.24, .67], rightHand: [-.55, -.23, .57],
  leftPalm: [[-.95, .08, .24], [0, -.93, .16]], rightPalm: [[.9, -.27, .34], [0, -1, .07]],
  fingers: ["open", "point"],
} as const;
const lastLap = {
  rightHand: [-1.42, .2, .6], rightPalm: [[-.02, .98, .12], [0, 0, 1]], fingers: [null, "point"],
} as const;
const timeOut = {
  leftHand: [.37, -.18, .62], rightHand: [-.39, .055, .63],
  leftPalm: [[-.09, .98, .12], [0, 0, 1]], rightPalm: [[.94, .05, .32], [0, -1, .1]],
  fingers: ["open", "open"],
} as const;
const boxSignal = {
  rightHand: [-1.34, -.015, .67], rightPalm: [[-.13, -.53, .84], [0, -.82, -.55]], fingers: [null, "peace"],
} as const;
const adjustment = {
  leftHand: [.56, -.31, .6], rightHand: [-.32, -.26, .7],
  leftPalm: [[-.86, .1, .5], [0, .85, .42]], rightPalm: [[.71, -.48, .52], [0, -.89, -.38]],
  fingers: ["cup", "cup"],
} as const;
const helmet = {
  leftHand: [1.43, .35, .32], rightHand: [-1.43, .34, .32],
  leftPalm: [[-.44, .83, -.2], [-.85, -.43, .08]], rightPalm: [[.44, .83, -.2], [.85, -.43, .08]],
  fingers: ["cup", "cup"],
} as const;
const levelHands = {
  leftHand: [1.22, -.29, .65], rightHand: [-1.23, -.29, .65],
  leftPalm: [[.15, -.12, .98], [0, -1, .02]], rightPalm: [[-.15, -.12, .98], [0, -1, .02]],
  fingers: ["open", "open"],
} as const;
const bump = {
  rightHand: [-.93, -.19, .82], rightPalm: [[-.08, .5, .86], [.91, 0, .19]], fingers: [null, "fist"],
} as const;
const bumpStep = { r: [-.019, 0, .074, -.08] } as const;

const PIT_CREW_EMOTES = [
  { id: "081", name: "Radio check", duration: 3.2, keys: [
    [.15, { ...radio, rightHand: [-1.37, -.08, .58], head: [.06, -.1, .026], face: [.18, .38] }],
    [.34, { ...radio, sway: -.029, rise: -.021, torso: [.038, -.065, .037], head: [.085, -.2, .115], face: [-.12, .61] }],
    [.52, { ...radio, sway: -.028, rise: -.02, head: [.145, -.13, .08], face: [.23, .46] }],
    [.66, { ...radio, rightHand: [-1.5, .27, .36], head: [-.044, .05, .065], sway: -.019, face: [.69, .38] }],
    [.84, { rightHand: [-1.32, -.31, .57], head: [.041, .13, .02], face: [.59, .21] }],
  ] },
  { id: "082", name: "Two-minute call", duration: 3.45, keys: [
    [.17, { ...watch, leftHand: [.93, -.42, .58], rightHand: [-1.06, -.34, .54], head: [.16, .09, -.025], face: [.21, .29] }],
    [.33, { ...watch, sway: .024, rise: -.022, torso: [.07, .075, -.04], head: [.24, .12, -.057], face: [-.09, .39] }],
    [.45, { ...watch, rightHand: [-.45, -.31, .63], sway: .022, rise: -.024, head: [.21, .1, -.05], face: [.16, .42] }],
    [.58, { ...watch, rightHand: [-.45, -.16, .62], head: [.08, .01, .042], face: [.38, .52] }],
    [.71, { leftHand: [.83, -.38, .57], rightHand: [-1.27, .23, .57], rightPalm: [[-.02, .99, .13], [0, 0, 1]],
      fingers: [null, "peace"], sway: -.017, rise: -.019, head: [-.055, .06, .045], face: [.69, .59] }],
    [.86, { rightHand: [-1.31, -.23, .6], face: [.56, .24] }],
  ] },
  { id: "083", name: "Last lap", duration: 3.05, keys: [
    [.18, { ...lastLap, rightHand: [-1.3, -.22, .62], head: [.09, -.17, .04], face: [.31, .26] }],
    [.36, { ...lastLap, rightHand: [-1.6, .47, .54], sway: -.041, rise: -.026, torso: [-.058, -.12, .052], head: [-.085, -.08, .066], face: [.82, .64] }],
    [.58, { ...lastLap, rightHand: [-1.54, .48, .56], sway: -.038, rise: -.023, head: [.085, .08, .045], face: [.91, .51] }],
    [.77, { ...lastLap, rightHand: [-1.35, .05, .63], sway: -.013, rise: -.018, head: [.023, .12, .03], face: [.72, .33] }],
  ] },
  { id: "084", name: "Pit stop", duration: 3.3, keys: [
    [.16, { ...timeOut, leftHand: [1.13, -.35, .61], rightHand: [-1.22, -.32, .64], head: [.02, -.095, -.03], face: [.1, .34] }],
    [.34, { ...timeOut, rise: -.025, torso: [.059, -.04, .02], head: [.055, -.02, -.04], face: [.12, .66] }],
    [.57, { ...timeOut, rise: -.023, torso: [.056, -.025, .018], head: [-.04, .03, .046], face: [.53, .51] }],
    [.7, { ...timeOut, leftHand: [.56, -.23, .63], rightHand: [-.72, -.09, .65], head: [.07, .08, .015], face: [.69, .36] }],
    [.86, { leftHand: [1.19, -.37, .56], rightHand: [-1.2, -.39, .55], face: [.46, .2] }],
  ] },
  { id: "085", name: "Box this lap", duration: 3.2, keys: [
    [.16, { ...boxSignal, rightHand: [-1.46, -.12, .61], head: [.05, -.23, .052], face: [.25, .29] }],
    [.31, { ...boxSignal, sway: -.038, rise: -.02, torso: [-.048, -.082, .058], head: [-.055, -.15, .072], face: [.55, .63] }],
    [.4, { ...boxSignal, rightHand: [-1.28, -.15, .8], sway: -.048, rise: -.04, torso: [.075, -.1, .061], head: [.18, -.1, .041], face: [.71, .44] }],
    [.49, { ...boxSignal, sway: -.041, rise: -.024, head: [.025, -.15, .05], face: [.72, .55] }],
    [.58, { ...boxSignal, rightHand: [-1.26, -.12, .78], sway: -.043, rise: -.038, torso: [.068, -.08, .054], head: [.15, -.03, .032], face: [.85, .43] }],
    [.79, { rightHand: [-1.4, -.37, .55], head: [.01, .07, .033], face: [.65, .27] }],
  ] },
  { id: "087", name: "Dial the setup", duration: 3.5, keys: [
    [.17, { ...adjustment, leftHand: [1.05, -.4, .61], rightHand: [-.93, -.36, .57], head: [.15, .08, -.025], face: [.18, .29] }],
    [.34, { ...adjustment, sway: .022, rise: -.025, torso: [.088, .06, -.038], head: [.21, .09, -.04], wrist: -.24, face: [-.09, .41] }],
    [.45, { ...adjustment, sway: .023, rise: -.026, torso: [.093, .07, -.033], head: [.24, .08, -.046], wrist: .27, face: [.11, .41] }],
    [.57, { ...adjustment, head: [.19, .06, -.028], wrist: -.17, face: [.45, .44] }],
    [.69, { ...adjustment, rightHand: [-.54, -.24, .69], head: [-.04, .02, .067], wrist: .23, face: [.76, .54] }],
    [.84, { leftHand: [1.18, -.39, .55], rightHand: [-1.2, -.38, .58], head: [.035, .09, .031], face: [.57, .23] }],
  ] },
  { id: "088", name: "Helmet fit", duration: 3.55, keys: [
    [.17, { ...helmet, leftHand: [1.58, -.14, .56], rightHand: [-1.57, -.11, .55], head: [.09, -.06, -.026], face: [.22, .31] }],
    [.35, { ...helmet, sway: .027, rise: -.026, torso: [.054, -.062, -.028], head: [.065, -.11, -.077], face: [.23, .51] }],
    [.5, { ...helmet, leftHand: [1.18, .17, .48], rightHand: [-1.2, .14, .49], sway: -.024, rise: -.03, head: [.15, .06, .064], face: [.34, .43] }],
    [.67, { ...helmet, leftHand: [1.34, -.06, .58], rightHand: [-1.35, -.06, .56], head: [-.035, .01, -.02], rise: -.019, face: [.75, .46] }],
    [.84, { leftHand: [1.43, -.36, .56], rightHand: [-1.43, -.36, .57], head: [.057, .08, .025], face: [.55, .24] }],
  ] },
  { id: "089", name: "All set", duration: 3.1, keys: [
    [.16, { ...levelHands, leftHand: [1.27, -.46, .55], rightHand: [-1.29, -.43, .56], head: [.072, .06, -.03], face: [.31, .31] }],
    [.33, { ...levelHands, torso: [.085, -.055, -.025], head: [.077, -.065, .042], rise: -.023, face: [.58, .48] }],
    [.48, { ...levelHands, leftHand: [1.78, -.47, .64], rightHand: [-1.77, -.48, .64], torso: [-.038, .023, .028],
      sway: -.035, rise: -.035, head: [.145, .036, .031], face: [.83, .45] }],
    [.65, { ...levelHands, leftHand: [1.73, -.51, .62], rightHand: [-1.76, -.5, .6], sway: -.023, rise: -.026, head: [-.042, .09, .051], face: [.91, .51] }],
    [.81, { head: [.061, .06, .03], rise: -.017, face: [.69, .28] }],
  ] },
  { id: "090", name: "Crew fist bump", duration: 3.15, keys: [
    [.17, { ...bump, rightHand: [-1.26, -.32, .55], head: [.042, -.11, .042], face: [.38, .31] }],
    [.31, { ...bump, rightHand: [-.92, -.13, .69], sway: -.012, rise: -.022, travel: .012,
      feet: { r: [-.01, .025, .04, -.046] }, torso: [.024, -.08, .038], head: [-.045, -.05, .059], face: [.72, .55] }],
    [.47, { ...bump, rightHand: [-.63, -.12, .94], sway: -.038, rise: -.041, travel: .052,
      feet: bumpStep, torso: [.16, -.15, .044], head: [-.048, .04, .053], face: [.95, .52] }],
    [.6, { ...bump, rightHand: [-.78, -.18, .73], sway: -.026, rise: -.033, travel: .036,
      feet: bumpStep, torso: [.09, -.08, .036], head: [-.037, .105, .042], face: [.91, .46] }],
    [.73, { rightHand: [-1.13, -.28, .61], sway: -.008, rise: -.022, travel: .014,
      feet: { r: [-.01, .024, .035, -.036] }, torso: [.039, -.035, .025], head: [.032, .105, .04], face: [.78, .36] }],
    [.87, { rightHand: [-1.37, -.38, .5], rise: -.014, head: [.019, .073, .028], face: [.61, .26] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["081", "083", "085", "090"];

export function availablePitCrewEmotes(bag: boolean) {
  return bag ? PIT_CREW_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : PIT_CREW_EMOTES;
}
