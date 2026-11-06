import { Color, DataTexture, EquirectangularReflectionMapping, LinearFilter, SRGBColorSpace } from "three";
import type { WorldSkyPreset } from "../store/world/worldStore";

const skies = {
  starry_night: {
    horizon: "#060b16", zenith: "#39475e", ground: "#0c1017",
    skyLight: "#647894", groundLight: "#10151c", ambient: .34,
    keyColor: "#a3bfe7", keyIntensity: .85, fogNear: 230, fogFar: 1000,
  },
  foggy_day: {
    horizon: "#96a9b3", zenith: "#a8b9c8", ground: "#424f54",
    skyLight: "#c1d1de", groundLight: "#647069", ambient: 0.76,
    keyColor: "#f2ece0", keyIntensity: 1.12, fogNear: 160, fogFar: 930,
  },
} as const;

export function worldSkyLighting(preset: WorldSkyPreset) {
  return skies[preset] ?? skies.starry_night;
}

/** One sky supplies diffuse light and glossy reflections on every graphics tier.
 * Sampling resolution controls the specular detail. No live cube capture or download. */
export function skyReflectionMap(preset: WorldSkyPreset, detailed: boolean) {
  const sky = worldSkyLighting(preset);
  const width = detailed ? 256 : 128, height = width / 2;
  const pixels = new Uint8Array(width * height * 4);
  const horizon = new Color(sky.horizon), ground = new Color(sky.ground), zenith = new Color(sky.zenith);
  const key = new Color(sky.keyColor), band = new Color(), sample = new Color();
  // Match the direction of the world key light at (-120, 180, -80).
  const keyLength = Math.hypot(-120, 180, -80);
  for (let row = 0; row < height; row++) {
    const latitude = Math.PI * ((row + .5) / height - .5);
    const y = Math.sin(latitude), ring = Math.cos(latitude);
    band.copy(horizon).lerp(y < 0 ? ground : zenith, Math.abs(y));
    for (let column = 0; column < width; column++) {
      const longitude = 2 * Math.PI * ((column + .5) / width - .5);
      const towardKey = (-120 * ring * Math.cos(longitude) + 180 * y - 80 * ring * Math.sin(longitude)) / keyLength;
      const highlight = Math.max(0, towardKey) ** 48 * .22 * sky.keyIntensity;
      sample.copy(key).multiplyScalar(highlight).add(band).convertLinearToSRGB();
      const offset = (row * width + column) * 4;
      pixels[offset] = Math.min(255, Math.round(sample.r * 255));
      pixels[offset + 1] = Math.min(255, Math.round(sample.g * 255));
      pixels[offset + 2] = Math.min(255, Math.round(sample.b * 255));
      pixels[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, width, height);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.name = 'world-sky-' + preset;
  texture.needsUpdate = true;
  return texture;
}
