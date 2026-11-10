import type { Emote } from "./garageEmotes";

const warmHands = {
  leftHand: [.17, -.3, .64], rightHand: [-.17, -.34, .615],
  leftPalm: [[-.05, .6, .79], [-1, 0, 0]], rightPalm: [[.07, .6, .79], [1, 0, 0]],
  fingers: ["open", "open"], torso: [.08, -.02, .028], head: [.2, .035, -.028],
} as const;
const fringe = {
  rightHand: [-1.12, .52, .34], rightPalm: [[.7, .56, -.43], [-.16, -.41, -.9]], fingers: [null, "cup"],
} as const;
const shaka = {
  rightHand: [-1.58, .1, .59], rightPalm: [[-.61, .73, .29], [.03, -.16, 1]], fingers: [null, "shaka"],
} as const;
const shuffleLeft = [.135, 0, .022, .08] as const;
const shuffleRight = [.103, 0, .01, -.01] as const;
const leftBeat = { leftHand: [1.66, -.48, .57], rightHand: [-1.89, -.68, .4], fingers: ["cup", "cup"] } as const;
const rightBeat = { leftHand: [1.9, -.65, .45], rightHand: [-1.53, -.49, .57], fingers: ["cup", "cup"] } as const;
const shade = {
  rightHand: [-1.21, .56, .48], rightPalm: [[.97, .16, -.11], [.04, -1, .09]], fingers: [null, "open"],
} as const;
const palmStretch = {
  leftHand: [.48, -.25, .77], rightHand: [-.23, -.062, .82],
  leftPalm: [[-.26, .93, .26], [.08, -.23, 1]], rightPalm: [[.94, -.18, .29], [0, -.29, -.96]],
  fingers: ["open", "cup"],
} as const;
const rainPalm = {
  rightHand: [-1.29, -.25, .76], rightPalm: [[-.15, .11, .98], [0, 1, -.11]], fingers: [null, "cup"],
} as const;
const pocketTap = {
  rightHand: [-1.3, -.56, .47], rightPalm: [[.18, -.94, .3], [.1, -.28, -.96]], fingers: [null, "cup"],
} as const;
const wrapCross = {
  leftHand: [-.39, -.09, .65], rightHand: [.42, .005, .8],
  leftPalm: [[-.87, .48, .12], [0, 0, 1]], rightPalm: [[.86, .46, -.1], [0, 0, 1]],
  fingers: ["open", "open"],
} as const;

const AFTER_HOURS_EMOTES = [
  { id: "091", name: "Cold hands", duration: 3.7, keys: [
    [.15, { ...warmHands, leftHand: [.91, -.48, .55], rightHand: [-.95, -.47, .53], face: [.08, .32] }],
    [.3, { ...warmHands, rise: -.023, sway: .014, face: [.18, .42] }],
    [.39, { ...warmHands, leftHand: [.17, -.345, .61], rightHand: [-.17, -.28, .642], rise: -.027, face: [.21, .46] }],
    [.49, { ...warmHands, rise: -.026, sway: .017, face: [.31, .38] }],
    [.58, { ...warmHands, leftHand: [.17, -.34, .612], rightHand: [-.16, -.28, .644], rise: -.025, face: [.49, .39] }],
    [.73, { ...warmHands, torso: [.032, .02, .018], head: [-.04, .08, -.035], face: [.68, .44] }],
    [.87, { leftHand: [.95, -.43, .57], rightHand: [-1.06, -.42, .55], head: [.04, .06, .02], face: [.46, .27] }],
  ] },
  { id: "092", name: "Neck reset", duration: 3.6, keys: [
    [.19, { head: [-.045, .04, -.17], torso: [-.035, .025, .027], sway: .017, rise: -.014, face: [.08, .27] }],
    [.34, { head: [.075, .09, -.29], torso: [.026, .037, .055], sway: .029, rise: -.021, face: [-.11, .36] }],
    [.5, { head: [.25, .012, -.035], torso: [.077, .01, .016], sway: .005, rise: -.027, face: [.06, .34] }],
    [.67, { head: [.09, -.09, .26], torso: [.023, -.029, -.056], sway: -.026, rise: -.02, face: [.29, .37] }],
    [.82, { head: [-.06, -.035, .1], torso: [-.023, -.02, -.026], sway: -.014, rise: -.013, face: [.61, .24] }],
  ] },
  { id: "093", name: "Fix the fringe", duration: 3.1, keys: [
    [.17, { ...fringe, rightHand: [-1.39, -.12, .53], head: [.059, .08, -.044], face: [.19, .37] }],
    [.32, { ...fringe, torso: [.039, .038, -.024], head: [.12, .11, -.095], sway: .017, face: [.19, .46] }],
    [.47, { ...fringe, rightHand: [-1.58, .44, .26], rightPalm: [[.33, .92, -.18], [-.76, .08, -.48]],
      head: [.053, .18, -.073], sway: .022, face: [.39, .41] }],
    [.63, { ...fringe, rightHand: [-1.55, .24, .35], rightPalm: [[.29, .94, .19], [-.8, .25, -.42]],
      head: [-.035, .095, .02], face: [.72, .44] }],
    [.81, { rightHand: [-1.43, -.34, .54], head: [.022, .052, .032], face: [.56, .26] }],
  ] },
  { id: "094", name: "Hang loose", duration: 3.1, keys: [
    [.16, { rightHand: [-1.46, -.16, .55], rightPalm: [[-.15, .77, .62], [.25, -.59, .76]],
      head: [.053, -.08, .041], face: [.34, .3] }],
    [.34, { ...shaka, sway: -.035, rise: -.023, torso: [-.033, -.075, .04], head: [-.04, -.04, .102], face: [.79, .54] }],
    [.47, { ...shaka, rightPalm: [[-.67, .63, .38], [.04, -.06, 1]],
      sway: -.037, head: [.079, .022, .076], face: [.91, .5] }],
    [.61, { ...shaka, rightPalm: [[-.44, .88, .13], [-.04, -.17, 1]], sway: -.03,
      rise: -.019, head: [-.031, .06, .061], face: [.94, .5] }],
    [.8, { rightHand: [-1.46, -.32, .56], head: [.031, .08, .033], face: [.67, .31] }],
  ] },
  { id: "095", name: "Night shuffle", duration: 3.65, keys: [
    [.11, { ...rightBeat, sway: -.038, rise: -.021, feet: { l: [.055, .024, .01, .04] },
      torso: [.026, .07, .085], head: [.026, .11, -.045], face: [.43, .29] }],
    [.23, { ...leftBeat, sway: .059, rise: -.045, feet: { l: shuffleLeft },
      torso: [.064, -.09, -.102], head: [.079, .08, .054], face: [.74, .43] }],
    [.33, { ...leftBeat, sway: .122, rise: -.028, feet: { l: shuffleLeft, r: [.06, .032, .018, -.015] },
      torso: [-.025, -.12, -.082], head: [-.042, -.025, .057], face: [.89, .45] }],
    [.43, { ...rightBeat, sway: .132, rise: -.042, feet: { l: shuffleLeft, r: shuffleRight },
      torso: [.049, .085, .032], head: [.073, -.061, -.027], face: [.95, .45] }],
    [.54, { ...leftBeat, sway: .128, rise: -.026, feet: { l: shuffleLeft, r: [.057, .029, .014, -.035] },
      torso: [-.024, -.07, -.071], head: [-.029, -.09, .045], face: [.86, .4] }],
    [.66, { ...rightBeat, sway: .06, rise: -.045, feet: { l: shuffleLeft },
      torso: [.055, .092, .09], head: [.082, -.023, -.061], face: [.92, .46] }],
    [.77, { ...rightBeat, sway: .014, rise: -.026, feet: { l: [.06, .032, .012, .04] },
      torso: [-.02, .11, .083], head: [-.021, .077, -.041], face: [.83, .36] }],
    [.87, { ...leftBeat, sway: .008, rise: -.031, torso: [.039, -.057, -.04],
      head: [.052, .052, .035], face: [.8, .37] }],
    [.95, { head: [.009, .027, .014], face: [.55, .24] }],
  ] },
  { id: "096", name: "Shade the lights", duration: 3.6, keys: [
    [.16, { ...shade, rightHand: [-1.54, -.06, .6], head: [-.061, -.09, .034], face: [.14, .36] }],
    [.33, { ...shade, sway: -.019, rise: -.02, torso: [-.047, -.05, .03], head: [-.17, -.09, .063], face: [-.04, .63] }],
    [.49, { ...shade, rightHand: [-1.24, .57, .5], sway: -.023, rise: -.022,
      torso: [-.031, .031, .027], head: [-.14, .19, .039], face: [.09, .66] }],
    [.66, { ...shade, rightHand: [-1.45, .43, .48], head: [-.055, .1, -.021], face: [.49, .46] }],
    [.84, { rightHand: [-1.51, -.34, .57], head: [.043, .054, .02], face: [.55, .29] }],
  ] },
  { id: "097", name: "Palm stretch", duration: 3.6, keys: [
    [.17, { ...palmStretch, leftHand: [.91, -.42, .66], rightHand: [-.94, -.38, .6], head: [.08, .079, -.04], face: [.17, .31] }],
    [.34, { ...palmStretch, rise: -.022, sway: .022, torso: [.056, .039, -.041], head: [.123, .082, -.05], face: [.07, .45] }],
    [.49, { ...palmStretch, leftHand: [.48, -.23, .81], rightHand: [-.24, -.042, .86],
      leftPalm: [[-.31, .95, -.012], [.05, .02, 1]], rise: -.028, sway: .028,
      torso: [.062, .044, -.047], head: [.15, .071, -.046], face: [-.04, .5] }],
    [.65, { ...palmStretch, leftHand: [.53, -.25, .77], rightHand: [-.44, -.23, .8],
      rise: -.018, sway: .015, head: [.031, .058, -.03], face: [.56, .4] }],
    [.82, { leftHand: [1.03, -.44, .61], rightHand: [-1.03, -.44, .58], head: [-.023, .07, .021], face: [.61, .27] }],
  ] },
  { id: "098", name: "Rain check", duration: 3.4, keys: [
    [.17, { ...rainPalm, rightHand: [-1.46, -.38, .59], head: [.093, -.15, .058], face: [.23, .32] }],
    [.33, { ...rainPalm, sway: -.023, rise: -.019, torso: [.046, -.065, .031], head: [.139, -.18, .06], face: [.19, .48] }],
    [.51, { ...rainPalm, rightHand: [-1.31, -.2, .8], torso: [-.042, -.08, .02], sway: -.021,
      head: [-.21, -.105, .051], face: [.34, .65] }],
    [.63, { ...rainPalm, rightHand: [-1.48, -.36, .73], rightPalm: [[-.49, -.36, .79], [-.13, .94, .35]],
      head: [.043, -.04, .074], face: [.63, .49] }],
    [.71, { ...rainPalm, rightHand: [-1.39, -.28, .75], rightPalm: [[-.22, .17, .95], [0, .95, -.14]],
      head: [.083, .04, .067], face: [.69, .39] }],
    [.86, { rightHand: [-1.46, -.46, .58], head: [.026, .07, .029], face: [.54, .23] }],
  ] },
  { id: "099", name: "Keys check", duration: 3.25, keys: [
    [.17, { ...pocketTap, rightHand: [-1.62, -.61, .58], torso: [.059, -.035, .028], head: [.13, -.14, .048], face: [.06, .34] }],
    [.32, { ...pocketTap, sway: -.024, rise: -.026, torso: [.079, -.07, .045], head: [.192, -.16, .063], face: [-.09, .5] }],
    [.41, { ...pocketTap, rightHand: [-1.33, -.49, .55], sway: -.026, rise: -.024,
      torso: [.064, -.06, .04], head: [.136, -.16, .062], face: [.14, .49] }],
    [.49, { ...pocketTap, rightHand: [-1.27, -.57, .47], sway: -.023, rise: -.027, head: [.193, -.148, .055], face: [.25, .47] }],
    [.64, { ...pocketTap, rightHand: [-1.45, -.46, .56], head: [-.045, .047, .043], face: [.75, .47] }],
    [.78, { rightHand: [-1.58, -.6, .6], head: [.139, .038, .028], rise: -.019, face: [.81, .42] }],
    [.89, { head: [.019, .04, .012], face: [.57, .24] }],
  ] },
  { id: "100", name: "That's a wrap", duration: 3.55, keys: [
    [.16, { leftHand: [1.14, -.28, .57], rightHand: [-1.12, -.29, .59], head: [.046, -.055, -.038], face: [.39, .34] }],
    [.33, { ...wrapCross, sway: -.027, rise: -.026, torso: [.054, -.052, .031], head: [.09, -.025, .059], face: [.81, .58] }],
    [.46, { ...wrapCross, leftHand: [-.42, -.095, .66], rightHand: [.44, -.005, .81],
      sway: -.026, rise: -.025, head: [-.042, .043, .047], face: [.96, .56] }],
    [.64, { leftHand: [1.79, -.29, .62], rightHand: [-1.81, -.32, .62],
      leftPalm: [[.79, .06, .62], [-.14, 1, .1]], rightPalm: [[-.79, .06, .62], [.14, 1, .1]],
      fingers: ["open", "open"], sway: .016, rise: -.024, torso: [-.043, .041, -.021], head: [.133, .041, -.033], face: [.96, .51] }],
    [.82, { leftHand: [1.44, -.49, .52], rightHand: [-1.47, -.49, .53], head: [.013, .055, .022], face: [.68, .31] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["092", "093", "094", "096", "098", "099"];

export function availableAfterHoursEmotes(bag: boolean) {
  return bag ? AFTER_HOURS_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : AFTER_HOURS_EMOTES;
}
