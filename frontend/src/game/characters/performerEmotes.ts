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
function spinSteps(): Emote["keys"] {
  const plants = { l: 0, r: 0 };
  const keys: Emote["keys"][number][] = [
    [.13, { ...turnArms, sway: -.028, torso: [.014, -.14, .037], head: [.012, .13, -.023] }],
  ];
  const angle = Math.PI / 3;
  for (let step = 0; step < 6; step++) {
    const swing = step % 2 === 0 ? "l" : "r";
    const support = swing === "l" ? "r" : "l";
    const start = step * angle;
    const end = start + angle;
    for (const phase of [.27, .56, 1]) {
      const lift = phase === 1 ? 0 : Math.sin(Math.PI * phase);
      const turn = start + angle * phase;
      const weight = (support === "l" ? .043 : -.043) * lift;
      keys.push([.15 + (step + phase) * .103, {
        ...turnArms,
        turn, sway: Math.cos(plants[support]) * weight, travel: -Math.sin(plants[support]) * weight,
        rise: -.011 - .01 * (1 - lift),
        feet: {
          [swing]: [0, .043 * lift, 0, plants[swing] + (end - plants[swing]) * phase, -.08 * lift],
          [support]: [0, 0, 0, plants[support]],
        },
        torso: [-.021, .095 * lift, .02 * lift], head: [-.026, step < 2 ? -.24 : .21, -.031],
        face: [.68 + step * .045, .43],
      }]);
    }
    plants[swing] = end;
  }
  keys.push(
    [.81, { turn: Math.PI * 2, sway: -.024, rise: -.013, feet: { l: [0, .027, 0, Math.PI * 1.86] },
      leftHand: [1.35, -.38, .51], rightHand: [-1.39, -.42, .49], torso: [.069, -.08, .04], face: [.92, .46] }],
    [.86, { torso: [.05, .034, -.025], head: [.076, .022, -.026], face: [.87, .36] }],
  );
  return keys;
}
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
  rightHand: [-1.43, .31, .62], rightPalm: [[0, .55, .835], [1, 0, 0]], fingers: [null, "point"],
} as const;
const looseLeft = { leftHand: [1.54, -.63, .46], leftPalm: [[.17, -.52, .84], [-.9, -.36, -.04]] } as const;
const looseRight = { rightHand: [-1.52, -.61, .45], rightPalm: [[-.15, -.51, .85], [.93, -.29, -.02]] } as const;
const handsUp = {
  leftHand: [1.95, .92, .24], rightHand: [-1.92, .95, .23], fingers: ["open", "open"],
  leftPalm: [[.15, .96, .24], [-.1, -.23, .97]], rightPalm: [[-.17, .96, .21], [.08, -.19, .98]],
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
    [.19, { turn: .11, ...leftBeat, sway: .075, rise: -.046, feet: { l: sideLeft }, head: [.092, .155, -.044], face: [.53, .37] }],
    [.28, { turn: -.09, ...leftBeat, sway: .13, rise: -.025, feet: { l: sideLeft, r: [.057, .037, .009, .02] },
      head: [-.05, .073, .042], face: [.82, .54] }],
    [.37, { turn: .13, ...rightBeat, sway: .136, rise: -.041, feet: { l: sideLeft, r: sideRight }, head: [.083, -.08, .061], face: [.84, .38] }],
    [.47, { turn: .17, ...leftBeat, sway: .092, rise: -.027, feet: { l: sideLeft, r: [.056, .034, .009, -.025] },
      head: [-.049, -.118, -.034], face: [.96, .54] }],
    [.56, { turn: -.12, ...rightBeat, sway: .033, rise: -.047, feet: { l: sideLeft }, head: [.072, -.157, .055], face: [.91, .4] }],
    [.65, { turn: -.08, ...rightBeat, sway: -.025, rise: -.023, feet: { l: [.065, .036, .012, .04] }, head: [-.052, -.069, .024], face: [.92, .48] }],
    [.74, { turn: .07, ...leftBeat, sway: -.012, rise: -.042, head: [.093, .058, -.051], face: [.9, .4] }],
    [.86, { sway: .018, rise: -.017, head: [-.04, .046, .025], face: [.75, .29] }],
  ] },
  { id: "124", name: "Shoulder groove", duration: 3.85, keys: [
    [.15, { ...leftBeat, sway: -.037, travel: -.022, turn: .15, rise: -.03, head: [.065, .13, .045], face: [.54, .31] }],
    [.23, { ...leftBeat, sway: -.005, travel: .039, turn: .04, rise: -.018, torso: [.02, -.095, -.041], face: [.73, .45] }],
    [.33, { ...rightBeat, sway: .049, travel: .009, turn: -.195, rise: -.034, head: [-.052, -.065, -.067], face: [.78, .51] }],
    [.42, { ...rightBeat, sway: .013, travel: -.035, turn: -.06, rise: -.026, torso: [.032, .078, .047], face: [.84, .45] }],
    [.52, { ...leftBeat, sway: -.046, travel: -.016, turn: .2, rise: -.032, head: [.082, .15, .06], face: [.88, .45] }],
    [.61, { ...leftBeat, sway: -.009, travel: .043, turn: .062, rise: -.015, torso: [.017, -.115, -.025], face: [.93, .49] }],
    [.7, { ...rightBeat, sway: .039, travel: .01, turn: -.17, rise: -.031, head: [-.069, -.1, -.074], face: [.92, .47] }],
    [.84, { sway: .018, travel: -.015, turn: -.042, rise: -.014, torso: [.027, .03, -.025], head: [-.03, .041, .014], face: [.72, .27] }],
  ] },
  { id: "125", name: "Spin and stop", duration: 3.95, keys: spinSteps() },
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
  { id: "128", name: "Encore request", duration: 3.55, keys: [
    [.18, { ...cue, rightHand: [-1.38, -.09, .54], head: [.054, -.08, .052], face: [.52, .39] }],
    [.32, { ...cue, head: [-.08, -.14, .036], torso: [-.038, -.06, .021], sway: -.021, face: [.83, .55] }],
    [.44, { ...cue, rightHand: [-1.56, .29, .67], rightPalm: [[0, .55, .835], [0, .835, -.55]],
      head: [-.03, -.13, .061], face: [.9, .53] }],
    [.55, { ...cue, rightHand: [-1.29, .19, .72], rightPalm: [[0, .55, .835], [-1, 0, 0]],
      fingers: [null, "cup"], torso: [.053, -.041, .028], head: [.094, -.07, .035], face: [.98, .54] }],
    [.69, { rightHand: [-.89, -.18, .55], head: [-.029, .057, -.027], face: [.89, .4] }],
    [.84, { rightHand: [-1.42, -.55, .42], head: [.027, .029, -.015], face: [.69, .27] }],
  ] },
  { id: "129", name: "Stage nerves shakeout", duration: 4.05, keys: [
    [.16, { ...looseRight, sway: .018, head: [.13, -.14, -.05], torso: [.076, -.045, -.018], face: [-.08, .5] }],
    [.28, { ...looseRight, rightHand: [-1.57, -.48, .54], sway: -.018, rise: -.019,
      torso: [.106, -.031, .034], head: [.15, -.07, .025], fingers: [null, "open"] }],
    [.35, { ...looseRight, rightHand: [-1.4, -.65, .43], wrist: .19, sway: -.014, rise: -.023, head: [.115, .027, .019] }],
    [.46, { ...looseLeft, leftHand: [1.54, -.51, .56], sway: .026, rise: -.016, torso: [.058, .046, -.032],
      head: [.088, .098, -.029], fingers: ["open", null], face: [.19, .32] }],
    [.54, { ...looseLeft, leftHand: [1.46, -.68, .48], wristLeft: -.18, sway: .019, rise: -.023,
      torso: [.071, .032, -.024], head: [.077, .046, -.025], face: [.28, .35] }],
    [.68, { torso: [-.075, .012, .016], head: [-.055, .009, -.023], face: [.38, .3] }],
    [.83, { torso: [.034, .008, .012], head: [.08, .015, -.009], rise: -.014, face: [.71, .42] }],
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
  { id: "hands-up-crowd", name: "Hands up", duration: 4.5, keys: [
    [.15, { ...rallyDown, sway: -.026, rise: -.037, turn: -.14, torso: [.13, -.13, .046], head: [.075, -.11, .042], face: [.46, .56] }],
    [.27, { ...handsUp, sway: -.046, rise: -.008, turn: .13, torso: [-.04, -.06, .073], head: [-.12, .09, -.02], face: [.9, .61] }],
    [.4, { ...handsUp, leftHand: [1.86, .6, .35], sway: .025, rise: -.043, turn: -.16,
      torso: [.106, .14, -.05], head: [.096, -.08, -.057], face: [.81, .54] }],
    [.52, { ...handsUp, sway: .048, rise: -.013, turn: -.04, torso: [-.066, .06, -.08], head: [-.075, .12, .013], face: [1, .65] }],
    [.64, { ...handsUp, rightHand: [-1.84, .63, .39], sway: -.029, rise: -.039, turn: .17,
      torso: [.09, -.12, .051], head: [.093, .026, .059], face: [.94, .54] }],
    [.76, { ...handsUp, sway: -.014, rise: -.01, turn: .07, torso: [-.055, -.07, .027], head: [-.104, -.03, .037], face: [1, .57] }],
    [.88, { ...rallyDown, turn: -.046, torso: [.075, .028, -.018], head: [.081, .051, -.021], face: [.77, .38] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["122", "128"];

export function availablePerformerEmotes(bag: boolean) {
  return bag ? PERFORMER_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : PERFORMER_EMOTES;
}
