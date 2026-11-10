import type { Emote } from "./garageEmotes";

export const STOIC_EMOTES = [
  { id: "131", name: "Measured acknowledgement", duration: 2.65, keys: [
    [.2, { sway: -.022, rise: -.014, torso: [-.03, -.023, .023], head: [-.068, -.052, .01], face: [.06, .25] }],
    [.42, { sway: -.025, rise: -.026, torso: [.055, -.019, .02], head: [.17, -.046, .021], face: [.13, .16] }],
    [.61, { sway: -.015, rise: -.018, torso: [.019, .02, -.01], head: [.058, .032, -.013], face: [.34, .21] }],
    [.8, { torso: [-.02, .012, -.013], head: [-.029, .036, -.02], face: [.27, .18] }],
  ] },
  { id: "132", name: "Scan the perimeter", duration: 3.7, keys: [
    [.17, { sway: -.017, rise: -.016, torso: [.019, -.09, .034], head: [-.037, -.32, .037], face: [.02, .31] }],
    [.34, { sway: -.039, rise: -.026, torso: [.026, -.17, .054], head: [.052, -.51, .055], face: [-.08, .47] }],
    [.49, { sway: -.015, rise: -.017, torso: [-.026, -.028, .016], head: [-.045, .014, -.006], face: [.03, .39] }],
    [.66, { sway: .035, rise: -.025, torso: [.025, .145, -.041], head: [.034, .49, -.057], face: [.06, .38] }],
    [.78, { sway: .019, rise: -.019, torso: [.016, .075, -.02], head: [.077, .2, -.032], face: [.17, .28] }],
    [.89, { head: [-.02, .045, -.012], face: [.22, .2] }],
  ] },
] as const satisfies readonly Emote[];
