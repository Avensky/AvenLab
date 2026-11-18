import { DoubleSide, MathUtils, Ray, Vector3, type BufferGeometry } from "three";
import { wardrobeCoverageSurface } from "./wardrobeCoverage";
import { wardrobeFitInputs, sameWardrobeFitInputs } from "./wardrobeSurface";
import { warpWardrobeGeometry } from "./warpWardrobeGeometry";

const centerDepth = .025;
const { smoothstep } = MathUtils;

type SkirtWarp = (x: number, y: number, z: number, target: Vector3) => Vector3;

type SkirtDrape = {
  frontInset: number; hipStart: number; hipPeak: number;
  hemEase: number; hipTaper: number;
};

// Heights and distances are in metres in Vesper's bind space. The wrap on 02
// has a higher, narrower ridge and needs more cloth carried toward the hem.
const skirtDrapes = new Map<string, SkirtDrape>([
  ["skirt-01", { frontInset: .015, hipStart: .82, hipPeak: .991, hemEase: .005, hipTaper: .004 }],
  ["skirt-02", { frontInset: .015, hipStart: .937, hipPeak: .992, hemEase: .023, hipTaper: .004 }],
  ["skirt-03", { frontInset: .010, hipStart: .878, hipPeak: 1.008, hemEase: .007, hipTaper: .009 }],
  ["skirt-04", { frontInset: .020, hipStart: .877, hipPeak: 1.010, hemEase: .009, hipTaper: .015 }],
]);

export function isShortSkirt(id: string) {
  return skirtDrapes.has(id);
}

const bottom = .82, step = .01, rows = 37, columns = 72;
const surfaceRadii = new WeakMap<BufferGeometry, {
  inputs: ReturnType<typeof wardrobeFitInputs>; start: number; count: number; radii: Float32Array;
}>();

function sampleSkirtSurface(geometry: BufferGeometry) {
  const inputs = wardrobeFitInputs(geometry);
  const { start, count } = geometry.drawRange;
  const cached = surfaceRadii.get(geometry);
  if (cached && cached.start === start && cached.count === count && sameWardrobeFitInputs(cached.inputs, inputs)) return cached.radii;
  const surface = wardrobeCoverageSurface(geometry, [bottom, bottom + (rows - 1) * step]);
  const radii = new Float32Array(rows * columns);
  const ray = new Ray();
  if (surface) {
    for (let col = 0; col < columns; col++) {
      const angle = col * 2 * Math.PI / columns;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      ray.direction.set(-dx, 0, -dz);
      // Cast inward so each sample finds the outside of the thigh below the seat.
      for (let row = 0; row < rows; row++) {
        ray.origin.set(.30 * dx, bottom + row * step, centerDepth + .30 * dz);
        const hit = surface.raycastFirst(ray, DoubleSide, 0, .30);
        if (hit) radii[row * columns + col] = .30 - hit.distance;
      }
    }
    surface.geometry.dispose();
  }
  surfaceRadii.set(geometry, { inputs, start, count, radii });
  return radii;
}

/** Radial clearance shared by the shell, seams and fasteners. */
function sampleSkirtInterior(body: BufferGeometry, lining?: BufferGeometry) {
  const skin = sampleSkirtSurface(body);
  const shorts = lining && sampleSkirtSurface(lining);
  const radii = skin.map((radius, index) => Math.max(radius ? radius + .004 : 0,
    shorts?.[index] ? shorts[index] + .002 : 0));
  return (x: number, y: number, depth: number) => {
    const height = MathUtils.clamp((y - bottom) / step, 0, rows - 1);
    const row = Math.min(Math.floor(height), rows - 2);
    const angle = MathUtils.euclideanModulo(Math.atan2(depth, x) * columns / (2 * Math.PI), columns);
    const col = Math.floor(angle), next = (col + 1) % columns;
    const lower = MathUtils.lerp(radii[row * columns + col], radii[row * columns + next], angle - col);
    const upper = MathUtils.lerp(radii[(row + 1) * columns + col], radii[(row + 1) * columns + next], angle - col);
    return MathUtils.lerp(lower, upper, height - row);
  };
}

function skirtWarp(id: string, drape: SkirtDrape, insideRadius: ReturnType<typeof sampleSkirtInterior>): SkirtWarp {
  return (x, y, z, target) => {
    const depth = z - centerDepth;
    const radius = Math.hypot(x, depth) || 1;
    const front = smoothstep(depth / radius, .05, .84);
    const side = smoothstep(Math.abs(x) / radius, .64, .96);
    const hip = smoothstep(y, .80, .925) * (1 - smoothstep(y, .98, 1.06));
    const frontHip = smoothstep(y, drape.hipStart, drape.hipPeak) * (1 - smoothstep(y, drape.hipPeak, 1.062));
    const hem = 1 - smoothstep(y, .79, .982);
    const lateral = side * (-drape.hipTaper * hip * smoothstep(z, -.024, .058)
      + .004 * hem * smoothstep(z, centerDepth, .09));
    let dz = front * (drape.hemEase * hem - drape.frontInset * frontHip);
    const rear = smoothstep(-depth / radius, .32, .82);
    if (id === "skirt-01") {
      // Take up ease over the seat without pulling the waistband or the wrap opening.
      dz += rear * .017 * smoothstep(y, .74, .89) * (1 - smoothstep(y, .963, 1.034));
    } else if (id === "skirt-02") {
      // Ease the high seat ridge into the bias-cut back panel in one continuous curve.
      dz += rear * .026 * smoothstep(y, .885, .950) * (1 - smoothstep(y, .950, 1.023));
    }
    // Seat the upper band closer to the waist while keeping the fabric and trim nested.
    const band = .0045 * smoothstep(y, 1.036, 1.073);
    const dx = Math.sign(x) * lateral - band * x / radius;
    dz -= band * depth / radius;
    const inward = radius - Math.hypot(x + dx, depth + dz);
    const ease = inward > 0 ? MathUtils.clamp((radius - insideRadius(x, y, depth)) / inward, 0, 1) : 1;
    return target.set(x + dx * ease, y, z + dz * ease);
  };
}

/** Shape the skirt shell and its details in bind space while retaining the authored rig and folds. */
export function prepareShortSkirtFit(id: string, body: BufferGeometry, lining?: BufferGeometry) {
  const drape = skirtDrapes.get(id);
  if (!drape) return;
  const shape = skirtWarp(id, drape, sampleSkirtInterior(body, lining));
  return warpWardrobeGeometry(shape);
}
