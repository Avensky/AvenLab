import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AnimationMixer } from 'three';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';
import { auditPose, lowerBustMarkers } from '../scripts/tucked-skirt-metrics.mjs';

const publicDir = new URL('../public/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../../packages/wardrobe-catalog/character-garments.json', import.meta.url)));
const skirts = catalog.filter(item => /^gothic-skirt-0[1-5]$|^skirt-0[1-4]$/.test(item.id));
const poses = [['standing', 0], ['walk-casual', .39], ['heart-overhead', .49]];

// A side seam extended down the torso can accidentally attach to a nearby
// forearm. Such a spike sits above the waistband and escapes overlap tests.
function checkCorsetSides(tucked, source) {
  let sampled = 0, growth = 0;
  tucked.traverseVisible(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const before = source.getObjectByName(mesh.name)?.geometry?.attributes.position;
    if (!before) return;
    const { index, drawRange, attributes } = mesh.geometry;
    const end = Math.min(index.count, drawRange.start + drawRange.count);
    for (let i = drawRange.start; i < end; i++) {
      const v = index.getX(i), x = before.getX(v), y = before.getY(v);
      const originalRadius = Math.hypot(x, before.getZ(v) - .025);
      if (y < 1.02 || y > 1.179 || Math.abs(x) < .75 * originalRadius) continue;
      const radius = Math.hypot(attributes.position.getX(v), attributes.position.getZ(v) - .025);
      growth = Math.max(growth, radius - originalRadius);
      sampled++;
    }
  });
  assert(sampled > 0 && growth < .018, `tucked corset side seams stay close to their authored width (${growth * 1000} mm growth)`);
}

// A corset changes its own tuck; the skirt's belt, drape and lining keep their fit.
function checkSkirtWidth(skirt, applyWaist) {
  applyWaist('over');
  const over = new Map();
  skirt.traverse(node => {
    if (node.isSkinnedMesh) over.set(node, {
      geometry: node.geometry,
      positions: node.geometry.attributes.position.array.slice(),
    });
  });
  assert(over.size > 0, 'the fitted skirt has measurable geometry');
  for (const waist of ['tucked', 'over', 'tucked']) {
    applyWaist(waist);
    for (const [mesh, original] of over) {
      assert.equal(mesh.geometry, original.geometry, `${skirt.name} keeps its geometry in ${waist} mode`);
      assert.deepEqual(mesh.geometry.attributes.position.array, original.positions,
        `${skirt.name} keeps its waistband, drape and lining in ${waist} mode`);
    }
  }
}

test('Gothic and Pack 7 skirts clear the bust and layer outside every tucked corset on both detail tiers', async t => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  const sceneCache = new Map();
  async function sceneFor(url) {
    if (!url) throw Error('Missing installed wardrobe asset');
    if (!sceneCache.has(url)) {
      const data = await readFile(new URL(url.replace(/^\//, ''), publicDir));
      if (data.toString('ascii', 0, 4) !== 'glTF') throw Error('Git LFS pointer: ' + url);
      sceneCache.set(url, await loadWardrobeGeometry(data));
    }
    return sceneCache.get(url);
  }
  try {
    const [{ prepareVillager, applyVillagerLook }, { DEFAULT_CHARACTER, characterLook }, { buildEmoteClips, findGaragePreviewEmote },
      { corsetModelUrl }, { wardrobeGarmentModelUrl }] = await Promise.all(
      ['villagerModel', 'characterCatalog', 'garageEmotes', 'wardrobe', 'wardrobeGarments']
        .map(name => vite.ssrLoadModule('/src/game/characters/' + name + '.ts')));
    const donor = (await sceneFor('models/characters/female/wardrobe/vesper-body.glb')).getObjectByName('BODY_WARDROBE');
    const marks = lowerBustMarkers(donor);
    const failures = [];
    let combinations = 0;
    for (const [tier, kind, actorSuffix] of [['Garage', 'garage', 'garage'], ['Mobile', 'portrait', 'portrait']]) {
      const actor = await sceneFor('models/characters/villagers/villager-female/villager-female.' + actorSuffix + '.glb');
      for (const item of skirts) {
        const url = wardrobeGarmentModelUrl(item, kind);
        const garment = await sceneFor(url);
        for (const number of ['01', '02', '03', '04', '05']) {
          const set = 'gothic-' + number, wardrobeTrial = { set, shirt: 'none', waist: 'tucked' };
          const corset = await sceneFor(corsetModelUrl(wardrobeTrial, kind));
          const model = prepareVillager(actor, { fitted: true, garmentBody: donor, corsetSource: { set, scene: corset },
            garments: [{ item, scene: garment, authoredFit: url === item.revisionUrl }] });
          const mixer = new AnimationMixer(model.root);
          try {
            const applyWaist = waist => applyVillagerLook(model, characterLook({
              ...DEFAULT_CHARACTER, garments: { skirt: item.id }, wardrobeTrial: { ...wardrobeTrial, waist },
            }));
            applyWaist('tucked');
            const skirt = model.root.getObjectByName('wardrobe-' + item.id);
            assert(skirt?.visible && model.detachedCorset?.group.visible, item.id + ' / ' + set);
            if (item.id.startsWith('gothic-')) {
              checkCorsetSides(model.detachedCorset.group.getObjectByName('CLOTH_CORSET_TUCKED'), corset);
            }
            checkSkirtWidth(skirt, applyWaist);
            const checks = set === 'gothic-05' ? [...poses, ['walk-casual', .49]] : poses;
            for (const [pose, phase] of checks) {
              if (phase) {
                const [clip] = buildEmoteClips(model.root, [findGaragePreviewEmote(pose, false)]);
                mixer.clipAction(clip).play();
                mixer.setTime(clip.duration * phase);
              }
              model.root.updateMatrixWorld(true);
              model.detachedCorset.updateShoulders?.();
              const highWaist = /^gothic-skirt-0[25]$/.test(item.id);
              const metrics = auditPose(model, skirt, marks, undefined, highWaist ? donor.geometry : undefined);
              const { bustGap, shared, overlapAngles, exposed, worst, worstAngle, worstHeight } = metrics;
              const label = [tier, item.id, set, phase ? pose + '@' + phase : pose].join(' ');
              // Full Gothic bands need a continuous tuck. Short Pack 7 cuts
              // expose skin along parts of the rim, so check the actual overlap.
              const fullBand = item.id.startsWith('gothic-');
              const missingTuck = fullBand ? overlapAngles < 68 || metrics.maxGap > .008001 : overlapAngles < 12;
              // 02/05 keep a high corset-style waist. A raised back edge is not
              // a cup collision: check the actual front skin on those cuts.
              const hitsBust = highWaist ? metrics.cupContact !== false : bustGap < (fullBand ? .001 : 0);
              if (hitsBust || missingTuck || exposed > 0) failures.push(
                label + ': bust clearance ' + (bustGap * 1000).toFixed(1) + ' mm, ' + exposed + '/' + shared +
                ' exterior rays over 1 mm, worst ' + (worst * 1000).toFixed(1) + ' mm at ' + worstAngle + '° / ' +
                (worstHeight * 1000).toFixed() + ' mm, overlap at ' + overlapAngles + ' angles' +
                (highWaist ? ', cup contact: ' + metrics.cupContact : ''));
              mixer.stopAllAction();
            }
            combinations++;
          } finally {
            model.dispose();
          }
        }
      }
    }
    assert.equal(combinations, 90);
    assert.equal(failures.length, 0, failures.join('\n'));
  } catch (error) {
    const missingAsset = error.code === 'ENOENT' || error.message.startsWith('Git LFS pointer:') || error.message === 'Missing installed wardrobe asset';
    if (missingAsset && process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS !== '1') return t.skip(error.message);
    throw error;
  } finally {
    await vite.close();
  }
});
