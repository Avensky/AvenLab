import { MathUtils, SkinnedMesh, type BufferGeometry, type Object3D } from "three";
import { angularStep, centerZ, columns, createGarmentProfiler, type GarmentProfiler, meridian, profile, sample, top } from "./skirtWaistProfile";
import { warpWardrobeGeometry } from "./warpWardrobeGeometry";

function tuckedParts(root: Object3D) {
  const parts: SkinnedMesh[] = [];
  const shell = root.getObjectByName("CLOTH_CORSET_TUCKED");
  if (!shell) return parts;
  // The legacy Laced Bodice has a separate inner waist facing next to the
  // shell; both follow the same hem and compression, including in motion.
  const waist = root.getObjectByName("CLOTH_CORSET_WAIST_TUCKED") ?? shell.parent?.getObjectByName("CLOTH_CORSET_WAIST_TUCKED");
  for (const garment of [shell, waist]) garment?.traverse(part => {
    if (part instanceof SkinnedMesh && part.geometry.drawRange.count > 0 && !parts.includes(part)) parts.push(part);
  });
  return parts;
}

function fitParts(parts: readonly SkinnedMesh[], warp: ReturnType<typeof warpWardrobeGeometry>) {
  const changed = parts.flatMap(mesh => {
    const source = mesh.geometry, geometry = warp(source);
    if (!geometry) return [];
    mesh.geometry = geometry;
    return [{ mesh, source, geometry }];
  });
  return () => {
    for (const { mesh, source, geometry } of changed) {
      mesh.geometry = source;
      geometry.dispose();
    }
  };
}

/** Extend only the hem that would otherwise leave a gap over the lowered skirt. */
function extendHem(parts: readonly SkinnedMesh[], skirts: readonly SkinnedMesh[], skin: Float32Array, measure: GarmentProfiler) {
  const skirt = measure(skirts);
  const hem = measure(parts);
  if (!skirt.found || !hem.found) return;
  const lower = hem.lower.map((y, i) => {
    // An open lace or eyelet may miss a ray. Use the neighboring panels to
    // locate the sewn hem in that narrow opening.
    return Math.min(y, hem.lower[(i + 1) % columns] + .003, hem.lower[(i + columns - 1) % columns] + .003);
  });
  const extension = lower.map((y, i) => MathUtils.clamp(y + .018 - skirt.upper[i], 0, .075));
  if (!extension.some(Boolean)) return;
  return fitParts(parts, warpWardrobeGeometry((x, y, z, point) => {
    point.set(x, y, z);
    if (y >= top) return point;
    const depth = z - centerZ, radius = Math.hypot(x, depth);
    if (!radius) return point;
    const angle = MathUtils.euclideanModulo(Math.atan2(depth, x) / angularStep, columns);
    const edge = meridian(angle, lower);
    const drop = meridian(angle, extension) * (1 - MathUtils.smoothstep(y, edge, edge + .067));
    if (!drop) return point;
    const scale = 1 + (sample(angle, y - drop, skin) - sample(angle, y, skin)) / radius;
    return point.set(x * scale, y - drop, centerZ + depth * scale);
  }));
}

/** Seat any remaining protruding cloth and hardware inside the fitted skirt. */
function seatHem(parts: readonly SkinnedMesh[], skirts: readonly SkinnedMesh[], skin: Float32Array, measure: GarmentProfiler) {
  const skirt = measure(skirts);
  if (!skirt.found) return;
  return fitParts(parts, warpWardrobeGeometry((x, y, z, point) => {
    point.set(x, y, z);
    if (y >= top) return point;
    const depth = z - centerZ, radius = Math.hypot(x, depth);
    if (!radius) return point;
    const angle = MathUtils.euclideanModulo(Math.atan2(depth, x) / angularStep, columns);
    const crest = meridian(angle, skirt.upper);
    const blend = 1 - MathUtils.smoothstep(y, crest + .006, crest + .040);
    if (!blend) return point;
    // Compress relief progressively under the fabric. At the visible seam
    // retain the contour of the body as the tucked panel comes back into view.
    const band = sample(angle, y, skirt.radius);
    const bodyRadius = sample(angle, y, skin);
    const limit = Math.max(band - .009, bodyRadius + .001);
    if (radius <= limit) return point;
    const excess = radius - limit;
    const compression = excess - .002 * (1 - Math.exp(-excess / .002));
    const scale = 1 - blend * compression / radius;
    return point.set(x * scale, y, centerZ + depth * scale);
  }));
}

export function prepareSkirtCorsetFit(
  root: Object3D, fabric: readonly SkinnedMesh[], body: BufferGeometry, extend: boolean,
) {
  if (!fabric.length) return;
  const parts = tuckedParts(root);
  if (!parts.length) return;
  const measure = createGarmentProfiler();
  const skin = profile([body], true).radius;
  const restoreHem = extend ? extendHem(parts, fabric, skin, measure) : undefined;
  // Fit the tucked corset to the existing waistband. Expanding the skirt here
  // makes its belt bulge and stretches the fabric whenever a corset is selected.
  const restoreTuck = seatHem(parts, fabric, skin, measure);
  return {
    dispose() {
      restoreTuck?.();
      restoreHem?.();
    },
  };
}
