import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Vector3 } from 'three';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';
import { prepareWardrobeTopFit } from '../src/game/characters/wardrobeTopFit.ts';

test('Top 03 keeps the bottom of both armholes on the torso while the upper shoulders move', async t => {
  const models = new URL('../public/models/characters/', import.meta.url);
  const files = await Promise.all(['female/wardrobe/tops/pack7-top-03.glb', 'wardrobe/gothic-02.mobile.glb']
    .map(path => readFile(new URL(path, models))));
  if (files.some(file => file.subarray(0, 4).toString() !== 'glTF')) {
    if (process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS === '1') assert.fail('Top 03 and the body donor must be materialized');
    return t.skip('Pull the Top 03 and body donor GLBs to check their rig');
  }
  const [top, body] = await Promise.all(files.map(loadWardrobeGeometry));
  const panels = [];
  top.traverse(part => { if (part.isSkinnedMesh) panels.push(part); });
  const fabric = panels.find(part => part.material.name === 'MAT_TOP_03_FABRIC');
  assert(fabric);
  const fit = prepareWardrobeTopFit(body.getObjectByName('BODY_WARDROBE').geometry, 'top-03', fabric.skeleton);
  const source = fabric.geometry;
  const sourceWeights = source.getAttribute('skinWeight').array.slice();
  fabric.geometry = fit(source);
  assert(fabric.geometry);
  assert.deepEqual(source.getAttribute('skinWeight').array, sourceWeights);
  t.after(() => fabric.geometry.dispose());
  const positions = source.getAttribute('position'), weights = fabric.geometry.getAttribute('skinWeight');
  const lower = [], shoulder = [];
  top.updateMatrixWorld(true);
  for (let i = 0; i < positions.count; i++) {
    const across = Math.abs(positions.getX(i)), y = positions.getY(i);
    if (y >= 1.38 || across <= .112) {
      for (let channel = 0; channel < 4; channel++) {
        assert.equal(weights.getComponent(i, channel), sourceWeights[i * 4 + channel],
          'the collar and upper shoulder keep their authored weights');
      }
    }
    if (across < .123) continue;
    const samples = y > 1.263 && y < 1.325 ? lower : y > 1.38 ? shoulder : undefined;
    if (samples) samples.push([i, fabric.getVertexPosition(i, new Vector3())]);
    assert(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-5);
  }
  assert(lower.length > 100 && shoulder.length > 100, 'both regions are sampled on the authored cloth');
  for (const side of ['l', 'r']) {
    const direction = side === 'l' ? 1 : -1;
    fabric.skeleton.getBoneByName('clavicle_' + side).rotation.z += direction * .2;
    fabric.skeleton.getBoneByName('upperarm_' + side).rotation.z += direction * .9;
  }
  top.updateMatrixWorld(true);
  function maxMovement(samples, side) {
    const point = new Vector3();
    return Math.max(...samples.filter(([i]) => Math.sign(positions.getX(i)) === side)
      .map(([i, rest]) => fabric.getVertexPosition(i, point).distanceTo(rest)));
  }
  for (const side of [-1, 1]) {
    assert(maxMovement(lower, side) < .00001, 'arm motion leaves the bottom of the opening attached to the torso');
    assert(maxMovement(shoulder, side) > .005, 'the top of the armhole still follows the shoulder');
  }
  assert.deepEqual(fabric.geometry.index.array, source.index.array);
  for (const name of ['uv', 'normal', 'tangent', 'skinIndex']) {
    assert.deepEqual(fabric.geometry.getAttribute(name).array, source.getAttribute(name).array, name);
  }
});

test('Top 03 repeat equips reuse the fit and keep actor buffers isolated across source and rig changes', async t => {
  const { Bone, BufferGeometry, Float32BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute, Skeleton,
    Uint16BufferAttribute } = await import('three');
  const { MeshBVH } = await import('three-mesh-bvh');
  const queries = t.mock.method(MeshBVH.prototype, 'closestPointToPoint');
  const body = new BufferGeometry();
  body.setAttribute('position', new Float32BufferAttribute([0, 1.1, 0, .25, 1.1, 0, .125, 1.55, 0], 3));
  body.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  body.setIndex([0, 1, 2]);
  const source = new BufferGeometry();
  source.setAttribute('position', new Float32BufferAttribute([.13, 1.29, .001], 3));
  source.setAttribute('skinIndex', new Uint16BufferAttribute([0, 1, 0, 0], 4));
  source.setAttribute('skinWeight', new Float32BufferAttribute([.25, .75, 0, 0], 4));
  const rig = name => new Skeleton(['spine', name].map(joint => Object.assign(new Bone(), { name: joint })));
  const equip = (skeleton = rig('upperarm_l')) => prepareWardrobeTopFit(body, 'top-03', skeleton)(source);

  const first = equip();
  const expected = first.getAttribute('position').array.slice();
  assert.equal(first.getAttribute('skinWeight').getX(0), 1);
  assert.equal(queries.mock.callCount(), 1);
  first.getAttribute('position').setX(0, 42);
  first.getAttribute('skinWeight').setX(0, 0);
  first.dispose();
  source.setAttribute('uv', new Float32BufferAttribute([.25, .5], 2));
  const warm = equip();
  assert.deepEqual(warm.getAttribute('position').array, expected);
  assert.equal(warm.getAttribute('skinWeight').getX(0), 1);
  assert.equal(warm.getAttribute('uv').getX(0), .25);
  for (const attribute of ['position', 'skinWeight', 'skinIndex', 'uv']) {
    assert.notEqual(warm.getAttribute(attribute).array, source.getAttribute(attribute).array);
  }
  assert.equal(queries.mock.callCount(), 1, 'a new actor on the same rig skips the vertex fit');

  source.getAttribute('position').setX(0, .14);
  source.getAttribute('position').needsUpdate = true;
  assert.equal(equip().getAttribute('position').getX(0), Math.fround(.14));
  body.getAttribute('normal').needsUpdate = true;
  equip();
  source.setAttribute('skinWeight', new Float32BufferAttribute([.6, .4, 0, 0], 4));
  equip();
  assert.equal(equip(rig('spine_02')).getAttribute('skinWeight').getX(0), Math.fround(.6));
  assert.equal(queries.mock.callCount(), 5, 'source, donor and joint changes each trigger fresh fitting');

  const packed = new InterleavedBuffer(new Float32Array([.13, 1.29, .001, .25, .5]), 5);
  source.setAttribute('position', new InterleavedBufferAttribute(packed, 3, 0));
  source.setAttribute('uv', new InterleavedBufferAttribute(packed, 2, 3));
  const interleavedCold = equip(), interleavedWarm = equip();
  const owned = interleavedWarm.getAttribute('position').data;
  assert.deepEqual(owned.array, interleavedCold.getAttribute('position').data.array);
  assert.notEqual(owned, packed);
  assert.equal(owned, interleavedWarm.getAttribute('uv').data);
  assert.deepEqual([...owned.array.slice(3)], [.25, .5], 'restoring fitted positions preserves adjacent UVs');
  packed.needsUpdate = true;
  equip();
  assert.equal(queries.mock.callCount(), 7);
});
