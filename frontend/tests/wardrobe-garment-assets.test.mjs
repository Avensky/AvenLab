import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { AnimationMixer, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const publicDir = new URL('../public/', import.meta.url);
const villagerDir = 'models/characters/villagers/villager-female/';
const garmentDir = 'models/characters/female/wardrobe/';
const catalog = JSON.parse(await readFile(new URL('../src/game/characters/dressingRoomImports.json', import.meta.url), 'utf8'));
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
  assert.deepEqual(garmentFiles.toSorted(), files.filter(file => file.endsWith('.glb'))
    .map(file => garmentDir + file.replaceAll('\\', '/')).sort());
  assert.equal(new Set(garmentFiles).size, 49);
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
  for (const material of gltf.materials) {
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
        assert(root.getObjectByName('fitting-room-body').geometry.drawRange.count > 0);
        const skirtGroup = root.getObjectByName('wardrobe-gothic-skirt-04');
        const topGroup = root.getObjectByName('wardrobe-top-02');
        for (const group of [skirtGroup, topGroup]) {
          assert(group?.children.length > 0);
          assert(group.children.every(mesh => mesh.isSkinnedMesh && mesh.skeleton === original.skeleton));
          assert(group.children.every(mesh => !mesh.name.includes('SHORTS')));
        }
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
