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

export function fittedArmTarget(target: readonly [XYZ, XYZ] | undefined): readonly [XYZ, XYZ] | undefined {
  if (!target || target[0][1] > -.5 || target[1][1] > .3) return target;
  return [[target[0][0] * .68, target[0][1], target[0][2]], [target[1][0], target[1][1], target[1][2] * .85]];
}
