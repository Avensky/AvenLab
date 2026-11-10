import type { Emote } from "./garageEmotes";

const rallyPalms = {
  leftPalm: [[.15, .9, .41], [-.13, -.38, 1]], rightPalm: [[-.15, .9, .41], [.13, -.38, 1]],
  fingers: ["open", "open"],
} as const;
const rallyUp = { ...rallyPalms, leftHand: [1.94, .69, .28], rightHand: [-1.94, .69, .28] } as const;
const rallyDown = { ...rallyPalms, leftHand: [2.02, .07, .62], rightHand: [-2.02, .07, .62] } as const;
const greet = {
  rightHand: [-1.83, .34, .51], rightPalm: [[-.33, .91, .25], [.07, -.26, .96]], fingers: [null, "open"],
} as const;
const stageFoot = [-.036, 0, .155, -.16] as const;
const leftBeat = { leftHand: [1.95, -.41, .51], rightHand: [-1.33, -.37, .64], torso: [.05, -.115, -.088] } as const;
const rightBeat = { leftHand: [1.35, -.38, .64], rightHand: [-1.95, -.41, .51], torso: [.05, .115, .088] } as const;
const sideLeft = [.155, 0, .024, .12] as const;
const sideRight = [.13, 0, .016, .02] as const;
const turnArms = { leftHand: [.63, -.25, .58], rightHand: [-.58, -.27, .57], fingers: ["cup", "cup"] } as const;
const quarterTurn = Math.PI / 2;
const heart = {
  left: [[.89, 1.4, .4], [-1.14, 1.27, .6]], right: [[-.89, 1.4, .4], [1.14, 1.27, .6]],
  leftPalm: [[-.9, -.43, .13], [0, 0, 1]], rightPalm: [[.9, -.43, .13], [0, 0, 1]],
  fingers: ["open", "open"], joinIndexTips: true,
} as const;
const listening = {
  leftHand: [1.36, .32, .19], leftPalm: [[-.42, .86, -.29], [-.67, -.56, .43]],
  rightHand: [-1.3, -.12, .84], rightPalm: [[-.25, .39, .89], [.1, .91, -.39]],
  fingers: ["cup", "open"],
} as const;
const cue = {
  rightHand: [-1.34, .56, .52], rightPalm: [[-.19, .96, .19], [.1, -.18, .97]], fingers: [null, "point"],
} as const;
const looseHands = {
  leftHand: [1.79, -.58, .47], rightHand: [-1.79, -.58, .47],
  leftPalm: [[.25, -.79, .56], [-.78, .23, .35]], rightPalm: [[-.25, -.79, .56], [.78, .23, .35]],
  fingers: ["open", "open"],
} as const;

const PERFORMER_EMOTES = [
  { id: "121", name: "Audience rally", duration: 3.65, keys: [
    [.17, { ...rallyDown, head: [.095, -.06, .026], torso: [.079, -.035, .023], rise: -.035, face: [.53, .42] }],
    [.32, { ...rallyUp, head: [-.12, -.12, .031], torso: [-.067, -.045, .038], sway: -.031, rise: .008, face: [.95, .6] }],
    [.46, { ...rallyDown, head: [.085, .065, -.022], torso: [.068, .065, -.024], sway: .022, rise: -.046, face: [.83, .46] }],
    [.6, { ...rallyUp, leftHand: [1.83, .75, .3], head: [-.127, .13, -.049], torso: [-.085, .08, -.038],
      sway: .035, rise: .009, face: [1, .6] }],
    [.76, { ...rallyDown, head: [.01, .04, -.029], torso: [.014, .027, 0], rise: -.022, face: [.85, .36] }],
    [.89, { head: [.036, .013, .006], face: [.63, .25] }],
  ] },
  { id: "122", name: "Take the stage", duration: 3.65, keys: [
    [.17, { sway: .025, travel: .023, rise: -.021, feet: { r: [-.026, .032, .062, -.09, .13] },
      head: [.057, .1, -.055], torso: [.072, .046, -.018], face: [.4, .5] }],
    [.32, { ...greet, sway: -.022, travel: .097, rise: -.035, feet: { r: stageFoot }, head: [-.071, -.21, .037],
      torso: [-.075, -.083, .032], wrist: -.23, face: [.95, .57] }],
    [.47, { ...greet, sway: -.029, travel: .099, rise: -.022, feet: { r: stageFoot }, head: [.042, .12, -.039],
      torso: [.027, .038, .028], wrist: .24, face: [1, .56] }],
    [.61, { ...greet, rightHand: [-1.78, .17, .57], sway: -.027, travel: .075, rise: -.03, feet: { r: stageFoot },
      head: [-.027, .17, -.031], wrist: -.12, face: [.91, .4] }],
    [.78, { sway: .023, travel: .028, rise: -.024, feet: { r: [-.023, .032, .072, -.07, -.08] },
      head: [.069, .03, -.013], face: [.72, .31] }],
  ] },
  { id: "123", name: "Side step rhythm", duration: 4.25, keys: [
    [.10, { ...rightBeat, sway: -.027, rise: -.03, feet: { l: [.063, .027, .011, .04] }, head: [.045, .13, -.053] }],
    [.19, { ...leftBeat, sway: .075, rise: -.046, feet: { l: sideLeft }, head: [.092, .155, -.044], face: [.53, .37] }],
    [.28, { ...leftBeat, sway: .13, rise: -.025, feet: { l: sideLeft, r: [.057, .037, .009, .02] },
      head: [-.05, .073, .042], face: [.82, .54] }],
    [.37, { ...rightBeat, sway: .136, rise: -.041, feet: { l: sideLeft, r: sideRight }, head: [.083, -.08, .061], face: [.84, .38] }],
    [.47, { ...leftBeat, sway: .092, rise: -.027, feet: { l: sideLeft, r: [.056, .034, .009, -.025] },
      head: [-.049, -.118, -.034], face: [.96, .54] }],
    [.56, { ...rightBeat, sway: .033, rise: -.047, feet: { l: sideLeft }, head: [.072, -.157, .055], face: [.91, .4] }],
    [.65, { ...rightBeat, sway: -.025, rise: -.023, feet: { l: [.065, .036, .012, .04] }, head: [-.052, -.069, .024], face: [.92, .48] }],
    [.74, { ...leftBeat, sway: -.012, rise: -.042, head: [.093, .058, -.051], face: [.9, .4] }],
    [.86, { sway: .018, rise: -.017, head: [-.04, .046, .025], face: [.75, .29] }],
  ] },
  { id: "124", name: "Shoulder groove", duration: 3.4, keys: [
    [.17, { ...leftBeat, sway: -.042, rise: -.047, head: [.065, .13, .045], face: [.54, .31] }],
    [.29, { ...rightBeat, sway: .041, rise: -.023, head: [-.052, -.065, -.067], face: [.78, .51] }],
    [.42, { ...leftBeat, sway: -.045, rise: -.05, head: [.082, .15, .06], face: [.87, .45] }],
    [.54, { ...rightBeat, sway: .048, rise: -.022, head: [-.069, -.1, -.074], face: [.92, .47] }],
    [.66, { ...leftBeat, sway: -.042, rise: -.04, head: [.077, .12, .059], face: [.92, .38] }],
    [.81, { sway: .021, rise: -.015, torso: [.027, .03, -.025], head: [-.03, .041, .014], face: [.72, .27] }],
  ] },
  { id: "125", name: "Spin and stop", duration: 3.95, keys: [
    [.14, { ...turnArms, turn: -.16, sway: -.018, rise: -.035, torso: [.072, -.15, .041], head: [.033, .13, .035] }],
    // A low swing step alternates with the shoe pivoting on the floor.
    [.23, { ...turnArms, turn: .49, sway: -.012, rise: -.035, feet: { l: [0, .045, 0, .62], r: [0, 0, 0, .35] },
      head: [-.035, -.38, .023], face: [.57, .45] }],
    [.31, { ...turnArms, turn: quarterTurn, rise: -.032, feet: { l: [0, 0, 0, quarterTurn], r: [0, .04, 0, 1.4] },
      head: [-.055, -.51, -.025], face: [.69, .47] }],
    [.39, { ...turnArms, turn: quarterTurn * 1.55, rise: -.037, feet: { l: [0, 0, 0, 2.1], r: [0, .03, 0, 2.65] },
      torso: [.03, .07, -.039], head: [-.012, .42, .049], face: [.74, .5] }],
    [.47, { ...turnArms, turn: quarterTurn * 2, rise: -.028, feet: { l: [0, .036, 0, 3.17], r: [0, 0, 0, 3.12] },
      head: [.022, .48, .043], face: [.78, .53] }],
    [.55, { ...turnArms, turn: quarterTurn * 2.54, rise: -.033, feet: { l: [0, .03, 0, 4.16], r: [0, 0, 0, 3.64] },
      torso: [.033, .056, .036], head: [-.047, .43, .035], face: [.85, .5] }],
    [.63, { ...turnArms, turn: quarterTurn * 3, rise: -.025, feet: { l: [0, 0, 0, 4.71], r: [0, .038, 0, 4.86] },
      head: [-.045, .35, .033], face: [.87, .48] }],
    [.71, { ...turnArms, turn: quarterTurn * 3.56, rise: -.034, feet: { l: [0, 0, 0, 5.14], r: [0, .029, 0, 5.73] },
      torso: [.028, .05, -.044], head: [-.047, .32, .042], face: [.91, .51] }],
    [.78, { turn: quarterTurn * 4, rise: -.045, leftHand: [1.79, -.47, .55], rightHand: [-1.83, -.41, .62],
      head: [.069, -.05, -.032], torso: [.104, -.062, .05], face: [.98, .54] }],
    [.88, { turn: quarterTurn * 4, rise: -.019, head: [-.024, .034, -.02], torso: [-.022, -.016, .016], face: [.79, .32] }],
  ] },
  { id: "126", name: "Heart to the crowd", duration: 3.9, keys: [
    [.19, { ...rallyDown, leftHand: [1.55, -.1, .68], rightHand: [-1.55, -.1, .68],
      head: [.062, .08, -.046], torso: [.055, .034, -.026], rise: -.027, face: [.62, .38] }],
    [.35, { ...heart, head: [-.039, .04, -.064], torso: [-.067, .015, .025], sway: -.02, face: [.92, .57] }],
    [.51, { ...heart, head: [.047, -.06, .085], torso: [-.035, -.026, -.031], sway: .026, rise: -.021, face: [1, .5] }],
    [.66, { ...rallyPalms, leftHand: [2.23, .18, .51], rightHand: [-2.23, .18, .51], head: [.085, .035, -.033],
      torso: [.074, .03, .014], rise: -.027, face: [1, .55] }],
    [.81, { leftHand: [1.64, -.37, .53], rightHand: [-1.64, -.37, .53], head: [-.038, -.015, .028], face: [.76, .32] }],
  ] },
  { id: "127", name: "Singalong invitation", duration: 3.8, keys: [
    [.19, { ...listening, leftHand: [1.66, -.19, .44], rightHand: [-1.06, -.23, .68], head: [.028, -.13, .05], face: [.46, .42] }],
    [.36, { ...listening, sway: .026, rise: -.026, travel: .028, head: [.027, -.15, -.142],
      torso: [.115, -.071, -.037], face: [.77, .59] }],
    [.53, { ...listening, rightHand: [-1.8, -.12, .77], sway: .033, rise: -.031, travel: .039,
      head: [.04, -.045, -.12], torso: [.133, -.021, -.035], face: [.93, .6] }],
    [.69, { ...listening, leftHand: [1.56, .19, .29], rightHand: [-1.53, -.17, .74],
      head: [-.067, .14, -.063], torso: [.044, .062, -.027], face: [1, .51] }],
    [.85, { head: [.088, .06, -.021], face: [.8, .29] }],
  ] },
  { id: "128", name: "Encore request", duration: 3.5, keys: [
    [.19, { ...cue, rightHand: [-1.39, .15, .57], head: [.054, -.08, .052], face: [.52, .39] }],
    [.32, { ...cue, head: [-.12, -.16, .036], torso: [-.038, -.06, .021], sway: -.021, face: [.83, .55] }],
    [.43, { ...cue, rightHand: [-1.75, .48, .48], wrist: .28, head: [-.08, -.19, .061], face: [.9, .53] }],
    [.53, { ...cue, rightHand: [-1.51, .32, .68], wrist: -.18, head: [.039, -.13, .047], face: [.96, .51] }],
    [.64, { rightHand: [-1.38, .03, .81], rightPalm: [[-.21, .61, .76], [0, .77, -.61]],
      fingers: [null, "open"], torso: [.09, -.055, .028], head: [.112, .02, -.036], face: [1, .56] }],
    [.77, { rightHand: [-1.03, -.12, .66], rightPalm: [[.08, .92, -.37], [0, .34, .9]],
      fingers: [null, "cup"], head: [-.047, .063, -.027], face: [.89, .4] }],
  ] },
  { id: "129", name: "Stage nerves shakeout", duration: 3.45, keys: [
    [.17, { ...looseHands, head: [.12, -.14, -.06], torso: [.073, -.06, .04], face: [-.13, .57] }],
    [.29, { ...looseHands, wristLeft: -.32, wrist: .35, sway: -.023, rise: -.033,
      torso: [.116, .04, .034], head: [.146, .08, .015], face: [-.04, .51] }],
    [.38, { ...looseHands, wristLeft: .28, wrist: -.31, sway: .021, rise: -.022, torso: [.061, -.047, -.027], head: [.113, .08, .032] }],
    [.47, { ...looseHands, wristLeft: -.27, wrist: .3, sway: -.018, rise: -.025, torso: [.086, .031, .021], head: [.087, .034, .032] }],
    [.57, { ...looseHands, wristLeft: .18, wrist: -.15, sway: .013, rise: -.014, torso: [.044, -.01, -.016], head: [.065, .012, -.025] }],
    [.72, { torso: [-.086, .012, .016], head: [-.047, .009, -.023], rise: .008, face: [.36, .3] }],
    [.87, { torso: [.035, .008, .012], head: [.066, .011, -.009], rise: -.014, face: [.68, .42] }],
  ] },
  { id: "130", name: "Finale flourish", duration: 3.9, keys: [
    [.18, { ...greet, rightHand: [-1.55, .03, .64], head: [-.047, -.16, .047], torso: [-.034, -.075, .028], face: [.85, .44] }],
    [.34, { ...greet, rightHand: [-2.22, .32, .51], sway: -.029, turn: -.12,
      head: [-.1, -.18, .058], torso: [-.062, -.135, .033], face: [1, .54] }],
    [.52, { leftHand: [1.83, -.39, .48], rightHand: [-.61, -.29, .62], sway: -.024, rise: -.076,
      torso: [.37, .057, .049], head: [.23, -.063, .044], face: [.87, .35] }],
    [.64, { leftHand: [1.79, -.47, .53], rightHand: [-.69, -.32, .64], sway: -.021, rise: -.047,
      torso: [.224, .039, .033], head: [.092, .035, .03], face: [.91, .39] }],
    [.81, { ...greet, rightHand: [-1.38, -.28, .53], head: [-.045, .047, -.023], torso: [-.039, -.014, .009], face: [.92, .36] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["122", "128"];

export function availablePerformerEmotes(bag: boolean) {
  return bag ? PERFORMER_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : PERFORMER_EMOTES;
}
