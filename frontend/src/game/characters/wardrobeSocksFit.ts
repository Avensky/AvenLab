import { DoubleSide, MathUtils, Ray, type BufferGeometry } from "three";
import type { MeshBVH } from "three-mesh-bvh";

/** Ease the authored sock toe over the longer exposed toes of the shoeless rig. */
export function prepareShoelessSockFit(body: MeshBVH) {
  const ray = new Ray();
  return (source: BufferGeometry) => {
    const position = source.getAttribute("position");
    let fitted: BufferGeometry | undefined;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const toe = MathUtils.smoothstep(z, .035, .094) * (1 - MathUtils.smoothstep(y, .052, .104));
      if (!toe) continue;
      const centerX = Math.sign(x) * .149;
      const depth = z + .011 * toe;
      let width = x + (x - centerX) * .21 * toe;
      let height = y;
      // Probe a cross-section through the underlying foot. Keep the fabric
      // outside the toe surface with a small allowance for the fabric itself.
      ray.origin.set(centerX, -.03, depth);
      ray.direction.set(0, 1, 0);
      const sole = body.raycastFirst(ray, DoubleSide, 0, .125)?.point.y;
      ray.origin.y = .14;
      ray.direction.y = -1;
      const instep = body.raycastFirst(ray, DoubleSide, 0, .14)?.point.y;
      if (sole !== undefined && instep !== undefined && instep > sole) {
        const centerY = (sole + instep) / 2;
        const dx = width - centerX, dy = height - centerY;
        const radius = Math.hypot(dx, dy);
        if (radius) {
          ray.origin.set(centerX, centerY, depth);
          ray.direction.set(dx / radius, dy / radius, 0);
          // At the toe gaps the first intersection may be between two toes.
          const skin = Math.max(...body.raycast(ray, DoubleSide, 0, .09).map(hit => hit.distance));
          if (radius < skin + .0018) {
            const scale = 1 + toe * ((skin + .0018) / radius - 1);
            width = centerX + dx * scale;
            height = centerY + dy * scale;
          }
        }
      }
      fitted ??= source.clone();
      fitted.getAttribute("position").setXYZ(i, width, height, depth);
    }
    if (fitted) {
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
    }
    return fitted;
  };
}
