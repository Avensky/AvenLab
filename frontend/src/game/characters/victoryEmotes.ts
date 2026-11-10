import type { Emote, Palm, XYZ } from "./garageEmotes";

const raisedLeft: XYZ = [1.75, 1.06, .29];
const raisedRight: XYZ = [-1.75, 1.06, .29];
const clapOpenLeft: XYZ = [1.85, -.19, .62];
const clapOpenRight: XYZ = [-1.85, -.19, .62];
const palmsIn = {
  leftPalm: [[-.025, .86, .51], [-1, 0, 0]], rightPalm: [[.025, .86, .51], [1, 0, 0]],
  fingers: ["open", "open"],
} as const;
const clapOpen = { ...palmsIn, leftHand: clapOpenLeft, rightHand: clapOpenRight } as const;
const clapHit = { ...palmsIn, leftHand: [.105, -.16, .68], rightHand: [-.105, -.16, .68] } as const;
const chestHeart = {
  leftHand: [.62, -.3, .66], rightHand: [-.62, -.3, .66],
  leftPalm: [[-.61, .79, .04], [0, 0, 1]], rightPalm: [[.61, .79, .04], [0, 0, 1]],
  fingers: ["heart", "heart"],
} as const;
const fistUp: Palm = [[.02, 1, .23], [0, .23, -1]];
const kissTouch = {
  rightHand: [-.69, .13, .4], rightPalm: [[.56, .81, -.16], [0, -.19, -1]], fingers: [null, "open"], rightAtLips: true,
} as const;
const kissRelease: Palm = [[.16, .32, .94], [0, .95, -.32]];
const danceHands = {
  leftPalm: [[.33, -.46, .82], [0, -1, -.56]], rightPalm: [[-.33, -.46, .82], [0, -1, -.56]],
  fingers: ["open", "open"],
} as const;
const danceLeft = { ...danceHands, leftHand: [1.92, -.33, .48], rightHand: [-1.53, -.51, .53] } as const;
const danceRight = { ...danceHands, leftHand: [1.53, -.52, .54], rightHand: [-1.92, -.32, .49] } as const;
const danceLead = [.114, 0, .041, .14] as const;
const danceReturn = [-.04, 0, .022, -.12] as const;

export const VICTORY_EMOTES = [
  { id: "011", name: "Small fist pump", duration: 2.15, keys: [
    [.16, { sway: .035, rise: -.029, rightHand: [-1.45, -.25, .58], fingers: [null, "fist"], torso: [.04, .12, -.045], face: [.35, .14] }],
    [.31, { sway: -.052, rise: -.025, feet: { r: [-.048, 0, .041, -.13] }, rightHand: [-.72, .42, .56], rightPalm: fistUp, fingers: [null, "fist"], torso: [-.07, -.07, .055], head: [-.09, .08, -.035], face: [.95, .55] }],
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
    [.15, { ...clapOpen, face: [.7, .45] }],
    [.26, { ...clapHit, sway: .029, rise: -.025, torso: [.04, .015, -.035], face: [.92, .38] }],
    [.28, { ...clapHit, sway: .025, rise: -.024, torso: [.045, .01, -.026], face: [.94, .42] }],
    [.35, { ...clapOpen, sway: .021, rise: -.016, torso: [-.022, .028, -.04], face: [.95, .45] }],
    [.43, { ...clapHit, sway: -.022, rise: -.026, torso: [.045, 0, .03], face: [.95, .36] }],
    [.45, { ...clapHit, sway: -.026, rise: -.023, torso: [.046, 0, .029], face: [.96, .41] }],
    [.52, { ...clapOpen, sway: -.027, rise: -.014, torso: [-.027, -.021, .035], face: [.96, .5] }],
    [.61, { ...clapHit, sway: .02, rise: -.029, torso: [.045, -.012, .038], head: [.08, 0, -.025], face: [1, .42] }],
    [.63, { ...clapHit, sway: .025, rise: -.026, torso: [.044, -.01, .032], head: [.065, 0, -.018], face: [.96, .38] }],
    [.77, { ...clapOpen, leftHand: [1.4, -.34, .59], rightHand: [-1.4, -.34, .59], face: [.65, .23] }],
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
    [.34, { ...chestHeart, sway: .029, rise: -.024, head: [.065, -.045, -.08], face: [.92, .55] }],
    [.65, { ...chestHeart, sway: -.035, rise: -.026, head: [-.055, .045, .065], face: [1, .48] }],
    [.83, { leftHand: [1.3, -.35, .59], rightHand: [-1.3, -.35, .59], face: [.7, .24] }],
  ] },
  { id: "018", name: "Blown kiss", duration: 2.65, keys: [
    [.16, { rightHand: [-1.35, -.28, .54], head: [.035, .04, -.08], face: [.46, .31] }],
    [.36, { ...kissTouch, sway: -.021, rise: -.026, torso: [.05, -.035, 0], head: [.095, -.055, -.045], face: [.15, .37] }],
    [.48, { ...kissTouch, sway: -.041, rise: -.031, torso: [.055, -.04, 0], head: [.095, -.055, -.045], face: [.36, .42] }],
    [.55, { sway: -.05, rise: -.028, rightHand: [-.94, .15, .64], rightPalm: [[.33, .59, .74], [0, .72, -.58]], fingers: [null, "open"], head: [.04, .03, .025], face: [.69, .52] }],
    [.65, { sway: -.056, rise: -.023, feet: { r: [-.031, 0, .046, -.13] }, rightHand: [-1.12, .28, .9], rightPalm: kissRelease, fingers: [null, "open"], torso: [-.05, .04, .075], head: [-.105, .09, .07], face: [1, .6] }],
    [.79, { sway: -.019, rise: -.013, feet: { r: [-.016, .027, .022] }, rightHand: [-1.45, -.08, .71], head: [-.035, .06, .095], face: [.82, .38] }],
  ] },
  { id: "019", name: "Little victory dance", duration: 3.55, keys: [
    [.14, { ...danceLeft, sway: -.017, rise: -.025, feet: { l: [.064, .04, .026, .12] }, torso: [.025, -.095, -.044], head: [.018, .07, .064], face: [.68, .32] }],
    [.26, { ...danceRight, sway: .074, rise: -.042, feet: { l: danceLead }, torso: [.058, .07, -.075], head: [.08, -.05, .07], face: [.98, .44] }],
    [.37, { ...danceLeft, sway: .105, rise: -.019, feet: { l: danceLead, r: [.07, .039, .02, .08, .11] }, torso: [-.058, -.11, -.06], head: [-.077, .06, .05], face: [1, .51] }],
    [.47, { ...danceRight, sway: .093, rise: -.039, feet: { l: danceLead, r: [.089, 0, .021, .08] }, torso: [.06, .09, -.033], head: [.065, -.065, .025], face: [.9, .36] }],
    [.58, { ...danceRight, sway: .045, rise: -.021, feet: { l: danceLead, r: [.025, .045, .024, -.045, .13] }, torso: [-.058, .11, .063], head: [-.075, -.08, -.06], face: [.97, .51] }],
    [.69, { ...danceLeft, sway: -.046, rise: -.041, feet: { l: danceLead, r: danceReturn }, torso: [.063, -.095, .07], head: [.077, .063, -.055], face: [1, .52] }],
    [.8, { ...danceRight, sway: -.031, rise: -.02, feet: { l: [.048, .043, .022, .06, -.12], r: danceReturn }, torso: [-.043, .07, .033], head: [-.06, -.04, -.04], face: [.88, .45] }],
    [.91, { ...danceHands, leftHand: [1.62, -.57, .55], rightHand: [-1.62, -.57, .55], sway: .008, rise: -.026, feet: { r: [-.021, .025, .012, -.05] }, torso: [.041, -.025, -.012], head: [.041, .023, .029], face: [.63, .31] }],
  ] },
  { id: "020", name: "Champion stance", duration: 3.15, keys: [
    [.16, { sway: -.027, rise: -.026, feet: { l: [.054, .04, .018, .15] }, leftHand: [2.08, -.37, .57], rightHand: [-2.08, -.37, .57], torso: [-.035, .1, -.035], face: [.45, .26] }],
    [.36, { sway: .02, rise: -.041, feet: { l: [.111, 0, .027, .27] }, leftHand: [1.24, -.63, .27], rightHand: [-1.24, -.63, .27], torso: [-.085, .085, -.055], head: [-.17, -.08, .04], face: [.75, .46] }],
    [.75, { sway: .047, rise: -.034, feet: { l: [.111, 0, .027, .27] }, leftHand: [1.24, -.63, .27], rightHand: [-1.24, -.63, .27], torso: [-.08, .06, -.045], head: [-.12, .12, .05], face: [.82, .39] }],
    [.86, { sway: -.025, rise: -.02, feet: { l: [.051, .035, .017, .11] }, leftHand: [1.85, -.47, .45], rightHand: [-1.85, -.47, .45], face: [.55, .2] }],
  ] },
] as const satisfies readonly Emote[];

const overhead = {
  left: [[.83, 1.25, .42], [-1.06, 1.3, .57]], right: [[-.83, 1.25, .42], [1.06, 1.3, .57]],
  leftPalm: [[-.89, -.41, .16], [0, 0, 1]], rightPalm: [[.89, -.41, .16], [0, 0, 1]],
  fingers: ["open", "open"], overheadHeart: true,
} as const;
const tinyHeart = {
  rightHand: [-1.19, .26, .66], rightPalm: [[-.05, .99, .14], [0, 0, 1]], fingers: [null, "finger-heart"],
} as const;
const gunPalms = {
  leftPalm: [[.035, .105, 1], [-1, 0, .035]], rightPalm: [[-.035, .105, 1], [1, 0, .035]],
  fingers: ["finger-gun", "finger-gun"],
} as const;
const rapPalms = {
  leftPalm: [[-.28, .035, .96], [0, -1, 0]], rightPalm: [[.29, .03, .96], [0, -1, 0]],
  fingers: ["open", "open"],
} as const;

const VICTORY_VARIATIONS = [
  { id: "rap-hands", name: "Rap hands", duration: 3.1, keys: [
    [.14, { ...rapPalms, leftHand: [1.12, -.29, .59], rightHand: [-.92, -.08, .62], face: [.55, .24] }],
    [.25, { ...rapPalms, leftHand: [.68, -.32, .64], rightHand: [-.61, -.065, .67], torso: [.08, .06, -.055], head: [.12, -.04, .075], sway: .029, rise: -.026, face: [.83, .34] }],
    [.36, { ...rapPalms, leftHand: [.92, -.25, .59], rightHand: [-.97, -.16, .63], torso: [-.032, .07, -.04], head: [-.08, .03, .05], sway: .027, rise: -.016, face: [.91, .42] }],
    [.47, { ...rapPalms, leftHand: [.59, -.06, .68], rightHand: [-.68, -.32, .64], torso: [.07, -.06, .05], head: [.1, .02, -.05], sway: -.027, rise: -.027, face: [.88, .37] }],
    [.57, { ...rapPalms, leftHand: [.95, -.11, .63], rightHand: [-.91, -.27, .59], torso: [-.035, -.055, .035], head: [-.075, 0, -.03], sway: -.032, rise: -.016, face: [.93, .43] }],
    [.69, { ...rapPalms, leftHand: [.68, -.31, .67], rightHand: [-.56, -.035, .65], torso: [.075, .05, -.035], head: [.08, -.04, .065], sway: .024, rise: -.025, face: [1, .5] }],
    [.83, { ...rapPalms, leftHand: [1.05, -.31, .57], rightHand: [-1.11, -.19, .56], head: [-.025, .07, .05], face: [.72, .27] }],
  ] },
  { id: "heart-overhead", name: "Overhead heart", duration: 3.45, keys: [
    [.17, { leftHand: [2.2, .05, .42], rightHand: [-2.2, .05, .42], rise: -.02, face: [.49, .35] }],
    [.36, { ...overhead, sway: -.029, rise: -.02, head: [-.07, .025, .11], face: [1, .62] }],
    [.68, { ...overhead, sway: .032, rise: -.024, head: [-.052, -.04, -.1], face: [.94, .47] }],
    [.85, { leftHand: [2.42, .24, .46], rightHand: [-2.42, .24, .46], rise: -.02, face: [.67, .24] }],
  ] },
  { id: "heart-fingers", name: "Finger heart", duration: 2.85, keys: [
    [.18, { rightHand: [-1.45, -.22, .56], sway: -.021, rise: -.022, head: [.06, -.1, .06], face: [.42, .28] }],
    [.37, { ...tinyHeart, sway: -.036, rise: -.023, head: [-.055, -.10, .13], face: [.94, .48] }],
    [.65, { ...tinyHeart, sway: -.021, rise: -.021, head: [.015, .06, .105], face: [1, .52] }],
    [.83, { rightHand: [-1.39, -.25, .59], rise: -.018, head: [.03, .045, .07], face: [.63, .25] }],
  ] },
  { id: "finger-guns", name: "Finger guns", duration: 2.95, keys: [
    [.16, { ...gunPalms, leftHand: [1.53, -.09, .47], rightHand: [-1.44, -.11, .47], sway: .018, rise: -.016, head: [.028, -.06, .055], face: [.47, .35] }],
    [.32, { ...gunPalms, leftHand: [1.26, -.19, .73], rightHand: [-1.24, -.18, .75], sway: -.02, rise: -.028, torso: [.067, -.045, .045], head: [.09, .025, .051], face: [.82, .42] }],
    [.41, { ...gunPalms, leftHand: [1.34, -.13, .67], rightHand: [-1.47, -.05, .51], rightPalm: [[-.055, .35, .93], [1, 0, .059]], sway: -.032, rise: -.021, torso: [-.05, -.09, .04], head: [-.036, .055, .049], face: [.98, .62] }],
    [.51, { ...gunPalms, leftHand: [1.22, -.19, .76], rightHand: [-1.27, -.17, .74], sway: .009, rise: -.026, torso: [.043, .045, -.032], head: [.067, -.027, -.026], face: [.88, .45] }],
    [.61, { ...gunPalms, leftHand: [1.48, -.045, .52], rightHand: [-1.37, -.13, .67], leftPalm: [[.058, .37, .93], [-1, 0, .062]], sway: .036, rise: -.019, torso: [-.054, .09, -.048], head: [-.043, -.065, -.052], face: [1, .62] }],
    [.72, { ...gunPalms, leftHand: [1.34, -.21, .66], rightHand: [-1.33, -.2, .67], sway: .018, rise: -.024, head: [.043, .04, -.034], face: [.85, .42] }],
    [.85, { ...gunPalms, leftHand: [1.44, -.4, .53], rightHand: [-1.43, -.4, .54], sway: .006, rise: -.016, head: [.04, .07, .034], face: [.65, .24] }],
  ] },
] as const satisfies readonly Emote[];

export type VictoryEmoteId = typeof VICTORY_EMOTES[number]["id"];

const VICTORY_COLLECTION = [...VICTORY_EMOTES, ...VICTORY_VARIATIONS];
const BAG_COMPATIBLE = ["011", "018", "heart-fingers"];

export function availableVictoryEmotes(bag: boolean) {
  return bag ? VICTORY_COLLECTION.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : VICTORY_COLLECTION;
}
