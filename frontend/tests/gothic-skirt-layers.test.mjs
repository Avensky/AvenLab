import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Vector3 } from 'three';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';

const publicDir = new URL('../public/', import.meta.url);
const values = attribute => Array.from({ length: attribute.count * attribute.itemSize },
  (_, i) => attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize));
const snapshot = geometry => ({ index: values(geometry.index), attributes:
  Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, values(attribute)])) });

function meshesIn(root) {
  const meshes = [];
  root.traverse(mesh => { if (mesh.isSkinnedMesh) meshes.push(mesh); });
  return meshes;
}

function activeVertices(geometry) {
  const { index, drawRange } = geometry;
  return new Set(Array.from({ length: Math.min(index.count - drawRange.start, drawRange.count) },
    (_, i) => index.getX(drawRange.start + i)));
}

test('standalone Gothic 05 removes its overlapping short panel while preserving the fitted waistband and long skirt', async t => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] } });
  const loaded = new Map();
  async function load(url) {
    if (!url) throw Error('Missing installed wardrobe asset');
    if (!loaded.has(url)) {
      const bytes = await readFile(new URL(url.replace(/^\//, ''), publicDir));
      if (bytes.toString('ascii', 0, 4) !== 'glTF') throw Error('Git LFS pointer: ' + url);
      loaded.set(url, await loadWardrobeGeometry(bytes));
    }
    return loaded.get(url);
  }
  try {
    const [{ prepareVillager, applyVillagerLook }, { DEFAULT_CHARACTER, characterLook },
      { getWardrobeGarment, wardrobeGarmentModelUrl }, { corsetModelUrl }, { getWardrobeActorBody },
      { wardrobeCoverageSurface }, { prepareGothicSkirtFit }, { buildEmoteClips, findGaragePreviewEmote }] = await Promise.all(
      ['villagerModel', 'characterCatalog', 'wardrobeGarments', 'wardrobe', 'wardrobeBody', 'wardrobeCoverage', 'gothicSkirtFit', 'garageEmotes']
        .map(name => vite.ssrLoadModule(`/src/game/characters/${name}.ts`)));
    const donor = getWardrobeActorBody(await load('models/characters/female/wardrobe/vesper-body.glb'));
    const item = getWardrobeGarment('gothic-skirt-05');
    const wardrobeTrial = { set: 'gothic-05', shirt: 'none', waist: 'tucked' };

    for (const [tier, kind, suffix] of [['garage', 'garage', 'garage'], ['mobile', 'portrait', 'portrait']]) {
      const actor = await load(`models/characters/villagers/villager-female/villager-female.${suffix}.glb`);
      const url = wardrobeGarmentModelUrl(item, kind), source = await load(url);
      const sourceMeshes = meshesIn(source), originals = new Map(sourceMeshes.map(mesh => [mesh, snapshot(mesh.geometry)]));
      const sourceWaist = sourceMeshes.find(mesh => mesh.material.name === 'MAT_GOTHIC_05_Fabric_0');
      const sourceLong = sourceMeshes.find(mesh => mesh.material.name === 'MAT_GOTHIC_05_Trim_1');
      assert(sourceWaist && sourceLong, `${tier}: separate waistband/short panel and long skirt are present`);
      const waistbandFaces = [], shortPanelFaces = [];
      const sourceIndex = sourceWaist.geometry.index, sourcePosition = sourceWaist.geometry.attributes.position;
      for (let face = 0; face < sourceIndex.count; face += 3) {
        const triangle = [sourceIndex.getX(face), sourceIndex.getX(face + 1), sourceIndex.getX(face + 2)];
        (triangle.every(vertex => sourcePosition.getY(vertex) > 1) ? waistbandFaces : shortPanelFaces).push(...triangle);
      }
      assert(shortPanelFaces.length > 3000 && waistbandFaces.length > 3000,
        'the original asset contains both the redundant short skirt and a substantial waistband');

      // Compare against the existing untrimmed fit, rather than accepting a
      // changed silhouette as a side effect of removing the inner layer.
      const bodySurface = wardrobeCoverageSurface(donor.geometry);
      const skirtSurfaces = sourceMeshes.filter(mesh => !mesh.material.transparent &&
        !/hardware|ornament|buttons|buckle|^laces$|^closure$/.test(String(mesh.material.userData.tintChannel
          ?? mesh.material.userData.color_slot ?? mesh.userData.wardrobePart ?? 'fabric')))
        .map(mesh => wardrobeCoverageSurface(mesh.geometry));
      const fit = prepareGothicSkirtFit(bodySurface, skirtSurfaces, item.id, getWardrobeActorBody(actor).skeleton, url === item.revisionUrl);
      const fittedReference = new Map(sourceMeshes.map(mesh => [mesh.name, fit(mesh.geometry) ?? mesh.geometry.clone()]));
      bodySurface.geometry.dispose();
      for (const surface of skirtSurfaces) surface.geometry.dispose();
      const corsetSource = { set: wardrobeTrial.set, scene: await load(corsetModelUrl(wardrobeTrial, kind)) };
      const sourceDisposals = new Set();
      const sourceListeners = sourceMeshes.map(mesh => {
        const listener = () => sourceDisposals.add(mesh.geometry);
        mesh.geometry.addEventListener('dispose', listener);
        return [mesh.geometry, listener];
      });
      const model = prepareVillager(actor, { fitted: true, garmentBody: donor, corsetSource,
        garments: [{ item, scene: source, authoredFit: url === item.revisionUrl }] });
      const garment = model.root.getObjectByName(`wardrobe-${item.id}`);
      const fittedMeshes = meshesIn(garment);
      const ownedDisposals = new Map(fittedMeshes.map(mesh => [mesh.geometry, 0]));
      for (const geometry of ownedDisposals.keys()) geometry.addEventListener('dispose', () =>
        ownedDisposals.set(geometry, ownedDisposals.get(geometry) + 1));
      try {
        assert.equal(fittedMeshes.length, sourceMeshes.length, 'decorative material panels remain available');
        const waistband = fittedMeshes.find(mesh => mesh.material.name === sourceWaist.material.name);
        const longSkirt = fittedMeshes.find(mesh => mesh.material.name === sourceLong.material.name);
        assert.deepEqual(values(waistband.geometry.index), waistbandFaces, 'only the redundant short-panel faces are removed');
        assert.deepEqual(values(longSkirt.geometry.index), originals.get(sourceLong).index, 'the complete long skirt stays intact');
        assert.equal(waistband.geometry.drawRange.count, waistbandFaces.length);
        for (const mesh of fittedMeshes) {
          const reference = fittedReference.get(mesh.name);
          for (const attribute of ['position', 'uv', 'skinIndex', 'skinWeight']) {
            assert.deepEqual(values(mesh.geometry.attributes[attribute]), values(reference.attributes[attribute]),
              `${tier} ${mesh.name}: ${attribute} retains the approved fit`);
          }
        }
        for (const waist of ['tucked', 'over', 'tucked']) {
          applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: item.id },
            wardrobeTrial: { ...wardrobeTrial, waist } }));
          assert(garment.visible && waistband.visible && longSkirt.visible);
          assert.equal(model.root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible, false, 'stock skirt cannot overlap the separate skirt');
          assert.equal(model.root.getObjectByName('CLOTH_UNDER_UNDERSKIRT').visible, false);
          assert.deepEqual(values(waistband.geometry.index), waistbandFaces, `${waist}: the short panel stays removed`);
          for (const [pose, phase] of [['standing', 0], ['walk-casual', .39], ['heart-overhead', .49]]) {
            const mixer = new AnimationMixer(model.root);
            if (phase) {
              const [clip] = buildEmoteClips(model.root, [findGaragePreviewEmote(pose, false)]);
              mixer.clipAction(clip).play();
              mixer.setTime(clip.duration * phase);
            }
            model.root.updateMatrixWorld(true);
            const point = new Vector3();
            const minimumHeight = mesh => {
              let minimum = Infinity;
              for (const vertex of activeVertices(mesh.geometry)) {
                mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
                minimum = Math.min(minimum, point.y);
              }
              return minimum;
            };
            assert(minimumHeight(waistband) > .95, `${tier} ${waist} ${pose}: no short inner panel hangs into the lower drape`);
            assert(minimumHeight(longSkirt) < .65, `${tier} ${waist} ${pose}: the long pleated hem remains`);
            mixer.stopAllAction();
            mixer.uncacheRoot(model.root);
          }
        }
      } finally {
        model.dispose();
        for (const geometry of fittedReference.values()) geometry.dispose();
        for (const [geometry, listener] of sourceListeners) geometry.removeEventListener('dispose', listener);
      }
      assert.equal(sourceDisposals.size, 0, 'shared source geometries are never disposed by a preview');
      assert([...ownedDisposals.values()].every(count => count === 1), 'each displayed fitted geometry is disposed once');
      for (const [mesh, original] of originals) assert.deepEqual(snapshot(mesh.geometry), original,
        `${tier} ${mesh.name}: the cached source asset remains unchanged`);
    }
  } catch (error) {
    const missing = error.code === 'ENOENT' || error.message.startsWith('Git LFS pointer:') || error.message === 'Missing installed wardrobe asset';
    if (missing && process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS !== '1') return t.skip(error.message);
    throw error;
  } finally { await vite.close(); }
});
