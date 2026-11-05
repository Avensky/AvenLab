import outlines from "./outlines.json" with { type: "json" };
import type { LayoutObject } from "../document/layoutDocument.ts";
import { kitAsset } from "./catalog.ts";

const roadOutlines: Record<string, number[][]> = outlines;

export function kitOutline(item: LayoutObject) {
  const asset = kitAsset(item.piece),
    ring = roadOutlines[item.piece];
  if (!asset || !ring) return undefined;
  return ring.map(([x, z]) => [
    (x * item.size[0]) / asset.size[0],
    (z * item.size[2]) / asset.size[2],
  ]);
}

/** The pointer has already been transformed to the piece's local X/Z frame. */
export function insideOutline(x: number, z: number, ring: number[][]) {
  let inside = false;
  for (let a = ring.length - 1, b = 0; b < ring.length; a = b++) {
    const [ax, az] = ring[a],
      [bx, bz] = ring[b];
    if (az > z !== bz > z && x < ax + ((bx - ax) * (z - az)) / (bz - az))
      inside = !inside;
  }
  return inside;
}
