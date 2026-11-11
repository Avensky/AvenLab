import { Box3, MathUtils, Quaternion, Spherical, Vector3 } from "three";
import { CLOTHING_PIECES, clothingBounds, type ClothingPiece } from "./clothingPieces";
import type { Object3D } from "three";

/** Measure only on selection. A missing accessory still has a useful regional close-up. */
export function clothingFrame(root: Object3D, piece: ClothingPiece, fov: number, aspect: number) {
  const bounds = clothingBounds(root, piece);
  if (bounds.isEmpty()) {
    const body = new Box3().setFromObject(root);
    const region = CLOTHING_PIECES.find(item => item.id === piece)!;
    const height = Math.max(.5, body.max.y - body.min.y);
    const center = body.getCenter(new Vector3());
    center.y = body.min.y + height * region.center;
    bounds.setFromCenterAndSize(center, new Vector3(height * region.span * .7, height * region.span, height * .2));
  }
  const size = bounds.getSize(new Vector3());
  const span = Math.max(.12, size.y, size.x / Math.max(.15, aspect));
  return { center: bounds.getCenter(new Vector3()), distance: span * 1.25 / (2 * Math.tan(MathUtils.degToRad(fov) / 2)) + size.z * .5 };
}

/** Orbit the current close-up at its existing distance, keeping the eye above the floor. */
export function orbitFittingCamera(position: Vector3, target: Vector3, yaw: number, pitch: number, sphere: Spherical) {
  sphere.setFromVector3(position.sub(target));
  const basePolar = sphere.phi;
  const floorPolar = Math.acos(MathUtils.clamp((.30 - target.y) / sphere.radius, -1, 1));
  sphere.theta += yaw;
  sphere.phi = MathUtils.clamp(basePolar + pitch, .35, Math.max(.35, Math.min(2.15, floorPolar)));
  position.setFromSpherical(sphere).add(target);
  return sphere.phi - basePolar;
}

/** Arc around the subject instead of cutting through it when switching front/back views. */
export function blendCharacterCamera(position: Vector3, target: Vector3, nextPosition: Vector3, nextTarget: Vector3, blend: number,
  scratch: { eye: Vector3; nextEye: Vector3; swing: Quaternion; orbit: Quaternion }) {
  const { eye, nextEye, swing, orbit } = scratch;
  eye.subVectors(position, target); nextEye.subVectors(nextPosition, nextTarget);
  const radius = MathUtils.lerp(eye.length(), nextEye.length(), blend);
  swing.setFromUnitVectors(eye.normalize(), nextEye.normalize());
  eye.applyQuaternion(orbit.identity().slerp(swing, blend)).multiplyScalar(radius);
  target.lerp(nextTarget, blend);
  position.copy(target).add(eye);
}
