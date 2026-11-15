import { DoubleSide, MathUtils, Ray, Vector3, type BufferGeometry, type Skeleton } from "three";
import type { MeshBVH } from "three-mesh-bvh";

const waistStart = .965;
const waistEnd = 1.235;
const waistClearance = .009;
const centerDepth = .025;
const slices = 17;
const directions = 32;

function roundFrontPanel(source: BufferGeometry) {
  const cloth = source.getAttribute("position");
  const xTangent = new Vector3(), yTangent = new Vector3(), zTangent = new Vector3();
  const point = new Vector3(), scratch = new Vector3(), normal = new Vector3();
  const step = .0002;
  let fitted: BufferGeometry | undefined;
  const shape = (x: number, y: number, z: number, target: Vector3) => {
    const front = MathUtils.smoothstep(z, .035, .118);
    const outside = MathUtils.smoothstep(Math.abs(x), .06, .22);
    const hem = 1 - MathUtils.smoothstep(y, .48, .66);
    const round = front * outside * hem;
    const panel = front * (1 - outside) * (1 - MathUtils.smoothstep(y, .61, .76));
    return target.set(x - Math.sign(x) * .012 * round, y + .024 * round, z + .008 * panel);
  };
  for (let i = 0; i < cloth.count; i++) {
    const x = cloth.getX(i), y = cloth.getY(i), z = cloth.getZ(i);
    if (z <= .035 || y >= .76) continue;
    shape(x, y, z, point);
    if (point.x === x && point.y === y && point.z === z) continue;
    fitted ??= source.clone();
    fitted.getAttribute("position").setXYZ(i, point.x, point.y, point.z);
    const normals = fitted.getAttribute("normal");
    if (!normals) continue;
    // Transform the authored normals with the same warp. The side and back
    // panels keep their original normals, including the UV seam.
    shape(x + step, y, z, xTangent).sub(shape(x - step, y, z, scratch));
    shape(x, y + step, z, yTangent).sub(shape(x, y - step, z, scratch));
    shape(x, y, z + step, zTangent).sub(shape(x, y, z - step, scratch));
    normal.set(0, 0, 0).addScaledVector(scratch.crossVectors(yTangent, zTangent), normals.getX(i))
      .addScaledVector(scratch.crossVectors(zTangent, xTangent), normals.getY(i))
      .addScaledVector(scratch.crossVectors(xTangent, yTangent), normals.getZ(i)).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return fitted;
}

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

/** Use one waist adjustment for the fabric, trim, and fasteners. */
export function prepareGothicSkirtFit(body: MeshBVH, skirt: readonly MeshBVH[], id: string, skeleton: Skeleton) {
  const ray = new Ray();
  const rowHeight = (waistEnd - waistStart) / (slices - 1);
  const step = 2 * Math.PI / directions;
  const wideBackPanels = id === "gothic-skirt-01" || id === "gothic-skirt-05";
  const getBodyRadius = () => body.raycastFirst(ray, DoubleSide, 0, .18)?.distance;
  const inset = Array.from({ length: slices }, (_, row) => Array.from({ length: directions }, (_, column) => {
    ray.origin.set(0, waistStart + row * rowHeight, centerDepth);
    ray.direction.set(Math.cos(column * step), 0, Math.sin(column * step));
    const skin = getBodyRadius();
    if (skin === undefined) return;
    let edge = Infinity;
    for (const surface of skirt) {
      const hit = surface.raycastFirst(ray, DoubleSide, skin, edge);
      if (hit) edge = hit.distance;
    }
    if (Number.isFinite(edge)) return MathUtils.clamp(edge - skin - waistClearance, 0, .036);
  }));
  // Smooth adjacent sections so an opening or a pleat cannot pull a neighboring seam out of shape.
  const smoothed = inset.map((row, i) => row.map((_, j) => {
    let sum = 0, total = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let da = -1; da <= 1; da++) {
        const value = inset[i + dy]?.[(j + da + directions) % directions];
        if (value === undefined) continue;
        const weight = (2 - Math.abs(dy)) * (2 - Math.abs(da));
        sum += value * weight;
        total += weight;
      }
    }
    return total ? sum / total : 0;
  }));

  return (source: BufferGeometry) => {
    const cloth = source.getAttribute("position");
    let fitted = id === "gothic-skirt-04" ? roundFrontPanel(source) : fitLayeredHem(source, id, skeleton);
    for (let vertex = 0; vertex < cloth.count; vertex++) {
      const y = cloth.getY(vertex);
      if (y <= waistStart || y > waistEnd) continue;
      const x = cloth.getX(vertex), z = cloth.getZ(vertex) - centerDepth;
      const radius = Math.hypot(x, z);
      if (!radius) continue;
      ray.origin.set(0, y, centerDepth);
      ray.direction.set(x / radius, 0, z / radius);
      const skin = getBodyRadius();
      if (skin === undefined || radius <= skin + waistClearance) continue;
      const height = (y - waistStart) / rowHeight;
      const row = Math.min(Math.floor(height), slices - 2);
      const angle = MathUtils.euclideanModulo(Math.atan2(z, x) / step, directions);
      const column = Math.floor(angle), next = (column + 1) % directions;
      const lower = MathUtils.lerp(smoothed[row][column], smoothed[row][next], angle - column);
      const upper = MathUtils.lerp(smoothed[row + 1][column], smoothed[row + 1][next], angle - column);
      // The broad back panels on 01 and 05 span the spine with few vertices.
      const back = wideBackPanels ? MathUtils.smoothstep(-z / radius, .36, .59) : 0;
      const rearEase = id === "gothic-skirt-01" ? .006 * back * MathUtils.smoothstep(y, 1.119, 1.177) : 0;
      // Keep space between overlapping layers even where the skin limits the shared adjustment.
      const adjustment = Math.min(.80 * (radius - skin - waistClearance),
        MathUtils.lerp(lower, upper, height - row) * MathUtils.smoothstep(y, waistStart, 1.10) * (1 - back)) - rearEase;
      if (!adjustment) continue;
      fitted ??= source.clone();
      const scale = 1 - adjustment / radius;
      fitted.getAttribute("position").setXYZ(vertex, x * scale, y, centerDepth + z * scale);
    }
    if (fitted) {
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
    }
    return fitted;
  };
}
