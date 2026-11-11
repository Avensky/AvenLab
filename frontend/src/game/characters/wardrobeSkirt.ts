import { MathUtils, SkinnedMesh, type Object3D } from "three";

/** Give the Gothic 03 overskirt room around its ruffles, fading out at the waist. */
export function prepareWardrobeSkirt(root: Object3D) {
  let panel: SkinnedMesh | undefined;
  root.getObjectByName("CLOTH_BOTTOM_SKIRT")?.traverse(part => {
    if (part instanceof SkinnedMesh && !Array.isArray(part.material) && part.material.name === "MAT_GOTHIC_03_Fabric_2") panel = part;
  });
  const outer = panel;
  if (!outer) return;

  const source = outer.geometry;
  const geometry = source.clone();
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i) - .025;
    const radius = Math.hypot(x, z);
    if (radius === 0) continue;
    const direction = z / radius;
    const front = MathUtils.smoothstep(direction, .53, .80);
    const panel = MathUtils.smoothstep(y, .69, .75) * (1 - MathUtils.smoothstep(y, .85, .94));
    const sides = 1 - MathUtils.smoothstep(Math.abs(direction), .15, .52);
    const hem = 1 - MathUtils.smoothstep(y, .65, .71);
    const room = .009 * (1 - MathUtils.smoothstep(y, .94, 1.05)) + .039 * front * panel + .025 * sides * hem;
    const scale = 1 + room / radius;
    positions.setXYZ(i, x * scale, y, .025 + z * scale);
  }
  geometry.computeVertexNormals();
  outer.geometry = geometry;
  return () => { outer.geometry = source; geometry.dispose(); };
}
