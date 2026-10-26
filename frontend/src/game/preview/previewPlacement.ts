import { Box3, Mesh, Vector3, type Object3D } from "three";

function supportPart(object: Object3D) {
  for (let part: Object3D | null = object; part; part = part.parent) {
    const name = String(part.userData.name ?? part.name).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (name === "tracks" || /^(?:wheel(?:fl|fr|rl|rr)|(?:fl|fr|rl|rr)(?:wheel|tire))\d*$/.test(name)
      || /^(?:calliper|caliper)(?:front|rear)[lr]\d*$/.test(name)) return true;
  }
  if (object instanceof Mesh) {
    const slots = Array.isArray(object.material) ? object.material : [object.material];
    return slots.some(material => /(?:tire|tyre)/i.test(material.name));
  }
  return false;
}

// Precise vertex bounds avoid the oversized transformed accessor boxes of
// rotated wheels. Ground the tires/tracks, not hidden helpers or body trim.
export function measurePreviewGrounding(root: Object3D): { position: [number, number, number]; footprint: [number, number] } {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3(), contact = new Box3();
  root.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    const slots = Array.isArray(object.material) ? object.material : [object.material];
    if (!slots.some(material => material.visible && material.opacity > 0)) return;
    const box = new Box3().setFromObject(object, true);
    bounds.union(box);
    if (supportPart(object)) contact.union(box);
  });
  if (bounds.isEmpty()) return { position: [0, 0, 0], footprint: [2, 4] };
  const support = contact.isEmpty() ? bounds : contact;
  const center = support.getCenter(new Vector3()), size = support.getSize(new Vector3());
  return { position: [-center.x, -support.min.y, -center.z], footprint: [Math.max(0.5, size.x), Math.max(0.5, size.z)] };
}

export function previewPlacement(root: Object3D): [number, number, number] { return measurePreviewGrounding(root).position; }
