import type { BufferGeometry } from 'three';

// A distinct basename avoids extensionless .ts/.tsx collisions on Windows.
export const FLAG_CLOTH_WIDTH = 1.2;
export const FLAG_CLOTH_HEIGHT = .7;
export const FLAG_FACE_TARGET = .68;
const HALF_PI = Math.PI / 2;

/** Both sides of the fabric are visible. Pick the nearest readable face and
 * hinge around the pole, rather than spinning the pole or the chassis. */
export function flagClothTargetYaw(current: number, viewX: number, viewZ: number) {
  if (!Number.isFinite(current) || !Number.isFinite(viewX) || !Number.isFinite(viewZ) || Math.hypot(viewX, viewZ) < .001)
    return Number.isFinite(current) ? current : 0;
  const bearing = Math.atan2(viewX, viewZ);
  let difference = Math.atan2(Math.sin(bearing - current), Math.cos(bearing - current));
  if (difference > HALF_PI) difference -= Math.PI;
  if (difference < -HALF_PI) difference += Math.PI;
  const maximum = Math.acos(FLAG_FACE_TARGET);
  return current + difference - Math.max(-maximum, Math.min(maximum, difference));
}

/** Frame-rate independent damping; a long background frame cannot flip the
 * fabric across the pole. Hidden/offline time never advances this animation. */
export function approachFlagClothYaw(current: number, target: number, delta: number) {
  if (!Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(delta) || delta <= 0)
    return Number.isFinite(current) ? current : 0;
  const error = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const value = current + error * (1 - Math.exp(-10 * Math.min(delta, .05)));
  return Math.atan2(Math.sin(value), Math.cos(value));
}

/** A small segmented sheet: fixed at the pole, gently bellied and rippling
 * toward its free edge. Reuse the existing buffers instead of allocating each
 * frame or changing React state. */
export function updateFlagCloth(geometry: BufferGeometry, elapsed: number) {
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal');
  if (!position || !uv || position.count !== uv.count) return;
  const time = Number.isFinite(elapsed) ? elapsed : 0;
  for (let index = 0; index < position.count; index++) {
    const u = uv.getX(index), v = uv.getY(index);
    const phase = 2.5 * Math.PI * u - 2.4 * time + .8 * v;
    const sine = Math.sin(phase), cosine = Math.cos(phase), wave = u * sine;
    position.setXYZ(index,
      (u - .5) * FLAG_CLOTH_WIDTH,
      (v - .5) * FLAG_CLOTH_HEIGHT - .045 * u * u + .018 * wave,
      .105 * Math.sin(Math.PI * u) + .075 * wave);
    if (normal) {
      const derivative = sine + 2.5 * Math.PI * u * cosine;
      const yu = -.09 * u + .018 * derivative, yv = FLAG_CLOTH_HEIGHT + .018 * .8 * u * cosine;
      const zu = .105 * Math.PI * Math.cos(Math.PI * u) + .075 * derivative, zv = .075 * .8 * u * cosine;
      const nx = yu * zv - zu * yv, ny = -FLAG_CLOTH_WIDTH * zv, nz = FLAG_CLOTH_WIDTH * yv;
      const length = Math.hypot(nx, ny, nz);
      normal.setXYZ(index, nx / length, ny / length, nz / length);
    }
  }
  position.needsUpdate = true;
  if (normal) normal.needsUpdate = true;
}
