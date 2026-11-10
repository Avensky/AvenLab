import type { Emote } from "./garageEmotes";

export const GARAGE_LEAN_ID = "pose-lean";
export type GarageLeanFit = { offset: number; distance: number };

export function garageLeanPose({ offset, distance }: GarageLeanFit): Emote {
  const folded = {
    leftHand: [-.64, -.27, .4], rightHand: [.66, -.34, .45],
    leftPalm: [[-.92, .32, -.18], [0, 0, -1]], rightPalm: [[.9, .28, -.24], [0, 0, -1]],
    fingers: ["open", "open"],
  } as const;
  const l = [.035, 0, .016 - offset, .12] as const;
  const r = [-.012, 0, -offset, -.06] as const;
  const armsAside = { leftHand: [1.22, -.39, .62], rightHand: [-1.16, -.41, .61] } as const;
  const stance = { ...folded, travel: -offset - distance, sway: -.031, rise: -.037, feet: { l, r } } as const;
  return { id: GARAGE_LEAN_ID, name: "Folded arms by the door", duration: 9.2, keys: [
    [.05, { ...armsAside, travel: -offset * .23, sway: -.026, rise: -.026, feet: { l: [.016, .022, -offset * .52, .07] } }],
    [.09, { ...armsAside, travel: -offset * .59, sway: -.018, rise: -.03, feet: { l } }],
    [.13, { ...folded, travel: -offset * .85, sway: .019, rise: -.029, feet: { l, r: [-.006, .024, -offset * .63, -.04] } }],
    [.19, { ...stance, torso: [-.15, .025, -.035], head: [.095, -.12, .06], face: [.31, .11] }],
    [.32, { ...stance, torso: [-.17, .03, -.04], head: [.12, -.22, .065], face: [.35, .14] }],
    [.57, { ...stance, torso: [-.151, .026, -.037], head: [.09, -.13, .052], face: [.47, .12] }],
    [.77, { ...stance, torso: [-.16, .03, -.033], head: [.115, .12, .04], face: [.32, .11] }],
    [.83, { ...armsAside, travel: -offset, sway: .021, rise: -.032, feet: { l, r } }],
    [.88, { ...armsAside, travel: -offset * .72, sway: .02, rise: -.025, feet: { l, r: [-.007, .024, -offset * .48, -.034] } }],
    [.92, { ...armsAside, travel: -offset * .42, sway: -.017, rise: -.027, feet: { l } }],
    [.96, { travel: -offset * .16, sway: -.023, rise: -.022, feet: { l: [.016, .021, -offset * .35, .05] } }],
  ] };
}
