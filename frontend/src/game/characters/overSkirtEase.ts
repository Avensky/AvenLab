import { MathUtils, SkinnedMesh, Vector3, type BufferGeometry, type Object3D } from "three";

export type OverSkirtEase = 0 | 1 | 2;

const hemClearance = [0, .012, .024] as const;
const easeStart = 1.08;
const easeEnd = 1.17;
const torsoDepth = .025;

/** Flare the authored Over hem in the actor's bind space, including its trim. */
export function prepareOverSkirtEase(root: Object3D) {
  const meshes: { mesh: SkinnedMesh; source: BufferGeometry; fitted: Partial<Record<1 | 2, BufferGeometry>> }[] = [];
  for (const name of ["CLOTH_CORSET_OVER", "CLOTH_CORSET_WAIST_OVER"]) {
    root.getObjectByName(name)?.traverse(mesh => {
      if (mesh instanceof SkinnedMesh && mesh.geometry.hasAttribute("position")) {
        meshes.push({ mesh, source: mesh.geometry, fitted: {} });
      }
    });
  }
  const normal = new Vector3();
  let current: OverSkirtEase = 0;
  return {
    apply(ease: OverSkirtEase) {
      if (ease === current) return;
      current = ease;
      for (const part of meshes) {
        const { mesh, source } = part;
        if (!ease) {
          mesh.geometry = source;
          continue;
        }
        const fitted = part.fitted[ease] ??= flare(source, hemClearance[ease], normal);
        const sourceIndex = source.getIndex(), fittedIndex = fitted.getIndex();
        if (sourceIndex && fittedIndex) {
          fittedIndex.array.set(sourceIndex.array);
          fittedIndex.needsUpdate = true;
        }
        fitted.setDrawRange(source.drawRange.start, source.drawRange.count);
        mesh.geometry = fitted;
      }
    },
    dispose() {
      for (const { mesh, source, fitted } of meshes) {
        mesh.geometry = source;
        for (const geometry of Object.values(fitted)) geometry.dispose();
      }
    },
  };
}

function flare(source: BufferGeometry, clearance: number, normal: Vector3) {
  const geometry = source.clone();
  const position = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
  for (let vertex = 0; vertex < position.count; vertex++) {
    const y = position.getY(vertex);
    if (y >= easeEnd) continue;
    const x = position.getX(vertex), z = position.getZ(vertex) - torsoDepth;
    const radius = Math.hypot(x, z);
    if (!radius) continue;
    const progress = MathUtils.clamp((y - easeStart) / (easeEnd - easeStart), 0, 1);
    const delta = clearance * (1 - progress * progress * (3 - 2 * progress));
    const scale = 1 + delta / radius;
    position.setXYZ(vertex, x * scale, y, z * scale + torsoDepth);
    if (!normals) continue;
    // The flare scales the tangent around the torso and slopes toward
    // the waist. Transform normals with the inverse of that shaping.
    normal.fromBufferAttribute(normals, vertex);
    const ux = x / radius, uz = z / radius;
    const radialNormal = normal.x * ux + normal.z * uz;
    const slope = -6 * clearance * progress * (1 - progress) / (easeEnd - easeStart);
    normal.set(
      ux * radialNormal + (normal.x - ux * radialNormal) / scale,
      normal.y - slope * radialNormal,
      uz * radialNormal + (normal.z - uz * radialNormal) / scale,
    ).normalize();
    normals.setXYZ(vertex, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
