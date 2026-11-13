import type { Reflector } from "three/addons/objects/Reflector.js";
import type { ShaderMaterial } from "three";
import type { GarageEffects } from "../../store/preferences/garageEffects";

let capturingReflection = false;

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
    capturingReflection = true;
    try {
      capture.apply(this, args);
      if (now !== undefined) capturedAt = now;
    } finally {
      capturingReflection = false;
    }
  };
}

export function gateGarageFloorCapture(floor: Reflector, elapsedSeconds?: () => number | undefined, interval?: number) {
  gatePlanarReflectionCapture(floor, elapsedSeconds, interval, () => floor.userData.garageReflectionCapture !== false);
}
