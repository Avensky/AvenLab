import { SkinnedMesh, type Object3D } from "three";

/** Refit the shared Vesper shoes around each foot while keeping the soles planted. */
export function prepareVillageShoes(root: Object3D) {
  const shoes = root.getObjectByName("CLOTH_FEET_SHOES");
  if (!(shoes instanceof SkinnedMesh)) return;
  const source = shoes.geometry;
  const geometry = source.clone();
  const positions = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const sole = geometry.boundingBox!.min.y;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const foot = Math.sign(x);
    positions.setXYZ(i, foot * (.149 + (Math.abs(x) - .146) * 1.18),
      sole + (y - sole) * 1.14, .026 + (z - .026) * 1.085);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  shoes.geometry = geometry;
  return () => { shoes.geometry = source; geometry.dispose(); };
}
