import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, BufferGeometry, Float32BufferAttribute, Line3 } from 'three';
import { ExtendedTriangle } from 'three-mesh-bvh';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';

const publicDir = new URL('../public/', import.meta.url);
const values = attribute => Array.from({ length: attribute.count * attribute.itemSize },
  (_, i) => attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize));
const snapshot = geometry => ({ index: values(geometry.index), attributes:
  Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, values(attribute)])) });
const meshesIn = root => root.getObjectsByProperty('isSkinnedMesh', true);
const fabricIn = root => meshesIn(root).find(mesh => mesh.material.name === 'MAT_GOTHIC_01_Fabric_1');

async function environment(t, run) {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] } });
  const cache = new Map();
  const load = async path => {
    if (!cache.has(path)) {
      const bytes = await readFile(new URL(path.replace(/^\//, ''), publicDir));
      if (bytes.toString('ascii', 0, 4) !== 'glTF') throw Error('Git LFS pointer: ' + path);
      cache.set(path, await loadWardrobeGeometry(bytes));
    }
    return cache.get(path);
  };
  try {
    const names = ['villagerModel', 'characterCatalog', 'wardrobeGarments', 'wardrobeCoverage', 'gothicSkirtFit', 'gothicSkirtPanels', 'garageEmotes'];
    const api = Object.assign({}, ...await Promise.all(names.map(name => vite.ssrLoadModule(`/src/game/characters/${name}.ts`))));
    await run(api, load);
  } catch (error) {
    if ((error.code === 'ENOENT' || error.message.startsWith('Git LFS pointer:')) && process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS !== '1') return t.skip(error.message);
    throw error;
  } finally { await vite.close(); }
}

function verifyPreservedFit(before, after, layers, label) {
  assert.deepEqual(values(after.index), values(before.index), `${label}: authored triangles remain intact`);
  for (const name of ['uv', 'skinIndex', 'skinWeight']) {
    assert.deepEqual(values(after.attributes[name]), values(before.attributes[name]), `${label}: ${name} remains intact`);
  }
  const p = before.attributes.position, q = after.attributes.position;
  let changed = 0;
  for (let i = 0; i < p.count; i++) {
    const distance = Math.hypot(q.getX(i) - p.getX(i), q.getY(i) - p.getY(i), q.getZ(i) - p.getZ(i));
    assert.equal(q.getY(i), p.getY(i), `${label}: panel height ${i} is unchanged`);
    if (!layers.inner[i] || p.getY(i) <= .60 || p.getY(i) >= 1.04) {
      for (const name of ['position', 'normal', 'tangent']) {
        const a = before.attributes[name], b = after.attributes[name];
        if (!a) continue;
        for (let channel = 0; channel < a.itemSize; channel++) assert.equal(b.getComponent(i, channel), a.getComponent(i, channel),
          `${label}: outer cut, waistband and exposed hem retain ${name}`);
      }
    } else {
      assert(distance <= .012001, `${label}: inner correction stays within 12 mm`);
      const originalRadius = Math.hypot(p.getX(i), p.getZ(i) - .025), radius = Math.hypot(q.getX(i), q.getZ(i) - .025);
      assert(radius <= originalRadius + 1e-6, `${label}: covered fabric only moves inward`);
      if (distance > 1e-7) changed++;
    }
    const n = after.attributes.normal, originalNormal = before.attributes.normal;
    const length = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
    assert(Number.isFinite(length), `${label}: finite shading normal`);
    if (Math.hypot(originalNormal.getX(i), originalNormal.getY(i), originalNormal.getZ(i)) > .5) {
      assert(Math.abs(length - 1) < .002, `${label}: transformed shading normals remain unit length`);
    } else {
      // The bundled export already contains a few zero normals.
      // Preserve those authored values instead of silently repairing other parts.
      for (let channel = 0; channel < 3; channel++) assert.equal(n.getComponent(i, channel), originalNormal.getComponent(i, channel));
    }
  }
  assert(changed > 20, `${label}: the covered layer receives a substantive correction`);
}

function crossingLength(mesh, geometry, faces) {
  const previous = mesh.geometry;
  mesh.geometry = geometry;
  try {
    const triangles = faces.map(face => {
      const triangle = new ExtendedTriangle();
      for (const [corner, point] of [triangle.a, triangle.b, triangle.c].entries()) {
        mesh.getVertexPosition(geometry.index.getX(face * 3 + corner), point);
      }
      triangle.needsUpdate = true;
      return triangle;
    });
    const line = new Line3();
    return triangles[0].intersectsTriangle(triangles[1], line) ? line.distance() : 0;
  } finally { mesh.geometry = previous; }
}

test('Gothic 01 seats the visible inner-panel tears through walking while preserving the approved outer fit', async t => environment(t, async (api, load) => {
  const donor = (await load('models/characters/female/wardrobe/vesper-body.glb')).getObjectByName('BODY_WARDROBE');
  const item = api.getWardrobeGarment('gothic-skirt-01'), scene = await load(item.url);
  const sourceMeshes = meshesIn(scene), originals = new Map(sourceMeshes.map(mesh => [mesh.geometry, snapshot(mesh.geometry)]));
  const sourceFabric = fabricIn(scene), selection = api.handkerchiefSkirtPanelLayers(sourceFabric.geometry);
  assert(selection.inner.reduce((sum, selected) => sum + selected, 0) > 1000, 'the longer drape is selected from its topology');

  // A reordered export must identify the same physical drape rather than
  // relying on the vertex numbers used to locate the original visible tear.
  const position = sourceFabric.geometry.attributes.position, reordered = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
  for (let i = 0; i < position.count; i++) reordered.setXYZ(position.count - 1 - i, position.getX(i), position.getY(i), position.getZ(i));
  const permuted = new BufferGeometry().setAttribute('position', reordered)
    .setIndex(values(sourceFabric.geometry.index).map(vertex => position.count - 1 - vertex));
  const permutedSelection = api.handkerchiefSkirtPanelLayers(permuted);
  for (let i = 0; i < position.count; i++) assert.equal(permutedSelection.inner[position.count - 1 - i], selection.inner[i]);
  permuted.dispose();

  const sourceDisposed = new Set();
  for (const geometry of originals.keys()) geometry.addEventListener('dispose', () => sourceDisposed.add(geometry));
  for (const tier of ['garage', 'portrait']) {
    const actor = await load(`models/characters/villagers/villager-female/villager-female.${tier}.glb`);
    const body = api.wardrobeCoverageSurface(donor.geometry);
    const surfaces = sourceMeshes.filter(mesh => !/Hardware/.test(mesh.material.name)).map(mesh => api.wardrobeCoverageSurface(mesh.geometry));
    const fit = api.prepareGothicSkirtFit(body, surfaces, item.id, donor.skeleton);
    const references = new Map(sourceMeshes.map(mesh => [mesh.name, fit(mesh.geometry) ?? mesh.geometry.clone()]));
    body.geometry.dispose();
    for (const surface of surfaces) surface.geometry.dispose();
    const model = api.prepareVillager(actor, { fitted: true, garmentBody: donor, garments: [{ item, scene }] });
    const garment = model.root.getObjectByName(`wardrobe-${item.id}`), fabric = fabricIn(garment), baseline = references.get(fabric.name);
    const result = fabric.geometry;
    let disposals = 0;
    result.addEventListener('dispose', () => disposals++);
    const mixer = new AnimationMixer(model.root);
    try {
      const look = api.characterLook({ ...api.DEFAULT_CHARACTER, garments: { skirt: item.id } });
      api.applyVillagerLook(model, look);
      verifyPreservedFit(baseline, result, api.handkerchiefSkirtPanelLayers(baseline), tier);
      for (const mesh of meshesIn(garment).filter(mesh => mesh !== fabric)) {
        assert.deepEqual(snapshot(mesh.geometry), snapshot(references.get(mesh.name)), `${tier}: trim, inset and hardware retain their existing fit`);
      }
      // These two outer/inner pairs produce the traced pointed strip in the
      // rear walking view. Inner-to-inner folded seams are not the defect.
      const visiblePairs = [[809, 324], [885, 291]], reproduced = [0, 0];
      const [clip] = api.buildEmoteClips(model.root, [api.findGaragePreviewEmote('walk-casual', false)]);
      mixer.clipAction(clip).play();
      for (const phase of [0, .18, .30, .39, .50, .64, .86]) {
        mixer.setTime(clip.duration * phase);
        model.root.updateMatrixWorld(true);
        for (const [i, pair] of visiblePairs.entries()) {
          reproduced[i] = Math.max(reproduced[i], crossingLength(fabric, baseline, pair));
          assert(crossingLength(fabric, result, pair) < 1e-6, `${tier}: visible panel pair ${pair} stays separated at walk ${phase}`);
        }
      }
      assert(reproduced.every(length => length > .04), 'both long source intersections are reproduced by the regression');
      api.applyVillagerLook(model, look);
      assert.equal(fabric.geometry, result, 'an unchanged outfit reuses its fitted panel geometry');
    } finally {
      mixer.stopAllAction();
      mixer.uncacheRoot(model.root);
      model.dispose();
      for (const geometry of references.values()) geometry.dispose();
    }
    assert.equal(disposals, 1, `${tier}: fitted panel geometry is disposed once`);
  }
  assert.equal(sourceDisposed.size, 0, 'the shared imported asset is never disposed');
  for (const [geometry, original] of originals) assert.deepEqual(snapshot(geometry), original, 'the cached source remains reusable');
}));

test('bundled Gothic 01 applies the same inner-panel repair after its waist fit and restores owned geometry safely', async t => environment(t, async (api, load) => {
  for (const tier of ['garage', 'mobile']) {
    const scene = await load(`models/characters/wardrobe/gothic-01.${tier}.glb`);
    const sourceMeshes = meshesIn(scene.getObjectByName('CLOTH_BOTTOM_SKIRT'));
    const originals = new Map(sourceMeshes.map(mesh => [mesh.geometry, snapshot(mesh.geometry)]));
    const sourceDisposed = new Set();
    for (const geometry of originals.keys()) geometry.addEventListener('dispose', () => sourceDisposed.add(geometry));
    const body = api.wardrobeCoverageSurface(scene.getObjectByName('BODY_WARDROBE').geometry, [.84, 1.25]);
    const surfaces = sourceMeshes.map(mesh => api.wardrobeCoverageSurface(mesh.geometry));
    const fit = api.prepareGothicWaistline(body, surfaces, 'gothic-skirt-01');
    const references = new Map(sourceMeshes.map(mesh => [mesh.name, fit(mesh.geometry) ?? mesh.geometry.clone()]));
    body.geometry.dispose();
    for (const surface of surfaces) surface.geometry.dispose();
    const model = api.prepareVillager(scene, { fitted: true });
    const skirt = model.root.getObjectByName('CLOTH_BOTTOM_SKIRT'), fabric = fabricIn(skirt), result = fabric.geometry;
    let disposals = 0;
    result.addEventListener('dispose', () => disposals++);
    try {
      const baseline = references.get(fabric.name);
      verifyPreservedFit(baseline, result, api.handkerchiefSkirtPanelLayers(baseline), `bundled ${tier}`);
      for (const mesh of meshesIn(skirt).filter(mesh => mesh !== fabric)) {
        assert.deepEqual(snapshot(mesh.geometry), snapshot(references.get(mesh.name)), `${tier}: bundled decoration retains its existing fit`);
      }
      for (const waist of ['tucked', 'over', 'tucked']) {
        api.applyVillagerLook(model, api.characterLook({ ...api.DEFAULT_CHARACTER, wardrobe: { set: 'gothic-01', shirt: 'none', waist } }));
        assert.equal(fabric.geometry, result, `${tier}: ${waist} reuses the corrected drape`);
      }
    } finally {
      model.dispose();
      for (const geometry of references.values()) geometry.dispose();
    }
    assert.equal(disposals, 1, `${tier}: the bundled repair is disposed exactly once`);
    assert.equal(sourceDisposed.size, 0, `${tier}: bundled source geometry stays alive`);
    assert.equal(fabric.geometry, fabricIn(scene.getObjectByName('CLOTH_BOTTOM_SKIRT')).geometry,
      `${tier}: disposal unwinds the repair and waist fit back to the shared source`);
    for (const [geometry, original] of originals) assert.deepEqual(snapshot(geometry), original, `${tier}: source geometry remains unchanged`);
  }
}));
