import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

export function wardrobeCoverageSurface(geometry: BufferGeometry) {
  const index = geometry.getIndex();
  if (!index) return;
  const { start, count } = geometry.drawRange;
  const indices = index.array.slice(start, Math.min(start + count, index.count));
  if (!indices.length) return;
  return new MeshBVH(new BufferGeometry().setAttribute("position", geometry.getAttribute("position"))
    .setIndex(new BufferAttribute(indices, 1)));
}

export function prepareWardrobeCoverage(surfaces: readonly MeshBVH[]) {
  const ray = new Ray();
  const normal = new Vector3(), edge = new Vector3();

  function covered(center: Vector3, corner?: Vector3) {
    ray.origin.copy(center);
    if (corner) ray.origin.lerp(corner, .8);
    ray.origin.addScaledVector(normal, -.012);
    return surfaces.some(surface => surface.raycastFirst(ray, DoubleSide, 0, .052));
  }

  return (center: Vector3, a: Vector3, b: Vector3, c: Vector3, checkEdges: boolean) => {
    normal.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
    ray.direction.copy(normal);
    return covered(center) && (!checkEdges || (covered(center, a) && covered(center, b) && covered(center, c)));
  };
}
