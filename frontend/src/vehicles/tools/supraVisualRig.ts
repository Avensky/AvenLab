import { Box3, Group, Matrix4, Mesh, Quaternion, Vector3, type Object3D } from "three";
import { isBrakeCaliperPart, type WheelCorner, type WheelVisualAssembly } from "./vehicleVisualRig.ts";
import { prepareVehicleVisual } from "./vehicleMaterials.ts";

export const SUPRA_WHEEL_CORNERS = ["fl", "fr", "rl", "rr"] as const;
const positiveAxle = new Vector3(1, 0, 0);
function isWheelCollection(object: Object3D) {
  // GLTFLoader sanitizes spaces and adds duplicate-name suffixes. userData.name
  // retains the original Blender name, so both clean collections and old exports work.
  const name = String(object.userData.name ?? object.name).toLowerCase().replace(/[^a-z0-9]/g, "");
  return /^(?:calliper|caliper)(?:front|rear)[lr]\d*$/.test(name)
    || /^(?:wheel)?(?:fl|fr|rl|rr)(?:wheel|collection|group)?\d*$/.test(name)
    || /^wheel(?:[0-9]|assembly|s$)/.test(name);
}
function belongsToWheel(object: Object3D) {
  for (let parent: Object3D | null = object; parent; parent = parent.parent) if (isWheelCollection(parent)) return true;
  return false;
}

export function createSupraVisualRig(scene: Group) {
  const prepared = prepareVehicleVisual(scene, "supra");
  const root = prepared.root;
  root.updateWorldMatrix(true, true);
  const center = new Box3().setFromObject(root).getCenter(new Vector3());
  const buckets = new Map<WheelCorner, { object: Mesh; world: Matrix4; bounds: Box3; tire: boolean }[]>();
  for (const corner of SUPRA_WHEEL_CORNERS) buckets.set(corner, []);
  // Read every original transform before detaching any meshes. The current GLB
  // nests three corners under Front R and includes empty duplicate corner groups.
  root.traverse(object => {
    if (!(object instanceof Mesh) || !belongsToWheel(object)) return;
    const bounds = new Box3().setFromObject(object);
    if (bounds.isEmpty()) return;
    const position = bounds.getCenter(new Vector3());
    const corner: WheelCorner = position.z >= center.z
      ? position.x < center.x ? "fl" : "fr"
      : position.x < center.x ? "rl" : "rr";
    const slots = Array.isArray(object.material) ? object.material : [object.material];
    buckets.get(corner)!.push({ object, world: object.matrixWorld.clone(), bounds,
      tire: slots.some(material => /tire|tyre|rim/i.test(material.name)) });
  });
  const wheelAssemblies = SUPRA_WHEEL_CORNERS.map((corner): WheelVisualAssembly | null => {
    const parts = buckets.get(corner)!;
    if (!parts.length) return null;
    const rollingParts = parts.filter(part => part.tire);
    const referenceParts = rollingParts.length ? rollingParts : parts;
    const bounds = new Box3();
    for (const part of referenceParts) bounds.union(part.bounds);
    const carrier = new Group(); carrier.name = `SUPRA_${corner.toUpperCase()}_WHEEL`;
    carrier.position.copy(bounds.getCenter(new Vector3()));
    const spinner = new Group(); spinner.name = `${corner.toUpperCase()}_SPINNER`; carrier.add(spinner);
    carrier.updateWorldMatrix(true, true);
    const inverse = carrier.matrixWorld.clone().invert();
    // Keep each fragment's full authored matrix, including mirrored scales and
    // inherited rotations. Reparenting collections must not flatten their geometry.
    for (const part of parts) {
      part.object.removeFromParent();
      const parent = isBrakeCaliperPart(part.object) ? carrier : spinner;
      parent.add(part.object);
      part.object.matrix.copy(inverse).multiply(part.world);
      part.object.matrix.decompose(part.object.position, part.object.quaternion, part.object.scale);
      part.object.matrixAutoUpdate = false;
      part.object.matrixWorldNeedsUpdate = true;
    }
    // The largest rolling fragment supplies the imported axle direction. Choose
    // positive model X so opposite sides share the backend's wheel-speed convention.
    const reference = [...referenceParts].sort((a, b) => b.bounds.getSize(new Vector3()).lengthSq() - a.bounds.getSize(new Vector3()).lengthSq())[0];
    const rotation = new Quaternion(); reference.world.decompose(new Vector3(), rotation, new Vector3());
    const axleAxis = positiveAxle.clone().applyQuaternion(rotation).normalize();
    if (axleAxis.dot(positiveAxle) < 0) axleAxis.negate();
    return { carrier, spinner, restRotation: new Quaternion(), axleAxis };
  });
  return { ...prepared, vehicleVisualRoot: root, wheelAssemblies };
}
