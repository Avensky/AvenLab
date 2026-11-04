import test from 'node:test';
import assert from 'node:assert/strict';
import {EquirectangularReflectionMapping, SRGBColorSpace} from 'three';
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
