import { Box3, Group, InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from "three";
import { createGarageTubeRack } from "./createGarageTubeRack.ts";

// Keep the ceiling lattice separate from the freestanding white tube rack.
// The FOND modules are ceiling-like panels, not the rack in the reference.
// Call only on the prepared display copy, after its scale/placement is applied.
export function completeGarageStructure(root: Object3D) {
  root.updateWorldMatrix(true, true);
  const structure = new Group(); structure.name = "completed-garage-structure";
  // The evaluated Blender export already contains its complete authored parts.
  // Keep those intact; reconstruction is only for the legacy partial export.
  if (root.userData.avenlabGarageComplete === true) return { structure, dispose: () => {} };
  const disposers: Array<() => void> = [];
  for (const name of ["FOND_01", "FOND_01001"]) {
    const rack = root.getObjectByName(name);
    if (rack) rack.visible = false;
  }
  const repeat = (name: string, counts: [number, number, number], step: Vector3) => {
    const module = root.getObjectByName(name);
    if (!module) return;
    module.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const instances = new InstancedMesh(object.geometry, object.material, counts[0] * counts[1] * counts[2]);
      instances.name = `completed-${name}`;
      const offset = new Matrix4(); let index = 0;
      for (let x = 0; x < counts[0]; x++) for (let y = 0; y < counts[1]; y++) for (let z = 0; z < counts[2]; z++) {
        offset.makeTranslation(x * step.x, y * step.y, z * step.z);
        instances.setMatrixAt(index++, offset.clone().multiply(object.matrixWorld));
      }
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingSphere();
      structure.add(instances);
      disposers.push(() => instances.dispose());
    });
    module.visible = false;
  };
  const roof = root.getObjectByName("Toit_GRILLE"), ceiling = root.getObjectByName("PLANE_Plane");
  if (roof && ceiling) {
    const unit = new Box3().setFromObject(roof, true).getSize(new Vector3());
    const area = new Box3().setFromObject(ceiling, true).getSize(new Vector3());
    if (unit.x > 0.01 && unit.z > 0.01) repeat("Toit_GRILLE", [Math.max(1, Math.min(16, Math.round(area.x / unit.x))), 1,
      Math.max(1, Math.min(16, Math.round(area.z / unit.z)))], new Vector3(unit.x, 0, unit.z));
  }
  const rackFragment = root.getObjectByName("Base_Light");
  if (rackFragment) {
    const rackBounds = new Box3().setFromObject(rackFragment, true);
    // The current side-rack export stops at the room's Z=0 centerline.
    // Complete its full span rather than preserving the visibly cut half.
    if (Math.abs(rackBounds.max.z) < 0.01 && rackBounds.min.z < -0.01) rackBounds.max.z = -rackBounds.min.z;
    const tubing = createGarageTubeRack(rackBounds);
    if (tubing) {
      rackFragment.visible = false;
      const rackLight = root.getObjectByName("Base_Light001") ?? root.getObjectByName("Base_Light.001");
      if (rackLight) rackLight.visible = false;
      structure.add(tubing.rack); disposers.push(tubing.dispose);
    }
  }
  return { structure, dispose: () => disposers.forEach(dispose => dispose()) };
}
