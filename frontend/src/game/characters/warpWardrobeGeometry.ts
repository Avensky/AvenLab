import { Vector3, type BufferGeometry } from "three";
import { createWardrobeWarpMemo } from "./wardrobeWarpMemo";

const sampleStep = .0002;

/**
 * Deform a skinned garment in bind space, including its authored normals and tangents.
 * Exact reuse is opt-in: shape must fully overwrite/return its target, depend only on
 * XYZ and fixed supporting data, and leave the source unchanged during one call.
 */
export function warpWardrobeGeometry(shape: (x: number, y: number, z: number, target: Vector3) => Vector3,
  selected?: ArrayLike<number>, options?: { reuseExactPositions?: boolean }) {
  const point = new Vector3(), scratch = new Vector3(), normal = new Vector3();
  const dx = new Vector3(), dy = new Vector3(), dz = new Vector3(), tangent = new Vector3();
  return (source: BufferGeometry) => {
    const position = source.getAttribute("position");
    // A new table for each source call prevents stale reuse across parts or variants.
    const memo = options?.reuseExactPositions ? createWardrobeWarpMemo(position) : undefined;
    let fitted: BufferGeometry | undefined;
    for (let vertex = 0; vertex < position.count; vertex++) {
      if (selected && !selected[vertex]) continue;
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      let entry = memo?.find(x, y, z) ?? -1;
      if (entry >= 0) memo!.readPoint(entry, point);
      else {
        shape(x, y, z, point);
        entry = memo?.remember(x, y, z, point) ?? -1;
      }
      if (point.x === x && point.y === y && point.z === z) continue;
      fitted ??= source.clone();
      fitted.getAttribute("position").setXYZ(vertex, point.x, point.y, point.z);
      const normals = fitted.getAttribute("normal");
      if (!normals) continue;
      // Transform authored normals with the warp so seams keep their split normals.
      if (!memo?.readJacobian(entry, dx, dy, dz)) {
        shape(x + sampleStep, y, z, dx).sub(shape(x - sampleStep, y, z, scratch));
        shape(x, y + sampleStep, z, dy).sub(shape(x, y - sampleStep, z, scratch));
        shape(x, y, z + sampleStep, dz).sub(shape(x, y, z - sampleStep, scratch));
        memo?.rememberJacobian(entry, dx, dy, dz);
      }
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
