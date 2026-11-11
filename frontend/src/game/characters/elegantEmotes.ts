import type { Emote } from "./garageEmotes";

const invitation = {
  rightHand: [-1.12, -.25, .76], rightPalm: [[-.45, .13, .88], [.04, 1, -.12]],
  fingers: [null, "open"],
} as const;
const waiting = {
  leftHand: [.23, -.51, .62], rightHand: [-.09, -.46, .65],
  leftPalm: [[-.54, -.27, .8], [.12, .93, .38]], rightPalm: [[.65, -.34, .68], [.03, -.91, -.39]],
  fingers: ["cup", "cup"],
} as const;
const clap = {
  leftHand: [.065, -.22, .68], rightHand: [-.065, -.21, .68],
  leftPalm: [[0, .68, .73], [-1, 0, 0]], rightPalm: [[0, .68, .73], [1, 0, 0]],
  fingers: ["open", "open"],
} as const;
const openClap = { ...clap, leftHand: [.42, -.24, .67], rightHand: [-.5, -.24, .67] } as const;
const handToChest = {
  rightHand: [-.43, -.1, .45], rightPalm: [[.79, .46, -.4], [-.36, -.15, -.92]], fingers: [null, "open"],
} as const;
const curtsyFoot = [-.013, 0, -.17, -.18] as const;
const courtesyFoot = [.17, 0, -.025, .15] as const;
const stepFoot = [-.13, 0, .085, -.2] as const;
const farewell = {
  rightHand: [-1.47, .15, .51], rightPalm: [[.04, 1, .1], [0, -.1, 1]], fingers: [null, "open"],
} as const;

const ELEGANT_EMOTES = [
  { id: "113", name: "Gracious presentation", duration: 3.55, keys: [
    [.19, { ...invitation, rightHand: [-.82, -.41, .62], head: [.08, .1, -.035], torso: [.065, .05, -.03] }],
    [.37, { ...invitation, rightHand: [-1.34, -.23, .73], turn: -.1, head: [.02, -.18, .03], face: [.54, .32] }],
    [.58, { ...invitation, rightHand: [-2.3, -.29, .5], turn: -.17, sway: -.04, rise: -.023,
      torso: [.02, -.1, .05], head: [-.04, -.34, .057], face: [.78, .36] }],
    [.76, { ...invitation, rightHand: [-1.83, -.4, .56], turn: -.09, torso: [.046, -.03, .017],
      head: [.06, .02, .032], face: [.76, .26] }],
  ] },
  { id: "114", name: "Poised waiting", duration: 3.6, keys: [
    [.23, { ...waiting, torso: [.026, -.04, .025], head: [.08, -.19, .045], sway: -.025, rise: -.015, face: [.33, .22] }],
    [.43, { ...waiting, rightHand: [-.12, -.45, .67], torso: [-.026, .02, -.026], head: [-.037, -.08, -.037],
      sway: .022, rise: -.022, face: [.53, .3] }],
    [.63, { ...waiting, leftHand: [.28, -.52, .63], torso: [.041, .06, -.019], head: [.033, .24, -.058],
      sway: .035, rise: -.027, face: [.42, .39] }],
    [.79, { rightHand: [-.76, -.5, .62], leftHand: [.83, -.5, .59], head: [-.02, .11, -.01], face: [.52, .24] }],
  ] },
  { id: "115", name: "Delicate applause", duration: 2.95, keys: [
    [.20, { ...openClap, head: [.02, -.04, -.04], face: [.54, .33] }],
    [.31, { ...clap, torso: [.033, -.02, .016], head: [.086, -.03, -.04], rise: -.018, face: [.7, .32] }],
    [.40, { ...openClap, torso: [.011, 0, .02], head: [.042, .01, -.046], face: [.73, .35] }],
    [.49, { ...clap, rightHand: [-.065, -.23, .68], torso: [.023, .03, -.018], head: [.012, .05, -.063], face: [.82, .42] }],
    [.57, { ...openClap, head: [-.02, .075, -.05], face: [.75, .37] }],
    [.66, { ...clap, torso: [.028, .045, -.026], head: [.073, .075, -.05], face: [.81, .3] }],
    [.81, { ...openClap, leftHand: [.78, -.41, .58], rightHand: [-.82, -.42, .58], head: [.038, .04, -.012], face: [.58, .21] }],
  ] },
  { id: "116", name: "Pardon me", duration: 3.45, keys: [
    [.17, { ...handToChest, sway: -.03, rise: -.02, head: [.09, .15, -.06], torso: [.075, .08, .027], face: [.3, .5] }],
    [.3, { ...handToChest, sway: -.017, rise: -.024, feet: { l: [.08, .04, -.013, .1] },
      head: [.13, .21, -.07], torso: [.101, .09, .027], face: [.54, .4] }],
    [.44, { ...handToChest, sway: .097, rise: -.038, feet: { l: courtesyFoot }, turn: .12,
      torso: [.12, .105, -.05], head: [.105, .07, -.054], face: [.65, .31] }],
    [.61, { ...handToChest, sway: .075, rise: -.029, feet: { l: courtesyFoot }, turn: .08,
      torso: [.055, .054, -.036], head: [-.031, .015, -.03], face: [.74, .29] }],
    [.78, { sway: -.021, rise: -.026, feet: { l: [.073, .031, -.014, .07] },
      head: [.047, -.035, .012], face: [.64, .26] }],
  ] },
  { id: "117", name: "Offer the floor", duration: 3.2, keys: [
    [.21, { ...invitation, rightHand: [-.66, -.17, .57], sway: -.026, head: [-.056, -.16, .054], face: [.41, .37] }],
    [.4, { ...invitation, rightHand: [-1.1, -.14, .84], torso: [.074, -.09, .036], head: [.094, -.22, .066],
      rise: -.023, travel: .023, face: [.7, .5] }],
    [.58, { ...invitation, rightHand: [-1.5, -.2, .77], torso: [.03, -.06, .02], head: [-.024, -.17, .046],
      sway: -.031, face: [.79, .37] }],
    [.78, { ...invitation, rightHand: [-1.56, -.41, .54], head: [.063, -.04, .027], face: [.57, .27] }],
  ] },
  { id: "118", name: "Measured curtsy", duration: 3.8, keys: [
    [.16, { sway: .032, rise: -.018, leftHand: [1.7, -.63, .46], rightHand: [-1.66, -.62, .46], head: [.018, -.09, .037] }],
    [.29, { sway: .028, rise: -.033, feet: { r: [-.022, .036, -.087, -.09] },
      leftHand: [1.8, -.59, .48], rightHand: [-1.8, -.61, .49], torso: [.062, -.035, .016] }],
    [.44, { sway: .02, rise: -.11, travel: -.036, feet: { r: curtsyFoot }, leftHand: [1.89, -.6, .48], rightHand: [-1.79, -.61, .52],
      torso: [.102, -.06, .04], head: [.15, -.058, .039], face: [.66, .3] }],
    [.58, { sway: .024, rise: -.071, travel: -.023, feet: { r: curtsyFoot }, leftHand: [1.81, -.56, .47], rightHand: [-1.72, -.58, .54],
      torso: [.071, -.019, .016], head: [.064, .065, .033], face: [.78, .39] }],
    [.75, { sway: .031, rise: -.022, feet: { r: [-.017, .028, -.065, -.07] }, head: [-.045, .063, .019], face: [.64, .25] }],
  ] },
  { id: "119", name: "Accept the praise", duration: 3.35, keys: [
    [.19, { ...handToChest, head: [-.079, .1, -.067], torso: [-.035, .045, -.026], face: [.38, .62] }],
    [.37, { ...handToChest, head: [.21, -.036, .043], torso: [.148, .045, -.019], sway: -.018, rise: -.034, face: [.78, .31] }],
    [.54, { ...invitation, rightHand: [-.92, -.22, .72], head: [.076, -.09, .047], torso: [.089, -.031, .031], face: [.94, .36] }],
    [.72, { ...invitation, rightHand: [-1.35, -.29, .64], head: [-.036, .036, .038], torso: [.025, .02, .025], face: [.85, .31] }],
    [.85, { head: [.057, .026, .017], face: [.67, .25] }],
  ] },
  { id: "120", name: "Formal farewell", duration: 3.85, keys: [
    [.16, { turn: -.09, sway: .024, rise: -.018, head: [.027, -.2, .04] }],
    [.29, { turn: -.22, sway: -.018, rise: -.026, feet: { r: [-.068, .034, .047, -.18] }, head: [.057, -.08, .08] }],
    [.43, { ...farewell, turn: -.28, sway: -.067, rise: -.034, feet: { r: stepFoot },
      torso: [.03, .095, .045], head: [-.032, .25, .064], wrist: -.18, face: [.78, .42] }],
    [.56, { ...farewell, turn: -.28, sway: -.063, rise: -.03, feet: { r: stepFoot },
      torso: [.02, .115, .044], head: [.045, .27, .06], wrist: .21, face: [.88, .37] }],
    [.66, { ...farewell, rightHand: [-1.5, .07, .52], turn: -.18, sway: -.033, rise: -.026, feet: { r: stepFoot },
      head: [.071, .15, .05], wrist: -.11, face: [.76, .29] }],
    [.81, { sway: .02, rise: -.022, feet: { r: [-.053, .032, .035, -.08] }, head: [.021, .055, .015], face: [.57, .22] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["113", "116", "117", "119", "120"];

export function availableElegantEmotes(bag: boolean) {
  return bag ? ELEGANT_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : ELEGANT_EMOTES;
}
