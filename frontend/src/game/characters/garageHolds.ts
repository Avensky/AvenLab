import type { Emote } from "./garageEmotes";

type HoldPose = Emote["keys"][number][1];

function hold(id: string, pose: HoldPose, breath: HoldPose): Emote {
  return { id, name: id, duration: 4.2, keys: [[0, pose], [.48, { ...pose, ...breath }], [1, pose]] };
}

const lowHands = hold("hold-low-hands", {
  leftHand: [.41, -.61, .57], rightHand: [-.45, -.55, .67],
  leftPalm: [[-.83, -.09, .52], [0, .9, .15]], rightPalm: [[.84, -.26, .47], [0, -.86, -.19]],
  fingers: ["cup", "open"], rise: -.018, sway: .02, torso: [.02, -.055, -.032], head: [.07, .1, -.04], face: [.33, .08],
}, { torso: [-.009, -.035, -.023], head: [.045, .135, -.055], rise: -.014 });

const hipRestPose = {
  rightHand: [-1.75, -.58, .34], rightPalm: [[-.16, -.86, .49], [.45, 0, -1]],
  fingers: [null, "cup"], rise: -.02, sway: -.035, torso: [.02, .07, .05], head: [-.04, -.1, -.05], face: [.25, .12],
} as const;
const hipBreath = { torso: [-.006, .048, .041], head: [-.018, -.14, -.053], rise: -.015 } as const;
const hipRest = hold("hold-hip-rest", {
  ...hipRestPose, leftHand: [1.92, -.61, .62], leftPalm: [[.07, -.89, .44], [-1, 0, 0]], fingers: ["cup", "cup"],
}, hipBreath);
const bagHipRest = hold("hold-hip-rest", hipRestPose, hipBreath);

const looseArms = hold("hold-loose-arms", {
  leftHand: [1.88, -.64, .57], rightHand: [-1.88, -.65, .57],
  leftPalm: [[.07, -.91, .41], [-1, 0, 0]], rightPalm: [[-.07, -.92, .4], [1, 0, 0]],
  fingers: ["cup", "cup"], rise: -.016, sway: .026, torso: [-.018, -.07, -.035], head: [-.02, .16, .062], face: [.4, .14],
}, { torso: [-.044, -.047, -.028], head: [-.035, .12, .044], rise: -.011 });

const bagRest = hold("hold-bag-rest", {
  rightHand: [-.83, -.42, .61], rightPalm: [[.59, -.2, .78], [0, .82, -.45]],
  fingers: [null, "cup"], rise: -.02, sway: .022, torso: [.035, -.049, -.023], head: [.075, .13, .044], face: [.33, .12],
}, { torso: [.012, -.039, -.018], head: [.043, .17, .039], rise: -.016 });

export function garageHoldEmotes(bag: boolean): readonly Emote[] {
  return bag ? [bagHipRest, bagRest] : [lowHands, hipRest, looseArms];
}
