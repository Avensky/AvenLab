import { MathUtils, type Object3D, SkinnedMesh } from "three";

/** Bend the Village braid back over Top 03's collar in Vesper's bind space. */
export function fitVillageBraidOverCollar(hair?: Object3D) {
  if (!(hair instanceof SkinnedMesh)) return;
  const source = hair.geometry;
  const fitted = source.clone();
  const position = fitted.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i), z = position.getZ(i);
    if (y <= 1.365 || y >= 1.499 || z >= -.008) continue;
    const nape = MathUtils.smoothstep(y, 1.365, 1.425) * (1 - MathUtils.smoothstep(y, 1.456, 1.499));
    const rear = 1 - MathUtils.smoothstep(z, -.035, -.008);
    position.setZ(i, z - .022 * nape * rear);
  }
  fitted.computeBoundingBox();
  fitted.computeBoundingSphere();
  hair.geometry = fitted;
  return () => {
    hair.geometry = source;
    fitted.dispose();
  };
}
