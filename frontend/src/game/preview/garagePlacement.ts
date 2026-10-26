import { Box3, Matrix3, Mesh, Raycaster, Vector3, type Object3D } from "three";

// Display placement only. Preserve the GLB's geometry, units and node poses.
// An explicit floor-level vehicle anchor takes priority over raycast fallback.
export function garagePlacement(root: Object3D, floorName?: string): [number, number, number] {
  root.updateWorldMatrix(true, true);
  const anchor = root.getObjectByName("VEHICLE_ANCHOR") ?? root.getObjectByName("GARAGE_ANCHOR");
  if (anchor) return anchor.getWorldPosition(new Vector3()).multiplyScalar(-1).toArray();
  const bounds = new Box3().setFromObject(root, true);
  if (bounds.isEmpty()) return [0, 0, 0];
  const preferredFloor = floorName ? root.getObjectByName(floorName) : undefined;
  const center = (preferredFloor ? new Box3().setFromObject(preferredFloor, true) : bounds).getCenter(new Vector3());
  const meshes: Mesh[] = [], floors: Mesh[] = [];
  root.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(material => material.visible && material.opacity > 0)) return;
    meshes.push(object);
    const names = [object.name, object.userData.name, ...materials.map(material => material.name)].join(" ");
    if (/floor|ground|slab|pavement/i.test(names)) floors.push(object);
  });
  const ray = new Raycaster(new Vector3(center.x, bounds.max.y + 1, center.z), new Vector3(0, -1, 0));
  const normalMatrix = new Matrix3();
  const level = (objects: Mesh[], upper = false, backFaces = false) => ray.intersectObjects(objects, false).filter(hit => {
    if (!hit.face) return false;
    const y = hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).y;
    return (backFaces ? Math.abs(y) : y) > 0.5;
  })
    .sort((a, b) => upper ? b.point.y - a.point.y : a.point.y - b.point.y)[0]?.point.y;
  const selected: Mesh[] = [];
  preferredFloor?.traverseVisible(object => { if (object instanceof Mesh) selected.push(object); });
  // The uploaded pad is double-sided, with downward-facing top triangles.
  const floor = level(selected, true, true) ?? level(floors) ?? level(meshes) ?? bounds.min.y;
  return [-center.x, -floor, -center.z];
}
