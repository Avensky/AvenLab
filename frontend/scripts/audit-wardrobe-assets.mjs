import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getGLPrimitiveCount, listTextureInfoByMaterial } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from './load-wardrobe-geometry.mjs';
import { installedPackedVesperPortrait } from './character-model-paths.mts';
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
      let triangleCount = 0;
      let primitiveCount = 0;
      for (const mesh of meshes) for (const part of mesh.listPrimitives()) {
        primitiveCount++;
        const positions = part.getAttribute('POSITION');
        const weights = part.getAttribute('WEIGHTS_0');
        const skinIndices = part.getAttribute('JOINTS_0');
        assert(positions?.getArray().every(Number.isFinite), 'finite positions');
        const vertexCount = positions.getCount();
        const indices = part.getIndices();
        assert(!indices || indices.getArray().every(i => Number.isInteger(i) && i >= 0 && i < vertexCount),
          `${mesh.getName()}: vertex index outside the position buffer`);
        const count = getGLPrimitiveCount(part);
        assert(Number.isInteger(count) && count > 0, `${mesh.getName()}: incomplete or empty primitive`);
        if (part.getMode() >= Primitive.Mode.TRIANGLES) triangleCount += count;
        const normals = part.getAttribute('NORMAL');
        if (normals) assert(normals.getElementSize() === 3 && normals.getCount() === vertexCount && normals.getArray().every(Number.isFinite),
          `${mesh.getName()}: invalid vertex normals`);
        const material = part.getMaterial();
        const channels = new Set(material ? listTextureInfoByMaterial(material).map(info =>
          info.getExtension('KHR_texture_transform')?.getTexCoord() ?? info.getTexCoord()) : []);
        for (const channel of channels) {
          const uv = part.getAttribute(`TEXCOORD_${channel}`);
          assert(uv?.getElementSize() === 2 && uv.getCount() === vertexCount && uv.getArray().every(Number.isFinite),
            `${mesh.getName()}: material ${material.getName()} requires valid TEXCOORD_${channel}`);
        }
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
      console.log(`PASS ${label}: ${(bytes.length / 1_000_000).toFixed(2)} MB, ${triangleCount} stored triangles, ${primitiveCount} mesh primitives, ${joints.length} joints, ${textures.length} embedded images`);
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
      { usesFittedAnimation }, { buildEmoteClips, findGaragePreviewEmote }, { getWardrobeGarment }, { clothingPieceFor }] =
      await Promise.all(['villagerModel', 'characterCatalog', 'wardrobe', 'standaloneCorset', 'sweetheartCorset',
        'animationFit', 'garageEmotes', 'wardrobeGarments', 'clothingPieces']
        .map(name => vite.ssrLoadModule(`/src/game/characters/${name}.ts`)));
    const villageFolder = '/models/characters/villagers/villager-female';
    const bundleFolder = '/models/characters/wardrobe';
    const fittedFolder = '/models/characters/female/wardrobe/corsets';
    const villagePortrait = installedPackedVesperPortrait() ?? `${villageFolder}/villager-female.portrait.glb`;
    const donor = (await sceneFor(`${bundleFolder}/gothic-02.mobile.glb`)).getObjectByName('BODY_WARDROBE');
    assert(donor?.isSkinnedMesh, 'Sweetheart Mobile provides the complete fitting body');
    const scenarios = [];
    for (const [name, set] of [['Sweetheart', 'gothic-02'], ['High Collar', 'gothic-05']]) {
      for (const matched of [false, true]) for (const waist of ['over', 'tucked']) {
        const asset = name === 'High Collar' ? 'gothic-high-collar' : matched ? undefined : set;
        scenarios.push({ name, set, waist, matched, asset, route: matched ? 'matched outfit' : 'Village skirt' });
      }
    }
    const villageWaist = { explicitWaist: true, route: 'Village skirt and belt' };
    // Weight shift and shoulder stretch can expose the lacing down to the waist.
    const laced = { name: 'Laced Bodice', set: 'gothic-01', asset: 'gothic-laced-bodice',
      maskProbe: { minHeight: 1.09, extraPoses: [['002', .38], ['008', .5]] } };
    for (const waist of ['over', 'tucked']) {
      scenarios.push({ ...laced, waist, ...villageWaist }, { ...laced, waist, matched: true, route: 'matched outfit' });
      scenarios.push({ name: 'Ruffled', set: 'gothic-03', asset: 'gothic-03', waist, ...villageWaist });
      for (const bra of [false, 'classic', 'push-up']) {
        const asset = waist === 'over' ? 'gothic-underbust-vest' : 'gothic-underbust-vest-tucked';
        scenarios.push({ name: 'Underbust', set: 'gothic-04', asset, waist, bra, route: bra ? `${bra} bra` : 'bra removed' });
      }
    }
    for (const bra of ['classic', 'push-up']) scenarios.push({ name: `Standalone ${bra} bra`, bra });

    let poseCount = 0, clearCases = 0, gapCases = 0, errors = 0;
    for (const [tier, kind, alternate] of [['garage', 'garage', 'mobile'], ['mobile', 'portrait', 'garage']]) {
      for (const { name, set, waist, matched, asset, explicitWaist, bra, route, maskProbe } of scenarios) {
        const label = set ? `${name} ${tier} ${waist} with ${route}` : `${name} ${tier}`;
        let model;
        try {
          const outfit = set ? { [matched ? 'wardrobe' : 'wardrobeTrial']: { set, waist, shirt: 'none' } }
            : { removedClothing: ['top', 'corset'] };
          const equipped = explicitWaist ? { skirt: 'village-skirt', belt: 'village-belt' } : {};
          const appearance = characterLook(DEFAULT_CHARACTER).appearance;
          const look = characterLook({ ...DEFAULT_CHARACTER, ...outfit, garments: equipped,
            ...(bra === false && { bra: false }),
            ...(bra && { bra: true, appearance: { ...appearance, bra_style: bra } }) });
          const expectedBase = matched ? `${bundleFolder}/${set}.${tier}.glb` : villagePortrait;
          const baseUrl = villagerModelUrl(look, kind, 'portrait');
          assert.equal(baseUrl, expectedBase, 'correct actor and skirt URL');
          // Exercise both Village actor meshes for the independently fitted underwear.
          const actor = await sceneFor(!set && kind === 'garage' ? `${villageFolder}/villager-female.garage.glb` : baseUrl);
          const urls = corsetModelUrls(corsetRenderChoice(look), kind);
          assert.equal(urls[0], asset && `${fittedFolder}/${asset}.${tier}.glb`, 'correct primary corset asset');
          if (asset === 'gothic-high-collar') assert.equal(urls[1], `${fittedFolder}/${asset}.${alternate}.glb`, 'alternate High Collar tier');
          const scene = asset ? await sceneFor(urls[0]) : undefined;
          if (asset === 'gothic-high-collar' || asset === 'gothic-laced-bodice') {
            assert(hasAuthoredLacedBodiceFit(scene), 'authored asset contains both fit roles');
          }
          if (set === 'gothic-02') assert(hasAuthoredSweetheartFit(scene ?? actor, 2), 'current authored Sweetheart v2 fit');
          model = prepareVillager(actor, {
            fitted: usesFittedAnimation(look), garmentBody: donor, removedClothing: look.removedClothing,
            garments: Object.values(equipped).map(id => ({ item: getWardrobeGarment(id), scene: actor })),
            corsetSource: scene ? { set, scene } : undefined,
          });
          assert.equal(Boolean(model.detachedCorset), Boolean(scene), 'requested corset binds to the live actor');
          applyVillagerLook(model, look);
          const bindBody = (actor.getObjectByName('BODY_WARDROBE') ?? donor).geometry;
          const skin = model.root.getObjectByName(model.detachedCorset || !set ? 'fitting-room-body' : 'BODY_WARDROBE');
          assert(skin?.visible && skin.isSkinnedMesh && skin.geometry.drawRange.count > 0, 'live skinned body retained');
          if (set) {
            const group = model.detachedCorset?.group ?? model.root;
            const cloth = group.getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`);
            const other = group.getObjectByName(`CLOTH_CORSET_${waist === 'over' ? 'TUCKED' : 'OVER'}`);
            assert(cloth?.visible && !other?.visible, 'correct waist fit is visible');
            if (set === 'gothic-02' || set === 'gothic-05') assert(other, 'both waist fits exist');
          }
          const covers = [];
          model.root.traverseVisible(mesh => {
            if (!mesh.isSkinnedMesh || !mesh.geometry.index || !clothingPieceFor(mesh)) return;
            if (!mesh.material.visible || mesh.material.transparent || mesh.material.alphaTest > 0) return;
            covers.push(mesh);
          });
          assert(covers.some(mesh => clothingPieceFor(mesh) === 'skirt'), 'selected skirt retained');
          if (set) assert(covers.some(mesh => clothingPieceFor(mesh) === 'corset'), 'selected corset retained');
          if (bra) assert(model.root.getObjectByName(`wardrobe-underwear-bra${bra === 'push-up' ? '-push-up' : ''}`)?.visible,
            'selected bra cut retained');
          if (bra === false) assert(!covers.some(mesh => clothingPieceFor(mesh) === 'bra'), 'removed bra stays hidden');
          for (const mesh of covers) {
            const bones = mesh.skeleton.bones;
            assert(bones.length === skin.skeleton.bones.length && bones.every((bone, index) => bone === skin.skeleton.bones[index]),
              'clothing and body follow the same live rig joints');
          }
          const probes = auditCorsetSkinMask(model.root, skin, bindBody, covers, buildEmoteClips, findGaragePreviewEmote, maskProbe);
          poseCount += probes.length;
          const gaps = probes.filter(probe => probe.uncovered > 0);
          if (gaps.length) {
            gapCases++;
            console.error(`FAIL ${label}: ${gaps.map(probe =>
              `${probe.pose}@${probe.phase} ${probe.uncovered}/${probe.sampled} externally visible masked-skin rays (${probe.upperBackUncovered}/${probe.upperBackSampled} upper back)`).join(', ')}`);
          } else {
            clearCases++;
            const samples = probes.reduce((total, probe) => total + probe.sampled, 0);
            const detail = samples ? `0/${samples} uncovered masked-skin rays` : 'no externally visible masked torso samples';
            console.log(`PASS ${label}: ${detail} across ${probes.length} poses`);
          }
        } catch (error) {
          errors++;
          console.error(`FAIL ${label}: ${error.message}`);
        } finally {
          model?.dispose();
        }
      }
    }
    console.log(`Torso mask audit: ${poseCount} poses, ${clearCases} clear cases, ${gapCases} cases with uncovered rays, ${errors} errors.`);
    return gapCases === 0 && errors === 0;
  } finally {
    await vite.close();
  }
}
