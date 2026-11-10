import type { Emote } from "./garageEmotes";

const respect = {
  rightHand: [-1.37, -.24, .68], rightPalm: [[-.25, .16, .96], [.08, .97, -.17]],
  fingers: [null, "open"],
} as const;
const close = {
  leftHand: [.47, -.22, .64], rightHand: [-.45, -.23, .655],
  leftPalm: [[-.145, .71, .69], [-.94, -.29, .13]], rightPalm: [[.153, .69, .71], [.94, -.29, .11]],
  fingers: ["cup", "cup"],
} as const;
const pointAtBoard = {
  rightHand: [-1.36, .18, .67], rightPalm: [[-.62, .38, .68], [-.48, -.86, .04]],
  fingers: [null, "point"],
} as const;
const salute = {
  rightHand: [-1.28, .4, .42], rightPalm: [[.91, .24, .33], [.28, -.95, -.08]],
  fingers: [null, "open"],
} as const;

const RACE_REACTIONS = [
  { id: "191", name: "Good race acknowledgement", duration: 3.95, keys: [
    [.18, { ...respect, rightHand: [-1.25, -.48, .511], turn: -.11, torso: [.044, -.057, .03], head: [.075, -.185, .051], face: [.23, .41] }],
    [.36, { ...respect, rightHand: [-1.54, -.21, .75], turn: -.16, sway: -.034, rise: -.024, travel: .031,
      torso: [.091, -.097, .041], head: [.161, -.163, .057], face: [.55, .48] }],
    [.54, { ...respect, rightHand: [-1.42, -.22, .75], turn: -.13, sway: -.024, rise: -.019,
      torso: [.042, -.063, .033], head: [-.079, -.143, .043], face: [.77, .49] }],
    [.69, { ...respect, rightHand: [-1.21, -.3, .66], turn: -.071, torso: [.059, -.038, .023], head: [.102, -.07, .033], face: [.79, .39] }],
    [.85, { rightHand: [-1.45, -.48, .483], head: [.04, .034, .02], face: [.56, .28] }],
  ] },
  { id: "192", name: "Close second frustration", duration: 4.45, keys: [
    [.17, { sway: -.021, torso: [.065, -.12, .035], head: [.145, -.241, .062], face: [-.24, .59] }],
    [.34, { ...close, leftHand: [.91, -.28, .58], rightHand: [-.94, -.28, .59], sway: .024, rise: -.029,
      torso: [.112, .07, -.06], head: [.192, .065, -.113], face: [-.32, -.43] }],
    [.48, { ...close, sway: -.022, rise: -.037, torso: [.119, -.03, .026], head: [.228, -.061, .087], face: [-.23, .51] }],
    [.59, { ...close, leftHand: [.56, -.24, .615], rightHand: [-.55, -.25, .639], sway: -.021,
      torso: [-.084, -.023, .033], head: [-.095, -.032, .062], blink: .72, face: [.12, .36] }],
    [.71, { leftHand: [1.55, -.42, .52], rightHand: [-1.59, -.42, .529], torso: [.047, .061, -.029], head: [.146, .119, -.063], face: [.52, .37] }],
    [.86, { torso: [-.021, .028, -.018], head: [.041, .08, -.03], face: [.59, .24] }],
  ] },
  { id: "193", name: "Photo finish lean", duration: 4.25, keys: [
    [.16, { turn: -.08, head: [.035, -.18, .08], torso: [.047, -.06, .04], face: [.2, .47] }],
    [.31, { turn: -.17, rise: -.035, travel: .05, torso: [.187, -.11, .045], head: [-.09, -.26, .08],
      feet: { r: [-.026, .024, .053, -.11] }, face: [.12, -.32] }],
    [.48, { turn: -.19, rise: -.049, travel: .093, torso: [.249, -.093, .062], head: [-.115, -.3, .106],
      feet: { r: [-.039, 0, .099, -.14] }, face: [-.08, -.49] }],
    [.63, { turn: -.19, rise: -.041, travel: .08, torso: [.191, -.061, .05], head: [.013, -.21, .07],
      feet: { r: [-.039, 0, .099, -.14] }, face: [.76, .47] }],
    [.81, { turn: -.07, rise: -.015, travel: .024, torso: [.062, -.024, .025], head: [.05, -.09, .021],
      feet: { r: [-.018, .031, .045, -.07] }, face: [.93, .43] }],
  ] },
  { id: "194", name: "Timing board double take", duration: 4.35, keys: [
    [.18, { head: [-.08, -.24, .053], torso: [-.019, -.08, .025], face: [.34, .25] }],
    [.31, { head: [.04, .069, -.03], torso: [.018, .012, -.018], face: [.28, .37] }],
    [.41, { ...pointAtBoard, turn: -.12, head: [-.184, -.36, .083], torso: [-.06, -.154, .052], face: [.06, .81] }],
    [.58, { ...pointAtBoard, turn: -.15, head: [-.15, -.29, .041], torso: [-.035, -.12, .062], face: [.81, .6] }],
    [.72, { ...pointAtBoard, rightHand: [-1.24, -.14, .61], turn: -.07, head: [.104, -.12, .053], face: [.92, .38] }],
    [.87, { head: [.045, -.025, -.027], face: [.73, .23] }],
  ] },
  { id: "195", name: "Crew salute", duration: 3.85, keys: [
    [.18, { turn: .08, torso: [.018, .065, -.035], head: [.026, .148, -.055], face: [.4, .38] }],
    [.32, { ...salute, turn: .15, torso: [-.046, .089, -.043], head: [-.017, .19, -.058], face: [.7, .43] }],
    [.49, { ...salute, turn: .15, head: [.074, .17, -.046], torso: [.006, .093, -.025], face: [.84, .44] }],
    [.62, { ...respect, rightHand: [-1.56, .1, .64], turn: .09, head: [-.052, .11, -.028], face: [.89, .38] }],
    [.81, { rightHand: [-1.4, -.47, .49], head: [.073, .057, .021], face: [.71, .28] }],
  ] },
  { id: "196", name: "Late brake wince", duration: 4.1, keys: [
    [.19, { ...close, turn: .08, torso: [.059, .063, -.028], head: [.043, .207, -.06], face: [.29, .43] }],
    [.31, { ...close, turn: .13, torso: [.109, .092, -.071], head: [.076, .305, -.095], face: [.08, .6] }],
    [.41, { ...close, turn: .13, torso: [-.155, .082, -.085], head: [.137, .263, -.079],
      rise: -.069, feet: { l: [.049, .023, -.069, .14] }, sway: .037, blink: .87, face: [-.54, -.31] }],
    [.55, { ...close, turn: .12, torso: [-.081, .064, -.054], head: [.128, .233, -.069],
      rise: -.056, feet: { l: [.051, 0, -.085, .15] }, sway: .038, face: [-.37, .54] }],
    [.71, { turn: .08, torso: [.025, .035, -.03], head: [.032, .106, .028],
      rise: -.02, feet: { l: [.025, .026, -.038, .07] }, face: [.49, .32] }],
    [.88, { head: [.057, .061, .036], face: [.62, .27] }],
  ] },
  { id: "197", name: "Clear the track", duration: 4.3, keys: [
    [.18, { ...respect, rightHand: [-1.19, -.09, .53], turn: -.095, head: [.018, -.22, .03], face: [.21, .51] }],
    [.34, { rightHand: [-.38, -.09, .62], rightPalm: [[.82, .45, .34], [-.4, .22, .88]], fingers: [null, "open"],
      torso: [.062, .049, -.028], head: [.059, -.17, .06], face: [.2, .55] }],
    [.52, { rightHand: [-2.05, -.17, .47], rightPalm: [[-.84, .27, .48], [.16, .96, -.25]], fingers: [null, "open"],
      turn: -.24, torso: [.023, -.15, .052], sway: -.041, head: [-.044, -.29, .043], face: [.37, .62] }],
    [.67, { ...pointAtBoard, rightHand: [-1.85, -.21, .47], turn: -.2, head: [.089, -.24, .057], face: [.59, .46] }],
    [.85, { rightHand: [-1.44, -.51, .48], turn: -.06, head: [.076, -.085, .041], face: [.62, .34] }],
  ] },
  { id: "198", name: "Race won relief", duration: 5.05, keys: [
    [.16, { ...close, torso: [.123, -.031, .022], head: [.158, -.075, .054], rise: -.041, face: [-.17, -.27] }],
    [.33, { ...close, torso: [.068, -.009, .018], head: [.132, -.056, .043], rise: -.029, blink: .75, face: [.23, .48] }],
    [.5, { ...close, leftHand: [.95, -.22, .63], rightHand: [-.95, -.22, .63], fingers: ["open", "open"],
      torso: [-.071, .023, -.019], head: [-.15, .045, -.037], rise: .011, face: [.96, .48] }],
    [.68, { ...respect, rightHand: [-1.09, -.19, .43], torso: [-.012, -.04, .018], head: [.086, -.079, .041], face: [1, .37] }],
    [.81, { rightHand: [-1.26, -.42, .5], torso: [.048, .021, -.015], head: [.056, .105, -.027], face: [.86, .34] }],
    [.92, { head: [.022, .045, -.018], face: [.57, .24] }],
  ] },
] as const satisfies readonly Emote[];

export function availableRaceReactions(bag: boolean) {
  return bag ? RACE_REACTIONS.filter(emote => emote.id !== "192" && emote.id !== "196" && emote.id !== "198") : RACE_REACTIONS;
}
