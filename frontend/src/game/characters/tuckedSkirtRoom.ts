import { MathUtils, type SkinnedMesh } from "three";
import { angularStep, bottom, centerZ, columns, type GarmentProfiler, rows, sample, step, top } from "./skirtWaistProfile";
import { warpWardrobeGeometry } from "./warpWardrobeGeometry";

/** Give the waistband room for the selected corset while retaining the authored flare. */
export function prepareTuckedSkirtRoom(skirtParts: readonly SkinnedMesh[], tucked: readonly SkinnedMesh[], measure: GarmentProfiler, strideEase: number) {
  const outer = skirtParts.filter(mesh => mesh.userData.wardrobeRole !== "shorts");
  const cloth = outer.filter(mesh => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some(m => m.visible && !m.transparent && m.opacity >= .99 && !m.alphaTest
      && !/hardware|buckle|button|eyelet|metal/i.test(m.userData.tintChannel ?? m.userData.color_slot ?? m.name));
  });
  const corset = tucked.filter(part => part.visible);
  if (!cloth.length || !corset.length) return;
  const band = measure(cloth);
  const shell = measure(corset);
  if (!band.found || !shell.found) return;
  const room = new Float32Array(rows * columns);
  for (let row = 0; row < rows; row++) {
    const y = bottom + row * step;
    for (let col = 0; col < columns; col++) {
      // The High Collar has a rigid hip panel. On short skirts the waistband
      // can cross its hem as the pelvis rolls through a stride.
      if (y < Math.max(band.lower[col], shell.lower[col] - strideEase) - step / 2
        || y > Math.min(band.upper[col], shell.upper[col]) + step / 2) continue;
      const i = row * columns + col;
      room[i] = MathUtils.clamp(shell.radius[i] + .005 + strideEase - band.radius[i], 0, .028 + strideEase);
    }
  }
  if (!room.some(Boolean)) return;
  // Share the allowance across neighboring stitches. Extending the measured
  // field just above the last intersection also moves the piping with the rim.
  const smooth = new Float32Array(room.length);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let extra = room[row * columns + col];
      for (let dr = -3; dr <= 3; dr++) {
        const r = row + dr;
        if (r < 0 || r >= rows) continue;
        for (let dc = -2; dc <= 2; dc++) {
          const c = (columns + col + dc) % columns;
          const falloff = Math.abs(dr) * .22 + Math.abs(dc) * .26;
          extra = Math.max(extra, room[r * columns + c] * (1 - falloff));
        }
      }
      smooth[row * columns + col] = extra;
    }
  }
  const warp = warpWardrobeGeometry((x, y, z, point) => {
    point.set(x, y, z);
    if (y <= bottom - .025 || y > top) return point;
    const depth = z - centerZ, radius = Math.hypot(x, depth);
    if (!radius) return point;
    const angle = MathUtils.euclideanModulo(Math.atan2(depth, x) / angularStep, columns);
    const extra = sample(angle, y, smooth) * MathUtils.smoothstep(y, bottom - .025, bottom);
    if (!extra) return point;
    const scale = 1 + extra / radius;
    return point.set(x * scale, y, centerZ + depth * scale);
  });
  const fitted = outer.flatMap(mesh => {
    const original = mesh.geometry, geometry = warp(original);
    return geometry ? [{ mesh, original, geometry }] : [];
  });
  if (!fitted.length) return;
  return {
    apply(active: boolean) {
      for (const { mesh, original, geometry } of fitted) mesh.geometry = active ? geometry : original;
    },
    dispose() {
      for (const { mesh, original, geometry } of fitted) {
        mesh.geometry = original;
        geometry.dispose();
      }
    },
  };
}
