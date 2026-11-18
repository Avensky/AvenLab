import { DoubleSide, MathUtils, Ray, type BufferGeometry, type SkinnedMesh } from "three";
import { wardrobeCoverageSurface } from "./wardrobeCoverage";

// Vesper's imported garments share the torso's bind space. Sample the actual
// waistband at each meridian so a pointed front and dipped back retain their cut.
export const centerZ = .025;
const reach = .28;
export const bottom = .985;
export const step = .004;
export const rows = 54;
export const top = bottom + (rows - 1) * step;
export const columns = 96;
export const angularStep = 2 * Math.PI / columns;

export function profile(parts: readonly BufferGeometry[], fromTorso = false) {
  const surfaces = parts.flatMap(geometry => wardrobeCoverageSurface(geometry, [bottom, top]) ?? []);
  const radius = new Float32Array(columns * rows);
  const lower = new Float32Array(columns).fill(top);
  const upper = new Float32Array(columns).fill(bottom);
  const ray = new Ray();
  let found = false;
  for (let col = 0; col < columns; col++) {
    const x = Math.cos(col * angularStep), z = Math.sin(col * angularStep);
    // For the donor cast from inside the torso. From the outside the arm can
    // be the first hit at waist height, producing a spike when a hem moves.
    ray.direction.set(fromTorso ? x : -x, 0, fromTorso ? z : -z);
    let last = 0, firstRow = rows;
    for (let row = 0; row < rows; row++) {
      const y = bottom + row * step;
      ray.origin.set(fromTorso ? 0 : reach * x, y, centerZ + (fromTorso ? 0 : reach * z));
      let distance = reach;
      for (const surface of surfaces) {
        const hit = surface.raycastFirst(ray, DoubleSide, 0, distance);
        if (hit) distance = hit.distance;
      }
      if (distance < reach) {
        last = fromTorso ? distance : reach - distance;
        firstRow = Math.min(firstRow, row);
        lower[col] = Math.min(lower[col], y);
        upper[col] = y;
        found = true;
      }
      // Extend the last sample past the crest, where the tuck fades back
      // into the visible corset. This also bridges small gaps in a laced rim.
      radius[row * columns + col] = last;
    }
    for (let row = 0; row < firstRow && firstRow < rows; row++) {
      radius[row * columns + col] = radius[firstRow * columns + col];
    }
  }
  for (const surface of surfaces) surface.geometry.dispose();
  return { radius, lower, upper, found };
}

/** Measurements live only for the synchronous fit. A warp swaps geometry references. */
export function createGarmentProfiler() {
  const measured: { parts: BufferGeometry[]; result: ReturnType<typeof profile> }[] = [];
  return (meshes: readonly SkinnedMesh[]) => {
    const parts = meshes.map(mesh => mesh.geometry);
    const same = measured.find(entry => entry.parts.length === parts.length && parts.every((part, i) => entry.parts[i] === part));
    if (same) return same.result;
    const result = profile(parts);
    measured.push({ parts, result });
    return result;
  };
}

export type GarmentProfiler = ReturnType<typeof createGarmentProfiler>;

export function meridian(angle: number, field: Float32Array, row = 0) {
  const col = Math.floor(angle), next = (col + 1) % columns;
  return MathUtils.lerp(field[row * columns + col], field[row * columns + next], angle - col);
}

export function sample(angle: number, height: number, field: Float32Array) {
  const t = MathUtils.clamp((height - bottom) / step, 0, rows - 1);
  const row = Math.min(Math.floor(t), rows - 2);
  return MathUtils.lerp(meridian(angle, field, row), meridian(angle, field, row + 1), t - row);
}
