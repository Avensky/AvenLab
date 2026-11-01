import type { GarageEffects } from "../../store/preferences/garageEffects";

type BloomPass = {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
};

/** Disabling bloom skips its blur passes rather than merely hiding the result. */
export function configureGarageBloom(
  pass: BloomPass,
  settings: GarageEffects,
  contrast: boolean,
) {
  pass.enabled = settings.bloom && settings.bloomStrength > 0 && !contrast;
  pass.strength = contrast ? 0 : settings.bloomStrength;
  pass.radius = settings.bloomRadius;
  pass.threshold = settings.bloomThreshold;
}
