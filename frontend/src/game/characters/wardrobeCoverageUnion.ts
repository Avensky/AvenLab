import { BufferAttribute, BufferGeometry, type TypedArray } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { wardrobeCoverageSurface } from "./wardrobeCoverage";

// Bound the additional packed buffers and a conservative allowance for BVH
// nodes/triangle bounds. Source geometry and the ordinary fallback are separate.
export const WARDROBE_COVERAGE_UNION_MAX_BYTES = 2 * 1024 * 1024;
export const WARDROBE_COVERAGE_UNION_MAX_PARTS = 64;
// At most two nodes per triangle: 32 packed bytes and six Float32 bounds per
// construction node, plus six Float32 triangle bounds. One shared bounds scratch.
const triangleBuildBytes = 2 * (32 + 6 * 4) + 6 * 4;
type Part = { position: Float32Array; index: TypedArray; start: number; end: number };

/** One temporary index for nearest-hit queries over cloth in a common bind space.
 * It has no render materials/transforms and owns its buffers. Dispose every
 * returned surface's geometry after the synchronous query phase. Unsupported or
 * oversized inputs retain the existing per-surface path without quantization.
 */
export function wardrobeCoverageUnion(geometries: readonly BufferGeometry[]): MeshBVH[] {
  const separate = () => geometries.flatMap(geometry => wardrobeCoverageSurface(geometry) ?? []);
  if (geometries.length < 2 || geometries.length > WARDROBE_COVERAGE_UNION_MAX_PARTS) return separate();
  const parts: Part[] = [];
  let vertexCount = 0, indexCount = 0;
  for (const geometry of geometries) {
    const index = geometry.getIndex();
    if (!index) continue;
    const { start, count } = geometry.drawRange;
    const end = Math.min(start + count, index.count);
    if (end <= start) continue;
    const position = geometry.getAttribute("position");
    // Preserve raw Float32 coordinates. Other layouts may have getter conversion
    // semantics; let the existing helper read them instead of repacking them.
    if (!(position instanceof BufferAttribute) || !(position.array instanceof Float32Array)
      || position.itemSize !== 3 || position.normalized || position.count * 3 !== position.array.length
      || position.getX !== BufferAttribute.prototype.getX || position.getY !== BufferAttribute.prototype.getY
      || position.getZ !== BufferAttribute.prototype.getZ
      || index.itemSize !== 1 || index.normalized
      || !(index.array instanceof Uint8Array || index.array instanceof Uint16Array || index.array instanceof Uint32Array)
      || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end)
      || start % 3 !== 0 || (end - start) % 3 !== 0) return separate();
    vertexCount += position.count;
    indexCount += end - start;
    const bytes = 6 * 4 + vertexCount * 3 * Float32Array.BYTES_PER_ELEMENT + indexCount * Uint32Array.BYTES_PER_ELEMENT
      + indexCount / 3 * triangleBuildBytes;
    if (bytes > WARDROBE_COVERAGE_UNION_MAX_BYTES) return separate();
    for (let i = start; i < end; i++) if (index.array[i] >= position.count) return separate();
    parts.push({ position: position.array, index: index.array, start, end });
  }
  if (parts.length < 2) return separate();

  const positions = new Float32Array(vertexCount * 3), indices = new Uint32Array(indexCount);
  let vertex = 0, faceIndex = 0;
  for (const part of parts) {
    positions.set(part.position, vertex * 3);
    for (let i = part.start; i < part.end; i++) indices[faceIndex++] = part.index[i] + vertex;
    vertex += part.position.length / 3;
  }
  const geometry = new BufferGeometry().setAttribute("position", new BufferAttribute(positions, 3))
    .setIndex(new BufferAttribute(indices, 1));
  try {
    // Keep the library's default strategy: SAH added cold build cost without
    // improving the measured fitting path. Reordering touches only our index.
    return [new MeshBVH(geometry)];
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}
