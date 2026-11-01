import type { Reflector } from "three/addons/objects/Reflector.js";
import type { ShaderMaterial } from "three";
import type { GarageEffects } from "../../store/preferences/garageEffects";

/** Keep tiles and safety stripes when mirrors are off, and skip their capture. */
export function configureGarageFloor(
  floor: Reflector,
  settings: GarageEffects,
) {
  const material = floor.material as ShaderMaterial;
  floor.userData.garageReflectionCapture =
    settings.floorReflections && settings.reflectionStrength > 0;
  material.uniforms.reflectionStrength.value = settings.floorReflections
    ? settings.reflectionStrength
    : 0;
  material.uniforms.reflectionBlur.value = settings.reflectionBlur;
}

export function gateGarageFloorCapture(floor: Reflector) {
  const capture = floor.onBeforeRender;
  floor.onBeforeRender = function (...args) {
    if (floor.userData.garageReflectionCapture !== false)
      capture.apply(this, args);
  };
}
