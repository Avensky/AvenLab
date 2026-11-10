import type { Emote } from "./garageEmotes";

const respect = {
  rightHand: [-1.37, -.24, .68], rightPalm: [[-.25, .16, .96], [.08, .97, -.17]],
  fingers: [null, "open"],
} as const;
const close = {
  leftHand: [.47, -.22, .64], rightHand: [-.45, -.23, .655],
  leftPalm: [[-.145, .71, .69], [-.94, -.29, .13]], rightPalm: [[.153, .69, .71], [.94, -.29, .11]],
  fingers: ["cup", "cup"],
} as const;

const RACE_REACTIONS = [
  { id: "191", name: "Good race acknowledgement", duration: 3.95, keys: [
    [.18, { ...respect, rightHand: [-1.25, -.48, .511], turn: -.11, torso: [.044, -.057, .03], head: [.075, -.185, .051], face: [.23, .41] }],
    [.36, { ...respect, rightHand: [-1.54, -.21, .75], turn: -.16, sway: -.034, rise: -.024, travel: .031,
      torso: [.091, -.097, .041], head: [.161, -.163, .057], face: [.55, .48] }],
    [.54, { ...respect, rightHand: [-1.42, -.22, .75], turn: -.13, sway: -.024, rise: -.019,
      torso: [.042, -.063, .033], head: [-.079, -.143, .043], face: [.77, .49] }],
    [.69, { ...respect, rightHand: [-1.21, -.3, .66], turn: -.071, torso: [.059, -.038, .023], head: [.102, -.07, .033], face: [.79, .39] }],
    [.85, { rightHand: [-1.45, -.48, .483], head: [.04, .034, .02], face: [.56, .28] }],
  ] },
  { id: "192", name: "Close second frustration", duration: 4.45, keys: [
    [.17, { sway: -.021, torso: [.065, -.12, .035], head: [.145, -.241, .062], face: [-.24, .59] }],
    [.34, { ...close, leftHand: [.91, -.28, .58], rightHand: [-.94, -.28, .59], sway: .024, rise: -.029,
      torso: [.112, .07, -.06], head: [.192, .065, -.113], face: [-.32, -.43] }],
    [.48, { ...close, sway: -.022, rise: -.037, torso: [.119, -.03, .026], head: [.228, -.061, .087], face: [-.23, .51] }],
    [.59, { ...close, leftHand: [.56, -.24, .615], rightHand: [-.55, -.25, .639], sway: -.021,
      torso: [-.084, -.023, .033], head: [-.095, -.032, .062], blink: .72, face: [.12, .36] }],
    [.71, { leftHand: [1.55, -.42, .52], rightHand: [-1.59, -.42, .529], torso: [.047, .061, -.029], head: [.146, .119, -.063], face: [.52, .37] }],
    [.86, { torso: [-.021, .028, -.018], head: [.041, .08, -.03], face: [.59, .24] }],
  ] },
] as const satisfies readonly Emote[];

export function availableRaceReactions(bag: boolean) {
  return bag ? RACE_REACTIONS.slice(0, 1) : RACE_REACTIONS;
}
