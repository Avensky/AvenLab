import { MathUtils, Vector3, type BufferGeometry } from "three";

const centerDepth = .025;
const sampleStep = .0002;
const { smoothstep } = MathUtils;

type SkirtWarp = (x: number, y: number, z: number, target: Vector3) => Vector3;

function rearWeight(x: number, z: number) {
  const rear = centerDepth - z;
  return smoothstep(rear / (Math.hypot(x, rear) || 1), .32, .82);
}

function roundedFront(frontVolume: number, hipTaper: number): SkirtWarp {
  return (x, y, z, target) => {
    const depth = z - centerDepth;
    const radius = Math.hypot(x, depth) || 1;
    const front = smoothstep(depth / radius, .05, .84);
    const side = smoothstep(Math.abs(x) / radius, .64, .96) * smoothstep(z, -.024, .058);
    const panel = smoothstep(y, .76, .91) * (1 - smoothstep(y, .985, 1.06));
    const hip = smoothstep(y, .80, .925) * (1 - smoothstep(y, .98, 1.06));
    return target.set(x - Math.sign(x) * hipTaper * side * hip, y, z + frontVolume * front * panel);
  };
}

const skirtWarps = new Map<string, SkirtWarp>([
  ["skirt-01", (x, y, z, target) => {
    const ease = .012 * smoothstep(y, 1.002, 1.071) * rearWeight(x, z);
    return target.set(x, y, z - ease);
  }],
  ["skirt-02", (x, y, z, target) => {
    // Carry the lower drape through the dip below the seat and soften the peak.
    const drape = .010 * smoothstep(y, .83, .89) * (1 - smoothstep(y, .89, .928));
    const peak = .012 * smoothstep(y, .895, .943) * (1 - smoothstep(y, .943, .985));
    return target.set(x, y, z + (peak - drape) * rearWeight(x, z));
  }],
  ["skirt-03", roundedFront(.014, .009)],
  ["skirt-04", roundedFront(.018, .015)],
]);

/** Shape the skirt shell and its details in bind space while retaining the authored rig and folds. */
export function prepareShortSkirtFit(id: string) {
  const shape = skirtWarps.get(id);
  if (!shape) return;
  const point = new Vector3(), scratch = new Vector3(), normal = new Vector3();
  const dx = new Vector3(), dy = new Vector3(), dz = new Vector3(), tangent = new Vector3();
  return (source: BufferGeometry) => {
    const position = source.getAttribute("position");
    let fitted: BufferGeometry | undefined;
    for (let vertex = 0; vertex < position.count; vertex++) {
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      shape(x, y, z, point);
      if (point.x === x && point.z === z) continue;
      fitted ??= source.clone();
      fitted.getAttribute("position").setXYZ(vertex, point.x, y, point.z);
      const normals = fitted.getAttribute("normal");
      if (!normals) continue;
      // Transform authored normals with the warp so seams keep their split normals.
      shape(x + sampleStep, y, z, dx).sub(shape(x - sampleStep, y, z, scratch));
      shape(x, y + sampleStep, z, dy).sub(shape(x, y - sampleStep, z, scratch));
      shape(x, y, z + sampleStep, dz).sub(shape(x, y, z - sampleStep, scratch));
      normal.set(0, 0, 0)
        .addScaledVector(scratch.crossVectors(dy, dz), normals.getX(vertex))
        .addScaledVector(scratch.crossVectors(dz, dx), normals.getY(vertex))
        .addScaledVector(scratch.crossVectors(dx, dy), normals.getZ(vertex))
        .normalize();
      normals.setXYZ(vertex, normal.x, normal.y, normal.z);
      const tangents = fitted.getAttribute("tangent");
      if (!tangents) continue;
      tangent.set(0, 0, 0)
        .addScaledVector(dx, tangents.getX(vertex))
        .addScaledVector(dy, tangents.getY(vertex))
        .addScaledVector(dz, tangents.getZ(vertex));
      tangent.addScaledVector(normal, -tangent.dot(normal)).normalize();
      tangents.setXYZ(vertex, tangent.x, tangent.y, tangent.z);
    }
    if (fitted) {
      fitted.computeBoundingBox();
      fitted.computeBoundingSphere();
    }
    return fitted;
  };
}
