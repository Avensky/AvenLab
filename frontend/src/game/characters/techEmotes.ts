import type { Emote } from "./garageEmotes";

const ready = { offset: [0, -.335, .388], angles: [.14, 0, .015] } as const;

export const TECH_EMOTES = [
  { id: "151", name: "Controller warmup", duration: 3.95, prop: "controller", keys: [
    [.16, { prop: { ...ready, show: 0 }, head: [.13, -.06, .033], torso: [.05, -.031, .018], face: [.19, .33] }],
    [.29, { prop: ready, thumbs: [.22, .04], head: [.223, .062, -.034], torso: [.076, .035, -.022], face: [.31, .47] }],
    [.39, { prop: { offset: [.018, -.3, .389], angles: [.09, .084, -.099] }, thumbs: [-.24, .22],
      torso: [.076, .046, -.029], head: [.197, .08, -.046], sway: .019, rise: -.022, face: [.45, .49] }],
    [.49, { prop: { offset: [-.022, -.31, .403], angles: [.16, -.095, .089] }, thumbs: [.26, -.3],
      torso: [.053, -.047, .031], head: [.195, -.084, .035], sway: -.023, rise: -.024, face: [.57, .39] }],
    [.61, { prop: ready, thumbs: [.05, .12], torso: [-.02, .018, -.015], head: [-.071, .043, -.023], face: [.82, .45] }],
    [.75, { prop: { offset: [0, -.366, .363], angles: [.21, -.025, .022] }, head: [.079, .012, -.015], face: [.73, .34] }],
    [.88, { prop: { ...ready, show: 0 }, head: [.023, -.024, .014], face: [.52, .22] }],
  ] },
  { id: "152", name: "Close game focus", duration: 4.65, prop: "controller", keys: [
    [.16, { prop: { ...ready, show: 0 }, head: [.108, .03, -.02], torso: [.041, .015, -.016], face: [.21, .37] }],
    [.3, { prop: { offset: [0, -.27, .41], angles: [.13, .02, .02] }, thumbs: [.18, .29], torso: [.127, -.04, .026],
      head: [-.079, -.04, .023], rise: -.038, travel: .046, face: [.06, -.36] }],
    [.42, { prop: { offset: [-.039, -.25, .413], angles: [.1, -.19, .108] }, thumbs: [-.32, .31],
      torso: [.172, -.094, .053], head: [-.095, -.075, .065], sway: -.034, rise: -.043, travel: .052, face: [-.12, -.5] }],
    [.5, { prop: { offset: [-.025, -.24, .414], angles: [.14, -.085, .07] }, thumbs: [.24, -.27],
      torso: [.152, -.059, .035], head: [-.074, -.033, .044], sway: -.02, rise: -.034, travel: .049, face: [.02, -.46] }],
    [.59, { prop: { offset: [.038, -.24, .413], angles: [.09, .17, -.105] }, thumbs: [.32, -.3],
      torso: [.161, .084, -.056], head: [-.095, .075, -.059], sway: .036, rise: -.04, travel: .05, face: [-.11, -.5] }],
    [.7, { prop: { ...ready, angles: [.13, .015, -.024] }, thumbs: [-.04, .25], torso: [.065, .025, -.016],
      head: [.083, .043, -.03], travel: .022, face: [.47, .27] }],
    [.82, { prop: { offset: [0, -.367, .351], angles: [.21, -.024, .029] }, head: [-.054, -.016, .01], face: [.75, .38] }],
    [.91, { prop: { ...ready, show: 0 }, head: [.035, -.006, .005], face: [.54, .23] }],
  ] },
] as const satisfies readonly Emote[];
