import type { Emote } from "./garageEmotes";

const leftStep = { leftHand: [1.6, -.65, .22], rightHand: [-1.46, -.54, .48], torso: [.03, -.062, .016] } as const;
const rightStep = { leftHand: [1.46, -.54, .48], rightHand: [-1.6, -.65, .22], torso: [.03, .062, -.016] } as const;
const leftForward = [0, 0, .155, .035] as const;
const rightForward = [0, 0, .27, -.035] as const;

export const walkForward = [
  [.10, { ...leftStep, travel: .028, sway: -.026, rise: -.025, feet: { l: [0, .037, .073, .02, .17] } }],
  [.22, { ...leftStep, travel: .085, sway: -.014, rise: -.036, feet: { l: leftForward } }],
  [.33, { ...rightStep, travel: .126, sway: .025, rise: -.022, feet: { l: leftForward, r: [0, .048, .127, -.02, .13] } }],
  [.44, { ...rightStep, travel: .191, sway: .013, rise: -.037, feet: { l: leftForward, r: rightForward } }],
] as const satisfies Emote["keys"];

export const walkPause = {
  travel: .201, sway: -.007, rise: -.025, feet: { l: leftForward, r: rightForward },
} as const;

export const walkReturn = [
  [.69, { ...rightStep, travel: .164, sway: .023, rise: -.027, feet: { l: leftForward, r: [0, .042, .128, -.02, -.14] } }],
  [.78, { ...rightStep, travel: .103, sway: .006, rise: -.04, feet: { l: leftForward } }],
  [.88, { ...leftStep, travel: .061, sway: -.023, rise: -.022, feet: { l: [0, .037, .074, .015, -.13] } }],
  [.96, { travel: .012, rise: -.012 }],
] as const satisfies Emote["keys"];

export const WALK_EMOTES = [
  { id: "walk-casual", name: "Casual walk", duration: 4.5, keys: [
    ...walkForward,
    [.56, { ...walkPause, head: [-.032, .07, -.03], face: [.22, .08] }],
    ...walkReturn,
  ] },
  { id: "walk-glance", name: "Side step and glance", duration: 4, keys: [
    [.12, { ...leftStep, sway: .035, travel: .024, rise: -.023, feet: { r: [-.10, .034, .044, -.075, .09] } }],
    [.25, { ...leftStep, sway: -.098, travel: .039, rise: -.038, feet: { r: [-.177, 0, .065, -.15] } }],
    [.36, { ...rightStep, sway: -.159, travel: .047, rise: -.027, feet: { r: [-.177, 0, .065, -.15], l: [-.095, .041, .016, -.1, .1] }, head: [-.04, -.26, .04] }],
    [.46, { sway: -.185, travel: .038, rise: -.032, turn: -.18, feet: { r: [-.177, 0, .065, -.15], l: [-.166, 0, .02, -.16] }, head: [-.025, -.19, .07] }],
    [.57, { sway: -.183, travel: .038, rise: -.028, turn: -.18, feet: { r: [-.177, 0, .065, -.15], l: [-.166, 0, .02, -.16] }, head: [.035, -.13, .03], face: [.34, .12] }],
    [.69, { ...rightStep, sway: -.149, travel: .03, rise: -.026, feet: { r: [-.177, 0, .065, -.15], l: [-.076, .038, .012, -.07, -.11] } }],
    [.77, { ...rightStep, sway: -.091, travel: .023, rise: -.038, feet: { r: [-.177, 0, .065, -.15] } }],
    [.88, { ...leftStep, sway: -.035, travel: .013, rise: -.027, feet: { r: [-.082, .034, .028, -.06, -.08] } }],
    [.96, { rise: -.01 }],
  ] },
] as const satisfies readonly Emote[];
