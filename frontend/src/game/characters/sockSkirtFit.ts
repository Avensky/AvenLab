import { BufferAttribute, DoubleSide, MathUtils, Ray, type BufferGeometry } from "three";
import type { MeshBVH } from "three-mesh-bvh";

const depth = .025;
const bottom = .14;
const step = .015;
const directions = 36;
const angleStep = 2 * Math.PI / directions;
const sectionCount = 49;
const hemRoom = .012;

/** Keep the sock cuff wherever a slit or the hem can expose it. */
export function prepareSockSkirtFit(skirt: readonly MeshBVH[]) {
  if (!skirt.length) return;
  const ray = new Ray();
  const coverage = Array.from({ length: sectionCount }, (_, row) => {
    ray.origin.set(0, bottom + step * row, depth);
    return Array.from({ length: directions }, (_, column) => {
      const angle = column * angleStep;
      ray.direction.set(Math.cos(angle), 0, Math.sin(angle));
      return skirt.some(surface => surface.raycastFirst(ray, DoubleSide, .065, .48));
    });
  });

  return (source: BufferGeometry) => {
    const position = source.getAttribute("position"), index = source.getIndex();
    if (!index) return;
    const covered = new Uint8Array(position.count);
    for (let vertex = 0; vertex < position.count; vertex++) {
      const y = position.getY(vertex);
      const row = Math.floor((y - hemRoom - bottom) / step);
      const lastRow = Math.ceil((y - bottom) / step);
      if (row < 0 || lastRow >= sectionCount) continue;
      const angle = Math.atan2(position.getZ(vertex) - depth, position.getX(vertex));
      const column = Math.floor(MathUtils.euclideanModulo(angle / angleStep, directions));
      let enclosed = true;
      // Preserve triangles near the side of a slit as well as below the hem.
      for (let sample = row; sample <= lastRow && enclosed; sample++) {
        for (let offset = -1; offset <= 2 && enclosed; offset++) {
          enclosed = coverage[sample][(column + offset + directions) % directions];
        }
      }
      covered[vertex] = Number(enclosed);
    }
    const { start, count } = source.drawRange;
    const end = Math.min(start + count, index.count);
    const kept: number[] = [];
    for (let i = start; i < end; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      if (!(covered[a] && covered[b] && covered[c])) kept.push(a, b, c);
    }
    if (kept.length === end - start) return;
    const fitted = source.clone();
    fitted.setIndex(new BufferAttribute(Uint32Array.from(kept), 1));
    fitted.setDrawRange(0, kept.length);
    return fitted;
  };
}
