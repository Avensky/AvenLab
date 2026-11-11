import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { AnimationMixer, BufferGeometry, DoubleSide, Float32BufferAttribute, Ray, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { createServer } from 'vite';

const publicDir = new URL('../public/', import.meta.url);
const villagerDir = 'models/characters/villagers/villager-female/';
const garmentDir = 'models/characters/female/wardrobe/';
const bundledDir = 'models/characters/wardrobe/';
const catalog = JSON.parse(await readFile(new URL('../src/game/characters/dressingRoomImports.json', import.meta.url), 'utf8'));
const wardrobeSets = JSON.parse(await readFile(new URL('../../avenlab-server/src/assets/character-wardrobe.json', import.meta.url), 'utf8'));
const garmentFiles = catalog.flatMap(item => [item.url, item.mobileUrl].filter(Boolean).map(url => url.slice(1)));
const rigTolerance = 2e-5;
const isLfsPointer = bytes => bytes.subarray(0, 64).toString().startsWith('version https://git-lfs.github.com/spec/v1');

test('each loose female garment and its available model tiers are in the wardrobe catalog', async () => {
  const families = { top: 5, skirt: 4, 'gothic-skirt': 5, coat: 1, dress: 1, hat: 2, socks: 4, bowtie: 14, harness: 5 };
  const ids = Object.entries(families).flatMap(([family, count]) =>
    Array.from({ length: count }, (_, index) => `${family}-${String(index + 1).padStart(2, '0')}`));
  assert.deepEqual(catalog.map(item => item.id).sort(), ids.sort());
  for (const item of catalog) {
    assert(item.url.startsWith(`/${garmentDir}`), item.id);
    const hasMobile = ['coat', 'dress', 'hat'].includes(item.slot) || /^skirt-/.test(item.id);
    assert.equal(Boolean(item.mobileUrl), hasMobile, item.id);
    if (hasMobile) assert.equal(item.mobileUrl, item.url.replace(/\.garage\.glb$/, '.mobile.glb'));
  }
  const files = await readdir(new URL(garmentDir, publicDir), { recursive: true });
  const imports = files.map(file => file.replaceAll('\\', '/')).filter(file => file.endsWith('.glb')
    && file !== 'vesper-body.glb' && !file.startsWith('corsets/'));
  assert.deepEqual(garmentFiles.toSorted(), imports.map(file => garmentDir + file).sort());
  assert.equal(new Set(garmentFiles).size, 49);
});

test('standalone wardrobe exports preserve authored meshes and discard unrelated layers', async t => {
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/build-wardrobe-pieces.mjs', import.meta.url))]);
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const corsetRoles = ['corset-over', 'corset-tucked'];
  const jobs = wardrobeSets.flatMap(({ id }) => ['garage', 'mobile'].map(tier => {
    const file = `${id}.${tier}.glb`;
    return { source: file, output: `corsets/${file}`, roles: corsetRoles };
  }));
  jobs.push({ source: 'gothic-02.mobile.glb', output: 'vesper-body.glb', roles: ['body'] });

  for (const { source, output, roles } of jobs) await t.test(output, async t => {
    const sourceBytes = await readFile(new URL(bundledDir + source, publicDir));
    if (isLfsPointer(sourceBytes)) return t.skip('Run git lfs pull to materialize this Gothic wardrobe model.');
    const pieceBytes = await readFile(new URL(garmentDir + output, publicDir));
    assert(pieceBytes.length < sourceBytes.length, 'standalone pieces should be smaller than their bundles');
    const original = (await io.readBinary(sourceBytes)).getRoot();
    const piece = (await io.readBinary(pieceBytes)).getRoot();
    const meshes = piece.listNodes().filter(node => node.getMesh());
    assert.deepEqual(meshes.map(node => node.getExtras().wardrobeRole).sort(), roles);
    assert.equal(piece.listMeshes().length, roles.length);
    assert.equal(piece.listSkins().length, 1);
    const [skin] = piece.listSkins();
    const [originalSkin] = original.listSkins();
    const joints = skin.listJoints(), originalJoints = originalSkin.listJoints();
    assert.equal(joints.length, 88);
    assert.deepEqual(joints.map(joint => joint.getName()), originalJoints.map(joint => joint.getName()));
    joints.forEach((joint, index) => {
      assert.equal(joint.getParentNode()?.getName(), originalJoints[index].getParentNode()?.getName());
      assertRigMatrix(joint.getWorldMatrix(), originalJoints[index].getWorldMatrix(), joint.getName());
    });
    assert.deepEqual(skin.getInverseBindMatrices().getArray(), originalSkin.getInverseBindMatrices().getArray());
    for (const node of meshes) {
      assert.equal(node.getSkin(), skin);
      const authored = original.listNodes().find(candidate => candidate.getName() === node.getName());
      assert(authored);
      const primitives = node.getMesh().listPrimitives(), sourcePrimitives = authored.getMesh().listPrimitives();
      assert.equal(primitives.length, sourcePrimitives.length);
      primitives.forEach((primitive, index) => {
        const sourcePrimitive = sourcePrimitives[index];
        assert.deepEqual(primitive.getIndices().getArray(), sourcePrimitive.getIndices().getArray());
        assert.deepEqual(primitive.listSemantics(), sourcePrimitive.listSemantics());
        for (const name of primitive.listSemantics()) {
          assert.deepEqual(primitive.getAttribute(name).getArray(), sourcePrimitive.getAttribute(name).getArray());
        }
        const material = primitive.getMaterial();
        if (roles.includes('body')) {
          assert.equal(material, null);
          assert.equal(piece.listTextures().length, 0);
        } else {
          const sourceMaterial = sourcePrimitive.getMaterial();
          assert.equal(material.getName(), sourceMaterial.getName());
          for (const slot of ['BaseColor', 'Normal', 'MetallicRoughness', 'Occlusion', 'Emissive']) {
            assert.deepEqual(material[`get${slot}Texture`]()?.getImage(), sourceMaterial[`get${slot}Texture`]()?.getImage());
          }
        }
      });
    }
  });
});

function assertRigMatrix(actual, expected, label) {
  assert.equal(actual.length, expected.length, label);
  assert(actual.every((value, index) => Math.abs(value - expected[index]) <= rigTolerance), label);
}

test('materialized loose garments can share the live female skeleton and skin weights', async t => {
  const baseUrl = new URL(villagerDir + 'villager-female.garage.glb', publicDir);
  const base = await readFile(baseUrl);
  if (isLfsPointer(base)) return t.skip('Run git lfs pull to materialize the female villager GLB.');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const [reference] = (await io.readBinary(base)).getRoot().listSkins();
  const baseJoints = reference.listJoints();
  const baseNames = baseJoints.map(joint => joint.getName());
  assert.equal(baseNames.length, 88);
  const baseParents = baseJoints.map(joint => joint.getParentNode()?.getName());
  const baseRest = baseJoints.map(joint => joint.getWorldMatrix());
  const baseInverses = reference.getInverseBindMatrices().getArray();

  for (const file of garmentFiles) {
    await t.test(file.slice(garmentDir.length), async subtest => {
      const bytes = await readFile(new URL(file, publicDir));
      if (isLfsPointer(bytes)) return subtest.skip('Run git lfs pull to materialize this garment GLB.');
      const root = (await io.readBinary(bytes)).getRoot();
      const skins = root.listSkins();
      assert.equal(skins.length, 1);
      const [skin] = skins;
      const joints = skin.listJoints();
      assert.deepEqual(joints.map(joint => joint.getName()), baseNames);
      assert.deepEqual(joints.map(joint => joint.getParentNode()?.getName()), baseParents);
      joints.forEach((joint, index) => assertRigMatrix(joint.getWorldMatrix(), baseRest[index], joint.getName()));
      assertRigMatrix(skin.getInverseBindMatrices().getArray(), baseInverses, 'inverse bind matrices');

      const meshes = root.listNodes().filter(node => node.getMesh());
      assert(meshes.length > 0);
      for (const mesh of meshes) {
        assert.equal(mesh.getSkin(), skin);
        for (const primitive of mesh.getMesh().listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          const skinIndex = primitive.getAttribute('JOINTS_0');
          const weights = primitive.getAttribute('WEIGHTS_0');
          assert(position.getArray().every(Number.isFinite));
          assert.equal(skinIndex.getCount(), position.getCount());
          assert.equal(weights.getCount(), position.getCount());
          assert.equal(skinIndex.getElementSize(), 4);
          assert.equal(weights.getElementSize(), 4);
          assert(skinIndex.getArray().every(index => Number.isInteger(index) && index >= 0 && index < joints.length));
          const vertex = [];
          for (let index = 0; index < weights.getCount(); index++) {
            weights.getElement(index, vertex);
            assert(vertex.every(weight => Number.isFinite(weight) && weight >= 0 && weight <= 1));
            assert(Math.abs(vertex[0] + vertex[1] + vertex[2] + vertex[3] - 1) < 1e-4);
          }
        }
      }
    });
  }
});

// Let the game loader exercise the authored skinning data without decoding images in Node.
async function loadGeometry(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  for (const material of gltf.materials ?? []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    delete material.extensions;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  delete gltf.images;
  delete gltf.textures;
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (gltf[key]) gltf[key] = gltf[key].filter(extension => extension !== 'EXT_texture_webp');
  }
  const json = Buffer.from(JSON.stringify(gltf));
  const padding = Buffer.alloc((4 - json.length % 4) % 4, 32);
  const bin = bytes.subarray(20 + jsonLength);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(20 + json.length + padding.length + bin.length, 8);
  header.writeUInt32LE(json.length + padding.length, 12);
  const glb = Buffer.concat([header, json, padding, bin]);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return (await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '')).scene;
}

function verifyTopShoulderContact(top, body) {
  const positions = new Float32Array(top.geometry.attributes.position.count * 3);
  const point = new Vector3();
  for (let i = 0; i < positions.length / 3; i++) {
    top.getVertexPosition(i, point).applyMatrix4(top.matrixWorld).toArray(positions, i * 3);
  }
  const surface = new MeshBVH(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setIndex(top.geometry.index.clone()));
  for (const [first, second, third] of [[3327, 3321, 3316], [2691, 2687, 2685]]) {
    const [a, b, c] = [first, second, third].map(vertex => body.getVertexPosition(vertex, new Vector3()).applyMatrix4(body.matrixWorld));
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const center = a.add(b).add(c).multiplyScalar(1 / 3).lerp(b, .62);
    const ray = new Ray(center.addScaledVector(normal, .032), normal.negate());
    assert((surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity) < .0323,
      'Top 02 keeps both shoulder edges outside the skin in the overhead pose');
  }
}

test('Gothic Skirt 04 and Top 02 replace stock pieces and animate together on both female models', async t => {
  const skirt = catalog.find(item => item.id === 'gothic-skirt-04');
  const top = catalog.find(item => item.id === 'top-02');
  const paths = [skirt.url.slice(1), top.url.slice(1), 'models/characters/wardrobe/gothic-02.mobile.glb',
    villagerDir + 'villager-female.garage.glb', villagerDir + 'villager-female.portrait.glb'];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return t.skip('Run git lfs pull to materialize the try-on models.');
  const [skirtScene, topScene, gothic, garage, portrait] = await Promise.all(bytes.map(loadGeometry));
  const sourceBody = gothic.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const sources = [{ item: skirt, scene: skirtScene }, { item: top, scene: topScene }];
    for (const base of [garage, portrait]) {
      const model = prepareVillager(base, { fitted: true, garments: sources, garmentBody: sourceBody });
      try {
        applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: skirt.id, top: top.id } }));
        const { root } = model;
        const original = root.getObjectByName('BODY_OUTFIT_CUT');
        assert.equal(original.visible, false);
        assert.equal(root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible, false);
        assert.equal(root.getObjectByName('CLOTH_TOP_CORSET').visible, false);
        assert.equal(root.getObjectByName('CLOTH_UNDER_UNDERSKIRT').visible, false);
        const body = root.getObjectByName('fitting-room-body');
        assert(body.geometry.drawRange.count > 0);
        const skirtGroup = root.getObjectByName('wardrobe-gothic-skirt-04');
        const topGroup = root.getObjectByName('wardrobe-top-02');
        for (const group of [skirtGroup, topGroup]) {
          assert(group?.children.length > 0);
          assert(group.children.every(mesh => mesh.isSkinnedMesh && mesh.skeleton === original.skeleton));
          assert(group.children.every(mesh => !mesh.name.includes('SHORTS')));
        }
        const [fittedTop] = topGroup.children;
        const originalTop = topScene.getObjectByName(fittedTop.name).geometry;
        assert.deepEqual(fittedTop.geometry.attributes.uv.array, originalTop.attributes.uv.array);
        assert.deepEqual(fittedTop.geometry.attributes.skinWeight.array, originalTop.attributes.skinWeight.array);
        let topAdjustment = 0;
        const authored = new Vector3(), fitted = new Vector3();
        for (let i = 0; i < originalTop.attributes.position.count; i++) {
          authored.fromBufferAttribute(originalTop.attributes.position, i);
          fitted.fromBufferAttribute(fittedTop.geometry.attributes.position, i);
          topAdjustment = Math.max(topAdjustment, authored.distanceTo(fitted));
        }
        assert(topAdjustment > .001 && topAdjustment <= .00401, 'the fit stays within 4 mm of the authored top');
        const skinFaces = body.geometry.index.array.subarray(0, body.geometry.drawRange.count);
        const visibleFace = (a, b, c) => {
          for (let i = 0; i < skinFaces.length; i += 3) {
            if (skinFaces[i] === a && skinFaces[i + 1] === b && skinFaces[i + 2] === c) return true;
          }
          return false;
        };
        assert(visibleFace(1113, 1116, 1117) && visibleFace(1140, 1136, 1139),
          'partially uncovered skin stays intact on both sides of the rear neckline');
        const mesh = skirtGroup.children.reduce((largest, candidate) =>
          candidate.geometry.index.count > largest.geometry.index.count ? candidate : largest);
        const point = new Vector3();
        root.updateMatrixWorld(true);
        const before = mesh.getVertexPosition(0, point).applyMatrix4(mesh.matrixWorld).clone();
        const wave = findGaragePreviewEmote('010', false);
        const clip = buildEmoteClips(root, [wave])[0];
        const mixer = new AnimationMixer(root);
        mixer.clipAction(clip).play();
        mixer.setTime(clip.duration * .49);
        root.updateMatrixWorld(true);
        const after = mesh.getVertexPosition(0, point).applyMatrix4(mesh.matrixWorld);
        assert(after.toArray().every(Number.isFinite));
        assert(after.distanceTo(before) > .001, 'the skirt moves with the animated actor');
        mixer.stopAllAction();
        const [overhead] = buildEmoteClips(root, [findGaragePreviewEmote('heart-overhead', false)]);
        mixer.clipAction(overhead).play();
        mixer.setTime(overhead.duration * .5);
        root.updateMatrixWorld(true);
        verifyTopShoulderContact(fittedTop, body);
        mixer.stopAllAction();
      } finally {
        model.dispose();
      }
    }
    const preset = prepareVillager(gothic, { fitted: true, garments: [sources[0]] });
    try {
      applyVillagerLook(preset, characterLook({
        ...DEFAULT_CHARACTER, garments: { skirt: skirt.id }, wardrobe: { set: 'gothic-02', shirt: 'none', waist: 'over' },
      }));
      assert(preset.root.getObjectByName('wardrobe-gothic-skirt-04').visible);
      assert(preset.root.getObjectByName('CLOTH_CORSET_OVER').visible);
      assert.equal(preset.root.getObjectByName('CLOTH_CORSET_TUCKED').visible, false);
      assert.equal(preset.root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible, false);
      assert.equal(preset.root.getObjectByName('BODY_WARDROBE').visible, false);
      assert(preset.root.getObjectByName('fitting-room-body').geometry.drawRange.count > 0);
    } finally {
      preset.dispose();
    }
  } finally {
    await vite.close();
  }
});

test('standalone corsets and a selected skirt share the live rig and switch waist fits independently', async t => {
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/build-wardrobe-pieces.mjs', import.meta.url))]);
  const skirt = catalog.find(item => item.id === 'gothic-skirt-04');
  const common = await Promise.all([skirt.url.slice(1), villagerDir + 'villager-female.garage.glb', villagerDir + 'villager-female.portrait.glb',
    bundledDir + 'gothic-02.mobile.glb'].map(path => readFile(new URL(path, publicDir))));
  if (common.some(isLfsPointer)) return t.skip('Run git lfs pull to materialize the fitting-room models.');
  const [skirtScene, garage, portrait, donor] = await Promise.all([
    ...common.slice(0, 3).map(loadGeometry), readFile(new URL(garmentDir + 'vesper-body.glb', publicDir)).then(loadGeometry),
  ]);
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook, villagerModelUrl } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { withClothingColors } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    const { corsetModelUrl, wardrobeModelUrl } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    for (const [tier, base] of [['garage', garage], ['mobile', portrait]]) {
      for (const { id: set } of wardrobeSets) {
        const bytes = await readFile(new URL(`${bundledDir}${set}.${tier}.glb`, publicDir));
        if (isLfsPointer(bytes)) continue;
        const scene = await readFile(new URL(`${garmentDir}corsets/${set}.${tier}.glb`, publicDir)).then(loadGeometry);
        const model = prepareVillager(base, { fitted: true, garments: [{ item: skirt, scene: skirtScene }], garmentBody, corsetSource: { set, scene } });
        try {
          const { root } = model;
          const corset = root.getObjectByName(`wardrobe-corset-${set}`);
          const skirtGroup = root.getObjectByName(`wardrobe-${skirt.id}`);
          const original = root.getObjectByName('BODY_OUTFIT_CUT');
          assert(corset && skirtGroup && original);
          assert(!corset.getObjectByName('BODY_WARDROBE') && !corset.getObjectByName('CLOTH_BOTTOM_SKIRT'));
          const body = root.getObjectByName('fitting-room-body');
          const bodyIndex = body.geometry.index;
          for (const waist of ['over', 'tucked']) {
            const wardrobeTrial = { set, waist, shirt: 'none' };
            const choice = { ...DEFAULT_CHARACTER, wardrobeTrial, garments: { skirt: skirt.id } };
            const dyed = withClothingColors(withClothingColors(choice, 'corset', { color: '#305080' }), 'shirt', { color: '#dab872' });
            const look = characterLook(dyed);
            const kind = tier === 'mobile' ? 'portrait' : 'garage';
            const villageUrl = villagerModelUrl(characterLook(DEFAULT_CHARACTER), kind);
            assert.equal(villagerModelUrl(look, kind), villageUrl);
            const wardrobe = { set: 'gothic-02', waist: 'over', shirt: 'none' };
            const savedUrl = wardrobeModelUrl(wardrobe, kind);
            if (savedUrl && corsetModelUrl(wardrobeTrial, kind)) {
              assert.equal(villagerModelUrl(characterLook({ ...choice, wardrobe }), kind), villageUrl,
                'selecting both pieces loads the Village base instead of the saved outfit bundle');
              assert.equal(villagerModelUrl(characterLook({ ...choice, wardrobe, garments: undefined }), kind), savedUrl,
                'selecting only a corset keeps the saved outfit skirt');
            }
            applyVillagerLook(model, look);
            assert.equal(original.visible, false);
            assert.equal(root.getObjectByName('CLOTH_TOP_CORSET').visible, false);
            assert.equal(root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible, false);
            assert.equal(body.geometry.index, bodyIndex);
            assert(body.geometry.drawRange.count > 0);
            assert.equal(corset.getObjectByName('CLOTH_CORSET_TUCKED').visible, waist === 'tucked');
            assert.equal(corset.getObjectByName('CLOTH_CORSET_OVER').visible, waist === 'over');
            const visibleMeshes = [];
            corset.traverseVisible(mesh => { if (mesh.isSkinnedMesh) visibleMeshes.push(mesh); });
            assert(visibleMeshes.length && visibleMeshes.every(mesh => mesh.skeleton === original.skeleton));
            assert(skirtGroup.children.every(mesh => mesh.skeleton === original.skeleton && mesh.visible));
            const activeFit = corset.getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`);
            const fabric = visibleMeshes.find(mesh => {
              for (let part = mesh; part && part !== corset; part = part.parent) {
                if (part === activeFit) return mesh.material.userData.color_slot === 'fabric' && mesh.geometry.drawRange.count > 0;
              }
              return false;
            });
            assert(fabric?.material.color.getHexString() === '305080', `${set} ${tier} ${waist} draws its authored corset fabric`);
            const blouse = corset.getObjectByName('CLOTH_UNDERBUST_BLOUSE');
            if (set === 'gothic-04') {
              assert(blouse?.visible && blouse.material.color.getHexString() === 'dab872');
            } else assert.equal(blouse, undefined);
          }
          const active = corset.getObjectByName('CLOTH_CORSET_TUCKED');
          const cloth = [];
          active.traverseVisible(mesh => { if (mesh.isSkinnedMesh) cloth.push(mesh); });
          const point = new Vector3();
          root.updateMatrixWorld(true);
          const before = cloth[0].getVertexPosition(0, point).applyMatrix4(cloth[0].matrixWorld).clone();
          const [clip] = buildEmoteClips(root, [findGaragePreviewEmote('010', false)]);
          const mixer = new AnimationMixer(root);
          mixer.clipAction(clip).play();
          mixer.setTime(clip.duration * .49);
          root.updateMatrixWorld(true);
          assert(cloth[0].getVertexPosition(0, point).applyMatrix4(cloth[0].matrixWorld).distanceTo(before) > .001);
          mixer.stopAllAction();
        } finally {
          model.dispose();
        }
      }
    }
  } finally {
    await vite.close();
  }
});
