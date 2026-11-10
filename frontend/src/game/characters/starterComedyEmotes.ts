import type { Emote } from "./garageEmotes";
import { flagRest } from "./starterEmotes";

const checkFlag = { offset: [-.127, -.158, .347], angles: [.15, -.25, .58], fold: 1.42 } as const;
const windFlag = { offset: [-.224, -.048, .307], angles: [.115, -.22, .28], fold: .43 } as const;
const braceFoot = [-.088, 0, .079, -.19] as const;
const notice = {
  rightHand: [-1.39, .22, .53], rightPalm: [[-.04, .98, .2], [.075, -.19, .98]], fingers: [null, "open"],
} as const;
const counting = {
  rightHand: [-1.26, .06, .57], rightPalm: [[.09, .88, .47], [.79, -.28, .53]],
} as const;
const chest = {
  rightHand: [-.45, -.125, .474], rightPalm: [[.87, .35, -.21], [.12, -.4, -.9]], fingers: [null, "open"],
} as const;
const bonnet = {
  rightHand: [-1.25, .54, .319], rightPalm: [[.84, .47, -.31], [.16, -.36, -.92]], fingers: [null, "cup"],
} as const;

export const STARTER_COMEDY_EMOTES = [
  { id: "181", name: "Slipped flag", duration: 4.45, prop: "flag", keys: [
    [.14, { prop: { ...flagRest, show: 0 }, head: [.062, -.09, .04], face: [.24, .37] }],
    [.28, { prop: { ...windFlag, offset: [-.214, -.09, .3] }, torso: [-.044, -.065, .032], head: [-.055, -.09, .05], face: [.59, .41] }],
    [.36, { prop: { offset: [-.248, -.27, .322], angles: [.04, -.28, .76], fold: .85, ripple: .8, grip: false },
      ...notice, rightHand: [-1.62, -.17, .56], head: [.184, -.152, .044], torso: [.109, -.085, .05], face: [-.18, .78] }],
    [.47, { prop: { offset: [-.252, -.352, .342], angles: [.072, -.21, .91], fold: .92, ripple: -.78 },
      sway: -.04, rise: -.063, torso: [.203, -.09, .072], head: [.263, -.124, .07], face: [.16, .58] }],
    [.61, { prop: { ...flagRest, angles: [.08, -.14, .39], ripple: .6 }, sway: -.025, rise: -.029,
      torso: [.092, -.03, .03], head: [.179, .105, .061], face: [.74, .58] }],
    [.76, { prop: flagRest, torso: [.029, .026, -.02], head: [-.046, .089, -.037], face: [.85, .41] }],
    [.9, { prop: { ...flagRest, show: 0 }, face: [.61, .28] }],
  ] },
  { id: "182", name: "Tangled flag", duration: 4.65, prop: "flag", keys: [
    [.15, { prop: { ...flagRest, show: 0 }, head: [.053, -.067, .041], face: [.25, .3] }],
    [.29, { prop: { ...checkFlag, fold: 1.59 }, head: [.183, -.185, .129], torso: [.084, -.072, .051], face: [-.13, .52] }],
    [.42, { prop: { ...checkFlag, angles: [.16, -.044, .45], fold: 1.31, ripple: -.71 }, torso: [.081, .035, -.032],
      head: [.126, .093, -.102], sway: .025, face: [-.08, .68] }],
    [.55, { prop: { ...checkFlag, angles: [.124, -.364, .38], fold: .73, ripple: .83 }, torso: [.071, -.078, .039],
      head: [.104, -.115, .068], sway: -.027, face: [.37, .56] }],
    [.68, { prop: { ...windFlag, fold: .18, ripple: -.55 }, torso: [-.042, -.035, .026], head: [-.09, .055, -.03], face: [.92, .53] }],
    [.8, { prop: flagRest, torso: [.039, .025, -.015], head: [.077, .049, -.021], face: [.87, .38] }],
    [.91, { prop: { ...flagRest, show: 0 }, face: [.58, .26] }],
  ] },
  { id: "183", name: "Windy flag struggle", duration: 4.55, prop: "flag", keys: [
    [.15, { prop: { ...flagRest, show: 0 }, head: [.054, -.08, .033], face: [.3, .34] }],
    [.29, { prop: windFlag, torso: [-.048, -.062, .028], head: [-.096, -.124, .056], sway: .023, face: [.46, .51] }],
    [.39, { prop: { offset: [-.262, -.037, .275], angles: [.28, -.17, .77], fold: 1.47, ripple: -.99 },
      feet: { r: [-.054, .039, .049, -.1] }, sway: -.026, rise: -.04, torso: [.14, -.084, .089],
      head: [.115, -.216, .076], face: [-.23, .79] }],
    [.51, { prop: { offset: [-.191, -.069, .297], angles: [.12, -.12, .52], fold: .9, ripple: 1 },
      feet: { r: braceFoot }, sway: -.061, rise: -.056, travel: .039, torso: [.154, -.067, .083],
      head: [.162, -.124, .062], face: [.08, .63] }],
    [.65, { prop: { ...windFlag, ripple: -.64 }, feet: { r: braceFoot }, sway: -.038, rise: -.035,
      torso: [-.039, -.053, .043], head: [-.075, -.086, .052], face: [.62, .59] }],
    [.8, { prop: flagRest, feet: { r: [-.046, .033, .04, -.091] }, sway: .019,
      torso: [.043, .034, -.029], head: [.087, .103, -.043], face: [.81, .44] }],
    [.91, { prop: { ...flagRest, show: 0 }, face: [.57, .25] }],
  ] },
  { id: "184", name: "Distracted by the car", duration: 4.65, keys: [
    [.17, { turn: -.12, sway: .026, rise: -.02, feet: { r: [-.022, .031, .042, -.12] },
      torso: [.101, -.099, .032], head: [.176, -.235, .065], face: [.27, .45] }],
    [.34, { turn: -.28, sway: -.042, rise: -.06, travel: .065, feet: { r: braceFoot },
      torso: [.279, -.152, .075], head: [.239, -.225, .103], rightHand: [-1.62, -.63, .481], face: [.63, .56] }],
    [.49, { turn: -.3, sway: -.045, rise: -.059, travel: .057, feet: { r: braceFoot },
      torso: [.262, -.12, .071], head: [.196, -.11, .078], face: [.79, .62] }],
    [.58, { ...notice, rightHand: [-1.41, -.04, .56], turn: -.15, sway: -.034, rise: -.022, feet: { r: braceFoot },
      torso: [-.075, -.04, .056], head: [-.12, .209, .07], face: [.33, .81] }],
    [.71, { ...notice, sway: .025, rise: -.017, feet: { r: [-.042, .036, .034, -.085] },
      torso: [.044, .045, -.034], head: [.131, .093, -.054], face: [.85, .57] }],
    [.87, { torso: [.037, .016, -.014], head: [.044, .024, -.022], face: [.68, .32] }],
  ] },
  { id: "185", name: "Lost count", duration: 4.6, keys: [
    [.16, { ...counting, rightHand: [-1.28, -.21, .562], fingers: [null, "three"], head: [.05, -.09, .04], face: [.43, .4] }],
    [.3, { ...counting, fingers: [null, "three"], torso: [-.039, -.037, .023], head: [-.064, -.052, .044], face: [.62, .46] }],
    [.44, { ...counting, fingers: [null, "peace"], rightHand: [-1.18, -.006, .59], torso: [.085, -.044, .033],
      head: [.217, -.14, .132], sway: -.023, face: [-.12, .63] }],
    [.58, { ...counting, fingers: [null, "point"], rightHand: [-1.08, -.059, .579], torso: [.082, -.04, .038],
      head: [.187, -.112, .082], face: [.12, .54] }],
    [.69, { ...counting, fingers: [null, "three"], rightHand: [-1.41, .16, .544], torso: [-.047, -.026, .019],
      head: [-.088, .034, .043], face: [.91, .62] }],
    [.86, { rightHand: [-1.44, -.42, .48], torso: [.036, .021, -.017], head: [.087, .041, -.033], face: [.75, .34] }],
  ] },
  { id: "186", name: "Wrong direction wave", duration: 4.45, keys: [
    [.16, { turn: .13, sway: -.017, rise: -.02, torso: [.045, .115, -.032], head: [.064, .239, -.053], face: [.32, .46] }],
    [.31, { ...notice, turn: .31, sway: .041, rise: -.022, wrist: -.22, torso: [.017, .17, -.067],
      head: [-.064, .325, -.079], face: [.87, .53] }],
    [.43, { ...notice, turn: .24, sway: .018, wrist: .22, torso: [.06, .07, -.019], head: [.128, -.178, .081], face: [.2, .8] }],
    [.57, { ...notice, rightHand: [-1.31, -.02, .59], turn: -.22, sway: -.035, rise: -.035,
      torso: [.12, -.14, .056], head: [.095, -.355, .063], face: [.48, .62] }],
    [.7, { ...notice, turn: -.19, sway: -.034, wrist: .19, torso: [-.029, -.097, .045],
      head: [-.038, -.247, .051], face: [.91, .57] }],
    [.86, { rightHand: [-1.43, -.43, .49], turn: -.07, head: [.075, -.033, .016], face: [.74, .33] }],
  ] },
  { id: "187", name: "Hiccup interruption", duration: 3.6, keys: [
    [.18, { ...chest, torso: [.045, -.02, .019], head: [.081, -.059, .032], face: [.22, .33] }],
    [.36, { ...chest, torso: [-.053, -.015, .018], head: [-.052, -.018, .022], rise: -.008, face: [.3, .43] }],
    [.415, { ...chest, rightHand: [-.5, -.1, .48], torso: [-.132, -.036, .043], head: [-.175, -.051, .067],
      rise: .015, blink: .84, face: [-.25, .67] }],
    [.5, { ...chest, torso: [.116, .031, -.04], head: [.179, .069, -.05], sway: .026, rise: -.039, face: [-.11, .61] }],
    [.65, { ...chest, rightHand: [-.51, -.17, .51], torso: [.048, .018, -.017], head: [.071, .101, -.06], face: [.68, .59] }],
    [.84, { head: [.048, .037, -.019], face: [.75, .32] }],
  ] },
  { id: "188", name: "Bonnet adjustment", duration: 3.85, keys: [
    [.16, { rightHand: [-1.51, -.2, .53], torso: [.076, -.035, .034], head: [.123, -.105, .059], face: [.2, .46] }],
    [.32, { ...bonnet, torso: [.05, -.068, .036], head: [.093, -.128, .074], sway: -.02, face: [.34, .49] }],
    [.49, { ...bonnet, rightHand: [-1.41, .505, .35], torso: [.035, -.057, .029], head: [-.06, -.103, .052], sway: -.023, face: [.72, .5] }],
    [.64, { ...bonnet, rightHand: [-1.5, .28, .44], torso: [-.035, .023, -.018], head: [-.034, .097, -.052], face: [.84, .47] }],
    [.82, { rightHand: [-1.41, -.44, .49], head: [.082, .045, -.021], face: [.67, .28] }],
  ] },
  { id: "189", name: "Overdone flourish", duration: 4.65, prop: "flag", keys: [
    [.15, { prop: { ...flagRest, show: 0 }, head: [.073, -.102, .062], face: [.38, .36] }],
    [.29, { prop: { ...windFlag, offset: [-.26, .158, .29], angles: [.07, -.27, .43], ripple: -.9 },
      sway: -.032, turn: -.17, torso: [-.055, -.111, .049], head: [-.108, -.177, .073], face: [.85, .58] }],
    [.42, { prop: { offset: [-.159, .193, .311], angles: [.31, .195, -.64], fold: .74, ripple: .95 },
      sway: .025, turn: .158, rise: -.018, torso: [-.069, .125, -.058], head: [-.045, .219, -.103], face: [.98, .65] }],
    [.54, { prop: { offset: [-.227, -.249, .327], angles: [.38, -.15, 1.34], fold: 1.16, ripple: -.95 },
      sway: -.033, rise: -.049, feet: { r: [-.052, .041, .048, -.1] }, torso: [.171, -.058, .095], head: [.171, -.116, .105], face: [-.08, .79] }],
    [.66, { prop: { ...flagRest, angles: [.14, -.19, .44], ripple: .62 }, sway: -.041, rise: -.041, feet: { r: braceFoot },
      torso: [.078, -.037, .068], head: [.135, .088, .072], face: [.69, .65] }],
    [.79, { prop: flagRest, sway: .018, feet: { r: [-.037, .028, .035, -.079] }, torso: [.046, .026, -.025], head: [.094, .072, -.043], face: [.9, .49] }],
    [.91, { prop: { ...flagRest, show: 0 }, face: [.62, .27] }],
  ] },
  { id: "190", name: "Caught daydreaming", duration: 4.75, keys: [
    [.17, { sway: .025, rise: -.015, torso: [-.058, .072, -.028], head: [-.098, .265, -.094], face: [.41, .35] }],
    [.34, { sway: .049, rise: -.031, torso: [-.078, .124, -.067], head: [-.129, .315, -.16], face: [.58, .31] }],
    [.48, { sway: .031, rise: -.027, torso: [-.046, .096, -.048], head: [-.108, .269, -.132], blink: .61, face: [.67, .29] }],
    [.56, { ...notice, rightHand: [-1.54, -.12, .57], sway: -.024, rise: -.027,
      torso: [.09, -.109, .056], head: [.143, -.317, .072], face: [.13, .82] }],
    [.69, { ...notice, wrist: -.21, sway: -.021, torso: [-.034, -.052, .04], head: [-.036, .072, .046], face: [.87, .58] }],
    [.78, { ...notice, wrist: .18, torso: [.041, .012, -.021], head: [.129, .09, -.03], face: [.93, .47] }],
    [.9, { rightHand: [-1.47, -.44, .51], torso: [.028, .014, -.012], head: [.043, .035, -.018], face: [.67, .27] }],
  ] },
] as const satisfies readonly Emote[];
