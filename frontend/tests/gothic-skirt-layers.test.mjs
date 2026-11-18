import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, DoubleSide, Float32BufferAttribute, Line3, Matrix4, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
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

// Only crossings exposed inside the white panel are tears. Its sewn outline
// intentionally meets the gray layer, so leave a small seam allowance there.
function exposedLiningCrossings(lining, shell) {
  const posed = mesh => {
    const geometry = mesh.geometry.clone(), position = new Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3);
    const point = new Vector3();
    for (let i = 0; i < position.count; i++) { mesh.getVertexPosition(i, point); position.setXYZ(i, point.x, point.y, point.z); }
    geometry.setAttribute('position', position);
    return new MeshBVH(geometry, { indirect: true });
  };
  const inner = posed(lining), outer = posed(shell);
  const { position } = outer.geometry.attributes, index = outer.geometry.index;
  const welded = new Map(), vertices = [];
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 1e6)).join(',');
    if (!welded.has(key)) welded.set(key, welded.size);
    vertices.push(welded.get(key));
  }
  const edges = new Map();
  for (let face = 0; face < index.count; face += 3) {
    const triangle = [index.getX(face), index.getX(face + 1), index.getX(face + 2)];
    for (let corner = 0; corner < 3; corner++) {
      const a = triangle[corner], b = triangle[(corner + 1) % 3];
      const key = [vertices[a], vertices[b]].sort((a, b) => a - b).join(':');
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { count: 1, a, b });
    }
  }
  const boundary = [...edges.values()].filter(edge => edge.count === 1).map(({ a, b }) =>
    new Line3(new Vector3().fromBufferAttribute(position, a), new Vector3().fromBufferAttribute(position, b)));
  const line = new Line3(), center = new Vector3(), edgePoint = new Vector3(), ray = new Ray();
  let exposed = 0;
  try {
    inner.bvhcast(outer, new Matrix4(), { intersectsTriangles(a, b) {
      if (!a.intersectsTriangle(b, line, true) || line.distance() < .001) return false;
      line.getCenter(center);
      const coveredUpperPanel = center.y > .95 && center.y < 1.08;
      const coveredRearPanel = center.y > .82 && center.y < .95 && center.z < .025;
      if (!coveredUpperPanel && !coveredRearPanel) return false;
      if (boundary.some(edge => edge.closestPointToPoint(center, true, edgePoint).distanceTo(center) < .006)) return false;
      const depth = center.z - .025, radius = Math.hypot(center.x, depth);
      ray.origin.set(.45 * center.x / radius, center.y, .025 + .45 * depth / radius);
      ray.direction.set(-center.x / radius, 0, -depth / radius);
      const hit = outer.raycastFirst(ray, DoubleSide, 0, .45);
      if (hit && Math.abs(hit.distance - (.45 - radius)) < .0005) exposed++;
      return false;
    } });
    return exposed;
  } finally { inner.geometry.dispose(); outer.geometry.dispose(); }
}

test('Gothic 03 seats its covered gray panel through motion without changing the white shell, waistband or ruffles', async t => {
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
      { getWardrobeGarment, wardrobeGarmentModelUrl }, { getWardrobeActorBody }, { wardrobeCoverageSurface },
      { prepareGothicSkirtFit }, { buildEmoteClips, findGaragePreviewEmote, garageBreathing }] = await Promise.all(
      ['villagerModel', 'characterCatalog', 'wardrobeGarments', 'wardrobeBody', 'wardrobeCoverage', 'gothicSkirtFit', 'garageEmotes']
        .map(name => vite.ssrLoadModule(`/src/game/characters/${name}.ts`)));
    const donor = getWardrobeActorBody(await load('models/characters/female/wardrobe/vesper-body.glb'));
    const item = getWardrobeGarment('gothic-skirt-03');
    let checked = 0, baselineContacts = 0, maximumInset = 0;
    for (const kind of ['garage', 'portrait']) {
      const actor = await load(`models/characters/villagers/villager-female/villager-female.${kind}.glb`);
      const url = wardrobeGarmentModelUrl(item, kind), source = await load(url);
      const sources = meshesIn(source), originals = new Map(sources.map(mesh => [mesh, snapshot(mesh.geometry)]));
      const body = wardrobeCoverageSurface(donor.geometry);
      const surfaces = sources.filter(mesh => /Fabric|Trim/.test(mesh.material.name)).map(mesh => wardrobeCoverageSurface(mesh.geometry));
      const fit = prepareGothicSkirtFit(body, surfaces, item.id, getWardrobeActorBody(actor).skeleton, url === item.revisionUrl);
      const reference = new Map(sources.map(mesh => [mesh.name, fit(mesh.geometry) ?? mesh.geometry.clone()]));
      for (const surface of surfaces) surface.geometry.dispose();
      const model = prepareVillager(actor, { fitted: true, garmentBody: donor, garments: [{ item, scene: source, authoredFit: url === item.revisionUrl }] });
      const garments = meshesIn(model.root.getObjectByName(`wardrobe-${item.id}`));
      const lining = garments.find(mesh => mesh.material.name === 'MAT_GOTHIC_03_Trim_1');
      const shell = garments.find(mesh => mesh.material.name === 'MAT_GOTHIC_03_Fabric_2');
      const cover = wardrobeCoverageSurface(reference.get(shell.name));
      const ray = new Ray();
      const owned = lining.geometry;
      let disposed = 0;
      owned.addEventListener('dispose', () => disposed++);
      try {
        applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: item.id } }));
        for (const mesh of garments) {
          const before = reference.get(mesh.name);
          if (mesh !== lining) assert.deepEqual(snapshot(mesh.geometry), snapshot(before), `${kind}: outer panels and hardware stay exact`);
          else {
            assert.deepEqual(values(mesh.geometry.index), values(before.index), 'inner topology stays intact');
            for (const name of ['uv', 'skinIndex', 'skinWeight']) assert.deepEqual(values(mesh.geometry.attributes[name]), values(before.attributes[name]));
            const old = before.attributes.position, next = mesh.geometry.attributes.position;
            let moved = 0;
            for (let i = 0; i < next.count; i++) {
              const x = old.getX(i), y = old.getY(i), z = old.getZ(i) - .025, radius = Math.hypot(x, z);
              const after = Math.hypot(next.getX(i), next.getZ(i) - .025), inset = radius - after;
              assert.equal(next.getY(i), y, 'no part of the skirt is raised or lowered');
              assert(inset >= -1e-7 && inset <= .040001, 'only a bounded inward layer fit is allowed');
              maximumInset = Math.max(maximumInset, inset);
              if (y <= .78 || y >= 1.08) {
                assert.equal(next.getX(i), x); assert.equal(next.getZ(i), old.getZ(i));
              }
              ray.origin.set(0, y, .025);
              ray.direction.set(x / radius, 0, z / radius);
              if (!cover.raycastFirst(ray, DoubleSide, 0, .28)) {
                assert.equal(next.getX(i), x, 'the exposed gray ruffles and opening stay unchanged');
                assert.equal(next.getZ(i), old.getZ(i));
              }
              if (inset > 1e-6) {
                moved++;
                ray.origin.set(.28 * x / radius, y, .025 + .28 * z / radius);
                ray.direction.set(-x / radius, 0, -z / radius);
                const skin = body.raycastFirst(ray, DoubleSide, 0, .28);
                assert(skin && after >= .28 - skin.distance + .002 - 1e-6, 'covered cloth keeps two millimeters above the skin');
              }
            }
            assert(moved > 30, 'the affected upper inner panel was seated');
          }
        }
        const mixer = new AnimationMixer(model.root);
        const poses = [[undefined, [0]], [garageBreathing(), [.25, .5, .75]],
          [findGaragePreviewEmote('walk-casual', false), [.2, .39, .49, .6, .8]],
          [findGaragePreviewEmote('heart-overhead', false), [.25, .49, .75]]];
        for (const [emote, phases] of poses) {
          const [clip] = emote ? buildEmoteClips(model.root, [emote]) : [];
          const action = clip && mixer.clipAction(clip).play();
          for (const phase of phases) {
            if (clip) mixer.setTime(clip.duration * phase);
            model.root.updateMatrixWorld(true);
            if (!emote) {
              lining.geometry = reference.get(lining.name);
              baselineContacts += exposedLiningCrossings(lining, shell);
              lining.geometry = owned;
            }
            assert.equal(exposedLiningCrossings(lining, shell), 0, `${kind} ${emote?.id ?? 'standing'} @${phase}: inner gray panel cannot pierce the white interior`);
            checked++;
          }
          action?.stop();
        }
        mixer.uncacheRoot(model.root);
      } finally {
        lining.geometry = owned;
        model.dispose(); body.geometry.dispose(); cover.geometry.dispose();
        for (const geometry of reference.values()) geometry.dispose();
      }
      assert.equal(disposed, 1, 'the fitted inner geometry is disposed once');
      for (const [mesh, original] of originals) assert.deepEqual(snapshot(mesh.geometry), original, 'shared source remains unchanged');
    }
    assert(baselineContacts > 20, 'the regression reproduces the original exposed panel defect');
    assert.equal(checked, 24);
    t.diagnostic(`24 posed layer checks; ${baselineContacts} baseline exposed intersections; maximum hidden inset ${(maximumInset * 1000).toFixed(2)} mm.`);
  } catch (error) {
    const missing = error.code === 'ENOENT' || error.message.startsWith('Git LFS pointer:') || error.message === 'Missing installed wardrobe asset';
    if (missing && process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS !== '1') return t.skip(error.message);
    throw error;
  } finally { await vite.close(); }
});
