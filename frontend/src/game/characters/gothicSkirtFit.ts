import { Box3, DoubleSide, MathUtils, Ray, type BufferGeometry, type Skeleton } from "three";
import type { MeshBVH } from "three-mesh-bvh";
import { warpWardrobeGeometry } from "./warpWardrobeGeometry";

// Lower limits for waistbands that are already close to Vesper's natural waist.
// Taller authored skirts keep their own rise with only a small downward nudge.
const waistlines: Readonly<Record<string, number>> = {
  "gothic-skirt-01": 1.115,
  "gothic-skirt-02": 1.120,
  "gothic-skirt-03": 1.110,
  "gothic-skirt-04": 1.100,
  "gothic-skirt-05": 1.118,
};
// Keep the accepted movement allowance on Skirt 01.
const subtleDrops: Readonly<Record<string, number>> = {
  "gothic-skirt-01": .022,
};
// These two styles keep their corset-like high waist just below the cups.
// A high rear rim during a step does not determine the front waistband height.
const highWaistCeilings: Readonly<Record<string, number>> = {
  "gothic-skirt-02": 1.180,
  "gothic-skirt-05": 1.182,
};
const drapeStart = .78;
const hipStart = .90;
const centerDepth = .025;
const slices = 33;
const directions = 64;

const roundFrontPanel = warpWardrobeGeometry((x, y, z, point) => {
  if (z <= .035 || y >= .76) return point.set(x, y, z);
  const front = MathUtils.smoothstep(z, .035, .118);
  const outside = MathUtils.smoothstep(Math.abs(x), .06, .22);
  const hem = 1 - MathUtils.smoothstep(y, .48, .66);
  const round = front * outside * hem;
  const panel = front * (1 - outside) * (1 - MathUtils.smoothstep(y, .61, .76));
  return point.set(x - Math.sign(x) * .012 * round, y + .024 * round, z + .008 * panel);
});

function fitLayeredHem(source: BufferGeometry, id: string, skeleton: Skeleton) {
  if (id !== "gothic-skirt-03" && id !== "gothic-skirt-05") return;
  const pelvis = skeleton.bones.findIndex(bone => bone.name === "pelvis");
  const leftThigh = skeleton.bones.findIndex(bone => bone.name === "thigh_l");
  const rightThigh = skeleton.bones.findIndex(bone => bone.name === "thigh_r");
  const original = source.getAttribute("position");
  const joints = source.getAttribute("skinIndex"), weights = source.getAttribute("skinWeight");
  const hasHemRig = pelvis >= 0 && leftThigh >= 0 && rightThigh >= 0 && joints && weights;
  const wideHem = id === "gothic-skirt-05";
  const hemStart = wideHem ? .238 : .190, hemEnd = wideHem ? .345 : .267;
  const influences = new Map<number, number>();
  const addInfluence = (joint: number, weight: number) => {
    if (weight > 0) influences.set(joint, (influences.get(joint) ?? 0) + weight);
  };
  let fitted: BufferGeometry | undefined;
  for (let vertex = 0; vertex < original.count; vertex++) {
    const x = original.getX(vertex), y = original.getY(vertex), z = original.getZ(vertex) - centerDepth;
    if (y >= .91) continue;
    const radius = Math.hypot(x, z);
    const inward = (wideHem ? .032 : .017) * (1 - MathUtils.smoothstep(y, .49, .72))
      * MathUtils.smoothstep(radius, hemStart, hemEnd);
    const strideRoom = (wideHem ? .009 : .021) * MathUtils.smoothstep(y, .52, .62) * (1 - MathUtils.smoothstep(y, .75, .84))
      * MathUtils.smoothstep(Math.abs(z), .055, .19);
    const radialOffset = strideRoom - inward;
    if (!hasHemRig && !radialOffset) continue;
    fitted ??= source.clone();
    if (radialOffset) {
      const scale = 1 + radialOffset / radius;
      fitted.getAttribute("position").setXYZ(vertex, x * scale, y, centerDepth + z * scale);
    }
    if (!hasHemRig) continue;
    // Nearby pieces of the same ruffle follow a shared field through the
    // knee, instead of snapping to different calf bones as the legs cross.
    const blend = 1 - MathUtils.smoothstep(y, .66, .91);
    const hold = MathUtils.lerp(.38, .68, MathUtils.smoothstep(y, .54, .91));
    const side = MathUtils.lerp(wideHem ? .12 : .20, wideHem ? .88 : .80, MathUtils.smoothstep(x, -.23, .23));
    const left = (1 - hold) * side, right = (1 - hold) * (1 - side);
    const fittedJoints = fitted.getAttribute("skinIndex"), fittedWeights = fitted.getAttribute("skinWeight");
    if (blend === 1) {
      fittedJoints.setXYZW(vertex, pelvis, leftThigh, rightThigh, 0);
      fittedWeights.setXYZW(vertex, hold, left, right, 0);
      continue;
    }
    influences.clear();
    for (let channel = 0; channel < 4; channel++) {
      addInfluence(joints.getComponent(vertex, channel), weights.getComponent(vertex, channel) * (1 - blend));
    }
    addInfluence(pelvis, blend * hold);
    addInfluence(leftThigh, blend * left);
    addInfluence(rightThigh, blend * right);
    const strongest = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = strongest.reduce((total, [, weight]) => total + weight, 0);
    for (let channel = 0; channel < 4; channel++) {
      fittedJoints.setComponent(vertex, channel, strongest[channel]?.[0] ?? 0);
      fittedWeights.setComponent(vertex, channel, (strongest[channel]?.[1] ?? 0) / sum);
    }
  }
  return fitted;
}

/** Grade a shared skirt shell and its details onto the waist, retaining the hemline. */
export function prepareGothicWaistline(body: MeshBVH, skirt: readonly MeshBVH[], id: string) {
  const bounds = new Box3();
  const rim = Math.max(...skirt.map(surface => surface.getBoundingBox(bounds).max.y));
  const target = waistlines[id];
  if (!target || rim <= target + .0001) return () => undefined;
  const nudge = subtleDrops[id] ?? .015;
  const ceiling = highWaistCeilings[id];
  const clearanceDrop = ceiling === undefined ? nudge : Math.max(0, rim - ceiling);
  const drop = Math.min(rim - target, clearanceDrop);
  // Keep the height of the decorated top band. The shortening is distributed
  // over the upper drape, so the hem, ruffles and foot clearance are preserved.
  const lowerY = (y: number) => y - drop * MathUtils.smoothstep(y, drapeStart, rim - .09);
  const angleStep = 2 * Math.PI / directions;
  const rowStep = (rim - hipStart) / (slices - 1);
  const skin = new Float32Array(slices * directions);
  const offsets = new Float32Array(skin.length).fill(NaN);
  const wideBack = id === "gothic-skirt-01" || id === "gothic-skirt-05";
  const ray = new Ray();
  for (let row = 0; row < slices; row++) {
    const y = hipStart + row * rowStep;
    for (let col = 0; col < directions; col++) {
      const angle = col * angleStep;
      const x = Math.cos(angle), z = Math.sin(angle);
      ray.origin.set(.22 * x, lowerY(y), centerDepth + .22 * z);
      ray.direction.set(-x, 0, -z);
      const hit = body.raycastFirst(ray, DoubleSide, 0, .22);
      if (!hit) continue;
      const index = row * directions + col;
      skin[index] = .22 - hit.distance;
      ray.origin.set(0, y, centerDepth);
      ray.direction.set(x, 0, z);
      let inner = Infinity;
      for (const surface of skirt) {
        const hit = surface.raycastFirst(ray, DoubleSide, .035, inner);
        if (hit) inner = hit.distance;
      }
      // Keep a little ease behind skirts with broad, sparsely cut back panels.
      const rear = wideBack ? MathUtils.smoothstep(-z, .32, .83) : 0;
      if (Number.isFinite(inner)) offsets[index] = MathUtils.clamp(skin[index] + .012 + .008 * rear - inner, -.045, .055);
    }
  }
  // At the scalloped rim some radial sections miss the fabric. In those
  // sections carry the nearest measured offset up from the panel below it.
  for (let i = 0; i < offsets.length; i++) {
    if (Number.isNaN(offsets[i])) offsets[i] = i < directions ? 0 : offsets[i - directions];
  }
  const smooth = offsets.map((_, i) => {
    const row = Math.floor(i / directions), col = i % directions;
    let value = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const r = MathUtils.clamp(row + dy, 0, slices - 1);
      for (let dx = -1; dx <= 1; dx++) {
        const c = (col + dx + directions) % directions;
        value += offsets[r * directions + c] * (2 - Math.abs(dx)) * (2 - Math.abs(dy));
      }
    }
    return value / 16;
  });
  return warpWardrobeGeometry((x, y, z, point) => {
    const newY = lowerY(y);
    const depth = z - centerDepth, radius = Math.hypot(x, depth);
    if (y <= hipStart || radius < .001) return point.set(x, newY, z);
    const height = MathUtils.clamp((y - hipStart) / rowStep, 0, slices - 1);
    const row = Math.min(Math.floor(height), slices - 2);
    const angle = MathUtils.euclideanModulo(Math.atan2(depth, x) / angleStep, directions);
    const col = Math.floor(angle), next = (col + 1) % directions;
    function sample(field: Float32Array) {
      const below = MathUtils.lerp(field[row * directions + col], field[row * directions + next], angle - col);
      const above = MathUtils.lerp(field[(row + 1) * directions + col], field[(row + 1) * directions + next], angle - col);
      return MathUtils.lerp(below, above, height - row);
    }
    const band = MathUtils.smoothstep(y, rim - .15, rim - .055);
    const clearance = sample(skin) + .009;
    const shellOffset = sample(smooth);
    // A long flat panel needs room across its face as well as at its corner
    // vertices. Carry outward panel clearance all the way down to the hip.
    const offset = Math.max(shellOffset > 0 ? shellOffset : shellOffset * band, clearance - radius)
      * MathUtils.smoothstep(y, hipStart, .96);
    const scale = 1 + offset / radius;
    return point.set(x * scale, newY, centerDepth + depth * scale);
  });
}

export function prepareGothicSkirtFit(body: MeshBVH, skirt: readonly MeshBVH[], id: string, skeleton: Skeleton, authoredFit = false) {
  const fitWaist = prepareGothicWaistline(body, skirt, id);
  return (source: BufferGeometry) => {
    const hem = authoredFit ? undefined : id === "gothic-skirt-04" ? roundFrontPanel(source) : fitLayeredHem(source, id, skeleton);
    const fitted = fitWaist(hem ?? source);
    if (fitted) hem?.dispose();
    return fitted ?? hem;
  };
}
