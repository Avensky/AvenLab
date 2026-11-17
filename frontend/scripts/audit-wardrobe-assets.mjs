import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from './load-wardrobe-geometry.mjs';
import { auditCorsetSkinMask } from './verify-corset-coverage.mjs';

export async function auditWardrobeAssets(publicRoot, variants) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const decodedImages = new Set();
  let passed = true;
  for (const { name, tier, path } of variants) {
    const label = `${name} ${tier}`;
    try {
      const bytes = await readFile(new URL(path, publicRoot));
      const model = (await io.readBinary(bytes)).getRoot();
      const skins = model.listSkins();
      assert.equal(skins.length, 1, 'one authored rig');
      const joints = skins[0].listJoints();
      assert.equal(joints.length, 88, 'Vesper joint count');
      const meshes = model.listMeshes();
      assert(meshes.length > 0, 'visible garment geometry');
      for (const mesh of meshes) for (const part of mesh.listPrimitives()) {
        const positions = part.getAttribute('POSITION');
        const weights = part.getAttribute('WEIGHTS_0');
        const skinIndices = part.getAttribute('JOINTS_0');
        assert(positions?.getArray().every(Number.isFinite), 'finite positions');
        assert.equal(weights?.getCount(), positions.getCount(), 'one weight tuple per vertex');
        assert.equal(skinIndices?.getCount(), positions.getCount(), 'one joint tuple per vertex');
        assert(skinIndices.getArray().every(index => index < joints.length), 'valid joint indices');
        const tuple = [0, 0, 0, 0];
        for (let i = 0; i < weights.getCount(); i++) {
          weights.getElement(i, tuple);
          const total = tuple.reduce((sum, value) => sum + value, 0);
          assert(tuple.every(value => Number.isFinite(value) && value >= 0) && Math.abs(total - 1) < 1e-4, 'normalized skin weights');
        }
      }
      const textures = model.listTextures();
      assert(textures.length > 0, 'embedded garment textures');
      for (const texture of textures) {
        const image = texture.getImage();
        assert(image?.length, 'embedded image bytes');
        const hash = createHash('sha256').update(image).digest('hex');
        if (decodedImages.has(hash)) continue;
        const pixels = await sharp(image).raw().toBuffer({ resolveWithObject: true });
        assert(pixels.info.width > 0 && pixels.info.height > 0, 'decoded image dimensions');
        decodedImages.add(hash);
      }
      console.log(`PASS ${label}: ${(bytes.length / 1_000_000).toFixed(2)} MB, ${joints.length} joints, ${textures.length} embedded images`);
    } catch (error) {
      passed = false;
      console.error(`FAIL ${label}: ${error.message}`);
    }
  }
  console.log(`Decoded ${decodedImages.size} distinct embedded images.`);
  return passed;
}

export async function auditCurrentCorsetMasks(frontend, publicRoot) {
  const vite = await createServer({
    root: fileURLToPath(frontend),
    configFile: fileURLToPath(new URL('vite.config.ts', frontend)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  });
  const sceneCache = new Map();
  function sceneFor(path) {
    if (!sceneCache.has(path)) {
      sceneCache.set(path, readFile(new URL(path.slice(1), publicRoot)).then(loadWardrobeGeometry));
    }
    return sceneCache.get(path);
  }

  try {
    const [{ prepareVillager, applyVillagerLook, villagerModelUrl }, { DEFAULT_CHARACTER, characterLook },
      { corsetRenderChoice, corsetModelUrls }, { hasAuthoredLacedBodiceFit }, { hasAuthoredSweetheartFit },
      { usesFittedAnimation }, { buildEmoteClips, findGaragePreviewEmote }] = await Promise.all(
      ['villagerModel', 'characterCatalog', 'wardrobe', 'standaloneCorset', 'sweetheartCorset', 'animationFit', 'garageEmotes']
        .map(name => vite.ssrLoadModule(`/src/game/characters/${name}.ts`)),
    );
    const villageBase = '/models/characters/villagers/villager-female/villager-female.portrait.glb';
    const bundleFolder = '/models/characters/wardrobe';
    const fittedFolder = '/models/characters/female/wardrobe/corsets';
    const donor = (await sceneFor(`${bundleFolder}/gothic-02.mobile.glb`)).getObjectByName('BODY_WARDROBE');
    assert(donor?.isSkinnedMesh, 'Sweetheart Mobile provides the complete fitting body');
    let passed = true;
    for (const [name, set] of [['Sweetheart', 'gothic-02'], ['High Collar', 'gothic-05']]) {
      for (const [tier, kind, alternate] of [['garage', 'garage', 'mobile'], ['mobile', 'portrait', 'garage']]) {
        for (const [route, field] of [['Village skirt', 'wardrobeTrial'], ['matched outfit', 'wardrobe']]) {
          for (const waist of ['over', 'tucked']) {
            const label = `${name} ${tier} ${waist} with ${route}`;
            let model;
            try {
              const selection = { set, waist, shirt: 'none' };
              const look = characterLook({ ...DEFAULT_CHARACTER, [field]: selection });
              const expectedBase = field === 'wardrobe' ? `${bundleFolder}/${set}.${tier}.glb` : villageBase;
              const url = villagerModelUrl(look, kind, 'portrait');
              assert.equal(url, expectedBase, 'correct actor and skirt URL');
              const actor = await sceneFor(url);
              const urls = corsetModelUrls(corsetRenderChoice(look), kind);
              const highCollar = set === 'gothic-05';
              if (highCollar) {
                assert.deepEqual(urls.slice(0, 2), [tier, alternate].map(lod => `${fittedFolder}/gothic-high-collar.${lod}.glb`),
                  'authored High Collar precedes its alternate tier and legacy asset');
              } else {
                assert.equal(urls[0], field === 'wardrobeTrial' ? `${fittedFolder}/${set}.${tier}.glb` : undefined,
                  'standalone Sweetheart precedes the bundled fallback; matched outfit retains its own corset');
              }
              const scene = urls[0] ? await sceneFor(urls[0]) : undefined;
              if (highCollar) assert(hasAuthoredLacedBodiceFit(scene), 'authored High Collar contains both fit roles');
              else assert(hasAuthoredSweetheartFit(scene ?? actor, 2), 'current authored Sweetheart v2 fit');
              model = prepareVillager(actor, {
                fitted: usesFittedAnimation(look),
                garmentBody: donor,
                corsetSource: scene ? { set, scene } : undefined,
              });
              assert.equal(Boolean(model.detachedCorset), Boolean(scene), 'requested corset binds to the live actor');
              applyVillagerLook(model, look);
              const group = model.detachedCorset?.group ?? model.root;
              const cloth = group.getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`);
              const other = group.getObjectByName(`CLOTH_CORSET_${waist === 'over' ? 'TUCKED' : 'OVER'}`);
              assert(cloth?.visible && other && !other.visible, 'correct waist fit is visible');
              const bindBody = (actor.getObjectByName('BODY_WARDROBE') ?? donor).geometry;
              const skin = model.root.getObjectByName(model.detachedCorset ? 'fitting-room-body' : 'BODY_WARDROBE');
              assert(skin?.visible && skin.isSkinnedMesh && skin.geometry.drawRange.count > 0, 'live skinned body retained');
              assert(model.root.getObjectByName('CLOTH_BOTTOM_SKIRT')?.visible, 'selected skirt retained');
              cloth.traverseVisible(mesh => {
                if (!mesh.isSkinnedMesh) return;
                const bones = mesh.skeleton.bones;
                assert(bones.length === skin.skeleton.bones.length && bones.every((bone, index) => bone === skin.skeleton.bones[index]),
                  'corset and body follow the same live rig joints');
              });
              const probes = auditCorsetSkinMask(model.root, skin, bindBody, cloth, buildEmoteClips, findGaragePreviewEmote);
              const gaps = probes.filter(probe => probe.uncovered > 0);
              if (gaps.length) {
                passed = false;
                console.error(`FAIL ${label}: ${gaps.map(probe =>
                  `${probe.pose}@${probe.phase} ${probe.uncovered}/${probe.sampled} externally visible masked-skin rays`).join(', ')}`);
              } else {
                console.log(`PASS ${label}: no uncovered masked torso skin in the three sampled poses`);
              }
            } catch (error) {
              passed = false;
              console.error(`FAIL ${label}: ${error.message}`);
            } finally {
              model?.dispose();
            }
          }
        }
      }
    }
    return passed;
  } finally {
    await vite.close();
  }
}
