import { Box3, BufferAttribute, BufferGeometry, Ray, Vector3, type Triangle } from "three";
import { MeshBVH } from "three-mesh-bvh";

export function wardrobeCoverageSurface(geometry: BufferGeometry, height?: readonly [number, number]) {
  const index = geometry.getIndex();
  if (!index) return;
  const { start, count } = geometry.drawRange;
  const end = Math.min(start + count, index.count);
  const position = geometry.getAttribute("position");
  let indices = index.array.slice(start, end);
  if (height) {
    let kept = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i + 1], c = indices[i + 2];
      const ay = position.getY(a), by = position.getY(b), cy = position.getY(c);
      if (Math.min(ay, by, cy) > height[1] || Math.max(ay, by, cy) < height[0]) continue;
      indices[kept++] = a;
      indices[kept++] = b;
      indices[kept++] = c;
    }
    indices = indices.subarray(0, kept);
  }
  if (!indices.length) return;
  return new MeshBVH(new BufferGeometry().setAttribute("position", position)
    .setIndex(new BufferAttribute(indices, 1)));
}

export function prepareWardrobeCoverage(surfaces: readonly MeshBVH[], minimumClearance = -.012, cornerSample = .8) {
  if (!surfaces.length) return () => false;
  const ray = new Ray();
  const normal = new Vector3(), edge = new Vector3();
  const near = .012 + minimumClearance;
  const far = .052;
  const search = new Box3(), end = new Vector3();
  const bounded = surfaces.map(surface => ({ surface, bounds: surface.getBoundingBox(new Box3()).expandByScalar(1e-6) }));
  const hit = new Vector3();
  // Coverage needs one double-sided hit within the sample distance.
  const intersects = {
    intersectsBounds: (bounds: Box3) => search.intersectsBox(bounds) && ray.intersectsBox(bounds),
    intersectsTriangle({ a, b, c }: Triangle) {
      if (!ray.intersectTriangle(a, b, c, false, hit)) return false;
      const distance = ray.origin.distanceTo(hit);
      return distance >= near && distance <= far;
    },
  };

  function covered(center: Vector3, corner?: Vector3) {
    ray.origin.copy(center);
    if (corner) ray.origin.lerp(corner, cornerSample);
    ray.origin.addScaledVector(normal, -.012);
    ray.at(far, end);
    search.min.copy(ray.origin).min(end);
    search.max.copy(ray.origin).max(end);
    for (const { surface, bounds } of bounded) {
      if (search.intersectsBox(bounds) && surface.shapecast(intersects)) return true;
    }
    return false;
  }

  return (center: Vector3, a: Vector3, b: Vector3, c: Vector3, checkEdges: boolean) => {
    normal.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
    ray.direction.copy(normal);
    return covered(center) && (!checkEdges || (covered(center, a) && covered(center, b) && covered(center, c)));
  };
}
