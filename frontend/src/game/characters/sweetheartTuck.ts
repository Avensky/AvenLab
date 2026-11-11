import { MathUtils, SkinnedMesh, type BufferGeometry, type Object3D } from "three";

/** Bring the tucked waist outside the body, with a gradual return to the authored cups. */
export function fitSweetheartTuck(corset: Object3D) {
  const panels: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  corset.traverse(mesh => {
    if (!(mesh instanceof SkinnedMesh)) return;
    const source = mesh.geometry;
    const fitted = source.clone();
    const position = fitted.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i) - .025;
      const radius = Math.hypot(x, z);
      if (radius === 0 || y >= 1.238) continue;
      const clearance = (.006 + .005 * MathUtils.smoothstep(y, 1.098, 1.122))
        * (1 - MathUtils.smoothstep(y, 1.195, 1.238));
      const scale = 1 + clearance / radius;
      position.setXYZ(i, x * scale, y, .025 + z * scale);
    }
    fitted.computeBoundingBox();
    fitted.computeBoundingSphere();
    mesh.geometry = fitted;
    panels.push({ mesh, source, fitted });
  });
  return () => {
    for (const { mesh, source, fitted } of panels) {
      mesh.geometry = source;
      fitted.dispose();
    }
  };
}
