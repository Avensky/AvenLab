import { DoubleSide, MathUtils, Ray, SkinnedMesh, type BufferGeometry, type Object3D } from "three";
import { angularStep, centerZ, columns, createGarmentProfiler, type GarmentProfiler, meridian, profile, sample, step, top } from "./skirtWaistProfile";
import { wardrobeCoverageSurface } from "./wardrobeCoverage";
import { wardrobeCoverageUnion } from "./wardrobeCoverageUnion";
import { warpWardrobeGeometry } from "./warpWardrobeGeometry";
import { wardrobeFitCache } from "./wardrobeFitCache";

const corsetTuckFit = {};

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
function seatHem(parts: readonly SkinnedMesh[], skirts: readonly SkinnedMesh[], skin: Float32Array, measure: GarmentProfiler, followFolds: boolean, body: BufferGeometry) {
  const skirt = measure(skirts);
  if (!skirt.found) return;
  const surfaces = followFolds ? wardrobeCoverageUnion(skirts.map(mesh => mesh.geometry)) : [];
  const highestRim = Math.max(...skirt.upper);
  // High-waist styles reach the cups. Their smooth seam transition can extend
  // above the ordinary profile; retain the real skin floor across that boundary.
  const upperBody = followFolds && highestRim > top - .025 ? wardrobeCoverageSurface(body) : undefined;
  const fitTop = upperBody ? Math.max(top, highestRim + .040) : top;
  const ray = new Ray();
  const turnCos = Math.cos(angularStep), turnSin = Math.sin(angularStep);
  const exactRadius = (x: number, depth: number, y: number) => {
    const reach = .28;
    ray.origin.set(reach * x, y, centerZ + reach * depth);
    ray.direction.set(-x, 0, -depth);
    let distance = reach;
    for (const surface of surfaces) {
      const hit = surface.raycastFirst(ray, DoubleSide, 0, distance);
      if (hit) distance = hit.distance;
    }
    return distance < reach ? reach - distance : Infinity;
  };
  try {
    return fitParts(parts, warpWardrobeGeometry((x, y, z, point) => {
      point.set(x, y, z);
      if (y >= fitTop) return point;
      const depth = z - centerZ, radius = Math.hypot(x, depth);
      if (!radius) return point;
      const angle = MathUtils.euclideanModulo(Math.atan2(depth, x) / angularStep, columns);
      const crest = meridian(angle, skirt.upper);
      const blend = 1 - MathUtils.smoothstep(y, crest + .006, crest + .040);
      if (!blend) return point;
      // Radial samples can bridge a narrow valley between pleats. Follow the
      // actual Gothic cloth here so a tucked tip stays inside that fold.
      let band = sample(angle, y, skirt.radius);
      if (surfaces.length) {
        const dx = x / radius, dz = depth / radius;
        band = Math.min(band, exactRadius(dx, dz, y));
        // The tucked tip and skirt can follow different spine joints. Leave
        // room for a nearby fold as they move, fading out at the visible seam.
        const hidden = 1 - MathUtils.smoothstep(y, crest - .025, crest - .005);
        if (hidden) {
          const nearby = Math.min(band,
            exactRadius(dx * turnCos - dz * turnSin, dx * turnSin + dz * turnCos, y),
            exactRadius(dx * turnCos + dz * turnSin, dz * turnCos - dx * turnSin, y),
            exactRadius(dx, dz, y - 2 * step), exactRadius(dx, dz, y + 2 * step));
          band = MathUtils.lerp(band, nearby, hidden);
        }
      }
      // Compress relief progressively under the fabric. At the visible seam
      // retain the contour of the body as the tucked panel comes back into view.
      let bodyRadius = sample(angle, y, skin);
      const upperBlend = upperBody ? MathUtils.smoothstep(y, top - step, top) : 0;
      if (upperBody && upperBlend) {
        ray.origin.set(0, y, centerZ);
        ray.direction.set(x / radius, 0, depth / radius);
        const hit = upperBody.raycastFirst(ray, DoubleSide, 0, .28);
        if (hit) bodyRadius = MathUtils.lerp(bodyRadius, hit.distance, upperBlend);
      }
      const seam = MathUtils.smoothstep(y, crest - .006, crest + .006);
      // Tall bands cover broad corset triangles. Give their hidden corners a
      // little more room to interpolate inside the rim, retaining the skin floor.
      const inset = .009 + (upperBody ? .002 * (1 - seam) : 0);
      const limit = Math.max(band - inset, bodyRadius + .001);
      if (radius <= limit) return point;
      const excess = radius - limit;
      // A broad corset triangle can cross the rim between its seated vertices.
      // Keep less relief under Gothic cloth, recovering above the visible seam.
      const relief = followFolds ? MathUtils.lerp(.001, .002, seam) : .002;
      const compression = excess - relief * (1 - Math.exp(-excess / relief));
      const scale = 1 - blend * compression / radius;
      return point.set(x * scale, y, centerZ + depth * scale);
    }, undefined, { reuseExactPositions: followFolds }));
  } finally {
    for (const surface of surfaces) surface.geometry.dispose();
    upperBody?.geometry.dispose();
  }
}

export function prepareSkirtCorsetFit(
  root: Object3D, fabric: readonly SkinnedMesh[], body: BufferGeometry, extend: boolean,
) {
  if (!fabric.length) return;
  const parts = tuckedParts(root);
  if (!parts.length) return;
  const sources = parts.map(part => part.geometry);
  const fitted = wardrobeFitCache.fit(corsetTuckFit, String(extend), sources, [...fabric.map(mesh => mesh.geometry), body], () => {
    const measure = createGarmentProfiler();
    const skin = profile([body], true).radius;
    let restoreHem: ReturnType<typeof extendHem>, restoreTuck: ReturnType<typeof seatHem>;
    try {
      restoreHem = extend ? extendHem(parts, fabric, skin, measure) : undefined;
      // Keep the accepted fit and clone its final result before releasing the
      // temporary extended/tucked geometries. Each model owns its final clone.
      restoreTuck = seatHem(parts, fabric, skin, measure, extend, body);
      return parts.map((part, i) => part.geometry === sources[i] ? undefined : part.geometry.clone());
    } finally { restoreTuck?.(); restoreHem?.(); }
  });
  for (let i = 0; i < parts.length; i++) if (fitted[i]) parts[i].geometry = fitted[i]!;
  return {
    dispose() {
      for (let i = 0; i < parts.length; i++) {
        parts[i].geometry = sources[i];
        fitted[i]?.dispose();
      }
    },
  };
}
