import { MathUtils, type BufferGeometry } from "three";
import { fitWardrobeSurface } from "./wardrobeSurface";

/** Fit the High Collar's inset to the skinned torso, including the shoulder caps. */
export function fitHighCollarSurface(body: BufferGeometry) {
  return fitWardrobeSurface(body, [
    point => point.y - 1.174,
    point => .139 + .025 * MathUtils.smoothstep(point.y, 1.310, 1.381) - Math.abs(point.x),
    point => {
      const across = Math.abs(point.x);
      const front = 1.297 + .137 * MathUtils.smoothstep(across, .027, .069);
      const back = 1.439 - .025 * MathUtils.smoothstep(across, .093, .162);
      const edge = MathUtils.lerp(back, front, MathUtils.smoothstep(point.z, -.01, .061));
      return edge - point.y;
    },
  ], .0035);
}
