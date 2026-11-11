import { MathUtils, SkinnedMesh, Vector3, type BufferGeometry, type Object3D } from "three";
import { fitWardrobeSurface } from "./wardrobeSurface";

/** Shape the raised vest front and shoulder straps on the same surface so they move together. */
export function fitUnderbustVest(root: Object3D, body: BufferGeometry) {
  const geometry = fitWardrobeSurface(body, [
    point => {
      const across = Math.abs(point.x);
      const neckline = 1.295 + .010 * MathUtils.smoothstep(across, .029, .087);
      const front = Math.min(point.y - 1.215, point.z - .046, .129 - across, neckline - point.y);
      const shoulder = .110 + .023 * MathUtils.smoothstep(point.y, 1.337, 1.406);
      const backJoin = MathUtils.lerp(.018, -.065, MathUtils.smoothstep(point.y, 1.345, 1.40));
      const shoulderEase = .004 * MathUtils.smoothstep(point.y, 1.321, 1.346)
        * (1 - MathUtils.smoothstep(point.y, 1.349, 1.369));
      const strap = Math.min(point.y - 1.271, point.z - backJoin, .018 + shoulderEase - Math.abs(across - shoulder));
      return Math.max(front, strap);
    },
  ], point => .002 + .0055 * MathUtils.smoothstep(point.y, 1.222, 1.254));
  if (!geometry) return;

  const cropped: { mesh: SkinnedMesh; source: BufferGeometry; fitted: BufferGeometry }[] = [];
  const center = new Vector3(), vertex = new Vector3();
  for (const fit of ["TUCKED", "OVER"]) {
    root.getObjectByName(`CLOTH_CORSET_${fit}`)?.traverse(mesh => {
      if (!(mesh instanceof SkinnedMesh)) return;
      const source = mesh.geometry, index = source.getIndex(), position = source.getAttribute("position");
      if (!index || !position) return;
      const kept: number[] = [];
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        center.fromBufferAttribute(position, a)
          .add(vertex.fromBufferAttribute(position, b))
          .add(vertex.fromBufferAttribute(position, c)).multiplyScalar(1 / 3);
        const across = Math.abs(center.x);
        const oldFrontStrap = center.z > -.026 && center.y > 1.281 && across > .093;
        const oldShoulderTip = center.z > -.061 && center.y > 1.369 && across > .147;
        const oldCenterTip = center.z > .112 && center.y > 1.260 && across < .024;
        if (!oldFrontStrap && !oldShoulderTip && !oldCenterTip) kept.push(a, b, c);
      }
      if (kept.length === index.count) return;
      const fitted = source.clone();
      fitted.setIndex(kept);
      fitted.setDrawRange(0, kept.length);
      mesh.geometry = fitted;
      cropped.push({ mesh, source, fitted });
    });
  }
  return { geometry, disposeShell: () => {
    for (const { mesh, source, fitted } of cropped) {
      mesh.geometry = source;
      fitted.dispose();
    }
  } };
}
