import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AnimationMixer } from 'three';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';
import { auditPose, lowerBustMarkers } from '../scripts/tucked-skirt-metrics.mjs';

const publicDir = new URL('../public/', import.meta.url);
async function loadScene(path) {
  const bytes = await readFile(new URL(path.replace(/^\//, ''), publicDir));
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw Error('Git LFS pointer: ' + path);
  return loadWardrobeGeometry(bytes);
}

test('matched Gothic outfits clear the bust and cover the tucked corset on both detail tiers', async t => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const [{ prepareVillager, applyVillagerLook }, { DEFAULT_CHARACTER, characterLook }, { corsetRenderChoice, corsetModelUrl },
      { buildEmoteClips, findGaragePreviewEmote }, { getWardrobeGarment, wardrobeGarmentModelUrl }] = await Promise.all(
      ['villagerModel', 'characterCatalog', 'wardrobe', 'garageEmotes', 'wardrobeGarments']
        .map(name => vite.ssrLoadModule(`/src/game/characters/${name}.ts`)));
    const failures = [];
    const outfits = ['01', '02', '03', '04', '05'].map(number => ({ set: `gothic-${number}` }));
    outfits.push({ set: 'gothic-01', fallback: true }, { set: 'gothic-05', fallback: true },
      { set: 'gothic-03', skirtId: 'gothic-skirt-02' }, { set: 'gothic-02', skirtId: 'skirt-01' },
      { set: 'gothic-03', trial: 'gothic-05' });
    for (const tier of ['garage', 'mobile']) for (const { set, fallback, skirtId, trial } of outfits) {
      const kind = tier === 'garage' ? 'garage' : 'portrait';
      const wardrobe = { set, shirt: 'none', waist: 'tucked' };
      // Exercise the archived Underbust bundle alongside the matched sets offered in the picker.
      const look = { ...characterLook({ ...DEFAULT_CHARACTER, wardrobe, garments: skirtId ? { skirt: skirtId } : undefined,
        wardrobeTrial: trial ? { ...wardrobe, set: trial } : undefined }), wardrobe };
      const bundle = await loadScene(`models/characters/wardrobe/${set}.${tier}.glb`);
      const marks = lowerBustMarkers(bundle.getObjectByName('BODY_WARDROBE'));
      const choice = corsetRenderChoice(look);
      const url = choice && !fallback && corsetModelUrl(choice, kind);
      const corsetSource = url ? { set: choice.set, scene: await loadScene(url) } : undefined;
      const item = skirtId && getWardrobeGarment(skirtId);
      assert(!skirtId || item, `${skirtId} is a selectable skirt`);
      const garmentUrl = item && wardrobeGarmentModelUrl(item, kind);
      const garments = item ? [{ item, scene: await loadScene(garmentUrl), authoredFit: garmentUrl === item.revisionUrl }] : [];
      const model = prepareVillager(bundle, { fitted: true, corsetSource, garments });
      const mixer = new AnimationMixer(model.root);
      try {
        const skirt = model.root.getObjectByName(skirtId ? `wardrobe-${skirtId}` : 'CLOTH_BOTTOM_SKIRT');
        const bodice = model.detachedCorset?.group ?? model.root;
        const tucked = bodice.getObjectByName('CLOTH_CORSET_TUCKED');
        const lining = bodice.getObjectByName('CLOTH_CORSET_WAIST_TUCKED');
        const waistParts = { traverseVisible(visit) { tucked.traverseVisible(visit); lining?.traverseVisible(visit); } };
        applyVillagerLook(model, { ...look, wardrobe: { ...wardrobe, waist: 'over' },
          corset: look.corset && { ...look.corset, waist: 'over' } });
        assert(bodice.getObjectByName('CLOTH_CORSET_OVER').visible && !tucked.visible, `${set} switches to Over`);
        applyVillagerLook(model, look);
        assert(skirt.visible && tucked.visible, `${set} switches back to Tucked`);
        if (skirtId) assert(!model.root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible, 'the chosen skirt replaces the bundled skirt');
        if (trial) assert.equal(model.detachedCorset?.group.name, `wardrobe-corset-${trial}`);
        for (const [pose, phase] of [['standing', 0], ['walk-casual', .39], ['heart-overhead', .49]]) {
          if (phase) {
            const [clip] = buildEmoteClips(model.root, [findGaragePreviewEmote(pose, false)]);
            mixer.clipAction(clip).play();
            mixer.setTime(clip.duration * phase);
          }
          model.root.updateMatrixWorld(true);
          model.detachedCorset?.updateShoulders?.();
          const highWaist = skirtId ? /^gothic-skirt-0[25]$/.test(skirtId) : /^gothic-0[25]$/.test(set);
          const metrics = auditPose(model, skirt, marks, waistParts,
            highWaist ? bundle.getObjectByName('BODY_WARDROBE').geometry : undefined);
          // The dipped waistband of a short skirt intentionally leaves skin between the layers.
          const dipped = skirtId?.startsWith('skirt-');
          const hitsBust = highWaist ? metrics.cupContact !== false : metrics.bustGap < (dipped ? .025 : .001);
          if (hitsBust || metrics.overlapAngles < (dipped ? 3 : 60) || metrics.exposed
            || (!dipped && metrics.maxGap > .008001)) {
            failures.push({ tier, set, fallback, skirtId, trial, pose, ...metrics });
          }
          mixer.stopAllAction();
        }
      } finally { model.dispose(); }
    }
    assert.deepEqual(failures, []);
  } catch (error) {
    if (error.message.startsWith('Git LFS pointer:') && process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS !== '1') return t.skip(error.message);
    throw error;
  } finally { await vite.close(); }
});
