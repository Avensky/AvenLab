import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Ray, Vector3, DoubleSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';
import { prepareWardrobeTopFit } from '../src/game/characters/wardrobeTopFit.ts';

test('Top 05 has a single rear cloth surface across its middle fold on first and repeat equip', async t => {
  const files = await Promise.all(['female/wardrobe/tops/pack7-top-05.glb', 'wardrobe/gothic-02.mobile.glb']
    .map(path => readFile(new URL('../public/models/characters/' + path, import.meta.url))));
  if (files.some(bytes => bytes.toString('ascii', 0, 4) !== 'glTF')) {
    if (process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS) assert.fail('Materialize Top 05 and the body donor');
    return t.skip('Materialize the garment and body donor');
  }
  const [top, donor] = await Promise.all(files.map(loadWardrobeGeometry));
  const source = top.getObjectByName('CLOTH_TOP_PACK7_05').geometry;
  for (let equip = 0; equip < 2; equip++) {
    const fit = prepareWardrobeTopFit(donor.getObjectByName('BODY_WARDROBE').geometry, 'top-05')(source);
    const surface = new MeshBVH(fit);
    for (const x of [-.04, .04]) {
      for (let y = 1.155; y < 1.165; y += .00025) {
        const ray = new Ray(new Vector3(x, y, -1), new Vector3(0, 0, 1));
        const back = surface.raycast(ray, DoubleSide).filter(hit => hit.point.z < 0);
        assert.equal(back.length, 1);
        assert(back[0].normal.z < -.6);
      }
    }
    fit.dispose();
  }
});
