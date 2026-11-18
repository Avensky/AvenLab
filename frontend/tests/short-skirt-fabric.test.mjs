import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';

const publicDir = new URL('../public/', import.meta.url);
const values = attribute => Array.from({ length: attribute.count * attribute.itemSize },
  (_, i) => attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize));
const snapshot = geometry => Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, values(attribute)]));
const server = () => createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] } });

function checkBasis(geometry) {
  const n = new Vector3(), t = new Vector3();
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    n.fromBufferAttribute(geometry.attributes.normal, i);
    t.fromBufferAttribute(geometry.attributes.tangent, i);
    assert(Math.abs(n.length() - 1) < 1e-5, `normal ${i} is a unit vector`);
    assert(Math.abs(t.length() - 1) < 1e-5, `tangent ${i} is a unit vector`);
    assert(Math.abs(n.dot(t)) < 1e-5, `tangent ${i} follows the rebuilt surface`);
    assert([-1, 1].includes(geometry.attributes.tangent.getW(i)), 'normal-map handedness remains valid');
  }
}

// Weight by the visible surface area so tiny triangles at folded hems cannot
// dominate the measurement of how well normals describe the actual cloth.
function shadingMismatch(geometry) {
  const { position, normal } = geometry.attributes, index = geometry.index;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), face = new Vector3(), n = new Vector3();
  let error = 0, area = 0;
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    a.fromBufferAttribute(position, vertices[0]);
    b.fromBufferAttribute(position, vertices[1]);
    c.fromBufferAttribute(position, vertices[2]);
    face.crossVectors(b.sub(a), c.sub(a));
    const weight = face.length();
    face.normalize();
    for (const vertex of vertices) {
      n.fromBufferAttribute(normal, vertex);
      error += weight * (1 - face.dot(n));
      area += weight;
    }
  }
  return error / area;
}

test('short skirt fabric smooths UV seams, preserves hard folds, and keeps a valid normal-map basis', async () => {
  const vite = await server();
  try {
    const { rebuildShortSkirtFabricNormals } = await vite.ssrLoadModule('/src/game/characters/shortSkirtFabric.ts');
    const source = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 0, 1, 1, 0, 0, 1, 0,
        0, 0, 0, 0, 1, 0, 0, 0, 1,
      ], 3))
      .setAttribute('normal', new Float32BufferAttribute([
        ...Array.from({ length: 6 }, () => [0, 0, 1]).flat(),
        ...Array.from({ length: 3 }, () => [1, 0, 0]).flat(),
      ], 3))
      .setAttribute('uv', new Float32BufferAttribute([
        0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 2, 1, .5, .5, .5, .5, .5, .5,
      ], 2))
      .setAttribute('tangent', new Float32BufferAttribute([
        ...Array.from({ length: 6 }, () => [1, 0, 0, 1]).flat(),
        ...Array.from({ length: 3 }, () => [0, 1, 0, 1]).flat(),
      ], 4))
      .setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const original = snapshot(source), fitted = source.clone();
    fitted.attributes.position.setZ(4, .3);
    fitted.attributes.normal.array.fill(-.5);
    const approvedPositions = values(fitted.attributes.position);
    rebuildShortSkirtFabricNormals(source, fitted);
    assert.deepEqual(values(fitted.attributes.position), approvedPositions, 'shading never changes the fitted shape');
    assert.deepEqual(values(fitted.attributes.uv), original.uv, 'the authored texture atlas stays in place');
    assert.deepEqual(snapshot(source), original, 'cached source geometry is untouched');
    for (const [left, right] of [[1, 3], [2, 5]]) {
      assert.deepEqual(new Vector3().fromBufferAttribute(fitted.attributes.normal, left),
        new Vector3().fromBufferAttribute(fitted.attributes.normal, right), 'smooth cloth has no seam at a UV split');
    }
    assert.deepEqual(new Vector3().fromBufferAttribute(fitted.attributes.normal, 6), new Vector3(1, 0, 0),
      'a coincident vertex with an authored hard normal stays separate');
    assert.equal(fitted.attributes.tangent.getW(0), 1);
    assert.equal(fitted.attributes.tangent.getW(3), -1, 'mirrored UVs retain their normal-map handedness');
    checkBasis(fitted);
    fitted.dispose();
    source.dispose();
  } finally {
    await vite.close();
  }
});

test('Skirt 02 weave remains subtle when reduced to broad fabric patches', async () => {
  const vite = await server();
  try {
    const { shortSkirtWeave } = await vite.ssrLoadModule('/src/game/characters/shortSkirtFabric.ts');
    const texture = shortSkirtWeave(), { data, width, height } = texture.image;
    let darkest = 255, lightest = 0;
    for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) {
      let sum = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) sum += data[((y + j) * width + x + i) * 4];
      darkest = Math.min(darkest, sum / 64);
      lightest = Math.max(lightest, sum / 64);
    }
    assert(darkest > 240, 'broad cloth patches do not turn into dark stains');
    assert(lightest - darkest < 5, 'coarse checker patches remain below two percent contrast');
    assert(texture.generateMipmaps && texture.anisotropy > 1, 'thread detail can be filtered at oblique and distant views');
  } finally {
    await vite.close();
  }
});

test('all four regular skirts rebuild cloth shading at both tiers without moving the approved fit', async t => {
  const catalog = JSON.parse(await readFile(new URL('../../packages/wardrobe-catalog/character-garments.json', import.meta.url), 'utf8'));
  const skirts = catalog.filter(item => /^skirt-0[1-4]$/.test(item.id));
  const paths = ['models/characters/female/wardrobe/vesper-body.glb',
    'models/characters/villagers/villager-female/villager-female.garage.glb',
    'models/characters/villagers/villager-female/villager-female.portrait.glb',
    ...skirts.flatMap(item => [item.url.slice(1), item.mobileUrl.slice(1)])];
  const files = await Promise.all(paths.map(path => readFile(new URL(path, publicDir)).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  })));
  if (files.some(bytes => !bytes || bytes.subarray(0, 64).toString().startsWith('version https://git-lfs.github.com/spec/v1'))) {
    const message = 'Materialize the Vesper body, Village models, and regular skirt GLBs for shading verification.';
    if (process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS === '1') assert.fail(message);
    return t.skip(message);
  }
  const [donor, garage, portrait, ...scenes] = await Promise.all(files.map(loadWardrobeGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await server();
  try {
    const { prepareShortSkirtFit } = await vite.ssrLoadModule('/src/game/characters/shortSkirtFit.ts');
    const { prepareVillager } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    for (const [i, scene] of scenes.entries()) {
      const item = skirts[Math.floor(i / 2)], label = `${item.id} ${i % 2 ? 'mobile' : 'garage'}`;
      let source;
      scene.traverse(mesh => { if (mesh.isSkinnedMesh && mesh.userData.wardrobePart === 'fabric') source = mesh.geometry; });
      const original = snapshot(source);
      const model = prepareVillager(i % 2 ? portrait : garage, { fitted: true, garments: [{ item, scene }], garmentBody });
      try {
        const garment = model.root.getObjectByName(`wardrobe-${item.id}`);
        const fabric = garment.children.find(mesh => mesh.userData.wardrobePart === 'fabric');
        const lining = garment.children.find(mesh => mesh.userData.wardrobeRole === 'shorts');
        const baseline = prepareShortSkirtFit(item.id, garmentBody.geometry, lining?.geometry)(source);
        assert.deepEqual(values(fabric.geometry.attributes.position), values(baseline.attributes.position), `${label}: exact approved positions`);
        assert.deepEqual(values(fabric.geometry.index), values(source.index), `${label}: exact authored triangles`);
        for (const name of ['uv', 'skinIndex', 'skinWeight']) {
          assert.deepEqual(values(fabric.geometry.attributes[name]), original[name], `${label}: unchanged ${name}`);
        }
        assert(shadingMismatch(fabric.geometry) < shadingMismatch(baseline) * .9, `${label}: surface-normal mismatch drops by at least ten percent`);
        checkBasis(fabric.geometry);
        assert.deepEqual(snapshot(source), original, `${label}: source geometry is reusable`);
        for (const mesh of garment.children.filter(mesh => mesh.userData.wardrobePart !== 'fabric')) {
          const originalGeometry = scene.getObjectByName(mesh.name).geometry;
          const expected = mesh === lining ? originalGeometry : prepareShortSkirtFit(item.id, garmentBody.geometry, lining?.geometry)(originalGeometry) ?? originalGeometry;
          for (const name of ['normal', 'tangent']) {
            if (expected.attributes[name]) assert.deepEqual(values(mesh.geometry.attributes[name]), values(expected.attributes[name]), `${label}: ${mesh.name} retains its authored finish`);
          }
          if (expected !== originalGeometry) expected.dispose();
        }
        baseline.dispose();
      } finally {
        model.dispose();
      }
    }
  } finally {
    await vite.close();
  }
});
