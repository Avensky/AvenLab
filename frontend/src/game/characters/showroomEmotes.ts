import type { Emote } from "./garageEmotes";

const reveal = {
  leftHand: [.58, -.28, .73], rightHand: [-1.8, -.19, .61],
  leftPalm: [[-.71, .06, .7], [0, .95, -.1]], rightPalm: [[-.66, .24, .71], [0, .91, -.27]],
  fingers: ["open", "open"],
} as const;
const keyCatch = {
  rightHand: [-1.27, -.22, .76], rightPalm: [[-.08, .28, .95], [0, 1, -.22]],
  fingers: [null, "cup"],
} as const;
const scratch = {
  rightHand: [-1.45, -.38, .77], rightPalm: [[-.38, -.43, .81], [0, -.89, -.45]],
  fingers: [null, "point"],
} as const;
const snap = {
  rightHand: [-1.4, .14, .65], rightPalm: [[-.2, .94, .28], [.17, -.21, .96]],
  fingers: [null, "pinch"],
} as const;
const knock = {
  rightHand: [-1.37, .13, .63], rightPalm: [[-.03, .75, .66], [.91, -.24, .23]],
  fingers: [null, "fist"],
} as const;
const shyPalm = {
  rightHand: [-1.07, .22, .56], rightPalm: [[.17, .99, .02], [.09, -.05, 1]],
  fingers: [null, "open"],
} as const;
const cuff = {
  leftHand: [.53, -.27, .69], rightHand: [-.34, -.31, .65],
  leftPalm: [[-.84, .05, .54], [.04, .98, -.18]], rightPalm: [[.92, .19, .34], [0, -.9, .27]],
  fingers: ["open", "cup"],
} as const;
const tapHands = { leftHand: [1.91, -.6, .62], rightHand: [-1.91, -.59, .63] } as const;
const approval = {
  rightHand: [-1.22, .03, .61], rightPalm: [[-.18, .89, .42], [0, -.4, 1]],
  fingers: [null, "pinch"],
} as const;
const bowHands = {
  leftHand: [1.26, -.47, .62], rightHand: [-.43, -.27, .52],
  rightPalm: [[.88, .25, .39], [0, 0, -1]], fingers: [null, "open"],
} as const;

const SHOWROOM_EMOTES = [
  { id: "103", name: "Car reveal", duration: 3.55, keys: [
    [.17, { leftHand: [1.19, -.42, .57], rightHand: [-1.16, -.42, .58], head: [.04, -.1, .03], face: [.26, .32] }],
    [.34, { ...reveal, turn: -.16, feet: { r: [-.033, 0, .029, -.15] }, sway: -.026, rise: -.025,
      torso: [.035, -.13, .044], head: [.01, -.34, .065], face: [.72, .45] }],
    [.55, { ...reveal, turn: -.16, feet: { r: [-.033, 0, .029, -.15] }, sway: -.022, rise: -.023,
      torso: [.034, -.12, .036], head: [-.04, .13, .057], face: [.95, .5] }],
    [.73, { ...reveal, leftHand: [.86, -.35, .65], rightHand: [-1.41, -.27, .64],
      feet: { r: [-.017, .024, .014, -.07] }, head: [.06, .08, .03], face: [.82, .35] }],
    [.86, { head: [.02, .04, .012], face: [.55, .23] }],
  ] },
  { id: "104", name: "Key toss", duration: 3.3, keys: [
    [.19, { ...keyCatch, rightHand: [-1.24, -.34, .68], fingers: [null, "pinch"], head: [.13, -.16, .06], face: [.26, .39] }],
    [.34, { ...keyCatch, rightHand: [-1.32, .01, .71], fingers: [null, "open"], torso: [-.026, -.047, .036],
      head: [-.14, -.17, .065], sway: -.024, face: [.42, .62] }],
    [.45, { ...keyCatch, rightHand: [-1.38, -.13, .74], fingers: [null, "open"], head: [-.22, -.19, .064], face: [.51, .68] }],
    [.55, { ...keyCatch, torso: [.039, -.07, .036], rise: -.023, head: [.14, -.13, .06], face: [.7, .52] }],
    [.67, { ...keyCatch, fingers: [null, "pinch"], head: [-.035, .09, .03], face: [.89, .51] }],
    [.84, { rightHand: [-1.38, -.43, .56], head: [.056, .05, .02], face: [.65, .3] }],
  ] },
  { id: "105", name: "Spot a scratch", duration: 3.45, keys: [
    [.19, { head: [.065, -.22, .053], torso: [.029, -.11, .033], face: [.08, .35] }],
    [.37, { ...scratch, turn: -.16, sway: -.025, rise: -.031, torso: [.123, -.15, .061], head: [.22, -.24, .09], face: [-.12, .56] }],
    [.51, { ...scratch, rightHand: [-1.61, -.35, .83], turn: -.16, sway: -.026, rise: -.032,
      torso: [.13, -.16, .067], head: [.19, -.25, .081], face: [.05, .45] }],
    [.67, { rightHand: [-1.39, -.47, .64], head: [-.02, .08, .032], torso: [.029, -.048, .025], face: [.65, .42] }],
    [.83, { head: [.097, .055, .026], face: [.72, .31] }],
  ] },
  { id: "106", name: "Finger snap", duration: 2.75, keys: [
    [.17, { ...snap, rightHand: [-1.32, -.19, .63], head: [.068, -.08, .046], face: [.23, .34] }],
    [.36, { ...snap, sway: -.026, rise: -.017, torso: [.023, -.06, .035], head: [-.035, -.07, .064], face: [.68, .51] }],
    [.42, { ...snap, rightHand: [-1.48, .09, .69], rightPalm: [[-.17, .8, .57], [.1, -.56, .8]],
      fingers: [null, "point"], head: [.057, .055, .04], face: [.95, .57] }],
    [.61, { ...snap, rightHand: [-1.42, .06, .63], fingers: [null, "cup"], sway: -.018, head: [-.017, .08, .061], face: [.84, .44] }],
    [.8, { rightHand: [-1.34, -.36, .58], head: [.032, .068, .024], face: [.63, .28] }],
  ] },
  { id: "107", name: "Window knock", duration: 3.2, keys: [
    [.17, { ...knock, rightHand: [-1.32, -.17, .58], head: [.04, -.2, .045], face: [.18, .38] }],
    [.31, { ...knock, turn: -.15, sway: -.024, torso: [.02, -.13, .048], head: [.045, -.31, .069], face: [.36, .43] }],
    [.4, { ...knock, rightHand: [-1.51, .12, .81], turn: -.15, torso: [.063, -.12, .04], head: [.086, -.27, .057], face: [.5, .48] }],
    [.48, { ...knock, turn: -.15, torso: [.02, -.12, .046], head: [.045, -.27, .062], face: [.56, .45] }],
    [.57, { ...knock, rightHand: [-1.51, .12, .81], turn: -.15, torso: [.062, -.12, .04], head: [.076, -.25, .057], face: [.64, .48] }],
    [.73, { ...knock, rightHand: [-1.42, -.12, .63], head: [-.095, -.13, .082], face: [.82, .47] }],
    [.85, { head: [.021, .02, .039], face: [.63, .27] }],
  ] },
  { id: "108", name: "Camera shy", duration: 3.55, keys: [
    [.19, { ...shyPalm, rightHand: [-1.48, -.08, .55], head: [.08, .04, -.03], face: [.22, .59] }],
    [.37, { ...shyPalm, sway: .029, rise: -.029, torso: [-.028, .11, -.071], head: [.145, .26, -.106], face: [-.07, .54] }],
    [.53, { ...shyPalm, rightHand: [-1.3, .16, .59], sway: .026, rise: -.025, head: [.092, .03, -.07], face: [.34, .61] }],
    [.69, { ...shyPalm, rightHand: [-1.46, -.075, .6], torso: [.024, -.01, -.03], head: [-.022, -.08, -.04], face: [.77, .49] }],
    [.83, { rightHand: [-1.42, -.41, .56], head: [.031, .044, .02], face: [.59, .28] }],
  ] },
  { id: "109", name: "Cuff straighten", duration: 3.45, keys: [
    [.18, { ...cuff, leftHand: [.89, -.41, .65], rightHand: [-.94, -.4, .61], head: [.14, .06, -.047], face: [.2, .32] }],
    [.36, { ...cuff, torso: [.073, .062, -.034], head: [.219, .11, -.057], rise: -.025, face: [.03, .45] }],
    [.48, { ...cuff, leftHand: [.67, -.29, .75], rightHand: [-.23, -.32, .69], head: [.19, .103, -.044], face: [.25, .47] }],
    [.62, { ...cuff, leftHand: [.72, -.32, .78], rightHand: [-.42, -.33, .7], sway: .018,
      head: [.113, .06, -.042], face: [.55, .39] }],
    [.83, { leftHand: [1.16, -.43, .59], rightHand: [-1.16, -.45, .59], head: [-.025, .064, .02], face: [.69, .29] }],
  ] },
  { id: "110", name: "Heel tap", duration: 3.4, keys: [
    [.17, { ...tapHands, sway: .028, rise: -.019, feet: { r: [-.03, .027, .049, -.12, .09] }, head: [.06, -.08, .044], face: [.33, .31] }],
    [.3, { ...tapHands, sway: .031, rise: -.027, feet: { r: [-.055, 0, .083, -.22, -.1] }, torso: [.038, -.054, -.03], head: [.086, -.091, .066], face: [.56, .4] }],
    [.42, { ...tapHands, sway: .031, rise: -.021, feet: { r: [-.054, .023, .079, -.22, .08] }, head: [.02, -.045, .05], face: [.69, .46] }],
    [.55, { ...tapHands, sway: .03, rise: -.026, feet: { r: [-.055, 0, .083, -.22, -.1] }, torso: [.029, -.048, -.022], head: [.082, .02, .066], face: [.74, .49] }],
    [.73, { ...tapHands, sway: .02, rise: -.018, feet: { r: [-.022, .025, .034, -.09] }, head: [-.02, .08, .026], face: [.78, .4] }],
    [.87, { head: [.025, .046, .012], face: [.61, .26] }],
  ] },
  { id: "111", name: "Perfect fit", duration: 3.05, keys: [
    [.17, { ...approval, rightHand: [-1.31, -.28, .59], head: [.095, -.15, .04], face: [.15, .39] }],
    [.35, { ...approval, rightHand: [-1.19, .13, .69], sway: -.024, torso: [.033, -.07, .044],
      head: [-.03, -.11, .082], face: [.6, .54] }],
    [.55, { ...approval, rightHand: [-1.17, .16, .7], sway: -.028, rise: -.024, torso: [.04, -.05, .042],
      head: [.155, .035, .064], face: [.93, .49] }],
    [.68, { ...approval, rightHand: [-1.32, -.02, .63], head: [-.036, .08, .057], face: [.88, .44] }],
    [.84, { rightHand: [-1.42, -.42, .56], head: [.035, .057, .028], face: [.64, .25] }],
  ] },
  { id: "112", name: "Curtain call", duration: 3.8, keys: [
    [.19, { ...bowHands, sway: .014, torso: [-.025, .04, -.025], head: [-.033, .09, -.044], face: [.53, .4] }],
    [.38, { ...bowHands, leftHand: [1.59, -.44, .63], sway: .019, rise: -.026,
      torso: [.16, .075, -.049], head: [.14, .058, -.043], face: [.82, .46] }],
    [.53, { ...bowHands, leftHand: [1.63, -.44, .63], sway: .019, rise: -.025,
      torso: [.149, .074, -.046], head: [.121, -.015, -.045], face: [.9, .5] }],
    [.72, { ...bowHands, rightHand: [-.94, -.36, .63], leftHand: [1.52, -.41, .62],
      torso: [-.036, -.029, .021], head: [-.054, .08, .019], face: [.94, .47] }],
    [.88, { head: [.037, .046, .02], face: [.67, .26] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["104", "105", "106", "107", "108", "111"];

export function availableShowroomEmotes(bag: boolean) {
  return bag ? SHOWROOM_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : SHOWROOM_EMOTES;
}
