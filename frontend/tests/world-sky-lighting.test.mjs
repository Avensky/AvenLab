import test from 'node:test';
import assert from 'node:assert/strict';
import {Color, EquirectangularReflectionMapping, SRGBColorSpace} from 'three';
import {skyReflectionMap, worldSkyLighting} from '../src/world/worldSkyLighting.ts';

// A matte surface receives the solid-angle weighted sky, not an unweighted average of the poles.
function meanSky(texture) {
  const {data, width, height} = texture.image;
  let energy = 0, weight = 0;
  const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  for (let y = 0; y < height; y++) {
    const area = Math.sin(Math.PI * (y + .5) / height);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      energy += area * (.2126 * linear(data[i] / 255) + .7152 * linear(data[i + 1] / 255) + .0722 * linear(data[i + 2] / 255));
      weight += area;
    }
  }
  return energy / weight;
}

test('reflection quality preserves world illumination on both weather presets', () => {
  const energies = {};
  for (const preset of ['starry_night', 'foggy_day']) {
    const low = skyReflectionMap(preset, false), high = skyReflectionMap(preset, true);
    assert.equal(low.mapping, EquirectangularReflectionMapping);
    assert.equal(low.colorSpace, SRGBColorSpace);
    assert.equal(high.image.width, 2 * low.image.width);
    const a = meanSky(low), b = meanSky(high);
    assert(a > 0 && Math.abs(a - b) / a < .01);
    energies[preset] = a;
    low.dispose(); high.dispose();
  }
  assert(energies.foggy_day > energies.starry_night * 6);
  assert(worldSkyLighting('foggy_day').fogFar < worldSkyLighting('starry_night').fogFar);
});

test('both reflection resolutions reproduce the authored sky at every texel', () => {
  for (const preset of ['foggy_day', 'starry_night']) {
    const sky = worldSkyLighting(preset);
    const horizon = new Color(sky.horizon), zenith = new Color(sky.zenith), ground = new Color(sky.ground);
    const key = new Color(sky.keyColor), band = new Color(), color = new Color();
    for (const detailed of [false, true]) {
      const texture = skyReflectionMap(preset, detailed);
      const { width, height, data } = texture.image;
      const reference = new Uint8ClampedArray(data.length);
      for (let row = 0; row < height; row++) {
        const latitude = Math.PI * ((row + .5) / height - .5);
        const y = Math.sin(latitude), ring = Math.cos(latitude);
        band.copy(horizon).lerp(y < 0 ? ground : zenith, Math.abs(y));
        for (let col = 0; col < width; col++) {
          const angle = 2 * Math.PI * ((col + .5) / width - .5);
          const dot = (-120 * ring * Math.cos(angle) + 180 * y - 80 * ring * Math.sin(angle)) / Math.hypot(-120, 180, -80);
          color.copy(key).multiplyScalar(Math.max(0, dot) ** 48 * .22 * sky.keyIntensity).add(band).convertLinearToSRGB();
          reference.set([Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255), 255], 4 * (row * width + col));
        }
      }
      assert.deepEqual(data, new Uint8Array(reference.buffer));
      texture.dispose();
    }
  }
});
