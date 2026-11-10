import type { Emote } from "./garageEmotes";
import { walkForward, walkPause, walkReturn } from "./walkingEmotes";

const signal = {
  leftHand: [1.63, .12, .55], leftPalm: [[.11, .9, .41], [-.94, -.04, .33]],
  fingers: ["thumb-up", null],
} as const;

const STARTER_EMOTES = [
  { id: "171", name: "Walk to the mark", duration: 4.8, keys: [
    ...walkForward,
    [.52, { ...walkPause, torso: [-.03, -.068, -.015], head: [.137, -.19, -.019], face: [.28, .43] }],
    [.61, { ...walkPause, torso: [-.061, .026, .02], head: [-.09, .082, .026], face: [.66, .51] }],
    ...walkReturn,
  ] },
  { id: "172", name: "Check the left driver", duration: 3.85, keys: [
    [.17, { turn: .1, sway: -.02, rise: -.016, head: [.045, .26, -.048], torso: [.046, .109, -.029], face: [.18, .41] }],
    [.33, { ...signal, leftHand: [1.57, -.04, .59], turn: .19, sway: .031, rise: -.025,
      torso: [.064, .143, -.047], head: [.07, .38, -.061], face: [.39, .52] }],
    [.49, { ...signal, turn: .18, sway: .035, rise: -.02, torso: [.033, .127, -.034],
      head: [-.049, .314, -.046], face: [.81, .52] }],
    [.65, { ...signal, leftHand: [1.49, .058, .57], turn: .1, sway: .019, torso: [.04, .063, -.023],
      head: [.125, .195, -.027], face: [.85, .47] }],
    [.83, { leftHand: [1.44, -.43, .47], head: [.039, .054, -.014], face: [.62, .26] }],
  ] },
] as const satisfies readonly Emote[];

export function availableStarterEmotes(bag: boolean) {
  return bag ? STARTER_EMOTES.slice(0, 1) : STARTER_EMOTES;
}
