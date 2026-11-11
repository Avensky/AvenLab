import { MathUtils, SkinnedMesh, Vector3, type BufferGeometry, type Object3D } from "three";
import { fitWardrobeSurface } from "./wardrobeSurface";

/** Trace simple ribbons along the shoulder surface, with each end inside the bodice seam. */
export function fitLacedBodiceStraps(root: Object3D, body: BufferGeometry) {
  const geometry = fitWardrobeSurface(body, [
    point => point.y - MathUtils.lerp(1.267, 1.279, MathUtils.smoothstep(point.z, -.035, .055)),
    point => {
      const front = MathUtils.smoothstep(point.z, -.04, .055);
      const rear = .111 + .014 * MathUtils.smoothstep(point.y, 1.364, 1.404);
      const chest = .125 - .042 * MathUtils.smoothstep(point.z, .005, .08);
      const center = MathUtils.lerp(rear, chest, front);
      const backSeam = (1 - front) * (1 - MathUtils.smoothstep(point.y, 1.295, 1.322));
      return .0155 + .008 * backSeam - Math.abs(Math.abs(point.x) - center);
    },
  ], .0045);
  if (!geometry) return;

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
