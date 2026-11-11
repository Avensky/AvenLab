import { DoubleSide, MathUtils, MeshStandardMaterial, SkinnedMesh, type Object3D, type Vector3 } from "three";
import { fitWardrobeSurface } from "./wardrobeSurface";

function finishSweetheartWaist(root: Object3D, skirt: Object3D, fabric: MeshStandardMaterial) {
  const body = root.getObjectByName("BODY_WARDROBE");
  if (!(body instanceof SkinnedMesh)) return;
  const boundaries = [
    (point: Vector3) => point.y - 1.049,
    (point: Vector3) => 1.105 - point.y,
    (point: Vector3) => .141 - Math.abs(point.x),
  ];
  const over = fitWardrobeSurface(body.geometry, boundaries, .003);
  const tucked = fitWardrobeSurface(body.geometry, boundaries, point => .003 + .009 * MathUtils.smoothstep(point.y, 1.06, 1.092));
  if (!over || !tucked) { over?.dispose(); tucked?.dispose(); return; }

  const material = new MeshStandardMaterial({
    name: "MAT_GOTHIC_02_WaistSeam", color: fabric.color, roughness: fabric.roughness,
    metalness: fabric.metalness, side: DoubleSide,
  });
  material.userData.color_slot = "fabric";
  const seams = ([["tucked", tucked], ["over", over]] as const).map(([fit, geometry]) => {
    const seam = body.clone(false);
    seam.name = `CLOTH_GOTHIC_02_WAIST_SEAM_${fit.toUpperCase()}`;
    seam.userData = { clothingPiece: "skirt", wardrobeRole: `bottom-seam-${fit}` };
    seam.geometry = geometry;
    seam.material = material;
    skirt.add(seam);
    return seam;
  });
  return () => {
    for (const seam of seams) { seam.removeFromParent(); seam.geometry.dispose(); }
    material.dispose();
  };
}

/** Keep the skirt fabric and remove the obsolete Sweetheart bodice and its lacing. */
export function prepareWardrobeSkirt(root: Object3D) {
  const skirt = root.getObjectByName("CLOTH_BOTTOM_SKIRT");
  if (!skirt) return;
  let panel: SkinnedMesh | undefined;
  let sweetheartFabric: MeshStandardMaterial | undefined;
  const retiredSweetheartPanels: SkinnedMesh[] = [];
  skirt.traverse(part => {
    if (!(part instanceof SkinnedMesh) || Array.isArray(part.material)) return;
    const name = part.material.name;
    if (name === "MAT_GOTHIC_02_Trim_1" || name === "MAT_GOTHIC_02_Hardware_4") retiredSweetheartPanels.push(part);
    if (name === "MAT_GOTHIC_02_Fabric_0" && part.material instanceof MeshStandardMaterial) sweetheartFabric = part.material;
    if (name === "MAT_GOTHIC_03_Fabric_2") panel = part;
  });
  for (const part of retiredSweetheartPanels) part.removeFromParent();
  if (sweetheartFabric) return finishSweetheartWaist(root, skirt, sweetheartFabric);
  // Give the Gothic 03 overskirt room around its ruffles, fading out at the waist.
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
