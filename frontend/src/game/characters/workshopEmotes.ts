import type { Emote } from "./garageEmotes";

const point = {
  rightHand: [-1.18, -.24, .66], rightPalm: [[-.28, -.42, .86], [.93, -.05, .27]],
  fingers: [null, "point"],
} as const;
const present = {
  rightHand: [-1.57, -.34, .69], rightPalm: [[-.48, .18, .86], [0, .98, -.2]],
  fingers: [null, "open"],
} as const;
const chin = {
  rightHand: [-.63, .075, .43], rightPalm: [[.68, .55, -.48], [.32, -.78, -.53]],
  fingers: [null, "cup"],
} as const;
const frame = {
  leftHand: [.9, .06, .66], rightHand: [-.93, .09, .68],
  leftPalm: [[-.26, .9, .34], [-.92, -.18, -.26]], rightPalm: [[.24, .9, .36], [.92, -.18, -.26]],
  fingers: ["frame", "frame"],
} as const;
const retreat = [-.035, 0, -.165, -.13] as const;
const aside = [.153, 0, -.031, .19] as const;
const nearWheel = [-.06, 0, .126, -.26] as const;
const clothLow = { offset: [-.094, -.315, .365], angles: [.15, -.17, .045] } as const;
const gaugeLow = { offset: [-.11, -.297, .338], angles: [-.1, -.07, .03] } as const;

const WORKSHOP_EMOTES = [
  { id: "161", name: "Fender check", duration: 4.25, keys: [
    [.17, { turn: -.17, sway: .018, rise: -.014, feet: { r: [-.019, .023, .048, -.15] },
      torso: [.07, -.095, .031], head: [.103, -.28, .048], face: [.06, .35] }],
    [.34, { ...point, turn: -.31, sway: -.026, travel: .047, rise: -.032, feet: { r: nearWheel },
      torso: [.16, -.155, .065], head: [.174, -.235, .07], face: [-.11, .51] }],
    [.52, { ...point, rightHand: [-1.7, -.27, .72], turn: -.27, sway: -.04, travel: .058, feet: { r: nearWheel },
      torso: [.119, -.108, .047], head: [.138, -.115, .051], face: [.12, .45] }],
    [.67, { ...present, turn: -.17, sway: -.023, travel: .028, feet: { r: nearWheel },
      torso: [.047, -.035, .021], head: [-.075, .062, .043], face: [.56, .46] }],
    [.82, { sway: .019, feet: { r: [-.025, .029, .046, -.11] }, head: [.045, .039, .02], face: [.61, .26] }],
  ] },
  { id: "162", name: "Check the hood line", duration: 4.1, keys: [
    [.18, { ...present, rightHand: [-1.01, -.39, .62], turn: .13, torso: [.07, .087, -.04], head: [.142, .24, -.062], face: [.18, .42] }],
    [.35, { ...present, rightHand: [-1.77, -.3, .62], turn: .21, sway: .035, rise: -.04,
      torso: [.144, .134, -.065], head: [.245, .217, -.078], face: [.04, .5] }],
    [.53, { ...present, rightHand: [-.69, -.28, .77], turn: .13, sway: .013, rise: -.035,
      torso: [.13, .046, -.02], head: [.203, -.14, .04], face: [.34, .48] }],
    [.7, { ...present, rightHand: [-.91, -.37, .63], torso: [.025, -.013, .019], head: [.104, -.1, .03], face: [.57, .41] }],
    [.85, { head: [-.02, -.026, .022], face: [.46, .26] }],
  ] },
  { id: "163", name: "Polishing pass", duration: 4.25, prop: "cloth", keys: [
    [.16, { prop: { ...clothLow, show: 0 }, head: [.121, -.129, .041], face: [.18, .35] }],
    [.3, { prop: clothLow, sway: -.027, travel: .026, torso: [.107, -.069, .028], head: [.224, -.144, .048], face: [.27, .46] }],
    [.42, { prop: { offset: [-.174, -.27, .344], angles: [.09, -.32, .09] }, sway: -.04, travel: .04,
      torso: [.138, -.113, .048], head: [.194, -.24, .06], face: [.4, .45] }],
    [.54, { prop: { offset: [-.012, -.28, .382], angles: [.08, .175, -.029] }, sway: -.005, travel: .043,
      torso: [.149, .076, -.022], head: [.18, .1, -.039], face: [.53, .5] }],
    [.64, { prop: { offset: [-.144, -.301, .35], angles: [.095, -.16, .04] }, sway: -.029,
      torso: [.114, -.052, .027], head: [.153, -.121, .04], face: [.64, .47] }],
    [.76, { prop: { ...clothLow, angles: [-.18, -.01, .012] }, head: [-.061, .058, -.021], torso: [.026, .03, -.017], face: [.79, .43] }],
    [.89, { prop: { ...clothLow, show: 0 }, head: [.041, .033, .017], face: [.55, .24] }],
  ] },
  { id: "164", name: "Read the tire gauge", duration: 4.45, prop: "gauge", keys: [
    [.16, { prop: { ...gaugeLow, show: 0 }, sway: .022, feet: { r: [-.027, .029, .056, -.13] }, head: [.148, -.19, .053], face: [.14, .42] }],
    [.31, { prop: gaugeLow, sway: -.034, rise: -.075, travel: .052, feet: { r: nearWheel },
      torso: [.192, -.136, .051], head: [.238, -.156, .049], face: [.1, .53] }],
    [.46, { prop: { offset: [-.14, -.285, .363], angles: [-.07, -.15, .04] }, sway: -.044, rise: -.111, travel: .075, feet: { r: nearWheel },
      torso: [.277, -.135, .07], head: [.242, -.143, .043], face: [-.05, .5] }],
    [.62, { prop: { offset: [-.112, -.181, .345], angles: [-.22, .027, .061] }, sway: -.039, rise: -.062, travel: .051,
      feet: { r: nearWheel }, torso: [.1, -.069, .033], head: [.265, -.093, .052], face: [.52, .46] }],
    [.77, { prop: gaugeLow, sway: .016, rise: -.027, feet: { r: [-.026, .03, .056, -.11] },
      head: [-.07, .054, .019], face: [.72, .36] }],
    [.89, { prop: { ...gaugeLow, show: 0 }, head: [.026, .037, .016], face: [.55, .26] }],
  ] },
  { id: "165", name: "Engine bay study", duration: 4.3, keys: [
    [.18, { turn: .14, sway: -.021, feet: { l: [.024, .032, .058, .14] }, torso: [.091, .115, -.035], head: [.153, .236, -.052], face: [.09, .39] }],
    [.37, { ...point, rightHand: [-.74, -.33, .69], turn: .24, sway: .031, rise: -.055, travel: .052,
      feet: { l: [.047, 0, .109, .24] }, torso: [.27, .14, -.043], head: [.25, .087, -.068], face: [-.1, .61] }],
    [.53, { ...chin, turn: .21, sway: .024, rise: -.049, travel: .054,
      feet: { l: [.047, 0, .109, .24] }, torso: [.205, .105, -.035], head: [.211, -.136, .064], face: [.23, .54] }],
    [.69, { ...chin, rightHand: [-.65, -.06, .55], turn: .11, sway: .014, rise: -.033, feet: { l: [.047, 0, .109, .24] },
      torso: [.077, .061, -.027], head: [-.05, .065, -.03], face: [.64, .48] }],
    [.84, { sway: -.021, feet: { l: [.022, .026, .044, .11] }, head: [.041, .032, -.022], face: [.55, .29] }],
  ] },
  { id: "166", name: "Make room at the door", duration: 4.2, keys: [
    [.16, { sway: -.029, rise: -.017, feet: { l: [.065, .033, -.01, .08] }, head: [.074, -.24, -.037], torso: [.052, -.098, .024] }],
    [.32, { ...present, sway: .079, turn: -.17, rise: -.033, feet: { l: aside },
      head: [.12, -.29, .053], torso: [.131, -.113, -.059], face: [.58, .45] }],
    [.49, { ...present, rightHand: [-1.88, -.22, .61], sway: .091, turn: -.24, rise: -.025, feet: { l: aside },
      head: [-.084, .13, -.047], torso: [.043, -.075, -.05], face: [.91, .52] }],
    [.66, { ...present, rightHand: [-1.43, -.27, .65], sway: .057, turn: -.14, feet: { l: aside },
      head: [.106, .072, -.04], torso: [.063, -.034, -.023], face: [.84, .43] }],
    [.81, { sway: -.017, feet: { l: [.063, .026, -.01, .083] }, head: [.047, .034, -.016], face: [.6, .28] }],
  ] },
  { id: "167", name: "Mirror angle check", duration: 3.95, keys: [
    [.17, { ...frame, leftHand: [1.35, -.29, .52], rightHand: [-1.33, -.28, .53], head: [.104, -.069, .035], face: [.15, .41] }],
    [.34, { ...frame, sway: -.029, rise: -.025, torso: [.055, -.082, .044], head: [.034, -.197, .086], face: [.08, .52] }],
    [.5, { ...frame, leftHand: [.81, .12, .63], rightHand: [-1.01, .01, .71], sway: .025,
      torso: [.043, .076, -.049], head: [.033, .189, -.09], face: [.44, .51] }],
    [.67, { ...frame, leftHand: [1.1, -.06, .63], rightHand: [-1.19, -.06, .65],
      head: [.13, .033, -.028], torso: [.06, .023, -.019], face: [.76, .45] }],
    [.84, { head: [-.032, .044, -.016], face: [.59, .26] }],
  ] },
  { id: "168", name: "Cabin glance", duration: 4.15, keys: [
    [.18, { turn: -.18, sway: .021, feet: { r: [-.024, .027, .052, -.13] },
      torso: [.08, -.097, .044], head: [.109, -.26, .04], face: [.12, .47] }],
    [.34, { turn: -.34, sway: -.043, rise: -.048, travel: .061, feet: { r: nearWheel },
      leftHand: [1.55, -.76, .33], rightHand: [-1.49, -.69, .48], torso: [.278, -.115, .072], head: [.228, -.28, .078], face: [.29, .57] }],
    [.52, { turn: -.31, sway: -.035, rise: -.043, travel: .069, feet: { r: nearWheel },
      leftHand: [1.54, -.74, .33], rightHand: [-1.53, -.66, .49], torso: [.251, -.059, .055], head: [.18, .17, .061], face: [.65, .53] }],
    [.68, { turn: -.18, sway: -.019, rise: -.031, travel: .038, feet: { r: nearWheel },
      torso: [.083, -.041, .033], head: [-.06, .175, .037], face: [.75, .44] }],
    [.83, { sway: .02, feet: { r: [-.023, .026, .046, -.105] }, head: [.067, .067, .025], face: [.59, .26] }],
  ] },
  { id: "169", name: "Cargo fit check", duration: 4.1, keys: [
    [.17, { turn: .125, sway: -.017, torso: [.071, .075, -.034], head: [.136, .208, -.053], face: [.19, .42] }],
    [.35, { leftHand: [1.57, -.26, .68], rightHand: [-1.59, -.28, .68], turn: .18, rise: -.037,
      torso: [.137, .064, -.026], head: [.189, .064, -.038], face: [.2, .55] }],
    [.52, { leftHand: [2.12, -.26, .65], rightHand: [-2.04, -.27, .67], turn: .085, rise: -.032,
      torso: [.118, -.037, .025], head: [.164, -.13, .04], face: [.49, .54] }],
    [.68, { leftHand: [1.65, -.43, .61], rightHand: [-1.64, -.42, .61],
      torso: [.045, .022, -.024], head: [.074, .109, -.041], face: [.77, .48] }],
    [.83, { head: [-.028, .055, -.022], face: [.58, .27] }],
  ] },
  { id: "170", name: "Pit stop reset", duration: 4.25, keys: [
    [.16, { sway: .023, rise: -.018, feet: { r: [-.017, .028, -.064, -.07] },
      torso: [.08, -.04, .028], head: [.123, -.104, .024], face: [.17, .35] }],
    [.33, { sway: -.035, travel: -.091, rise: -.039, feet: { r: retreat },
      leftHand: [1.53, -.59, .47], rightHand: [-1.54, -.57, .47], torso: [.139, -.076, .044], head: [.2, -.1, .047], face: [.13, .45] }],
    [.51, { sway: -.038, travel: -.103, rise: -.022, feet: { r: retreat },
      torso: [-.116, -.042, .027], head: [-.115, .032, .031], face: [.43, .33], blink: .55 }],
    [.66, { sway: -.024, travel: -.062, rise: -.019, feet: { r: retreat },
      torso: [-.025, .038, -.02], head: [.067, .07, -.027], face: [.73, .35] }],
    [.8, { sway: .023, travel: -.029, feet: { r: [-.014, .024, -.063, -.059] }, head: [.015, .027, -.013], face: [.6, .26] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["161", "162", "163", "164", "165", "166", "168", "170"];

export function availableWorkshopEmotes(bag: boolean) {
  return bag ? WORKSHOP_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : WORKSHOP_EMOTES;
}
