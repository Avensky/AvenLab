import { MathUtils, type SkinnedMesh } from "three";
import { fitWardrobeSurface } from "./wardrobeSurface";

/** Fill only the original vest's open chest, following the fitted body's skin weights. */
export function fitUnderbustChest(body: SkinnedMesh) {
  return fitWardrobeSurface(body.geometry, [
    point => point.y - 1.216,
    point => point.z - .045,
    point => .127 - Math.abs(point.x),
    point => {
      const across = Math.abs(point.x);
      const neckline = 1.277 + .023 * MathUtils.smoothstep(across, .026, .068)
        - .017 * MathUtils.smoothstep(across, .094, .127);
      return neckline - point.y;
    },
  ], .0035);
}
