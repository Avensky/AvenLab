import { Box3, Mesh, Vector3, type Object3D } from "three";

// Native fallback stage while the authored garage pad is loading (long X, short Z).
export const DEFAULT_PREVIEW_PLATFORM: [number, number] = [8, 5];
// Current Tank's Hull mesh, excluding the cannon, in its authored orientation.
// Keep one shared scale without downloading the Tank just to size another car.
// Re-measure this reference when replacing the tank asset.
export const PREVIEW_LINEUP_REFERENCE = { model: "tank", width: 2.76154, length: 5.590224 } as const;

function tankChassisPart(object: Object3D) {
  let chassis = false;
  for (let part: Object3D | null = object; part; part = part.parent) {
    const name = String(part.userData.name ?? part.name).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/^(?:cannon|barrel|turret)\d*$/.test(name)) return false;
    if (/^(?:hull|chassis)\d*$/.test(name)) chassis = true;
  }
  return chassis;
}

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
// Measure once before attaching the clone to a scaled/rotated display group.
export function measurePreviewBounds(root: Object3D, model?: string) {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3(), contact = new Box3(), chassis = new Box3();
  const vertex = new Vector3();
  root.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    const slots = Array.isArray(object.material) ? object.material : [object.material];
    if (!slots.some(material => material.visible && material.opacity > 0)) return;
    // Measure this mesh only. setFromObject also includes descendants, which
    // would put a child cannon back into an otherwise chassis-only box.
    const box = new Box3(), positions = object.geometry.getAttribute("position");
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      box.expandByPoint(object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld));
    }
    bounds.union(box);
    if (supportPart(object)) contact.union(box);
    if (model === "tank" && tankChassisPart(object)) chassis.union(box);
  });
  const support = contact.isEmpty() ? bounds : contact;
  // Tracks are the fallback if a future Tank export lacks a named hull.
  const centering = model === "tank" ? (chassis.isEmpty() ? support : chassis) : bounds;
  return { bounds, support, centering };
}

export function measurePreviewGrounding(root: Object3D): { position: [number, number, number]; footprint: [number, number] } {
  const { bounds, support } = measurePreviewBounds(root);
  if (bounds.isEmpty()) return { position: [0, 0, 0], footprint: [2, 4] };
  const center = support.getCenter(new Vector3()), size = support.getSize(new Vector3());
  return { position: [-center.x, -support.min.y, -center.z], footprint: [Math.max(0.5, size.x), Math.max(0.5, size.z)] };
}

export function previewPlacement(root: Object3D): [number, number, number] { return measurePreviewGrounding(root).position; }

// Fit the whole lineup using the Tank's chassis as the reference,
// accounting for the preview's 90-degree vehicle heading. All models use the
// same factor so their original relative sizes are retained.
// Keep the floor contact and its shadow separate from this visual scale.
export function fitPreviewToPlatform({ bounds, support, centering }: ReturnType<typeof measurePreviewBounds>, platform: readonly [number, number]) {
  if (bounds.isEmpty()) return { scale: 1, position: [0, 0, 0] as [number, number, number], footprint: [2, 4] as [number, number], shadowOffset: [0, 0] as [number, number] };
  const center = centering.getCenter(new Vector3());
  const contactSize = support.getSize(new Vector3()), contactCenter = support.getCenter(new Vector3());
  // Leave the 14cm safety band and a little clear space around the body.
  const length = Math.max(0.1, platform[0] - 0.4), width = Math.max(0.1, platform[1] - 0.4);
  const scale = Math.min(2, width / PREVIEW_LINEUP_REFERENCE.width, length / PREVIEW_LINEUP_REFERENCE.length);
  return {
    scale,
    position: [-center.x * scale, -support.min.y * scale, -center.z * scale] as [number, number, number],
    footprint: [Math.max(0.5, contactSize.x) * scale, Math.max(0.5, contactSize.z) * scale] as [number, number],
    shadowOffset: [(contactCenter.x - center.x) * scale, (contactCenter.z - center.z) * scale] as [number, number],
  };
}
