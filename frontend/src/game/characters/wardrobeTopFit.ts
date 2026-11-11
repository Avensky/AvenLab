import { BufferGeometry, MathUtils, Triangle, Vector3 } from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";

/** Ease only the Pack 7 cloth vertices that lie against the skin. */
export function prepareWardrobeTopFit(body: BufferGeometry, id: string) {
  const position = body.getAttribute("position"), normal = body.getAttribute("normal"), index = body.getIndex();
  if (!position || !normal || !index) return;

  const contact = .010;
  const shoulderFit = id === "top-02" || id === "top-03";
  const surfaceGeometry = new BufferGeometry().setAttribute("position", position).setIndex(index.clone());
  const surface = new MeshBVH(surfaceGeometry);
  const triangles = surfaceGeometry.getIndex()!;
  const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const point = new Vector3(), triangle = new Triangle(), bary = new Vector3();
  const direction = new Vector3(), scratch = new Vector3();

  return (source: BufferGeometry) => {
    const cloth = source.getAttribute("position");
    if (!cloth) return;
    let fitted: BufferGeometry | undefined;
    for (let vertex = 0; vertex < cloth.count; vertex++) {
      point.fromBufferAttribute(cloth, vertex);
      if (!surface.closestPointToPoint(point, hit, 0, contact) || hit.distance >= contact) continue;
      const a = triangles.getX(hit.faceIndex * 3), b = triangles.getX(hit.faceIndex * 3 + 1), c = triangles.getX(hit.faceIndex * 3 + 2);
      triangle.setFromAttributeAndIndices(position, a, b, c);
      if (!triangle.getBarycoord(hit.point, bary)) continue;
      direction.set(0, 0, 0).addScaledVector(scratch.fromBufferAttribute(normal, a), bary.x)
        .addScaledVector(scratch.fromBufferAttribute(normal, b), bary.y)
        .addScaledVector(scratch.fromBufferAttribute(normal, c), bary.z).normalize();
      const gap = scratch.copy(point).sub(hit.point).dot(direction);
      const across = Math.abs(point.x);
      // These two armholes cross the shoulder crease when the arm lifts.
      const shoulder = shoulderFit ? MathUtils.smoothstep(across, .095, .111) * (1 - MathUtils.smoothstep(across, .137, .157))
        * MathUtils.smoothstep(point.y, 1.344, 1.375) * (1 - MathUtils.smoothstep(point.y, 1.411, 1.440)) : 0;
      const ease = MathUtils.clamp(.002 - .0013 * shoulder - gap, -.004 * shoulder, .004);
      if (!ease) continue;

      fitted ??= source.clone();
      point.addScaledVector(direction, ease);
      fitted.getAttribute("position").setXYZ(vertex, point.x, point.y, point.z);
    }
    if (fitted) {
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
    }
    return fitted;
  };
}
