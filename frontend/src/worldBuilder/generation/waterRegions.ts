import type { LayoutObject } from '../document/layoutDocument.ts';

export const isWaterRegion = (o: LayoutObject) => ['coastal-water-visual', 'excavated-water'].includes(o.piece);
/** Same yaw and footprint test used by the server's Coast water lookup. */
export function waterSurfaceAt(objects: LayoutObject[], x: number, z: number) {
  for (const o of objects) {
    if (!isWaterRegion(o)) continue;
    const a = o.yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - o.position[0], dz = z - o.position[2];
    if (Math.abs(c * dx - s * dz) <= o.size[0] / 2 && Math.abs(s * dx + c * dz) <= o.size[2] / 2)
      return o.position[1] + o.size[1];
  }
  return null;
}
