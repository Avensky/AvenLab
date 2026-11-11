import { MathUtils } from "three";
import type { CharacterLook } from "./characterCatalog";
import type { XYZ } from "./garageEmotes";

export function usesFittedAnimation(look: CharacterLook) {
  return look.appearance.animation_fit === "fitted" || (look.appearance.animation_fit !== "full" && (!look.female || Boolean(look.wardrobe)));
}

/** Keep expressive raised arms and contact IK intact; remove full-skirt clearance from low gestures. */
export function fittedHandTarget(target: XYZ | undefined): XYZ | undefined {
  if (!target || target[1] > -.2) return target;
  const [x, y, z] = target;
  const low = Math.min(1, Math.max(0, (-y - .2) / .45));
  const across = Math.abs(x) > 1.02 && Math.abs(x) < 1.85
    ? Math.sign(x) * (1.02 + (Math.abs(x) - 1.02) * (1 - .72 * low)) : x;
  return [across, y, z > .12 && z < .9 ? z * (1 - .23 * low) : z];
}

/** Give free, lowered hands room at the sides of a skirt without lifting the elbows. */
export function skirtHandTarget(target: XYZ | undefined, skirtRoom: number): XYZ | undefined {
  if (!target || Math.abs(target[0]) < 1.02 || target[2] < 0) return target;
  const [x, y, z] = target;
  const clearance = MathUtils.smoothstep(-y, .38, .76);
  return [Math.sign(x) * MathUtils.lerp(Math.abs(x), Math.max(Math.abs(x), 2 + 4 * skirtRoom), clearance), y,
    MathUtils.lerp(z, Math.max(z, .30 + 1.5 * skirtRoom), clearance)];
}

/** Steer the low elbow down and back while IK keeps the wrist on its target. */
export function fittedElbowPole(target: XYZ, side: number): XYZ {
  const across = Math.abs(target[0]);
  const tuck = Math.max(0, Math.min(1, (across - 1.02) / .06, (1.85 - across) / .23,
    (-target[1] - .45) / .30, (target[2] - .08) / .12));
  return [side * (1 - .62 * tuck), -.8 - .2 * tuck, -.14 - .20 * tuck];
}

export function fittedArmTarget(target: readonly [XYZ, XYZ] | undefined): readonly [XYZ, XYZ] | undefined {
  if (!target || target[0][1] > -.5 || target[1][1] > .3) return target;
  return [[target[0][0] * .68, target[0][1], target[0][2]], [target[1][0], target[1][1], target[1][2] * .85]];
}
