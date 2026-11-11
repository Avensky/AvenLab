import { MathUtils, SkinnedMesh, Vector3, type BufferGeometry, type Object3D } from "three";
import type { MeshBVH } from "three-mesh-bvh";
import { prepareWardrobeCoverage, wardrobeCoverageSurface } from "./wardrobeCoverage";
import { fitWardrobeSurface } from "./wardrobeSurface";

/** Fit a continuous upper bodice from the shoulder to the front armhole. */
export function fitLacedBodiceStraps(root: Object3D, body: BufferGeometry) {
  const geometry = fitWardrobeSurface(body, [
    point => {
      const front = MathUtils.smoothstep(point.z, -.035, .055);
      const side = MathUtils.smoothstep(Math.abs(point.x), .094, .133);
      return point.y - MathUtils.lerp(1.267, 1.279 - .025 * side, front);
    },
    point => {
      const side = Math.abs(point.x);
      const front = MathUtils.smoothstep(point.z, -.04, .055);
      const rear = .111 + .014 * MathUtils.smoothstep(point.y, 1.364, 1.404);
      const chest = .125 - .042 * MathUtils.smoothstep(point.z, .005, .08);
      const center = MathUtils.lerp(rear, chest, front);
      const backSeam = (1 - front) * (1 - MathUtils.smoothstep(point.y, 1.295, 1.322));
      const halfWidth = .0155 + .008 * backSeam;
      const armhole = front * (1 - MathUtils.smoothstep(point.y, 1.315, 1.399));
      const neckline = center - halfWidth - .006 * front - .007 * armhole;
      const outerEdge = center + halfWidth + .010 * front + .043 * armhole;
      return Math.min(side - neckline, outerEdge - side);
    },
  ], .0045);
  if (!geometry) return;
  root.userData.lacedBodiceStraps = true;

  const cropped: { mesh: SkinnedMesh; source: BufferGeometry; owned: BufferGeometry }[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (const name of ["CLOTH_CORSET_TUCKED", "CLOTH_CORSET_OVER"]) {
    root.getObjectByName(name)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material)) return;
      const source = mesh.geometry, index = source.getIndex(), positions = source.getAttribute("position");
      if (!index || !positions) return;
      const fabric = mesh.material.userData.color_slot === "fabric";
      const kept: number[] = [];
      for (let i = 0; i < index.count; i += 3) {
        const first = index.getX(i), second = index.getX(i + 1), third = index.getX(i + 2);
        a.fromBufferAttribute(positions, first);
        b.fromBufferAttribute(positions, second);
        c.fromBufferAttribute(positions, third);
        a.add(b).add(c).multiplyScalar(1 / 3);
        const join = MathUtils.lerp(1.289, 1.306, MathUtils.smoothstep(a.z, -.04, .055));
        // The lacing ends below the old tabs. Keep the original cup and waist vertices intact.
        const upperStrap = fabric ? a.y > 1.319 || (a.y > join && Math.abs(a.x) > .072) : a.y > 1.298;
        if (!upperStrap) kept.push(first, second, third);
      }
      if (kept.length === index.count) return;
      const owned = source.clone();
      owned.setIndex(kept);
      owned.setDrawRange(0, kept.length);
      mesh.geometry = owned;
      cropped.push({ mesh, source, owned });
    });
  }
  return { geometry, disposeShell: () => {
    for (const { mesh, source, owned } of cropped) {
      mesh.geometry = source;
      owned.dispose();
    }
  } };
}

export function prepareLacedShoulderMask(root: Object3D, waist: "tucked" | "over") {
  if (!root.userData.lacedBodiceStraps) return;
  const surfaces: MeshBVH[] = [];
  for (const name of [`CLOTH_CORSET_${waist.toUpperCase()}`, "CLOTH_CORSET_FACING"]) {
    root.getObjectByName(name)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh) || Array.isArray(mesh.material) || mesh.material.transparent
        || mesh.material.userData.color_slot === "hardware") return;
      const surface = wardrobeCoverageSurface(mesh.geometry);
      if (surface) surfaces.push(surface);
    });
  }
  if (!surfaces.length) return;
  const covered = prepareWardrobeCoverage(surfaces);
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), center = new Vector3();
  return {
    retainsFace(position: ReturnType<BufferGeometry["getAttribute"]>, first: number, second: number, third: number) {
      a.fromBufferAttribute(position, first);
      b.fromBufferAttribute(position, second);
      c.fromBufferAttribute(position, third);
      center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      const side = Math.abs(center.x);
      // Restore skin at the neckline and armhole wherever the refitted fabric leaves it exposed.
      return center.y > 1.267 && side > .058 && side < .19 && !covered(center, a, b, c, true);
    },
    dispose() { for (const { geometry } of surfaces) geometry.dispose(); },
  };
}
