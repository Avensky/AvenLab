import { DoubleSide, MathUtils, Ray, type BufferGeometry, type SkinnedMesh } from "three";
import type { MeshBVH } from "three-mesh-bvh";
import { wardrobeCoverageSurface } from "./wardrobeCoverage";
import { warpWardrobeGeometry } from "./warpWardrobeGeometry";
import { wardrobeFitCache } from "./wardrobeFitCache";

type CoveredSkirtLayerOptions = {
  lower: readonly [number, number]; upper: readonly [number, number];
  clearance?: number; maxInset?: number; skinClearance?: number;
  selected?: ArrayLike<number>;
};

/** Seat a covered inner panel without moving its outer shell or exposed edges. */
export function seatCoveredSkirtLayer(source: BufferGeometry, shell: BufferGeometry, body: MeshBVH, options: CoveredSkirtLayerOptions) {
  const { lower, upper, clearance = .003, maxInset = .012 } = options;
  const skinClearance = Math.max(.002, options.skinClearance ?? .002);
  const outer = wardrobeCoverageSurface(shell, [lower[0], upper[1]]);
  if (!outer) return;
  const ray = new Ray();
  const turnCos = Math.cos(.065), turnSin = Math.sin(.065);
  const shellRadius = (x: number, z: number, y: number) => {
    ray.origin.set(0, y, .025);
    ray.direction.set(x, 0, z);
    return outer.raycastFirst(ray, DoubleSide, 0, .28)?.distance ?? Infinity;
  };
  try {
    return warpWardrobeGeometry((x, y, z, point) => {
      point.set(x, y, z);
      const blend = MathUtils.smoothstep(y, lower[0], lower[1]) * (1 - MathUtils.smoothstep(y, upper[0], upper[1]));
      if (!blend) return point;
      const depth = z - .025, radius = Math.hypot(x, depth);
      if (!radius) return point;
      const dx = x / radius, dz = depth / radius;
      const cloth = shellRadius(dx, dz, y);
      // The open front intentionally shows the gray layer between the buckles.
      if (!Number.isFinite(cloth)) return point;
      // A broad inner triangle can cut across a narrow outer fold between its
      // vertices. Follow the neighboring fold as well as the vertex's own ray.
      const fold = Math.min(cloth,
        shellRadius(dx * turnCos - dz * turnSin, dx * turnSin + dz * turnCos, y),
        shellRadius(dx * turnCos + dz * turnSin, dz * turnCos - dx * turnSin, y),
        shellRadius(dx, dz, y - .012), shellRadius(dx, dz, y + .012));
      ray.origin.set(.28 * dx, y, .025 + .28 * dz);
      ray.direction.set(-dx, 0, -dz);
      const skin = body.raycastFirst(ray, DoubleSide, 0, .28);
      if (!skin) return point;
      const limit = Math.max(fold - clearance, .28 - skin.distance + skinClearance);
      const inset = Math.min(maxInset, Math.max(0, radius - limit)) * blend;
      if (!inset) return point;
      const scale = 1 - inset / radius;
      return point.set(x * scale, y, .025 + depth * scale);
    }, options.selected)(source);
  } finally { outer.geometry.dispose(); }
}

const ruffledLayerFit = {};

/** Keep the Ruffled skirt's covered inner waist behind its white outer panel. */
export function seatRuffledSkirtLining(meshes: readonly SkinnedMesh[], body: MeshBVH) {
  const part = (name: string) => meshes.find(mesh => !Array.isArray(mesh.material) && mesh.material.name === name);
  const lining = part("MAT_GOTHIC_03_Trim_1"), shell = part("MAT_GOTHIC_03_Fabric_2");
  if (!lining || !shell) return;
  const [fitted] = wardrobeFitCache.fit(ruffledLayerFit, "", [lining.geometry], [shell.geometry, body.geometry], () =>
    [seatCoveredSkirtLayer(lining.geometry, shell.geometry, body, {
      lower: [.78, .82], upper: [1.06, 1.08], clearance: .007, maxInset: .040, skinClearance: .006,
    })]);
  if (fitted) lining.geometry = fitted;
  return fitted;
}
