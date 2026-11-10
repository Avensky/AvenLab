import type { Emote, XYZ } from "./garageEmotes";

const raisedLeft: XYZ = [1.75, 1.06, .29];
const raisedRight: XYZ = [-1.75, 1.06, .29];
const clapOpenLeft: XYZ = [1.85, -.19, .62];
const clapOpenRight: XYZ = [-1.85, -.19, .62];
const clapLeft: XYZ = [.2, -.16, .68];
const clapRight: XYZ = [-.2, -.16, .68];
const heartLeft: XYZ = [.42, -.18, .69];
const heartRight: XYZ = [-.42, -.18, .69];

export const VICTORY_EMOTES = [
  { id: "011", name: "Small fist pump", duration: 2.15, keys: [
    [.16, { sway: .035, rise: -.029, rightHand: [-1.45, -.25, .58], fingers: [null, "fist"], torso: [.04, .12, -.045], face: [.35, .14] }],
    [.31, { sway: -.052, rise: -.025, feet: { r: [-.048, 0, .041, -.13] }, rightHand: [-.63, .13, .59], fingers: [null, "fist"], torso: [-.07, -.07, .055], head: [-.09, .08, -.035], face: [.95, .55] }],
    [.47, { sway: -.06, rise: -.043, feet: { r: [-.048, 0, .041, -.13] }, rightHand: [-.54, -.25, .48], fingers: [null, "fist"], head: [.15, .02, 0], face: [.92, .25] }],
    [.69, { sway: -.014, rise: -.015, feet: { r: [-.026, .027, .021] }, rightHand: [-.72, -.28, .51], fingers: [null, "fist"], head: [-.035, -.03, .04], face: [.72, .22] }],
  ] },
  { id: "012", name: "Both arms up", duration: 3.2, keys: [
    [.15, { leftHand: [1.9, -.35, .57], rightHand: [-1.9, -.35, .57], torso: [.1, 0, 0], rise: -.009 }],
    [.38, { sway: .022, rise: .016, feet: { l: [0, .017, 0], r: [0, .018, 0] }, leftHand: raisedLeft, rightHand: raisedRight, torso: [-.065, 0, .04], head: [-.12, -.07, -.04], face: [1, .85] }],
    [.72, { sway: -.037, rise: -.018, leftHand: raisedLeft, rightHand: raisedRight, torso: [-.05, .025, -.03], head: [-.07, .11, .04], face: [1, .58] }],
    [.87, { leftHand: [2.2, .35, .57], rightHand: [-2.2, .35, .57], face: [.66, .26] }],
  ] },
  { id: "013", name: "Happy applause", duration: 3, keys: [
    [.14, { leftHand: clapOpenLeft, rightHand: clapOpenRight, face: [.7, .45] }],
    [.25, { sway: .035, rise: -.029, leftHand: clapLeft, rightHand: clapRight, torso: [.06, .04, -.045], face: [.92, .38] }],
    [.34, { sway: .027, rise: -.014, leftHand: clapOpenLeft, rightHand: clapOpenRight, torso: [-.03, .04, -.055], face: [.95, .45] }],
    [.43, { sway: -.031, rise: -.031, leftHand: clapLeft, rightHand: clapRight, torso: [.06, 0, .035], face: [.95, .36] }],
    [.52, { sway: -.036, rise: -.016, leftHand: clapOpenLeft, rightHand: clapOpenRight, torso: [-.03, -.045, .05], face: [.96, .5] }],
    [.61, { sway: .028, rise: -.032, leftHand: clapLeft, rightHand: clapRight, torso: [.07, -.02, .065], head: [.08, 0, -.025], face: [1, .42] }],
    [.76, { leftHand: [1.4, -.36, .59], rightHand: [-1.4, -.36, .59], face: [.65, .23] }],
  ] },
  { id: "014", name: "Victory hop", duration: 2.45, keys: [
    [.22, { leftHand: [1.5, -.5, .55], rightHand: [-1.5, -.5, .55], torso: [.1, 0, 0], rise: -.022 }],
    [.31, { feet: { l: [.013, .073, .013], r: [-.013, .071, .015] }, leftHand: [1.45, .16, .6], rightHand: [-1.45, .16, .6], rise: .07, face: [.9, .64] }],
    [.39, { feet: { l: [.055, .173, .024], r: [-.049, .142, -.055] }, leftHand: [1.45, .64, .42], rightHand: [-1.45, .64, .42], rise: .135, face: [1, .9] }],
    [.47, { feet: { l: [.049, .078, .02], r: [-.047, .081, -.028] }, leftHand: [1.65, .13, .6], rightHand: [-1.65, .13, .6], rise: .072, face: [1, .55] }],
    [.54, { feet: { l: [.039, 0, .014], r: [-.043, 0, -.017] }, leftHand: [1.75, -.38, .63], rightHand: [-1.75, -.38, .63], torso: [.15, 0, 0], rise: -.026, face: [.85, .3] }],
    [.72, { sway: .029, rise: -.032, feet: { l: [.02, .028, .007], r: [-.023, 0, -.01] }, torso: [-.05, 0, 0], head: [-.055, .045, -.035], face: [.7, .25] }],
  ] },
  { id: "015", name: "Double peace pose", duration: 2.9, keys: [
    [.18, { sway: .045, rise: -.02, feet: { r: [-.034, .033, .042] }, leftHand: [2.1, -.11, .52], rightHand: [-2.1, -.11, .52], fingers: ["peace", "peace"], face: [.45, .32] }],
    [.37, { sway: -.046, rise: -.04, feet: { r: [-.07, 0, .087, -.23] }, leftHand: [1.82, .38, .54], rightHand: [-1.82, .38, .54], fingers: ["peace", "peace"], torso: [.045, -.09, -.08], head: [-.075, .1, .15], wristLeft: -.17, wrist: .17, face: [1, .65] }],
    [.68, { sway: -.029, rise: -.033, feet: { r: [-.07, 0, .087, -.23] }, leftHand: [1.82, .39, .54], rightHand: [-1.82, .34, .54], fingers: ["peace", "peace"], torso: [.05, -.06, -.06], head: [-.055, .12, .12], wristLeft: -.13, wrist: .19, face: [.95, .48] }],
    [.83, { sway: .022, rise: -.018, feet: { r: [-.026, .027, .042] }, leftHand: [1.9, -.22, .58], rightHand: [-1.9, -.22, .58], face: [.7, .25] }],
  ] },
  { id: "016", name: "Playful bow", duration: 2.75, keys: [
    [.17, { sway: .024, rise: -.023, feet: { r: [-.027, .029, .036] }, leftHand: [1.8, -.55, .5], rightHand: [-.56, -.23, .62], torso: [-.085, .04, -.035], head: [-.12, .05, .025], face: [.68, .32] }],
    [.38, { sway: -.04, rise: -.063, feet: { r: [-.04, 0, .075, -.12] }, leftHand: [1.88, -.55, .55], rightHand: [-.42, -.34, .73], torso: [.45, -.08, .055], head: [.19, 0, 0], face: [.72, .18] }],
    [.57, { sway: -.023, rise: -.047, feet: { r: [-.04, 0, .075, -.12] }, leftHand: [1.88, -.53, .56], rightHand: [-.42, -.31, .71], torso: [.36, -.06, .045], head: [-.25, .12, -.075], face: [.95, .62] }],
    [.75, { sway: .025, rise: -.024, feet: { r: [-.021, .026, .032] }, torso: [.05, .01, 0], head: [-.08, -.045, .045], face: [.95, .33] }],
  ] },
  { id: "017", name: "Hand heart", duration: 3.1, keys: [
    [.16, { leftHand: [1.35, -.42, .59], rightHand: [-1.35, -.42, .59], face: [.55, .35] }],
    [.34, { sway: .029, rise: -.024, leftHand: heartLeft, rightHand: heartRight, fingers: ["heart", "heart"], wristLeft: .26, wrist: -.26, head: [.065, -.045, -.08], face: [.92, .55] }],
    [.65, { sway: -.035, rise: -.026, leftHand: heartLeft, rightHand: heartRight, fingers: ["heart", "heart"], wristLeft: .28, wrist: -.28, head: [-.055, .045, .065], face: [1, .48] }],
    [.83, { leftHand: [1.3, -.35, .59], rightHand: [-1.3, -.35, .59], face: [.7, .24] }],
  ] },
  { id: "018", name: "Blown kiss", duration: 2.65, keys: [
    [.16, { rightHand: [-1.35, -.28, .54], head: [.035, .04, -.08], face: [.46, .31] }],
    [.36, { sway: -.021, rise: -.026, rightHand: [-.32, .19, .46], wrist: .17, torso: [.075, -.045, 0], head: [.12, -.09, -.055], face: [.15, .37] }],
    [.48, { sway: -.041, rise: -.031, rightHand: [-.3, .22, .5], wrist: .13, torso: [.07, -.055, 0], head: [.09, -.06, -.035], face: [.36, .42] }],
    [.62, { sway: -.056, rise: -.023, feet: { r: [-.031, 0, .046, -.13] }, rightHand: [-1.22, .37, .97], wrist: -.24, torso: [-.05, .04, .075], head: [-.105, .09, .07], face: [1, .6] }],
    [.79, { sway: -.019, rise: -.013, feet: { r: [-.016, .027, .022] }, rightHand: [-1.45, -.08, .71], head: [-.035, .06, .095], face: [.82, .38] }],
  ] },
  { id: "019", name: "Little victory dance", duration: 3.25, keys: [
    [.16, { sway: -.032, rise: -.035, feet: { l: [.1, .079, .042, .23] }, leftHand: [1.75, -.36, .6], rightHand: [-.62, -.33, .61], torso: [.045, -.21, -.13], head: [-.04, .12, .12], face: [.8, .36] }],
    [.31, { sway: .099, rise: -.051, feet: { l: [.17, 0, .07, .32] }, leftHand: [1.55, -.2, .55], rightHand: [-.74, -.48, .54], torso: [-.065, -.14, -.085], head: [-.09, .05, .07], face: [.96, .55] }],
    [.45, { sway: .041, rise: -.031, feet: { l: [.17, 0, .07, .32], r: [-.092, .08, -.036, -.24] }, leftHand: [.62, -.23, .64], rightHand: [-1.72, -.3, .6], torso: [.055, .22, .12], head: [.05, -.12, -.12], face: [1, .49] }],
    [.61, { sway: -.082, rise: -.05, feet: { l: [.17, 0, .07, .32], r: [-.12, 0, -.057, -.33] }, leftHand: [.73, -.42, .55], rightHand: [-1.54, -.25, .55], torso: [-.08, .16, .09], head: [-.09, -.05, -.07], face: [.97, .49] }],
    [.77, { sway: -.069, rise: -.026, feet: { l: [.059, .083, .03, .13], r: [-.12, 0, -.057, -.33] }, leftHand: [1.34, -.28, .57], rightHand: [-1.34, -.28, .57], torso: [.065, 0, .03], face: [.9, .35] }],
    [.89, { sway: .017, rise: -.024, feet: { r: [-.054, .047, -.027, -.16] }, torso: [-.025, 0, -.03], head: [-.06, .03, .04], face: [.64, .23] }],
  ] },
  { id: "020", name: "Champion stance", duration: 3.15, keys: [
    [.16, { sway: -.027, rise: -.026, feet: { l: [.054, .04, .018, .15] }, leftHand: [2.08, -.37, .57], rightHand: [-2.08, -.37, .57], torso: [-.035, .1, -.035], face: [.45, .26] }],
    [.36, { sway: .02, rise: -.041, feet: { l: [.111, 0, .027, .27] }, leftHand: [1.24, -.63, .27], rightHand: [-1.24, -.63, .27], torso: [-.085, .085, -.055], head: [-.17, -.08, .04], face: [.75, .46] }],
    [.75, { sway: .047, rise: -.034, feet: { l: [.111, 0, .027, .27] }, leftHand: [1.24, -.63, .27], rightHand: [-1.24, -.63, .27], torso: [-.08, .06, -.045], head: [-.12, .12, .05], face: [.82, .39] }],
    [.86, { sway: -.025, rise: -.02, feet: { l: [.051, .035, .017, .11] }, leftHand: [1.85, -.47, .45], rightHand: [-1.85, -.47, .45], face: [.55, .2] }],
  ] },
] as const satisfies readonly Emote[];

export type VictoryEmoteId = typeof VICTORY_EMOTES[number]["id"];

export function availableVictoryEmotes(bag: boolean) {
  return bag ? VICTORY_EMOTES.filter(emote => emote.id === "011" || emote.id === "018") : VICTORY_EMOTES;
}
