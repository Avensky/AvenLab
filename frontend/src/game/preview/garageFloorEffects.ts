import type { Reflector } from "three/addons/objects/Reflector.js";
import type { Scene, ShaderMaterial } from "three";
import type { GarageEffects } from "../../store/preferences/garageEffects";

let capturingReflection = false;
type ReflectionFrame = { time: number; used: boolean; priority?: Reflector; waiting?: Reflector };
const reflectionFrames = new WeakMap<Scene, ReflectionFrame>();

/** Keep tiles and safety stripes when mirrors are off, and skip their capture. */
export function configureGarageFloor(
  floor: Reflector,
  settings: GarageEffects,
) {
  const material = floor.material as ShaderMaterial;
  floor.userData.garageReflectionCapture =
    settings.floorReflections && settings.reflectionStrength > 0;
  material.uniforms.reflectionStrength.value = settings.floorReflections
    ? settings.reflectionStrength * .76
    : 0;
  material.uniforms.reflectionBlur.value = settings.reflectionBlur;
}

export function gatePlanarReflectionCapture(reflector: Reflector, elapsedSeconds?: () => number | undefined, interval = 1 / 30, enabled = () => true) {
  const capture = reflector.onBeforeRender;
  let capturedAt = -Infinity;
  reflector.onBeforeRender = function (...args) {
    // The floor and fitting-room wall mirror both capture from the preview camera.
    if (capturingReflection) return;
    if (!enabled()) {
      capturedAt = -Infinity;
      return;
    }
    const now = elapsedSeconds?.();
    // The cached texture and its matching projection stay valid between captures.
    if (now !== undefined && now >= capturedAt && now - capturedAt < interval - .001) return;
    let frame: ReflectionFrame | undefined;
    const [, scene, camera] = args;
    if (now !== undefined && scene && camera) {
      const plane = reflector.matrixWorld.elements, eye = camera.matrixWorld.elements;
      // Match Reflector's back-face test so an unseen mirror cannot claim a pass.
      if (!reflector.forceUpdate &&
        (plane[12] - eye[12]) * plane[8] + (plane[13] - eye[13]) * plane[9] + (plane[14] - eye[14]) * plane[10] > 0) return;
      frame = reflectionFrames.get(scene);
      if (!frame) {
        frame = { time: now, used: false };
        reflectionFrames.set(scene, frame);
      } else if (frame.time !== now) {
        // A due mirror that lost the last frame goes first once. This lets
        // both mirrors advance even below their target refresh rates.
        frame.priority = now > frame.time ? frame.waiting : undefined;
        frame.waiting = undefined;
        frame.used = false;
        frame.time = now;
      }
      if (frame.used) {
        frame.waiting ??= reflector;
        return;
      }
      if (frame.priority && frame.priority !== reflector) return;
    }
    capturingReflection = true;
    try {
      capture.apply(this, args);
      if (frame) frame.used = true;
      capturedAt = now ?? -Infinity;
    } finally {
      capturingReflection = false;
    }
  };
}

export function gateGarageFloorCapture(floor: Reflector, elapsedSeconds?: () => number | undefined, interval?: number) {
  gatePlanarReflectionCapture(floor, elapsedSeconds, interval, () => floor.userData.garageReflectionCapture !== false);
}
