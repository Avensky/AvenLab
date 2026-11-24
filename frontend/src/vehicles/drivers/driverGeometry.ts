import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type DriverPart = "skin" | "female" | "male" | "neutral" | "bottom" | "shortHair" | "longHair" | "hat";
export const DRIVER_PARTS: readonly DriverPart[] = ["skin", "female", "male", "neutral", "bottom", "shortHair", "longHair", "hat"];
export const DRIVER_CROWN = .81;
export const DRIVER_HAT_CROWN = .88;

type Point = readonly [number, number, number];
function ellipsoid(at: Point, size: Point, width = 8, height = 5, cap = Math.PI) {
  return new SphereGeometry(1, width, height, 0, Math.PI * 2, 0, cap)
    .scale(...size).translate(...at);
}
function limb(from: Point, to: Point, radius: number, end = radius) {
  const a = new Vector3(...from), b = new Vector3(...to), direction = b.clone().sub(a);
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
  const matrix = new Matrix4().compose(a.add(b).multiplyScalar(.5), rotation, new Vector3(1, 1, 1));
  return new CylinderGeometry(end, radius, direction.length(), 6, 1).applyMatrix4(matrix);
}
function merge(parts: BufferGeometry[]) {
  for (const part of parts) part.deleteAttribute("uv");
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function torso(shoulder: number, waist: number, chest: number) {
  // Four eight-sided rings give the three body silhouettes a waist and shoulders
  // without morph targets, joints, subdivision, or a material for every garment.
  const rings = [[.04, .15, .10, 0], [.19, waist, .085, -.015], [.38, chest, .115, -.025], [.47, shoulder, .085, -.04]];
  const positions: number[] = [], indices: number[] = [];
  for (const [y, x, z, center] of rings) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      positions.push(Math.sin(angle) * x, y, Math.cos(angle) * z + center);
    }
  }
  for (let row = 0; row < rings.length - 1; row++) {
    for (let i = 0; i < 8; i++) {
      const a = row * 8 + i, b = row * 8 + (i + 1) % 8;
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
  }
  for (let i = 1; i < 7; i++) indices.push(0, i + 1, i, 24, 24 + i, 25 + i);
  const chestGeometry = new BufferGeometry();
  chestGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  chestGeometry.setIndex(indices);
  chestGeometry.computeVertexNormals();
  const parts = [chestGeometry];
  for (const side of [-1, 1]) {
    const elbow: Point = [side * .20, .19, .17];
    parts.push(limb([side * shoulder, .43, -.025], elbow, .055, .044));
    parts.push(limb(elbow, [side * .17, .30, .39], .044, .033));
  }
  return merge(parts);
}

function hair(long: boolean) {
  const parts: BufferGeometry[] = [ellipsoid([0, .658, -.03], [.112, .151, .108], 8, 3, Math.PI * .48)];
  if (long) {
    parts.push(new BoxGeometry(.205, .31, .075).translate(0, .54, -.112));
    for (const side of [-1, 1]) parts.push(ellipsoid([side * .098, .55, -.06], [.038, .16, .065], 6, 3));
  } else {
    parts.push(new BoxGeometry(.18, .13, .06).translate(0, .66, -.108));
  }
  return merge(parts);
}

/** One tiny texture-free geometry set for the entire occupied fleet. A driver
 * uses five of these at most; no per-character scenes or GLB preparation. */
export function createDriverGeometries(): Record<DriverPart, BufferGeometry> {
  const skin: BufferGeometry[] = [ellipsoid([0, .65, -.025], [.103, .14, .10]), limb([0, .46, -.03], [0, .56, -.03], .046)];
  skin.push(ellipsoid([0, .65, .073], [.025, .027, .026], 5, 3));
  for (const side of [-1, 1]) skin.push(ellipsoid([side * .17, .30, .415], [.039, .035, .049], 6, 3));
  const bottom: BufferGeometry[] = [new BoxGeometry(.30, .15, .22).translate(0, .01, .025)];
  for (const side of [-1, 1]) {
    bottom.push(limb([side * .095, .005, .07], [side * .11, -.025, .36], .085, .07));
    bottom.push(limb([side * .11, -.025, .36], [side * .11, -.28, .48], .061, .043));
  }
  return {
    skin: merge(skin),
    female: torso(.16, .115, .167),
    male: torso(.205, .16, .20),
    neutral: torso(.182, .138, .184),
    bottom: merge(bottom),
    shortHair: hair(false),
    longHair: hair(true),
    hat: merge([
      new CylinderGeometry(.165, .165, .016, 8).translate(0, .792, -.03),
      ellipsoid([0, .787, -.03], [.128, .093, .118], 8, 3, Math.PI * .5),
    ]),
  };
}
