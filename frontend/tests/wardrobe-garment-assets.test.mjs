import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { AnimationMixer, Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4, MeshPhysicalMaterial, Ray, Texture, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { createServer } from 'vite';
import { hasCompatibleWardrobeRevision } from '../scripts/character-model-paths.mts';
import { loadWardrobeGeometry as loadGeometry } from '../scripts/load-wardrobe-geometry.mjs';
import { auditCorsetSkinMask } from '../scripts/verify-corset-coverage.mjs';
import { applyLacedBodiceFinish } from '../src/game/characters/lacedBodiceAppearance.ts';

const publicDir = new URL('../public/', import.meta.url);
const villagerDir = 'models/characters/villagers/villager-female/';
const garmentDir = 'models/characters/female/wardrobe/';
const bundledDir = 'models/characters/wardrobe/';
const catalog = JSON.parse(await readFile(new URL('../../packages/wardrobe-catalog/character-garments.json', import.meta.url), 'utf8'));
const wardrobeSets = JSON.parse(await readFile(new URL('../../packages/wardrobe-catalog/character-wardrobe.json', import.meta.url), 'utf8'));
const garmentFiles = catalog.flatMap(item => [item.url, item.mobileUrl].filter(Boolean).map(url => url.slice(1)));
const hoodIds = Array.from({ length: 7 }, (_, index) => `hood-0${index + 1}`);
const hoodFiles = new Set(catalog.filter(item => hoodIds.includes(item.id))
  .flatMap(item => [item.url.slice(1), item.mobileUrl.slice(1)]));
const supersededHoodFiles = new Set([
  "models/characters/female/wardrobe/hoods/hood-01.garage.glb",
  "models/characters/female/wardrobe/hoods/hood-01.mobile.glb",
  "models/characters/female/wardrobe/hoods/hood-02.garage.glb",
  "models/characters/female/wardrobe/hoods/hood-02.mobile.glb",
]);
const rigTolerance = 2e-5;
const isLfsPointer = bytes => bytes.subarray(0, 64).toString().startsWith('version https://git-lfs.github.com/spec/v1');
function skipMissingAsset(t, message) {
  if (process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS === '1') assert.fail(message);
  return t.skip(message);
}

test('each loose female garment and its available model tiers are in the wardrobe catalog', async () => {
  const families = { top: 5, armor: 5, bracer: 1, skirt: 4, 'gothic-skirt': 5, coat: 1, dress: 1, medieval: 8, hat: 2, socks: 4, bowtie: 14, harness: 5, 'medieval-kaftan': 5 };
  const ids = Object.entries(families).flatMap(([family, count]) =>
    Array.from({ length: count }, (_, index) => `${family}-${String(index + 1).padStart(2, '0')}`));
  ids.push(...hoodIds, 'linen-nightgown');
  assert.deepEqual(catalog.map(item => item.id).sort(), ids.sort());
  for (const item of catalog) {
    assert(item.url.startsWith(`/${garmentDir}`), item.id);
    const hasMobile = ['coat', 'dress', 'hat'].includes(item.slot) || /^(skirt|armor|bracer)-/.test(item.id);
    assert.equal(Boolean(item.mobileUrl), hasMobile, item.id);
    if (hasMobile) assert.equal(item.mobileUrl, item.url.replace(/\.garage\.glb$/, '.mobile.glb'));
  }
  const files = await readdir(new URL(garmentDir, publicDir), { recursive: true });
  const revisions = new Set(catalog.flatMap(item => item.revisionUrl ? [item.revisionUrl.slice(1)] : []));
  const imports = files.map(file => file.replaceAll('\\', '/')).filter(file => file.endsWith('.glb')
    && file !== 'vesper-body.glb' && !file.startsWith('corsets/') && !revisions.has(garmentDir + file));
  // The Sleepwear folder also stores copies of the cataloged dress exports.
  const installed = new Set(imports.map(file => garmentDir + file.replace(/^Sleepwear\//, 'dress/'))
    .filter(file => !supersededHoodFiles.has(file)));
  assert.deepEqual(garmentFiles.filter(file => !hoodFiles.has(file) || installed.has(file)).sort(), [...installed].sort());
  assert.equal(new Set(garmentFiles).size, garmentFiles.length);
});

function posedSurface(mesh) {
  const position = mesh.geometry.getAttribute('position');
  const world = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
  const vertex = new Vector3();
  for (let i = 0; i < position.count; i++) {
    mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
    world.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  const geometry = new BufferGeometry().setAttribute('position', world);
  if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
  return new MeshBVH(geometry);
}

test('both glasses sit close to the nose and eyes on the authored character heads', async t => {
  const paths = [
    villagerDir + 'villager-female.garage.glb',
    bundledDir + 'gothic-05.mobile.glb',
    'models/characters/villagers/villager-male/villager-male.glb',
  ];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return t.skip('Run git lfs pull to materialize the character models.');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { CHARACTERS, DEFAULT_CHARACTER, ROOK_ID, characterAppearance, characterLook } =
      await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { VILLAGER_EYES } = await vite.ssrLoadModule('/src/game/characters/villagerFace.ts');
    const rook = CHARACTERS.find(item => item.id === ROOK_ID);
    const ray = new Ray(new Vector3(), new Vector3(0, 0, -1));
    const depthAt = (surfaces, x, y) => {
      ray.origin.set(x, y, .30);
      const distance = Math.min(...surfaces.map(surface => surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity));
      return .30 - distance;
    };
    for (const [index, file] of bytes.entries()) {
      const female = index !== 2;
      const eyes = VILLAGER_EYES[female ? 'female' : 'male'];
      const base = female ? DEFAULT_CHARACTER : { id: rook.id, outfit: rook.outfits[0].id };
      const choice = index === 1 ? { ...base, wardrobe: { set: 'gothic-05', shirt: 'none', waist: 'tucked' } } : base;
      const model = prepareVillager(await loadGeometry(file), { female, fitted: index === 1 });
      try {
        const { root } = model;
        root.updateMatrixWorld(true);
        const surfaces = [];
        root.getObjectByName(female ? 'HEAD_FACE4' : 'HEAD_WARRIOR').traverse(part => {
          if (part.isMesh && ['MAT_SkinFace', 'MAT_Cornea', 'MAT_Eyes'].includes(part.material.name)) surfaces.push(posedSurface(part));
        });
        try {
          for (const style of ['round', 'aviator']) {
            applyVillagerLook(model, characterLook({ ...choice, appearance: { ...characterAppearance(choice), glasses: style } }));
            root.updateMatrixWorld(true);
            const [rim, lens] = root.getObjectByName('villager-glasses').children.map(posedSurface);
            try {
              const y = eyes.y + root.position.y + .002;
              const bridgeGap = depthAt([rim], 0, y + .011) - depthAt(surfaces, 0, y + .011);
              assert(bridgeGap > .001 && bridgeGap < .008, `${paths[index]} ${style} bridge gap ${bridgeGap}`);
              for (const x of [-eyes.x, eyes.x]) {
                const lensGap = depthAt([lens], x, y) - depthAt(surfaces, x, y);
                assert(lensGap > .003 && lensGap < .022, `${paths[index]} ${style} lens gap ${lensGap}`);
              }
              assert(depthAt([lens], .046, y) < depthAt([lens], eyes.x, y) - .006, 'outer rims curve back toward the ears');
            } finally {
              rim.geometry.dispose();
              lens.geometry.dispose();
            }
          }
        } finally {
          for (const { geometry } of surfaces) geometry.dispose();
        }
      } finally { model.dispose(); }
    }
  } finally { await vite.close(); }
});

test('Top 03 keeps the long braid outside its collar through movement', async t => {
  const item = catalog.find(item => item.id === 'top-03');
  const paths = [item.url.slice(1), bundledDir + 'gothic-02.mobile.glb',
    villagerDir + 'villager-female.garage.glb', villagerDir + 'villager-female.portrait.glb'];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return skipMissingAsset(t, 'Materialize Top 03 and both Vesper tiers to check the collar.');
  const [scene, donor, ...bases] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterAppearance, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const choice = { ...DEFAULT_CHARACTER, garments: { top: item.id } };
    const identity = new Matrix4();
    for (const base of bases) {
      const source = base.getObjectByName('HAIR_HAIR20').geometry;
      const model = prepareVillager(base, { fitted: true, garmentBody, garments: [{ item, scene }] });
      const { root, longHair } = model;
      try {
        const cropped = characterLook({ ...choice, appearance: { ...characterAppearance(choice), hair: 'cropped' } });
        applyVillagerLook(model, cropped);
        assert.equal(longHair.geometry, source, 'a hidden braid does not allocate a collar fit');
        applyVillagerLook(model, characterLook(choice));
        assert(longHair.visible);
        const before = source.attributes.position, after = longHair.geometry.attributes.position;
        let bend = 0;
        for (let i = 0; i < before.count; i++) {
          const y = before.getY(i), z = before.getZ(i), dz = z - after.getZ(i);
          assert.equal(after.getX(i), before.getX(i));
          assert.equal(after.getY(i), y);
          if (y <= 1.365 || y >= 1.499 || z >= -.008) assert.equal(dz, 0, 'only the rear nape may move');
          bend = Math.max(bend, dz);
        }
        assert(bend > 0 && bend < .023, 'the collar fit stays local and under 23 mm');
        const shirts = root.getObjectByName('wardrobe-top-03').children.filter(mesh => mesh.isSkinnedMesh);
        assert(shirts.length > 0);
        const mixer = new AnimationMixer(root);
        for (const [id, phase] of [['idle', 0], ['002', .38], ['008', .5], ['heart-overhead', .5]]) {
          let action;
          if (id !== 'idle') {
            const [clip] = buildEmoteClips(root, [findGaragePreviewEmote(id, false)]);
            action = mixer.clipAction(clip).play();
            mixer.setTime(clip.duration * phase);
          }
          root.updateMatrixWorld(true);
          const braid = posedSurface(longHair);
          for (const mesh of shirts) {
            const cloth = posedSurface(mesh);
            const intersects = braid.bvhcast(cloth, identity, { intersectsTriangles: (a, b) => a.intersectsTriangle(b) });
            cloth.geometry.dispose();
            assert.equal(intersects, false, `${id} hair crosses ${mesh.name}`);
          }
          braid.geometry.dispose();
          action?.stop();
        }
        applyVillagerLook(model, cropped);
        assert.equal(longHair.visible, false);
        assert.equal(model.crop.visible, true);
      } finally { model.dispose(); }
      assert.equal(longHair.geometry, source, 'removing the fitted outfit restores the authored braid');
    }
  } finally { await vite.close(); }
});

test('the Village bonnet can keep its crown without its chin bow', async t => {
  const paths = [villagerDir + 'villager-female.garage.glb', villagerDir + 'villager-female.portrait.glb',
    bundledDir + 'gothic-05.garage.glb', bundledDir + 'gothic-05.mobile.glb'];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return t.skip('Run git lfs pull to materialize the fitting-room models.');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterAppearance, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const withBow = { ...DEFAULT_CHARACTER, appearance: { ...characterAppearance(DEFAULT_CHARACTER), accent: '#e0528f' } };
    for (const [index, data] of bytes.entries()) {
      const scene = await loadGeometry(data);
      const source = scene.getObjectByName('ACC_HAT').geometry;
      const model = prepareVillager(scene);
      try {
        const { hat, bow } = model;
        const choice = index < 2 ? withBow : { ...withBow, wardrobe: { set: 'gothic-05', shirt: 'none', waist: 'tucked' } };
        assert(hat.geometry === source, 'unshown hats defer the fit');
        applyVillagerLook(model, characterLook({ ...choice, removedClothing: ['bonnet-bow'] }));
        assert(hat.visible, 'removing the chin tie keeps the bonnet visible');
        if (bow) assert(bow.visible, 'the Village waist bow remains independent');
        const fitted = hat.geometry, full = source.index.array;
        const remaining = fitted.index.array.subarray(0, fitted.drawRange.count);
        const original = source.getAttribute('position'), adjusted = fitted.getAttribute('position');
        const crown = new Set(remaining), point = new Vector3(), authored = new Vector3();
        let pinned = 0, lifted = 0;
        for (let i = 0; i < original.count; i++) {
          point.fromBufferAttribute(adjusted, i);
          authored.fromBufferAttribute(original, i);
          if (crown.has(i) || authored.y >= 1.463) {
            assert(point.equals(authored), 'the crown and jaw attachment keep their authored positions');
            if (!crown.has(i)) pinned++;
          } else if (point.y - authored.y > .045) lifted++;
        }
        assert(pinned > 0 && lifted > 0, 'the chin bow keeps its attachment and raises its tails');
        assert(remaining.length < full.length && remaining.length > full.length * .7, 'only the bow is removed');
        let kept = 0;
        for (let i = 0; i < full.length; i += 3) {
          if (full[i] === remaining[kept] && full[i + 1] === remaining[kept + 1] && full[i + 2] === remaining[kept + 2]) kept += 3;
          else for (let corner = 0; corner < 3; corner++) assert(source.attributes.position.getY(full[i + corner]) < 1.473);
        }
        assert.equal(kept, remaining.length);
        applyVillagerLook(model, characterLook(choice));
        assert.equal(hat.geometry, fitted, 'restoring the bow reuses its fitted geometry');
        assert.equal(fitted.drawRange.count, full.length);
        for (const key of ['skinIndex', 'skinWeight', 'uv']) {
          const actual = fitted.getAttribute(key), expected = source.getAttribute(key);
          for (let i = 0; i < expected.count; i++) for (let j = 0; j < expected.itemSize; j++) {
            assert.equal(actual.getComponent(i, j), expected.getComponent(i, j), key);
          }
        }
      } finally {
        model.dispose();
      }
    }
  } finally {
    await vite.close();
  }
});

test('the Village bonnet bow clears Pack 7 tops through motion', async t => {
  const ids = ['top-01', 'top-02', 'top-03', 'top-04', 'top-05'];
  const paths = [villagerDir + 'villager-female.garage.glb', villagerDir + 'villager-female.portrait.glb',
    bundledDir + 'gothic-02.mobile.glb', ...ids.map(id => catalog.find(item => item.id === id).url.slice(1))];
  const files = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (files.some(isLfsPointer)) return skipMissingAsset(t, 'Materialize both Village tiers, the body donor and all five Pack 7 tops.');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const [garage, portrait, donor, ...tops] = await Promise.all(files.map(file => loadGeometry(file)));
    const garmentBody = donor.getObjectByName('BODY_WARDROBE'), bonnet = getWardrobeGarment('village-bonnet');
    const point = new Vector3(), identity = new Matrix4();
    function posedGeometry(mesh, faces) {
      mesh.skeleton.update();
      const count = mesh.geometry.getAttribute('position').count;
      const positions = new Float32BufferAttribute(new Float32Array(count * 3), 3);
      for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      return new BufferGeometry().setAttribute('position', positions).setIndex(faces);
    }
    for (const actor of [garage, portrait]) {
      for (const [i, scene] of tops.entries()) {
        const item = getWardrobeGarment(ids[i]);
        // Alternate between the starter bonnet and re-equipping the same item.
        const reEquip = (i % 2 === 1) !== (actor === portrait);
        const garments = [{ item, scene }];
        if (reEquip) garments.push({ item: bonnet, scene: actor });
        const look = characterLook({ ...DEFAULT_CHARACTER, garments: { top: item.id, hat: reEquip ? bonnet.id : undefined } });
        const model = prepareVillager(actor, { fitted: true, garments, garmentBody });
        try {
          applyVillagerLook(model, look);
          const { root, hat } = model;
          const wearing = reEquip ? root.getObjectByName('wardrobe-village-bonnet').getObjectByName('ACC_HAT') : hat;
          assert.equal(hat.visible, !reEquip);
          if (reEquip) assert(hat.geometry === actor.getObjectByName('ACC_HAT').geometry, 'the superseded hat stays unfitted');
          assert(wearing.visible);
          applyVillagerLook(model, { ...look, removedClothing: ['bonnet-bow'] });
          const crown = new Set(wearing.geometry.index.array.subarray(0, wearing.geometry.drawRange.count));
          assert(wearing.visible && wearing.geometry.drawRange.count < wearing.geometry.index.count);
          applyVillagerLook(model, look);
          assert.equal(wearing.geometry.drawRange.count, wearing.geometry.index.count);
          const ribbonFaces = Array.from(wearing.geometry.index.array).filter(index => !crown.has(index));
          assert(ribbonFaces.length > 0 && ribbonFaces.length < wearing.geometry.index.count / 2);
          const cloth = [];
          root.getObjectByName(`wardrobe-${item.id}`).traverseVisible(mesh => { if (mesh.isSkinnedMesh) cloth.push(mesh); });
          assert(cloth.length);
          const mixer = new AnimationMixer(root);
          for (const emote of ['idle', '010', 'heart-overhead']) {
            if (emote !== 'idle') {
              const [clip] = buildEmoteClips(root, [findGaragePreviewEmote(emote, false)]);
              mixer.clipAction(clip).play();
              mixer.setTime(clip.duration * .5);
            }
            root.updateMatrixWorld(true);
            const ribbon = new MeshBVH(posedGeometry(wearing, ribbonFaces));
            for (const mesh of cloth) {
              const shell = posedGeometry(mesh, mesh.geometry.index.clone());
              shell.boundsTree = new MeshBVH(shell);
              assert.equal(ribbon.intersectsGeometry(shell, identity), false, `${item.id} ${emote}: ribbon crosses ${mesh.name}`);
              shell.dispose();
            }
            ribbon.geometry.dispose();
            mixer.stopAllAction();
          }
          mixer.uncacheRoot(root);
        } finally { model.dispose(); }
      }
    }
  } finally { await vite.close(); }
});

test('medieval hoods replace the bonnet while keeping the outfit and stored hairstyle', async t => {
  const up = catalog.find(item => item.id === 'hood-01');
  const down = catalog.find(item => item.id === 'hood-07');
  const paths = [villagerDir + 'villager-female.garage.glb', up.url.slice(1), down.url.slice(1)];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir)).catch(error => {
    if (error.code === 'ENOENT' && hoodFiles.has(path)) return undefined;
    throw error;
  })));
  if (bytes.some(data => !data || isLfsPointer(data))) return t.skip('Install the Medieval Hood Pack and materialize the character model.');
  const [villager, upScene, downScene] = await Promise.all(bytes.map(loadGeometry));
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    for (const [item, scene, removed] of [[up, upScene, false], [down, downScene, false], [up, upScene, true]]) {
      const removedClothing = removed ? ['hat'] : [];
      const model = prepareVillager(villager, { garments: removed ? [] : [{ item, scene }], removedClothing });
      try {
        applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, garments: { hat: item.id }, removedClothing }));
        assert.equal(model.hat.visible, false);
        assert.equal(model.root.getObjectByName('CLOTH_TOP_CORSET').visible, true);
        assert.equal(model.longHair.visible, removed || item === down);
        assert.equal(model.crop.visible, false);
        assert.equal(Boolean(model.scalpCap?.visible), !removed && item === down);
        assert.equal(Boolean(model.root.getObjectByName(`wardrobe-${item.id}`)), !removed);
      } finally { model.dispose(); }
    }
  } finally { await vite.close(); }
});

for (const number of ['01', '02', '03', '04', '05']) test(`Top ${number} keeps both armholes filled through raised-arm poses and masks its solid panels`, async t => {
  const item = catalog.find(({ id }) => id === `top-${number}`);
  const tiers = ['portrait', 'garage'];
  const paths = [item.url.slice(1), bundledDir + 'gothic-02.mobile.glb',
    ...tiers.map(tier => villagerDir + `villager-female.${tier}.glb`)];
  const files = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (files.some(isLfsPointer)) return skipMissingAsset(t, `Materialize Top ${number} and the Villager and Vesper body models.`);
  const [top, donor, ...actors] = await Promise.all(files.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const { index, attributes: { position } } = garmentBody.geometry;
  const front = [], back = [];
  const lowerPanel = number === '01' || number === '05';
  const bottom = lowerPanel ? 1.155 : 1.255;
  const upper = lowerPanel ? 1.21 : number === '02' ? 1.31 : 1.38;
  const center = new Vector3(), vertex = new Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const face = index.array.subarray(i, i + 3);
    center.set(0, 0, 0);
    for (const id of face) center.add(vertex.fromBufferAttribute(position, id));
    center.divideScalar(3);
    if (Math.abs(center.x) >= .070 || center.y < bottom || center.y > upper) continue;
    if (center.z > (lowerPanel ? .025 : .080)) front.push(face.join(','));
    if (center.z < -.030) back.push(face.join(','));
  }
  assert(front.length > (lowerPanel ? 15 : 100) && back.length > (lowerPanel ? 15 : 100), 'the donor has skin under both solid shirt panels');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { clothingPieceFor } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const look = characterLook({ ...DEFAULT_CHARACTER, garments: { top: item.id } });
    for (const [i, actor] of actors.entries()) {
      const model = prepareVillager(actor, { fitted: true, garmentBody, garments: [{ item, scene: top }], removedClothing: look.removedClothing });
      try {
        applyVillagerLook(model, look);
        const skin = model.root.getObjectByName('fitting-room-body');
        const cloth = [];
        model.root.traverseVisible(mesh => {
          if (mesh.isSkinnedMesh && clothingPieceFor(mesh) && mesh.geometry.index
            && !mesh.material.transparent && !mesh.material.alphaTest) cloth.push(mesh);
        });
        const kept = new Set();
        const { index, drawRange } = skin.geometry;
        for (let j = drawRange.start; j < drawRange.start + drawRange.count; j += 3) kept.add(index.array.subarray(j, j + 3).join(','));
        for (const panel of [front, back]) assert(lowerPanel ? panel.some(face => !kept.has(face)) : panel.every(face => !kept.has(face)), `${tiers[i]} masks the solid panels`);
        const poses = auditCorsetSkinMask(model.root, skin, garmentBody.geometry, cloth, buildEmoteClips, findGaragePreviewEmote, {
          minHeight: 1.22, extraPoses: [['008', .5], ['002', .38]],
          extraViews: [[1, 0, 0], [-1, 0, 0], [1, -.25, .35], [-1, -.25, .35], [1, -.4, -.4], [-1, -.4, -.4]],
        });
        for (const { pose, uncovered, sampled } of poses) {
          assert(sampled > 100, `${tiers[i]} ${pose} sampled exposed body faces`);
          assert.equal(uncovered, 0, `${tiers[i]} ${pose} missing visible skin`);
        }
      } finally { model.dispose(); }
    }
  } finally { await vite.close(); }
});

test('the authored Sweetheart keeps chest and underarm skin in both waist fits', async t => {
  const paths = [villagerDir + 'villager-female.garage.glb',
    bundledDir + 'gothic-02.garage.glb', bundledDir + 'gothic-02.mobile.glb'];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the Sweetheart and Villager models.');
  const [village, ...bundles] = await Promise.all(bytes.map(loadGeometry));
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { hasAuthoredSweetheartFit } = await vite.ssrLoadModule('/src/game/characters/sweetheartCorset.ts');
    for (const bundle of bundles) {
      assert(hasAuthoredSweetheartFit(bundle, 2));
      const donor = bundle.getObjectByName('BODY_WARDROBE');
      const { index, attributes: { position } } = donor.geometry;
      const chest = [], underarm = [];
      for (let i = 0; i < index.count; i += 3) {
        const face = index.array.subarray(i, i + 3);
        const y = (position.getY(face[0]) + position.getY(face[1]) + position.getY(face[2])) / 3;
        const x = Math.abs((position.getX(face[0]) + position.getX(face[1]) + position.getX(face[2])) / 3);
        const z = (position.getZ(face[0]) + position.getZ(face[1]) + position.getZ(face[2])) / 3;
        if (y < 1.21 || y > 1.38) continue;
        if (x < .075 && z > .075) chest.push(face.join(','));
        if (x > .10 && x < .19 && z > -.04 && z < .11) underarm.push(face.join(','));
      }
      assert(chest.length > 25 && underarm.length > 25, 'both openings contain body geometry');
      for (const standalone of [false, true]) {
        const label = standalone ? 'standalone' : 'bundled';
        const source = standalone ? village : bundle;
        const model = prepareVillager(source, { fitted: true,
          ...(standalone ? { garmentBody: donor, corsetSource: { set: 'gothic-02', scene: bundle } } : {}),
        });
        try {
          const body = model.root.getObjectByName(standalone ? 'fitting-room-body' : 'BODY_WARDROBE');
          for (const waist of ['tucked', 'over']) {
            const choice = { set: 'gothic-02', shirt: 'none', waist };
            applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER,
              ...(standalone ? { wardrobeTrial: choice } : { wardrobe: choice }),
            }));
            const corset = model.root.getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`);
            assert(corset?.visible, `${label} ${waist} corset`);
            assert(body.visible, `${label} wears the full body donor`);
            assert(Number.isFinite(body.geometry.drawRange.count), `${label} ${waist} applies the mask to the displayed body`);
            const visible = new Set();
            for (let i = 0; i < body.geometry.drawRange.count; i += 3) {
              visible.add(body.geometry.index.array.subarray(i, i + 3).join(','));
            }
            for (const face of chest) assert(visible.has(face), `${label} ${waist} chest ${face}`);
            for (const face of underarm) assert(visible.has(face), `${label} ${waist} underarm ${face}`);
          }
        } finally { model.dispose(); }
      }
    }
  } finally { await vite.close(); }
});

test('turning off wardrobe layers fits underwear and keeps the other pieces', async t => {
  const top = catalog.find(item => item.id === 'top-02');
  const skirt = catalog.find(item => item.id === 'gothic-skirt-02');
  const paths = [
    villagerDir + 'villager-female.garage.glb', bundledDir + 'gothic-02.garage.glb',
    bundledDir + 'gothic-02.mobile.glb', top.url.slice(1), skirt.url.slice(1), garmentDir + 'vesper-body.glb',
  ];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
  const [village, bundle, donorScene, topScene, skirtScene, fittingBody] = await Promise.all(bytes.map(loadGeometry));
  const donor = donorScene.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({
    define: { __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify([top.id, skirt.id, 'linen-nightgown']) },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const build = (scene, choice, options) => {
      const look = characterLook({ ...DEFAULT_CHARACTER, ...choice });
      const model = prepareVillager(scene, { removedClothing: look.removedClothing, ...options });
      applyVillagerLook(model, look);
      return model;
    };
    const { getWardrobeGarment, setWardrobeGarment, setWardrobeRemoval, villageWardrobeItems } =
      await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    for (const item of villageWardrobeItems) {
      assert(village.getObjectByName(item.villageNode), item.id);
    }
    const sleeves = getWardrobeGarment('village-sleeves');
    const separated = setWardrobeGarment(DEFAULT_CHARACTER, sleeves.slot, sleeves.id);
    const sleeveless = setWardrobeRemoval(separated, 'sleeves', true);
    const withoutSleeves = build(village, sleeveless, { garmentBody: donor });
    try {
      assert.equal(withoutSleeves.root.getObjectByName(sleeves.villageNode).visible, false);
      assert(withoutSleeves.root.getObjectByName('CLOTH_TOP_CORSET').visible);
      assert(withoutSleeves.root.getObjectByName('fitting-room-body').geometry.drawRange.count > 0);
      assert(!withoutSleeves.root.getObjectByName('wardrobe-underwear-bra'));
    } finally { withoutSleeves.dispose(); }
    const withSleeves = build(village, separated, { garments: [{ item: sleeves, scene: village }] });
    try {
      const sleeveGroup = withSleeves.root.getObjectByName('wardrobe-village-sleeves');
      assert.deepEqual(sleeveGroup.children.map(mesh => mesh.name), [sleeves.villageNode]);
      assert.equal(withSleeves.root.getObjectByName(sleeves.villageNode).visible, false);
    } finally { withSleeves.dispose(); }

    const withoutCorset = build(village, { removedClothing: ['corset'], garments: { top: top.id } },
      { garmentBody: donor, garments: [{ item: top, scene: topScene }] });
    try {
      const { root } = withoutCorset;
      assert.equal(root.getObjectByName('BODY_OUTFIT_CUT').visible, false);
      assert.equal(root.getObjectByName('CLOTH_TOP_CORSET').visible, false);
      assert(root.getObjectByName('wardrobe-top-02').visible);
      assert(root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible);
      assert(root.getObjectByName('fitting-room-body').geometry.drawRange.count > 0);
      assert.equal(root.getObjectByName('wardrobe-underwear-bra'), undefined, 'the equipped Top 02 covers the torso');
    } finally {
      withoutCorset.dispose();
    }

    const exposedTorso = build(bundle, { wardrobe: { set: 'gothic-02', shirt: 'none', waist: 'over' }, removedClothing: ['corset'] });
    try {
      const { root } = exposedTorso;
      const body = root.getObjectByName('fitting-room-body');
      const original = bundle.getObjectByName('BODY_WARDROBE').geometry;
      const visible = new Set();
      for (let i = 0; i < body.geometry.drawRange.count; i += 3) {
        visible.add(body.geometry.index.array.subarray(i, i + 3).join(','));
      }
      const point = new Vector3(), corner = new Vector3();
      let torsoFaces = 0;
      for (let i = 0; i < original.index.count; i += 3) {
        const face = original.index.array.subarray(i, i + 3);
        point.set(0, 0, 0);
        for (const vertex of face) point.add(corner.fromBufferAttribute(original.attributes.position, vertex));
        point.multiplyScalar(1 / 3);
        if (point.y < 1.02 || point.y > 1.09 || Math.abs(point.x) > .10) continue;
        torsoFaces++;
        assert(visible.has(face.join(',')), 'the skirt waist does not remove donor torso faces');
      }
      assert(torsoFaces > 100);
      assert.equal(root.getObjectByName('CLOTH_CORSET_OVER').visible, false);
      assert.equal(root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible, true);
      assert(root.getObjectByName('wardrobe-underwear-bra')?.visible);
      assert.equal(root.getObjectByName('wardrobe-underwear-briefs'), undefined);
      const bra = root.getObjectByName('wardrobe-underwear-bra');
      const visibleWithBra = body.geometry.drawRange.count;
      const removed = { ...DEFAULT_CHARACTER, wardrobe: { set: 'gothic-02', waist: 'over', shirt: 'none' }, removedClothing: ['corset'] };
      applyVillagerLook(exposedTorso, characterLook({ ...removed, bra: false }));
      assert.equal(bra.visible, false, 'the bra can come off independently of the removed corset');
      assert(body.geometry.drawRange.count > visibleWithBra, 'removing the bra restores the skin beneath it');
      applyVillagerLook(exposedTorso, characterLook({ ...removed, bra: true }));
      assert.equal(root.getObjectByName('wardrobe-underwear-bra'), bra, 'the same rigged bra can be put back on');
      assert.equal(bra.visible, true);
      assert.equal(body.geometry.drawRange.count, visibleWithBra);
    } finally {
      exposedTorso.dispose();
    }

    const vest = await readFile(new URL(`${garmentDir}corsets/gothic-underbust-vest.garage.glb`, publicDir));
    if (!isLfsPointer(vest)) {
      const choice = { ...DEFAULT_CHARACTER, wardrobeTrial: { set: 'gothic-04', waist: 'over', shirt: 'none' } };
      const model = build(village, choice, { garmentBody: donor, corsetSource: { set: 'gothic-04', scene: await loadGeometry(vest) } });
      try {
        const bra = model.root.getObjectByName('wardrobe-underwear-bra');
        const body = model.root.getObjectByName('fitting-room-body');
        const over = model.root.getObjectByName('CLOTH_CORSET_OVER');
        assert(bra && !bra.visible && over.visible, 'equipping the rebuilt vest starts with the bra off');
        applyVillagerLook(model, characterLook({ ...choice, bra: true }));
        assert(bra.visible && over.visible, 'the rebuilt vest and optional bra can be worn together');
        assert(bra.children.every(mesh => mesh.skeleton === body.skeleton), 'the close-fitting bra uses the same bones as the body');
      } finally {
        model.dispose();
      }
    }

    const withoutSkirt = build(bundle, { wardrobe: { set: 'gothic-02', shirt: 'none', waist: 'over' }, removedClothing: ['skirt'] });
    try {
      const { root } = withoutSkirt;
      assert.equal(root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible, false);
      assert(root.getObjectByName('wardrobe-underwear-briefs')?.visible);
      assert.equal(root.userData.skirtHandRoom, undefined);
      assert(root.getObjectByName('CLOTH_CORSET_OVER').visible);
      assert(root.getObjectByName('CLOTH_FEET_SHOES').visible);
      assert(root.getObjectByName('fitting-room-body').geometry.drawRange.count > 0);
      assert.equal(root.getObjectByName('wardrobe-underwear-bra'), undefined, 'the fitted corset stays on');
    } finally {
      withoutSkirt.dispose();
    }

    for (const [scene, choice] of [[village, {}], [bundle, { wardrobe: { set: 'gothic-02', shirt: 'none', waist: 'over' } }]]) {
      const removed = setWardrobeRemoval({ ...DEFAULT_CHARACTER, ...choice, bra: false }, 'top', true);
      const model = build(scene, removed, { garmentBody: donor });
      try {
        assert(model.root.getObjectByName('wardrobe-underwear-bra')?.visible, 'Remove top puts the bra on');
        assert.equal(model.root.getObjectByName(scene === village ? 'CLOTH_TOP_CORSET' : 'CLOTH_CORSET_OVER').visible, false);
        assert(model.root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible);
      } finally { model.dispose(); }
    }
    for (const slot of ['skirt', 'village-skirt']) {
      const choice = { ...DEFAULT_CHARACTER, garments: { underskirt: 'village-petticoat' }, removedClothing: [slot] };
      assert.equal(characterLook(choice).garments, undefined, 'a saved separate petticoat follows the removed skirt');
      const model = build(village, choice, { garmentBody: donor });
      try {
        assert(!model.root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible);
        assert(!model.root.getObjectByName('CLOTH_UNDER_UNDERSKIRT').visible);
        assert(model.root.getObjectByName('wardrobe-underwear-briefs')?.visible);
      } finally { model.dispose(); }
    }

    const petticoat = getWardrobeGarment('village-petticoat');
    const removedSkirt = setWardrobeRemoval({ ...DEFAULT_CHARACTER, garments: { skirt: 'skirt-03' } }, 'skirt', true);
    const innerOnly = setWardrobeGarment(removedSkirt, 'underskirt', petticoat.id);
    const innerOnlyModel = build(village, innerOnly, { garmentBody: donor, garments: [{ item: petticoat, scene: village }] });
    try {
      assert(!innerOnlyModel.root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible);
      assert(!innerOnlyModel.root.getObjectByName('ACC_BELT').visible);
      assert(innerOnlyModel.root.getObjectByName('wardrobe-village-petticoat').children[0].visible);
      assert.equal(characterLook(setWardrobeRemoval(innerOnly, 'skirt', false)).garments.skirt, 'skirt-03');
    } finally { innerOnlyModel.dispose(); }

    for (const donorMesh of [donor, fittingBody.getObjectByName('BODY_WARDROBE')]) {
      const donorPosition = donorMesh.geometry.attributes.position.array.slice();
      const donorIndex = donorMesh.geometry.index.array.slice();
      const choice = { ...DEFAULT_CHARACTER, removedClothing: ['top', 'corset', 'skirt', 'shoes'] };
      const { withClothingColors } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
      const dyed = withClothingColors(withClothingColors(choice, 'bra', { color: '#223355' }), 'briefs', { accent: '#bbccdd' });
      const restored = build(village, dyed, { garmentBody: donorMesh });
      try {
        const { root } = restored;
        for (const name of ['CLOTH_ARMS_SLEEVES', 'CLOTH_TOP_CORSET', 'CLOTH_BOTTOM_SKIRT', 'CLOTH_FEET_SHOES']) {
          assert.equal(root.getObjectByName(name).visible, false, name);
        }
        const body = root.getObjectByName('fitting-room-body');
        assert(body.geometry.drawRange.count > 0 && body.geometry.drawRange.count < donorMesh.geometry.index.count,
          'the underwear shell masks donor faces beneath the fabric');
        for (const piece of ['bra', 'briefs']) {
          const group = root.getObjectByName(`wardrobe-underwear-${piece}`);
          assert(group?.visible);
          assert.equal(group.children.length, 3, 'fabric, top binding and hem binding are present');
          for (const mesh of group.children) {
            assert.equal(mesh.skeleton, body.skeleton);
            assert.equal(mesh.material.transparent, false);
            const weights = mesh.geometry.attributes.skinWeight;
            for (let i = 0; i < weights.count; i++) {
              assert(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-5);
            }
          }
        }
        assert.equal(root.getObjectByName('wardrobe-underwear-bra-fabric').material.color.getHexString(), '223355');
        assert.equal(root.getObjectByName('wardrobe-underwear-briefs-hem-binding').material.color.getHexString(), 'bbccdd');
        assert.deepEqual(donorMesh.geometry.attributes.position.array, donorPosition, 'fitting leaves donor coordinates intact');
        assert.deepEqual(donorMesh.geometry.index.array, donorIndex, 'fitting leaves donor topology intact');
        root.updateMatrixWorld(true);
        assert(Math.abs(new Box3().setFromObject(body, true).min.y) < 1e-5, 'the bare feet remain on the floor');
      } finally {
        restored.dispose();
      }
    }

    const underSkirt = build(village, { garments: { skirt: skirt.id } }, { garmentBody: donor, garments: [{ item: skirt, scene: skirtScene }] });
    try {
      assert(underSkirt.root.getObjectByName('wardrobe-underwear-briefs')?.visible);
      assert(underSkirt.root.getObjectByName(`wardrobe-${skirt.id}`)?.visible);
    } finally { underSkirt.dispose(); }

    const withoutDress = build(village, { outfit: 'linen-nightgown', removedClothing: ['dress', 'skirt'] }, { garmentBody: donor });
    try {
      assert(withoutDress.root.getObjectByName('wardrobe-underwear-briefs')?.visible);
      assert(withoutDress.root.getObjectByName('CLOTH_TOP_CORSET').visible, 'revealing the briefs uses the stock top beneath a complete outfit');
      assert.equal(withoutDress.root.getObjectByName('CLOTH_FEET_SHOES').visible, false,
        'revealing the briefs keeps the selected sleepwear outfit barefoot');
      assert.equal(withoutDress.root.getObjectByName('wardrobe-underwear-bra'), undefined);
    } finally { withoutDress.dispose(); }

    const defaultModel = build(village, {});
    try {
      assert(defaultModel.root.getObjectByName('CLOTH_TOP_CORSET').visible);
      assert(defaultModel.root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible);
      assert(defaultModel.root.getObjectByName('CLOTH_FEET_SHOES').visible, 'returning to the Village outfit restores the shoes');
      assert.equal(defaultModel.root.getObjectByName('fitting-room-body'), undefined);
      assert.equal(defaultModel.root.getObjectByName('wardrobe-underwear'), undefined);
    } finally { defaultModel.dispose(); }

    const missingDonor = build(village, { removedClothing: ['corset', 'hat'] });
    try {
      assert(missingDonor.root.getObjectByName('CLOTH_TOP_CORSET').visible, 'keep the stock corset when the donor is unavailable');
      assert.equal(missingDonor.root.getObjectByName('ACC_HAT').visible, false);
      assert.equal(missingDonor.root.getObjectByName('fitting-room-body'), undefined);
      assert.equal(missingDonor.root.getObjectByName('wardrobe-underwear'), undefined);
    } finally {
      missingDonor.dispose();
    }
  } finally {
    await vite.close();
  }
});

test('removing detachable sleeves preserves the bodice or dress and exposes both skinned arms', async t => {
  const item = catalog.find(({ id }) => id === 'medieval-kaftan-01');
  assert(item.detachableSleeves);
  const tiers = [['garage', item.url], ['portrait', item.mobileUrl]];
  const inputs = [bundledDir + 'gothic-02.mobile.glb', ...tiers.flatMap(([kind, path]) => [
    villagerDir + `villager-female.${kind}.glb`, path.slice(1),
  ])];
  const files = await Promise.all(inputs.map(path => readFile(new URL(path, publicDir))));
  if (files.some(isLfsPointer)) return t.skip('Run git lfs pull to materialize the fitting-room models.');
  const [donor, ...scenes] = await Promise.all(files.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    const completeSkin = wardrobeCoverageSurface(garmentBody.geometry);
    try {
      for (const [i, [kind]] of tiers.entries()) {
        const [base, dress] = scenes.slice(i * 2, i * 2 + 2);
        for (const garments of [[], [{ item, scene: dress }]]) {
          const build = removedClothing => {
            const choice = { ...DEFAULT_CHARACTER, removedClothing, ...(garments.length && { garments: { dress: item.id } }) };
            const model = prepareVillager(base, { fitted: Boolean(garments.length), garmentBody, garments, removedClothing });
            applyVillagerLook(model, characterLook(choice));
            return model;
          };
          const withSleeves = build([]), withoutSleeves = build(['sleeves']);
          const root = withoutSleeves.root;
          const from = garments.length ? withSleeves.root.getObjectByName('fitting-room-body') : withSleeves.root.getObjectByName('BODY_OUTFIT_CUT');
          const to = root.getObjectByName('fitting-room-body');
          const beforeSkin = wardrobeCoverageSurface(from.geometry), afterSkin = wardrobeCoverageSurface(to.geometry);
          try {
            if (garments.length) {
              const sleeves = root => root.getObjectByName(`wardrobe-${item.id}`).children.filter(mesh => /_SLEEVE_/.test(mesh.name));
              assert.equal(sleeves(withSleeves.root).length, 2, `${kind} draws the sleeve fabric and trim`);
              assert.equal(sleeves(root).length, 0, `${kind} hides both sleeve primitives`);
              assert(root.getObjectByName('CLOTH_KAFTAN_01_BODY_FABRIC').visible, `${kind} keeps the dress body`);
            } else {
              assert(withSleeves.root.getObjectByName('CLOTH_ARMS_SLEEVES').visible);
              assert.equal(root.getObjectByName('CLOTH_ARMS_SLEEVES').visible, false);
              assert(root.getObjectByName('CLOTH_TOP_CORSET').visible);
              assert(root.getObjectByName('CLOTH_BOTTOM_SKIRT').visible);
            }
            assert(root.getObjectByName('CLOTH_FEET_SHOES').visible);
            assert.equal(root.getObjectByName('wardrobe-underwear-bra'), undefined);
            for (const side of [-1, 1]) {
              let exposed = 0;
              for (const x of [.205, .235, .265, .295, .325, .355]) for (const y of [1.08, 1.13, 1.18, 1.23, 1.28, 1.33]) {
                const ray = new Ray(new Vector3(side * x, y, .40), new Vector3(0, 0, -1));
                const donorHit = completeSkin.raycastFirst(ray, DoubleSide, 0, .60);
                if (!donorHit) continue;
                const hit = surface => surface.raycastFirst(ray, DoubleSide, donorHit.distance - .001, donorHit.distance + .001);
                if (!hit(beforeSkin) && hit(afterSkin)) exposed++;
              }
              assert(exposed > 1, `${kind} restores donor faces under each removed sleeve`);
            }
          } finally {
            beforeSkin.geometry.dispose();
            afterSkin.geometry.dispose();
            withSleeves.dispose();
            withoutSleeves.dispose();
          }
        }
      }
    } finally { completeSkin.geometry.dispose(); }
  } finally { await vite.close(); }
});

test('Gothic Skirts 02 and 03 keep optional revisions beside the original skirts', async t => {
  const [second, third] = ['02', '03'].map(number => catalog.find(item => item.id === `gothic-skirt-${number}`));
  assert.equal(second.revisionUrl, second.url.replace(/\.glb$/, '-update.glb'));
  assert.equal(third.revisionUrl, third.url.replace(/\.glb$/, '-update.glb'));
  const original = new URL(second.url.slice(1), publicDir);
  const incompatible = new URL('models/characters/female/props/bag-black-gold/bag-black-gold-mobile.glb', publicDir);
  assert.equal(hasCompatibleWardrobeRevision(incompatible, original), false);
  const originalBytes = await readFile(original);
  if (isLfsPointer(originalBytes)) return t.skip('Run git lfs pull to materialize the fitting-room models.');
  assert.equal(hasCompatibleWardrobeRevision(original, original), true);
  const scratch = await mkdtemp(join(tmpdir(), 'avenlab-skirt-revision-'));
  try {
    const duplicate = pathToFileURL(join(scratch, 'gothic-skirt-02-update.glb'));
    await writeFile(duplicate, originalBytes);
    assert.equal(hasCompatibleWardrobeRevision(duplicate, original), false,
      'a renamed copy of the original keeps the automatic waistband fit');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  assert.equal(hasCompatibleWardrobeRevision(new URL(third.url.slice(1), publicDir), original), false,
    'the revision must identify the same skirt');
  const vite = await createServer({
    define: {
      __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify([second.id, third.id]),
      __DRESSING_ROOM_REVISION_IDS__: JSON.stringify([second.id]),
    },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  });
  try {
    const { getWardrobeGarment, hasWardrobeRevisionMesh, wardrobeGarmentModelUrl } =
      await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const secondItem = getWardrobeGarment(second.id);
    assert(hasWardrobeRevisionMesh(secondItem, await loadGeometry(originalBytes)),
      'the runtime check accepts the real multipart skirt');
    for (const tier of ['garage', 'portrait']) {
      assert.equal(wardrobeGarmentModelUrl(secondItem, tier), second.revisionUrl);
      assert.equal(wardrobeGarmentModelUrl(secondItem, tier, { useRevision: false }), second.url);
      assert.equal(wardrobeGarmentModelUrl(getWardrobeGarment(third.id), tier), third.url);
    }
  } finally {
    await vite.close();
  }
});

test('standalone wardrobe exports keep the corset rig and discard unrelated layers', async t => {
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
    if (isLfsPointer(sourceBytes)) return skipMissingAsset(t, 'Run git lfs pull to materialize this Gothic wardrobe model.');
    const pieceUrl = new URL(garmentDir + output, publicDir);
    const pieceBytes = await readFile(pieceUrl);
    assert(pieceBytes.length < sourceBytes.length, 'standalone pieces should be smaller than their bundles');
    if (/^gothic-0[23]\.mobile\.glb$/.test(source)) {
      const skirt = catalog.find(item => item.id === `gothic-skirt-${source.slice(7, 9)}`);
      const skirtUrl = new URL(skirt.url.slice(1), publicDir);
      if (!isLfsPointer(await readFile(skirtUrl))) {
        assert.equal(hasCompatibleWardrobeRevision(pieceUrl, skirtUrl), false,
          'a standalone corset shares the rig but cannot be a skirt revision');
        assert.equal(hasCompatibleWardrobeRevision(new URL(bundledDir + source, publicDir), skirtUrl), false,
          'a full Gothic outfit cannot be a skirt revision');
      }
    }
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
      const underbust = source.startsWith('gothic-04.');
      assert.equal(node.getExtras().underbustFitVersion, underbust ? 2 : undefined);
      const primitives = node.getMesh().listPrimitives(), sourcePrimitives = authored.getMesh().listPrimitives();
      assert.equal(primitives.length, sourcePrimitives.length);
      let positionChanged = false;
      primitives.forEach((primitive, index) => {
        const sourcePrimitive = sourcePrimitives[index];
        if (underbust) {
          const before = sourcePrimitive.getAttribute('POSITION').getCount();
          const count = primitive.getAttribute('POSITION').getCount();
          const isCrown = ['MAT_CORSET_04_05.001', 'MAT_CORSET_04_00.001'].includes(primitive.getMaterial()?.getName());
          const indices = primitive.getIndices().getArray();
          assert(indices.every(vertex => vertex < count));
          if (isCrown) {
            assert(count > before, 'fabric and trim have separate rebuilt crowns');
            assert(indices.some(vertex => vertex >= before), 'rebuilt crowns are used by the visible surface');
            assert.equal(primitive.getExtras().underbustCrownStart, before);
          } else assert.equal(count, before, 'the placket and hardware keep their vertex layout');
          const weights = primitive.getAttribute('WEIGHTS_0').getArray();
          for (let i = 0; i < weights.length; i += 4) {
            assert(Math.abs(weights[i] + weights[i + 1] + weights[i + 2] + weights[i + 3] - 1) < 1e-4);
          }
        } else if (source.startsWith('gothic-03.')) {
          // Meshopt may rotate a triangle's first index while keeping winding and face order.
          const actual = primitive.getIndices().getArray(), expected = sourcePrimitive.getIndices().getArray();
          assert.equal(actual.length, expected.length);
          for (let offset = 0; offset < expected.length; offset += 3) {
            const [a, b, c] = actual.subarray(offset, offset + 3);
            const [x, y, z] = expected.subarray(offset, offset + 3);
            assert((a === x && b === y && c === z) || (a === y && b === z && c === x) || (a === z && b === x && c === y),
              `Ruffled preserves the winding and position of triangle ${offset / 3}`);
          }
        } else assert.deepEqual(primitive.getIndices().getArray(), sourcePrimitive.getIndices().getArray());
        assert.deepEqual(primitive.listSemantics().toSorted(), sourcePrimitive.listSemantics().toSorted());
        for (const name of primitive.listSemantics()) {
          const fitted = primitive.getAttribute(name).getArray();
          const original = sourcePrimitive.getAttribute(name).getArray();
          if (underbust && ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0'].includes(name)) {
            assert(fitted.length >= original.length);
            if (name === 'POSITION') positionChanged ||= original.some((value, i) => Math.abs(value - fitted[i]) > .001);
          } else if (underbust) assert.deepEqual(fitted.subarray(0, original.length), original);
          else assert.deepEqual(fitted, original);
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
      if (underbust) assert(positionChanged, `${node.getName()} includes the baked refit`);
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
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const [reference] = (await io.readBinary(base)).getRoot().listSkins();
  const baseJoints = reference.listJoints();
  const baseNames = baseJoints.map(joint => joint.getName());
  assert.equal(baseNames.length, 88);
  const baseParents = baseJoints.map(joint => joint.getParentNode()?.getName());
  const baseRest = baseJoints.map(joint => joint.getWorldMatrix());
  const baseInverses = reference.getInverseBindMatrices().getArray();

  for (const file of garmentFiles) {
    await t.test(file.slice(garmentDir.length), async subtest => {
      const bytes = await readFile(new URL(file, publicDir)).catch(error => {
        if (error.code === 'ENOENT' && hoodFiles.has(file)) return undefined;
        throw error;
      });
      if (!bytes) return subtest.skip('Install the Medieval Hood Pack to verify this garment GLB.');
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

function verifyTopShoulderOpening(top, body) {
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
    assert((surface.raycastFirst(ray, DoubleSide)?.distance ?? Infinity) > .0323,
      'both shoulder points lie in the exposed armhole in the overhead pose');
  }
}

test('Gothic Skirt 04 and Top 02 replace stock pieces and animate together on both female models', async t => {
  const skirt = catalog.find(item => item.id === 'gothic-skirt-04');
  const top = catalog.find(item => item.id === 'top-02');
  const paths = [skirt.url.slice(1), top.url.slice(1), 'models/characters/wardrobe/gothic-02.mobile.glb',
    villagerDir + 'villager-female.garage.glb', villagerDir + 'villager-female.portrait.glb'];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the try-on models.');
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
        const attributes = fittedTop.geometry.attributes;
        const sourceUV = originalTop.attributes.uv;
        const uvKey = (uv, i) => uv.getX(i) + ',' + uv.getY(i);
        const authoredUVs = new Set(Array.from({length: sourceUV.count}, (_, i) => uvKey(sourceUV, i)));
        let preservedUVs = 0;
        for (let i = 0; i < attributes.position.count; i++) {
          const pos = attributes.position;
          if (pos.getY(i) > 1.32 && pos.getY(i) < 1.39 && pos.getZ(i) < 0) {
            assert(Math.abs(pos.getX(i)) < .118, 'the rear rim stays inside the traced cut');
          }
          if (authoredUVs.has(uvKey(attributes.uv, i))) preservedUVs++;
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += attributes.skinWeight.getComponent(i, k);
          assert(Math.abs(sum - 1) < .0002);
        }
        assert(preservedUVs > .85 * attributes.uv.count, 'the retained fabric uses the original UV map');
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
        verifyTopShoulderOpening(fittedTop, body);
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
  if (common.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
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
        const garments = [{ item: skirt, scene: skirtScene }];
        const model = prepareVillager(base, { fitted: true, garments, garmentBody, corsetSource: { set, scene } });
        try {
          const { root } = model;
          const corset = root.getObjectByName(`wardrobe-corset-${set}`);
          const skirtGroup = root.getObjectByName(`wardrobe-${skirt.id}`);
          const original = root.getObjectByName('BODY_OUTFIT_CUT');
          assert(corset && skirtGroup && original);
          assert(!corset.getObjectByName('BODY_WARDROBE') && !corset.getObjectByName('CLOTH_BOTTOM_SKIRT'));
          const body = root.getObjectByName('fitting-room-body');
          const bodyIndex = body.geometry.index;
          const maskRevisits = [];
          for (const waist of ['over', 'tucked']) {
            const wardrobeTrial = { set, waist, shirt: 'none' };
            const choice = { ...DEFAULT_CHARACTER, wardrobeTrial, garments: { skirt: skirt.id } };
            const dyed = withClothingColors(choice, 'corset', { color: '#305080' });
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
            if (tier === 'garage' && set === 'gothic-02') {
              maskRevisits.push({ look, indices: bodyIndex.array.slice(0, body.geometry.drawRange.count) });
            }
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
            assert.equal(corset.getObjectByName('CLOTH_UNDERBUST_BLOUSE'), undefined);
            if (set === 'gothic-04' && waist === 'over') {
              const shell = visibleMeshes.find(mesh => mesh.material.name === 'MAT_CORSET_04_05.001');
              const fitted = shell.geometry, positions = fitted.getAttribute('position');
              applyVillagerLook(model, { ...look, overEase: 2 });
              const eased = shell.geometry.getAttribute('position');
              assert.notEqual(eased, positions);
              const upper = new Vector3(), widened = new Vector3();
              for (let i = 0; i < positions.count; i++) {
                if (positions.getY(i) >= 1.17) assert(upper.fromBufferAttribute(positions, i)
                  .equals(widened.fromBufferAttribute(eased, i)), 'over-skirt ease preserves the fit above the hem');
              }
              applyVillagerLook(model, look);
              assert.equal(shell.geometry, fitted, 'turning ease off restores the regular fit');
            }
          }
          if (maskRevisits.length) {
            assert(!original.geometry.hasAttribute('_aven_coverage'), 'the cut Village body has no changing authored mask');
            const baselineIndexReads = t.mock.method(original.geometry, 'getIndex');
            try {
              for (const { look, indices } of maskRevisits) {
                const version = bodyIndex.version;
                applyVillagerLook(model, look);
                assert.equal(corset.getObjectByName('CLOTH_CORSET_TUCKED').visible, look.corset.waist === 'tucked');
                assert.equal(corset.getObjectByName('CLOTH_CORSET_OVER').visible, look.corset.waist === 'over');
                assert.equal(body.geometry.index, bodyIndex, 'returning to a fit uses the live index buffer');
                assert(bodyIndex.version > version, 'switching fits publishes the reused mask');
                assert.equal(body.geometry.drawRange.count, indices.length);
                assert.deepEqual(bodyIndex.array.subarray(0, indices.length), indices);
              }
              assert.equal(baselineIndexReads.mock.callCount(), 0, 'revisiting fits skips rebuilding the cut-body coverage surface');
            } finally {
              baselineIndexReads.mock.restore();
            }
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

test('the rebuilt Gothic Underbust uses independent Over and Tucked fits on both tiers', async t => {
  const set = 'gothic-04';
  const tiers = [['garage', 'garage'], ['mobile', 'portrait']];
  const rebuiltPath = (tier, waist) => `${garmentDir}corsets/gothic-underbust-vest${waist === 'tucked' ? '-tucked' : ''}.${tier}.glb`;
  const top = catalog.find(item => item.id === 'top-02');
  const inputs = [top.url.slice(1), bundledDir + 'gothic-02.mobile.glb',
    ...tiers.flatMap(([tier]) => ['over', 'tucked'].map(waist => rebuiltPath(tier, waist)))];
  const sources = await Promise.all(inputs.map(path => readFile(new URL(path, publicDir))));
  if (sources.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
  const topScene = await loadGeometry(sources[0]);
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/build-wardrobe-pieces.mjs', import.meta.url))]);
  const donor = await readFile(new URL(garmentDir + 'vesper-body.glb', publicDir)).then(loadGeometry);
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  assert(garmentBody, 'standalone fits use the generated complete Vesper body');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook, villagerModelUrl } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { corsetModelUrl, corsetModelUrls } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    const { rebuiltUnderbustPart } = await vite.ssrLoadModule('/src/game/characters/standaloneCorset.ts');
    const { withClothingColors } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { resolveWardrobePreview } = await vite.ssrLoadModule('/src/game/characters/wardrobePreviewAssets.ts');
    const { WARDROBE_BODY_DONOR_URLS: [donorUrl] } = await vite.ssrLoadModule('/src/game/characters/wardrobeBody.ts');

    for (const [tier, kind] of tiers) {
      const baseUrl = villagerModelUrl(characterLook(DEFAULT_CHARACTER), kind);
      assert(baseUrl, `${tier} has a live Vesper model`);
      const baseBytes = await readFile(new URL(baseUrl.slice(1), publicDir));
      if (isLfsPointer(baseBytes)) return skipMissingAsset(t, 'Run git lfs pull to materialize the character models.');
      const base = await loadGeometry(baseBytes);
      const legacyChoice = { ...DEFAULT_CHARACTER, wardrobeTrial: { set, waist: 'over', shirt: 'none' },
        garments: { top: top.id, skirt: 'village-skirt' } };
      const legacyLook = characterLook(legacyChoice);
      const legacyPlan = resolveWardrobePreview({ preferredUrl: baseUrl, look: legacyLook, kind, villageKind: kind,
        sources: { [baseUrl]: base, [top.url]: topScene, [donorUrl]: donor } });
      assert.deepEqual(legacyPlan.pendingUrls, [], 'a legacy layered choice does not request a detached corset');
      assert.equal(legacyPlan.unavailable, false);
      assert.equal(legacyPlan.preview.corsetScene, undefined);
      const shirtPreview = prepareVillager(legacyPlan.preview.scene, { fitted: true,
        garments: legacyPlan.preview.garments, garmentBody: legacyPlan.preview.garmentBody });
      try {
        applyVillagerLook(shirtPreview, legacyPlan.preview.look);
        assert(shirtPreview.root.getObjectByName(`wardrobe-${top.id}`)?.visible);
        assert(shirtPreview.root.getObjectByName('wardrobe-village-skirt')?.visible);
        assert.equal(shirtPreview.root.getObjectByName('CLOTH_TOP_CORSET').visible, false);
        assert.equal(shirtPreview.root.getObjectByName(`wardrobe-corset-${set}`), undefined);
      } finally {
        shirtPreview.dispose();
      }
      for (const waist of ['over', 'tucked']) {
        const choice = withClothingColors({ ...DEFAULT_CHARACTER, wardrobeTrial: { set, waist, shirt: 'none' },
          ...(waist === 'tucked' && { bra: true }) },
          'corset', { color: '#305080' });
        const look = characterLook(choice);
        assert.equal(villagerModelUrl(look, kind), baseUrl);
        const url = corsetModelUrl(look.corset, kind);
        assert.equal(url, `/${rebuiltPath(tier, waist)}`);
        assert.equal(corsetModelUrls(look.corset, kind)[1],
          `/${garmentDir}corsets/${set}.${tier}.glb`, `missing rebuilt ${waist} falls back to the legacy fit`);
        const bytes = await readFile(new URL(url.slice(1), publicDir));
        const scene = await loadGeometry(bytes);
        assert(rebuiltUnderbustPart(scene, waist), 'the requested asset has the expected fit role');
        assert.equal(rebuiltUnderbustPart(scene, waist === 'over' ? 'tucked' : 'over'), undefined,
          'a mismatched rebuilt role is ineligible for this fit');
        const colorMap = new Texture();
        scene.traverse(mesh => {
          if (mesh.isSkinnedMesh && mesh.material.name === '1_FRONT_1652') mesh.material.map = colorMap;
        });
        const model = prepareVillager(base, { fitted: true, garmentBody, corsetSource: { set, scene } });
        try {
          applyVillagerLook(model, look);
          const { root } = model;
          const corset = root.getObjectByName(`wardrobe-corset-${set}`);
          const outfitSkin = root.getObjectByName('BODY_OUTFIT_CUT');
          assert(corset && outfitSkin, `${tier} ${waist} attaches to the live Vesper rig`);
          assert.equal(root.getObjectByName('CLOTH_TOP_CORSET').visible, false, 'the stock bodice is replaced');
          const fit = corset.getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`);
          assert(fit?.visible, `${tier} ${waist} displays its fit`);
          const visibleMeshes = [];
          fit.traverseVisible(mesh => { if (mesh.isSkinnedMesh) visibleMeshes.push(mesh); });
          assert(visibleMeshes.length > 0 && visibleMeshes.every(mesh => mesh.skeleton === outfitSkin.skeleton));
          if (waist === 'tucked') {
            assert.notEqual(corset.getObjectByName('CLOTH_CORSET_OVER')?.visible, true, 'Tucked does not draw Over');
            const bra = root.getObjectByName('wardrobe-underwear-bra');
            assert(bra?.visible, 'the optional bra binds under Tucked');
            applyVillagerLook(model, characterLook({ ...choice, bra: false }));
            assert.equal(bra.visible, false, 'the bra can be removed independently of Tucked');
            assert(fit.visible);
            applyVillagerLook(model, look);
          }

          const authored = scene.getObjectByName('UNDERBUST_SOURCE_REFIT');
          const authoredNames = new Set();
          assert(authored, `the selected ${waist} model contains the rebuilt garment`);
          authored.traverse(mesh => { if (mesh.isSkinnedMesh) authoredNames.add(mesh.name); });
          assert(visibleMeshes.some(mesh => authoredNames.has(mesh.name)), `${waist} draws the rebuilt garment primitives`);
          assert(visibleMeshes.some(mesh => mesh.material.userData.color_slot === 'fabric'
            && mesh.material.color.getHexString() === '305080'), 'the rebuilt fabric follows the corset color');
          assert(visibleMeshes.some(mesh => mesh.material.userData.color_slot === 'hardware'), 'buckles keep a separate color channel');
          const fabric = visibleMeshes.find(mesh => mesh.material.userData.color_slot === 'fabric');
          const dyeShader = { uniforms: {}, fragmentShader: '#include <map_fragment>' };
          fabric.material.onBeforeCompile(dyeShader);
          assert.match(dyeShader.fragmentShader, /stitchTone \* underbustDyeGain/);
          assert(dyeShader.uniforms.underbustDyeGain.value > 20, 'dyes remove the baked dark base tint');
          assert.equal(fabric.material.map, colorMap, 'dyes keep the same stitched color map');
          const colors = { color: '#ffffff', accent: '#225577', panel: '#993355', lining: '#008844', hardware: '#ccaa55' };
          applyVillagerLook(model, characterLook(withClothingColors(choice, 'corset', colors)));
          for (const [group, color] of Object.entries(colors)) {
            const materials = visibleMeshes.filter(mesh => mesh.material.userData.underbustDyeGroup === group);
            assert(materials.length > 0 && materials.every(mesh => mesh.material.color.getHexString() === color.slice(1)),
              `${tier} ${waist} applies the ${group} dye independently`);
          }
          applyVillagerLook(model, characterLook(withClothingColors(choice, 'corset')));
          assert.equal(dyeShader.uniforms.underbustDyeGain.value, 0, 'reset restores the original map sampling');
          applyVillagerLook(model, look);
          if (waist === 'over') {
            const regular = fabric.geometry;
            applyVillagerLook(model, { ...look, overEase: 2 });
            assert.notEqual(fabric.geometry, regular, 'wide Over uses a separate hem geometry');
            applyVillagerLook(model, look);
            assert.equal(fabric.geometry, regular, 'regular Over restores the same geometry');
          }

          const samples = [];
          root.updateMatrixWorld(true);
          const point = new Vector3();
          for (const mesh of visibleMeshes) {
            const positions = mesh.geometry.getAttribute('position');
            for (let i = 0; i < positions.count; i += 53) {
              if (positions.getY(i) >= 1.17 && positions.getY(i) <= 1.34 && positions.getZ(i) > .035) {
                samples.push({ mesh, i, before: mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).clone() });
              }
            }
          }
          assert(samples.length > 0, 'the upper cup has skinned samples');
          const [clip] = buildEmoteClips(root, [findGaragePreviewEmote('010', false)]);
          const mixer = new AnimationMixer(root);
          mixer.clipAction(clip).play();
          mixer.setTime(clip.duration * .49);
          root.updateMatrixWorld(true);
          assert(samples.some(({ mesh, i, before }) =>
            mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).distanceTo(before) > .001),
          'the rebuilt cup follows live emote playback');
          mixer.stopAllAction();
        } finally {
          model.dispose();
          colorMap.dispose();
        }
      }
    }
  } finally {
    await vite.close();
  }
});

test('the rebuilt Gothic Underbust and standalone bras use the push-up cut on both tiers', async t => {
  const files = await Promise.all([
    bundledDir + 'gothic-02.mobile.glb',
    ...['garage', 'portrait'].map(tier => villagerDir + `villager-female.${tier}.glb`),
    ...['garage', 'mobile'].map(tier => garmentDir + `corsets/gothic-underbust-vest.${tier}.glb`),
  ].map(path => readFile(new URL(path, publicDir))));
  if (files.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
  const [donor, garage, mobile, garageVest, mobileVest] = await Promise.all(files.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { withClothingColors } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    for (const [actor, vest] of [[garage, garageVest], [mobile, mobileVest]]) {
      for (const corsetSource of [undefined, { set: 'gothic-04', scene: vest }]) {
        const choice = withClothingColors({
          ...DEFAULT_CHARACTER, bra: true, ...(corsetSource
            ? { wardrobeTrial: { set: corsetSource.set, waist: 'over', shirt: 'none' } }
            : { removedClothing: ['corset'] }),
        }, 'bra', { color: '#223355', accent: '#bbccdd' });
        const classicLook = characterLook(choice);
        const pushUpLook = characterLook({ ...choice, appearance: { ...choice.appearance, bra_style: 'push-up' } });
        const model = prepareVillager(actor, { fitted: true, garmentBody, corsetSource, removedClothing: classicLook.removedClothing });
        try {
          const { root } = model;
          const body = root.getObjectByName('fitting-room-body');
          const indices = body.geometry.index;
          const captureMask = () => indices.array.slice(0, body.geometry.drawRange.count);
          applyVillagerLook(model, classicLook);
          const classic = root.getObjectByName('wardrobe-underwear-bra');
          assert(classic?.visible);
          const classicMask = captureMask();
          applyVillagerLook(model, pushUpLook);
          const pushUp = root.getObjectByName('wardrobe-underwear-bra-push-up');
          assert(pushUp?.visible);
          assert.equal(classic.visible, false);
          assert.equal(pushUp.children.length, 3, 'push-up has fabric and bindings');
          assert(pushUp.children.every(mesh => mesh.skeleton === body.skeleton && !mesh.material.transparent));
          const fabric = pushUp.getObjectByName('wardrobe-underwear-bra-push-up-fabric');
          assert.equal(fabric.material.color.getHexString(), '223355');
          assert.equal(pushUp.getObjectByName('wardrobe-underwear-bra-push-up-top-binding').material.color.getHexString(), 'bbccdd');
          if (corsetSource) assert(root.getObjectByName('CLOTH_CORSET_OVER')?.visible);
          const pushUpMask = captureMask();
          if (!corsetSource) {
            assert(pushUpMask.length > classicMask.length, 'the low cup keeps more donor skin visible');
            const cup = wardrobeCoverageSurface(fabric.geometry);
            const classicCup = wardrobeCoverageSurface(classic.getObjectByName('wardrobe-underwear-bra-fabric').geometry);
            try {
              for (const side of [-1, 1]) {
                const chestRay = y => new Ray(new Vector3(side * .061, y, .4), new Vector3(0, 0, -1));
                assert(cup.raycastFirst(chestRay(1.231), DoubleSide, 0, .37), 'the push-up cup covers its front anchor');
                assert(classicCup.raycastFirst(chestRay(1.268), DoubleSide, 0, .37), 'classic fabric reaches higher on the chest');
                assert(cup.raycastFirst(chestRay(1.268), DoubleSide, 0, .37), 'the cup comes close to classic coverage');
                assert(classicCup.raycastFirst(chestRay(1.278), DoubleSide, 0, .37));
                assert(!cup.raycastFirst(chestRay(1.278), DoubleSide, 0, .37), 'the demi neckline reveals a little more at the top');
                const pushLower = cup.raycastFirst(chestRay(1.215), DoubleSide, 0, .37);
                const classicLower = classicCup.raycastFirst(chestRay(1.215), DoubleSide, 0, .37);
                assert(classicLower.distance - pushLower.distance > .001, 'the pad adds depth at the base of each cup');
              }
            } finally {
              cup.geometry.dispose();
              classicCup.geometry.dispose();
            }
          }

          applyVillagerLook(model, classicLook);
          assert(classic.visible && !pushUp.visible);
          assert.deepEqual(captureMask(), classicMask, 'switching back restores the classic mask');
          applyVillagerLook(model, characterLook({ ...choice, bra: false, appearance: pushUpLook.appearance }));
          assert(!classic.visible && !pushUp.visible);
          applyVillagerLook(model, pushUpLook);
          assert(pushUp.visible);
          assert.equal(captureMask().length, pushUpMask.length);
          assert.deepEqual(captureMask(), pushUpMask, 'the push-up cut restores its own mask after toggling');
          assert.equal(body.geometry.index, indices, 'style changes preserve the live index buffer');
        } finally {
          model.dispose();
        }
      }
    }
  } finally {
    await vite.close();
  }
});

test('the rebuilt Gothic Underbust reuses skin masks for all Over fits on one actor', async t => {
  const files = await Promise.all([
    bundledDir + 'gothic-02.mobile.glb',
    villagerDir + 'villager-female.portrait.glb',
    garmentDir + 'corsets/gothic-underbust-vest.garage.glb',
  ].map(path => readFile(new URL(path, publicDir))));
  if (files.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
  const [donor, actor, vest] = await Promise.all(files.map(loadGeometry));
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterAppearance, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { WARDROBE_WAIST_OPTIONS } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    const set = 'gothic-04';
    const options = { fitted: true, garmentBody: donor.getObjectByName('BODY_WARDROBE'), corsetSource: { set, scene: vest } };
    const over = WARDROBE_WAIST_OPTIONS.filter(({ waist }) => waist === 'over');
    const fits = over.flatMap(({ ease, waist }) => ['classic', 'push-up', 'off'].map(style => ({
      style,
      look: characterLook({ ...DEFAULT_CHARACTER, wardrobeTrial: { set, waist, shirt: 'none' }, wardrobeEase: ease,
        bra: style !== 'off', appearance: { ...characterAppearance(DEFAULT_CHARACTER), bra_style: style === 'push-up' ? style : 'classic' } }),
    })));
    const model = prepareVillager(actor, options);
    const capture = (root, style) => {
      const body = root.getObjectByName('fitting-room-body').geometry;
      const fabric = root.getObjectByName('CLOTH_CORSET_OVER');
      assert(fabric.visible);
      assert.equal(Boolean(root.getObjectByName('wardrobe-underwear-bra')?.visible), style === 'classic');
      assert.equal(Boolean(root.getObjectByName('wardrobe-underwear-bra-push-up')?.visible), style === 'push-up');
      const parts = [];
      fabric.traverseVisible(part => {
        if (!part.isSkinnedMesh) return;
        const geometry = part.geometry;
        parts.push({ name: part.name, indices: geometry.index?.array.slice(), draw: { ...geometry.drawRange },
          positions: geometry.getAttribute('position').array.slice(), normals: geometry.getAttribute('normal')?.array.slice() });
      });
      return { body: body.index.array.slice(0, body.drawRange.count), parts };
    };
    const original = MeshBVH.prototype.shapecast;
    const searched = new Set();
    MeshBVH.prototype.shapecast = function (...args) {
      searched.add(this);
      return original.apply(this, args);
    };
    try {
      const liveIndex = model.root.getObjectByName('fitting-room-body').geometry.index;
      let firstStyleSurfaces;
      const expected = fits.map(({ look, style }) => {
        searched.clear();
        applyVillagerLook(model, look);
        if (style === 'classic') {
          assert(searched.size > 0, 'a new waist fit tests cloth coverage');
          firstStyleSurfaces = new Set(searched);
        } else if (style === 'push-up') {
          assert(searched.size > 0, 'the new bra tests its own cut');
          assert([...searched].every(surface => !firstStyleSurfaces.has(surface)), 'a bra change reuses outer clothing coverage');
        } else {
          assert.equal(searched.size, 0, 'removing the bra needs no new coverage queries');
        }
        return capture(model.root, style);
      });
      searched.clear();
      for (const [i, { look, style }] of fits.entries()) {
        applyVillagerLook(model, look);
        assert.deepEqual(capture(model.root, style), expected[i]);
        assert.equal(model.root.getObjectByName('fitting-room-body').geometry.index, liveIndex);
      }
      assert.equal(searched.size, 0, 'all nine sampled fits reuse their mask during a full cycle');

      for (const [i, { look, style }] of fits.slice(0, 3).entries()) {
        const peer = prepareVillager(actor, options);
        try {
          applyVillagerLook(peer, look);
          assert.deepEqual(capture(peer.root, style), expected[i], 'changing bras matches equipping that style first');
          const peerIndex = peer.root.getObjectByName('fitting-room-body').geometry.index;
          assert.notEqual(peerIndex.array.buffer, liveIndex.array.buffer, 'each actor keeps a private skin index array');
        } finally { peer.dispose(); }
      }
    } finally {
      MeshBVH.prototype.shapecast = original;
      model.dispose();
    }
  } finally { await vite.close(); }
});

test('standalone briefs follow a V and short boxers follow both thighs on the Vesper rig', async t => {
  const files = await Promise.all([
    garmentDir + 'vesper-body.glb',
    ...['garage', 'portrait'].map(tier => villagerDir + `villager-female.${tier}.glb`),
  ].map(path => readFile(new URL(path, publicDir))));
  if (files.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
  const [donor, ...actors] = await Promise.all(files.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterAppearance, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { clothingPieceFor } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    const removedClothing = ['skirt', 'underskirt', 'belt'];
    const choice = { ...DEFAULT_CHARACTER, removedClothing };
    const look = style => characterLook({ ...choice, appearance: { ...characterAppearance(choice), briefs_style: style } });
    for (const actor of actors) {
      const model = prepareVillager(actor, { fitted: true, garmentBody, removedClothing });
      try {
        let classicMask;
        const body = model.root.getObjectByName('fitting-room-body');
        for (const style of ['briefs', 'boxer-briefs', 'briefs']) {
          applyVillagerLook(model, look(style));
          const classic = model.root.getObjectByName('wardrobe-underwear-briefs');
          const boxer = model.root.getObjectByName('wardrobe-underwear-briefs-boxer');
          const isBoxer = style === 'boxer-briefs';
          assert.equal(Boolean(boxer?.visible), isBoxer);
          assert.equal(classic.visible, !isBoxer);
          const active = isBoxer ? boxer : classic;
          const mask = body.geometry.index.array.slice(0, body.geometry.drawRange.count);
          if (classicMask && !isBoxer) {
            assert.deepEqual(mask, classicMask, 'switching back restores exposed thigh skin');
            continue;
          }
          if (isBoxer) assert(mask.length < classicMask.length, 'boxers cover more of both legs');
          else classicMask = mask;
          const fabric = active.getObjectByName(active.name + '-fabric');
          const surface = wardrobeCoverageSurface(fabric.geometry);
          try {
            const hit = (x, y) => surface.raycastFirst(new Ray(new Vector3(x, y, .4), new Vector3(0, 0, -1)), DoubleSide, 0, .39);
            for (const side of [-1, 1]) {
              for (const [x, y] of [[.025, .848], [.055, .875], [.100, .930]]) {
                assert.equal(Boolean(hit(side * x, y)), isBoxer, 'only boxers cover the thigh below each diagonal edge');
                assert(hit(side * x, y + .045), 'both patterns cover the front above each leg opening');
              }
              assert(!hit(side * .082, .775), 'the leg openings leave the lower thigh clear');
              if (isBoxer) assert(hit(side * .082, .818), 'each short cuff ends just below the inseam');
            }
          } finally { surface.geometry.dispose(); }
          const clothing = [];
          model.root.traverseVisible(mesh => {
            if (mesh.isSkinnedMesh && mesh.geometry.index && clothingPieceFor(mesh) && mesh.material.visible
              && !mesh.material.transparent && !mesh.material.alphaTest) clothing.push(mesh);
          });
          const poses = auditCorsetSkinMask(model.root, body, garmentBody.geometry, clothing, buildEmoteClips, findGaragePreviewEmote, {
            minHeight: .75, maxHeight: 1.04, halfWidth: .18,
            extraPoses: [['walk-casual', .30], ['walk-casual', .64]], extraViews: [[1, 0, 0], [-1, 0, 0], [0, -.7, 1], [0, -.7, -1]],
          });
          for (const { pose, uncovered } of poses) assert.equal(uncovered, 0, `${style} keeps skin at its openings during ${pose}`);
        }
      } finally { model.dispose(); }
    }
  } finally { await vite.close(); }
});

test('wardrobe underwear reuses donor cuts and isolates actor geometry and dyes', async t => {
  const bytes = await readFile(new URL(bundledDir + 'gothic-02.mobile.glb', publicDir));
  if (isLfsPointer(bytes)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room body donor.');
  const [source, independent] = (await Promise.all([loadGeometry(bytes), loadGeometry(bytes)]))
    .map(scene => scene.getObjectByName('BODY_WARDROBE'));
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  const actors = [];
  try {
    const { prepareWardrobeUnderwear } = await vite.ssrLoadModule('/src/game/characters/wardrobeUnderwear.ts');
    function prepare(donor, briefs = 'standalone') {
      const body = donor.clone(false);
      body.bind(donor.skeleton.clone(), donor.bindMatrix);
      const position = donor.geometry.getAttribute('position');
      const getX = position.getX;
      const ownGetX = Object.getOwnPropertyDescriptor(position, 'getX');
      let reads = 0;
      position.getX = function (i) {
        reads++;
        return getX.call(this, i);
      };
      try {
        const underwear = prepareWardrobeUnderwear(body, { bra: true, briefs });
        actors.push({ body, underwear });
        const pushUp = underwear.setBraStyle('push-up');
        assert.equal(pushUp?.name, 'wardrobe-underwear-bra-push-up');
        const pieces = [underwear.bra, pushUp, underwear.briefs];
        const meshes = pieces.flatMap(piece => {
          assert.equal(piece?.children.length, 3, 'each cut has fabric and both bindings');
          return piece.children;
        });
        assert(meshes.every(mesh => mesh.skeleton === body.skeleton));
        return { underwear, meshes, reads };
      } finally {
        if (ownGetX) Object.defineProperty(position, 'getX', ownGetX);
        else delete position.getX;
      }
    }
    function equalCuts(actual, expected) {
      for (const [i, mesh] of actual.meshes.entries()) {
        const { geometry } = mesh;
        const match = expected.meshes[i];
        assert.equal(mesh.name, match.name);
        assert.notEqual(geometry, match.geometry);
        assert.notEqual(geometry.index.array, match.geometry.index.array);
        assert.deepEqual(geometry.index.array, match.geometry.index.array);
        assert.deepEqual(Object.keys(geometry.attributes), Object.keys(match.geometry.attributes));
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
          const other = match.geometry.getAttribute(name);
          assert.notEqual(attribute.array, other.array);
          assert.equal(attribute.itemSize, other.itemSize);
          assert.equal(attribute.normalized, other.normalized);
          assert.deepEqual(attribute.array, other.array, `${mesh.name} ${name}`);
        }
        assert.notEqual(mesh.material, match.material);
        assert(mesh.material.color.equals(match.material.color));
      }
    }
    const first = prepare(source);
    const warm = prepare(source, 'under-skirt');
    const cold = prepare(independent);
    assert(first.reads > 1000 && cold.reads > 1000, 'distinct donor geometries require cutting');
    assert.equal(warm.reads, 0, 'repeated cuts skip reading donor vertices');
    equalCuts(warm, cold);
    equalCuts(warm, first);

    const pushUpFabric = warm.meshes.find(mesh => mesh.name === 'wardrobe-underwear-bra-push-up-fabric');
    const briefsFabric = warm.meshes.find(mesh => mesh.name === 'wardrobe-underwear-briefs-fabric');
    warm.underwear.applyColors(piece => ({ color: piece === 'bra' ? '#112233' : '#445566', accent: '#778899' }));
    assert.equal(pushUpFabric.material.color.getHexString(), '112233');
    assert.equal(briefsFabric.material.color.getHexString(), '445566');
    equalCuts(first, cold);
    pushUpFabric.geometry.getAttribute('position').array[0] += 1;
    pushUpFabric.geometry.index.array[0]++;
    equalCuts(prepare(source), cold);

    for (const donor of [source, independent]) {
      const position = donor.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) + .02);
      position.needsUpdate = true;
    }
    const updated = prepare(source);
    assert(updated.reads > 1000, 'changing tracked donor positions requires cutting again');
    assert.notDeepEqual(updated.meshes[0].geometry.getAttribute('position').array, cold.meshes[0].geometry.getAttribute('position').array);
    equalCuts(updated, prepare(independent));
    const reused = prepare(source);
    assert.equal(reused.reads, 0);
    equalCuts(reused, updated);
  } finally {
    for (const { body, underwear } of actors) {
      underwear.dispose();
      body.skeleton.dispose();
    }
    await vite.close();
  }
});

test('rebuilt Tucked hardware clears the fitted skirt waist', async t => {
  const rebuilt = `${garmentDir}corsets/gothic-underbust-vest-tucked.garage.glb`;
  const read = path => readFile(new URL(path, publicDir));
  const bytes = await Promise.all([rebuilt, `${villagerDir}villager-female.garage.glb`, `${bundledDir}gothic-02.mobile.glb`].map(read));
  if (bytes.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
  const [scene, base, donor] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment, wardrobeGarmentModelUrl } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    const set = 'gothic-04';
    const identity = new Matrix4();
    for (const number of ['01', '02', '03', '04', '05']) {
      const skirt = `gothic-skirt-${number}`;
      const item = getWardrobeGarment(skirt);
      const url = wardrobeGarmentModelUrl(item, 'garage');
      assert(url, `${skirt} has a fitting-room model`);
      const skirtBytes = await read(url.slice(1));
      if (isLfsPointer(skirtBytes)) return skipMissingAsset(t, 'Run git lfs pull to materialize the Gothic skirts.');
      const garments = [{ item, scene: await loadGeometry(skirtBytes), authoredFit: url === item.revisionUrl }];
      const model = prepareVillager(base, { fitted: true, garments, garmentBody, corsetSource: { set, scene } });
      try {
        const look = characterLook({ ...DEFAULT_CHARACTER, garments: { skirt }, wardrobeTrial: { set, shirt: 'none', waist: 'tucked' } });
        applyVillagerLook(model, look);
        const tuck = model.root.getObjectByName('CLOTH_CORSET_TUCKED');
        assert(tuck?.visible && model.root.getObjectByName(`wardrobe-${skirt}`)?.visible);
        const buckles = new Map();
        tuck.traverse(mesh => {
          if (mesh.isSkinnedMesh && !Array.isArray(mesh.material)) buckles.set(mesh.material.name, mesh);
        });
        const tags = [...buckles].filter(([, mesh]) => mesh.material.userData.tuckedLowerHardware).map(([name]) => name).sort();
        assert.deepEqual(tags, ['Material2307089', 'Material2308903']);
        assert.equal(buckles.get('Material2303515')?.visible, true, `${skirt} keeps the upper buckle`);
        const panels = [];
        model.root.getObjectByName(`wardrobe-${skirt}`).traverseVisible(mesh => {
          if (!mesh.isSkinnedMesh || mesh.material.transparent || /hardware/i.test(mesh.material.name)) return;
          const surface = wardrobeCoverageSurface(mesh.geometry);
          if (surface) panels.push(surface);
        });
        try {
          assert(panels.length > 0);
          for (const name of tags) {
            const buckle = buckles.get(name);
            const crossesPanel = panels.some(panel => panel.intersectsGeometry(buckle.geometry, identity));
            assert.equal(buckle.visible, !crossesPanel, `${skirt} retains each buckle that clears the fitted waistband`);
          }
        } finally {
          for (const panel of panels) panel.geometry.dispose();
        }
      } finally {
        model.dispose();
      }
    }
  } finally {
    await vite.close();
  }
});

test('the rebuilt Gothic Underbust and bra keep skin around the armholes and binding', async t => {
  const tiers = [['garage', 'garage'], ['mobile', 'portrait']];
  const read = path => readFile(new URL(path, publicDir));
  const donorBytes = await read(bundledDir + 'gothic-02.mobile.glb');
  if (isLfsPointer(donorBytes)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room donor.');
  const donor = (await loadGeometry(donorBytes)).getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    const { corsetModelUrl } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    const set = 'gothic-04';
    const donorSkin = wardrobeCoverageSurface(donor.geometry);
    try {
      for (const [tier, kind] of tiers) {
        const bytes = await read(villagerDir + `villager-female.${kind}.glb`);
        if (isLfsPointer(bytes)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room character.');
        const base = await loadGeometry(bytes);
        for (const style of ['regular', 'original', 'bra']) {
          const braOnly = style === 'bra';
          const cut = style === 'original' ? style : undefined;
          const look = characterLook(braOnly
            ? { ...DEFAULT_CHARACTER, removedClothing: ['corset'], bra: true }
            : { ...DEFAULT_CHARACTER, wardrobeTrial: { set, waist: 'over', shirt: 'none', cut }, bra: false });
          let scene;
          if (!braOnly) {
            const url = corsetModelUrl(look.corset, kind);
            assert.equal(url, `/${garmentDir}corsets/gothic-underbust-vest${cut ? '-original-cut' : ''}.${tier}.glb`);
            const bytes = await read(url.slice(1));
            if (isLfsPointer(bytes)) return skipMissingAsset(t, 'Run git lfs pull to materialize the rebuilt vest.');
            scene = await loadGeometry(bytes);
          }
          const model = prepareVillager(base, { fitted: true, garmentBody: donor, removedClothing: look.removedClothing,
            corsetSource: scene ? { set, scene } : undefined });
          try {
            applyVillagerLook(model, look);
            const skin = wardrobeCoverageSurface(model.root.getObjectByName('fitting-room-body').geometry);
            try {
              const assertSkin = (ray, expected) => {
                const probe = `${tier} ${style} at ${ray.origin.toArray().map(value => value.toFixed(3)).join(', ')}`;
                const donorHit = donorSkin.raycastFirst(ray, DoubleSide, 0, .40);
                assert(donorHit, `donor includes skin ${probe}`);
                const activeHit = skin.raycastFirst(ray, DoubleSide, donorHit.distance - .0001, donorHit.distance + .0001);
                assert.equal(Boolean(activeHit), expected, `skin visibility ${probe}`);
              };
              if (!braOnly) for (const [x, y, side, expected] of [
                [-.105, 1.300, 1, true], [.105, 1.300, 1, true],
                [-.045, 1.227, -1, true], [.045, 1.227, -1, true], [.090, 1.241, -1, true],
                [0, 1.203, 1, false],
              ]) {
                const ray = new Ray(new Vector3(x, y, side * .30), new Vector3(0, 0, -side));
                assertSkin(ray, expected);
              }
              // Inspect the inner wall of each armhole from the angles where the slivers were exposed.
              for (const side of [-1, 1]) {
                const angle = (braOnly ? 25 : 160) * side * Math.PI / 180;
                const direction = new Vector3(-Math.sin(angle), 0, -Math.cos(angle));
                const sideways = new Vector3(Math.cos(angle), 0, -Math.sin(angle));
                const origin = direction.clone().multiplyScalar(-.40).addScaledVector(sideways, (braOnly ? .107 : -.114) * side);
                origin.y = braOnly ? 1.248 : 1.255;
                assertSkin(new Ray(origin, direction), true);
                // Heart Overhead exposes these front-facing skin triangles
                // at the classic neckline and just above the vest's outer rim.
                const x = braOnly ? .0991 : .0909;
                const y = braOnly ? 1.272 : 1.2571;
                assertSkin(new Ray(new Vector3(side * x, y, .40), new Vector3(0, 0, -1)), true);
              }
            } finally {
              skin.geometry.dispose();
            }
          } finally {
            model.dispose();
          }
        }
      }
    } finally {
      donorSkin.geometry.dispose();
    }
  } finally {
    await vite.close();
  }
});

test('rebuilt Laced Bodice limits the exported white sheen on cloth at every finish', () => {
  const source = new MeshPhysicalMaterial({ sheen: 1, sheenColor: 0xffffff, roughness: .66 });
  const cloth = source.clone();
  for (const [finish, coat] of [['satin', .06], ['glossy', .18], ['matte', 0], ['original', 0]]) {
    applyLacedBodiceFinish(source, cloth, finish, true);
    assert.equal(cloth.sheen, .12);
    assert.equal(cloth.clearcoat, coat);
  }
  assert.equal(source.sheen, 1);
});

test('rebuilt Laced Bodice keeps its authored mesh and dyes five groups independently', async t => {
  const set = 'gothic-01';
  const tiers = [['garage', 'garage'], ['mobile', 'portrait']];
  const targets = tiers.map(([tier]) => garmentDir + `corsets/gothic-laced-bodice.${tier}.glb`);
  const bases = tiers.map(([, kind]) => villagerDir + `villager-female.${kind}.glb`);
  const inputs = [bundledDir + 'gothic-02.mobile.glb', ...bases, ...targets];
  const bytes = await Promise.all(inputs.map(path => readFile(new URL(path, publicDir)).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  })));
  if (bytes.some(file => !file || isLfsPointer(file))) return skipMissingAsset(t, 'Run git lfs pull and build the character LODs.');
  const [donor, ...models] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  assert(garmentBody);
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { clothingColors, withClothingColors } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    const { corsetModelUrls, corsetRenderChoice } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    const picks = { color: '#ffffff', panel: '#993355', laces: '#336699', hardware: '#aa8866', closure: '#11bb44' };
    const slots = { fabric: 'color', panel: 'panel', laces: 'laces', hardware: 'hardware', closure: 'closure' };
    const tex = new Texture();
    const donorSkin = wardrobeCoverageSurface(garmentBody.geometry);
    for (const [index, [tier, kind]] of tiers.entries()) {
      const base = models[index], scene = models[index + tiers.length];
      const glb = bytes[index + 1 + tiers.length];
      const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)));
      const shell = gltf.materials.find(material => material.extras?.color_slot === 'fabric');
      assert(shell.pbrMetallicRoughness.baseColorTexture && shell.normalTexture, `${tier} carries the baked seams and weave`);
      const source = new Map();
      scene.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        const { color_slot: slot } = mesh.material.userData;
        if (slot === 'fabric') { mesh.material.map = tex; mesh.material.normalMap = tex; }
        source.set(mesh.name, mesh);
      });
      const model = prepareVillager(base, { fitted: true, garmentBody, corsetSource: { set, scene } });
      try {
        assert(model.detachedCorset.authoredLacedBodice);
        const { group } = model.detachedCorset;
        assert(!group.getObjectByName('CLOTH_CORSET_FACING'), 'authored straps bypass the old replacement geometry');
        const body = model.root.getObjectByName('BODY_OUTFIT_CUT');
        for (const waist of ['tucked', 'over']) {
          const fit = { set, waist, shirt: 'none' };
          const choice = { ...DEFAULT_CHARACTER, [waist === 'over' ? 'wardrobe' : 'wardrobeTrial']: fit };
          const styled = withClothingColors(choice, 'corset', { ...picks, finish: 'glossy' });
          const look = characterLook(JSON.parse(JSON.stringify(styled)));
          assert.deepEqual(clothingColors(look, 'corset'), { ...picks, finish: 'glossy' }, 'wardrobe saves round-trip');
          assert.equal(corsetModelUrls(corsetRenderChoice(look), kind)[0], `/${targets[index]}`);
          applyVillagerLook(model, look);
          const skin = wardrobeCoverageSurface(model.root.getObjectByName('fitting-room-body').geometry);
          try {
            for (const side of [-1, 1]) for (const [label, origin, direction, retained] of [
              ['front strap root', [side * .09, 1.315, .30], [0, 0, -1], true],
              ['rear strap root', [side * .11, 1.310, -.30], [0, 0, 1], true],
              ['underarm', [side * .26, 1.270, .03], [-side, 0, 0], true],
              ['covered bodice', [side * .08, 1.205, .30], [0, 0, -1], false],
            ]) {
              const ray = new Ray(new Vector3(...origin), new Vector3(...direction));
              const hit = donorSkin.raycastFirst(ray, DoubleSide, 0, .30);
              assert(hit, `body donor includes the ${label}`);
              const active = skin.raycastFirst(ray, DoubleSide, hit.distance - .0001, hit.distance + .0001);
              assert.equal(Boolean(active), retained, `${tier} ${waist} ${label} skin on side ${side}`);
            }
          } finally { skin.geometry.dispose(); }
          const meshes = [];
          group.traverseVisible(mesh => { if (mesh.isSkinnedMesh) meshes.push(mesh); });
          assert(group.getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`).visible);
          assert(meshes.every(mesh => mesh.skeleton === body.skeleton), 'both LODs bind to the live actor');
          assert.deepEqual(new Set(meshes.map(mesh => mesh.material.userData.color_slot)),
            new Set(waist === 'over' ? Object.keys(slots) : Object.keys(slots).filter(slot => slot !== 'closure')));
          for (const mesh of meshes) {
            const { color_slot: slot } = mesh.material.userData;
            const original = source.get(mesh.name).material;
            assert.equal(mesh.material.color.getHexString(), picks[slots[slot]].slice(1));
            assert.equal(mesh.material.roughness, slot === 'fabric' || slot === 'panel' ? .19 : original.roughness);
            assert.equal(mesh.material.metalness, original.metalness);
          }
          const fabric = meshes.find(mesh => mesh.material.userData.color_slot === 'fabric');
          const weights = fabric.geometry.getAttribute('skinWeight');
          for (const [finish, roughness] of [['matte', .89], ['satin', .42], ['original', source.get(fabric.name).material.roughness]]) {
            applyVillagerLook(model, characterLook(withClothingColors(styled, 'corset', { finish })));
            assert.equal(fabric.material.roughness, roughness);
            assert.equal(fabric.material.map, tex);
            assert.equal(fabric.material.normalMap, tex);
            assert.equal(fabric.geometry.getAttribute('skinWeight'), weights);
          }
          applyVillagerLook(model, characterLook(withClothingColors(styled, 'corset')));
          assert.equal(fabric.material.color.getHexString(), '797471', 'reset restores the original cloth swatch');
          assert.equal(source.get(fabric.name).material.color.getHexString(), '6e6660', 'loaded asset stays pristine');
        }
      } finally { model.dispose(); }
    }
    tex.dispose();
    donorSkin.geometry.dispose();
  } finally { await vite.close(); }
});

test('the lowered Gothic skirts keep skin visible at the bodice and hem openings', async t => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { corsetModelUrl } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    const cases = [
      { set: 'gothic-01', skirt: 'gothic-skirt-04', probes: [[.038, 1.180, 1], [.037, 1.140, 1], [-.006, 1.093, -1]] },
      // The raised waistband covers the lower probe; the opening just above it keeps its skin.
      { set: 'gothic-03', skirt: 'gothic-skirt-03', probes: [[.022, 1.140, -1], [.022, 1.127, -1, false]] },
      // The high-low hem exposes both front thighs and lower calves. The rear knee stays inside the train mid-stride.
      { set: 'gothic-02', skirt: 'gothic-skirt-02', probes: [[-.152, .684, 1], [.156, .732, 1], [-.121, .471, -1], [-.087, .617, -1, false]] },
      { set: 'gothic-02', skirt: 'gothic-skirt-02', socks: 'socks-04', probes: [[-.121, .471, -1, false]] },
    ];
    const read = async path => {
      const bytes = await readFile(new URL(path.replace(/^\//, ''), publicDir));
      if (isLfsPointer(bytes)) throw new Error('Git LFS pointer');
      return loadGeometry(bytes);
    };
    const donor = (await read(garmentDir + 'vesper-body.glb')).getObjectByName('BODY_WARDROBE');
    const full = wardrobeCoverageSurface(donor.geometry);
    try {
      for (const kind of ['garage', 'portrait']) {
        const actor = await read(villagerDir + `villager-female.${kind}.glb`);
        for (const { set, skirt, socks, probes } of cases) {
          const selected = [skirt, socks].filter(Boolean).map(id => catalog.find(item => item.id === id));
          const garments = await Promise.all(selected.map(async item => ({ item, scene: await read(item.url) })));
          const trial = { set, waist: 'tucked', shirt: 'none' };
          const url = corsetModelUrl(trial, kind);
          if (!url) return skipMissingAsset(t, 'Build both Gothic corset LODs.');
          const model = prepareVillager(actor, { fitted: true, garmentBody: donor, garments, corsetSource: { set, scene: await read(url) } });
          try {
            applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, wardrobeTrial: trial, garments: { skirt, socks } }));
            const skin = wardrobeCoverageSurface(model.root.getObjectByName('fitting-room-body').geometry);
            try {
              for (const [x, y, side, exposed = true] of probes) {
                const ray = new Ray(new Vector3(x, y, side * .30), new Vector3(0, 0, -side));
                const hit = full.raycastFirst(ray, DoubleSide);
                assert(hit, 'the body donor covers the sampled point');
                const visible = skin.raycastFirst(ray, DoubleSide, hit.distance - .0001, hit.distance + .0001);
                assert.equal(Boolean(visible), exposed, `${kind} ${set} / ${skirt} skin at x = ${x}, y = ${y}`);
              }
            } finally { skin.geometry.dispose(); }
          } finally { model.dispose(); }
        }
      }
    } finally { full.geometry.dispose(); }
  } catch (error) {
    if (error.code === 'ENOENT' || error.message === 'Git LFS pointer') return skipMissingAsset(t, 'Materialize both wardrobe tiers.');
    throw error;
  } finally { await vite.close(); }
});

test('the Village skirt and belt cover the back of the tucked Laced Bodice', async t => {
  const set = 'gothic-01';
  const tiers = [
    ['garage', 'villager-female.glb'], ['garage', 'villager-female.garage.glb'],
    ['garage', 'villager-female.portrait.glb'], ['mobile', 'villager-female.portrait.glb'],
  ];
  const paths = [bundledDir + 'gothic-02.mobile.glb', ...tiers.flatMap(([tier, base]) => [
    villagerDir + base,
    garmentDir + `corsets/gothic-laced-bodice.${tier}.glb`,
  ])];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir)).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  })));
  if (bytes.some(file => !file || isLfsPointer(file))) return skipMissingAsset(t, 'Run git lfs pull and build the character LODs.');
  const [donor, ...models] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const item = getWardrobeGarment('village-skirt');
    const belt = getWardrobeGarment('village-belt');
    const identity = new Matrix4();
    const intersection = { intersectsTriangles: (first, second) => first.intersectsTriangle(second) };
    const overlaps = (clothes, bodice) => clothes.some(surface =>
      bodice.some(layer => surface.bvhcast(layer, identity, intersection)));
    const surfaces = part => {
      const result = [];
      const point = new Vector3();
      part.traverseVisible(mesh => {
        if (!mesh.isSkinnedMesh || mesh.material.transparent) return;
        const position = new Float32BufferAttribute(mesh.geometry.attributes.position.count * 3, 3);
        for (let i = 0; i < position.count; i++) {
          mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
          position.setXYZ(i, point.x, point.y, point.z);
        }
        const { index, drawRange } = mesh.geometry;
        const indices = Array.from(index.array.subarray(drawRange.start, drawRange.start + drawRange.count));
        if (indices.length) result.push(new MeshBVH(new BufferGeometry().setAttribute('position', position).setIndex(indices)));
      });
      return result;
    };
    for (const [index, [tier, baseFile]] of tiers.entries()) {
      const [base, scene] = models.slice(index * 2, index * 2 + 2);
      const sourceOver = scene.getObjectByName('CLOTH_CORSET_OVER');
      for (const explicit of [false, true]) {
        const label = `${tier} ${baseFile} with the ${explicit ? 're-equipped' : 'stock'} Village outfit`;
        const garments = explicit ? [{ item, scene: base }, { item: belt, scene: base }] : [];
        const choice = { ...DEFAULT_CHARACTER, garments: explicit ? { skirt: item.id, belt: belt.id } : undefined };
        const model = prepareVillager(base, { fitted: true, garmentBody, corsetSource: { set, scene }, garments });
        try {
          applyVillagerLook(model, characterLook({ ...choice, wardrobeTrial: { set, waist: 'tucked', shirt: 'none' } }));
          const { root } = model;
          root.updateMatrixWorld(true);
          const stock = root.getObjectByName(item.villageNode);
          assert.equal(stock.visible, !explicit, label);
          const activeSkirt = explicit ? root.getObjectByName(`wardrobe-${item.id}`) : stock;
          const stockBelt = root.getObjectByName(belt.villageNode);
          assert.equal(stockBelt.visible, !explicit, label);
          const activeBelt = explicit ? root.getObjectByName(`wardrobe-${belt.id}`) : stockBelt;
          const activeBodice = model.detachedCorset.group.getObjectByName('CLOTH_CORSET_TUCKED');
          const sourceBelt = base.getObjectByName(belt.villageNode).geometry;
          const originalPositions = sourceBelt.attributes.position;
          activeBelt.traverseVisible(mesh => {
            if (!mesh.isSkinnedMesh) return;
            const positions = mesh.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
              if (originalPositions.getZ(i) < .025) continue;
              assert.deepEqual([positions.getX(i), positions.getY(i), positions.getZ(i)],
                [originalPositions.getX(i), originalPositions.getY(i), originalPositions.getZ(i)], 'front belt stays unchanged');
            }
          });
          const skirt = surfaces(activeSkirt);
          const tucked = surfaces(activeBodice);
          try {
            for (const side of [-1, 1]) {
              let rimSamples = 0;
              for (const degrees of [110, 118, 120, 124, 134]) {
                const angle = side * degrees * Math.PI / 180;
                const direction = new Vector3(Math.sin(angle), 0, Math.cos(angle));
                const ray = new Ray(new Vector3(0, 1.114, .025).addScaledVector(direction, .35), direction.negate());
                const hit = meshes => Math.min(...meshes.map(mesh => mesh.raycastFirst(ray, DoubleSide, 0, .35)?.distance ?? Infinity));
                for (const y of [1.114, 1.1156, 1.116, 1.1164, 1.1168]) {
                  ray.origin.y = y;
                  const belt = hit(skirt), bodice = hit(tucked);
                  if (!Number.isFinite(belt) || !Number.isFinite(bodice)) continue;
                  if (y >= 1.1156) rimSamples++;
                  assert(belt < bodice - .0002, `${label} covers rear hip ${side} at ${y} m`);
                }
              }
              assert(rimSamples, `${label} overlaps the top edge on rear hip ${side}`);
            }
          } finally {
            for (const { geometry } of [...skirt, ...tucked]) geometry.dispose();
          }
          const mixer = new AnimationMixer(root);
          const motions = [['002', [0, .25, .38, .5, .62]], ['013', [.45]], ['heart-overhead', [.5]]];
          for (const [emote, phases] of motions) {
            const [clip] = buildEmoteClips(root, [findGaragePreviewEmote(emote, false)]);
            mixer.clipAction(clip).play();
            try {
              for (const phase of phases) {
                mixer.setTime(clip.duration * phase);
                root.updateMatrixWorld(true);
                // The belt turns around the hip. Faces crossing the side seam are still visible from behind.
                const waistband = surfaces(activeSkirt), belt = surfaces(activeBelt), bodice = surfaces(activeBodice);
                try {
                  assert(!overlaps(waistband, bodice), `${label} waistband intersects the bodice at ${emote}@${phase}`);
                  assert(belt.length, `${label} has a rendered rear belt`);
                  assert(!overlaps(belt, bodice), `${label} belt intersects the bodice at ${emote}@${phase}`);
                } finally {
                  for (const { geometry } of [...waistband, ...belt, ...bodice]) geometry.dispose();
                }
              }
            } finally {
              mixer.stopAllAction();
              mixer.uncacheClip(clip);
            }
          }
          applyVillagerLook(model, characterLook({ ...choice, wardrobeTrial: { set, waist: 'over', shirt: 'none' } }));
          const over = model.detachedCorset.group.getObjectByName('CLOTH_CORSET_OVER');
          assert(over.visible);
          const sourceSkirt = base.getObjectByName(item.villageNode);
          activeSkirt.traverseVisible(mesh => {
            if (mesh.isSkinnedMesh) assert.equal(mesh.geometry, sourceSkirt.geometry, label);
          });
          activeBelt.traverseVisible(mesh => {
            if (mesh.isSkinnedMesh) assert.equal(mesh.geometry, sourceBelt, label);
          });
          over.traverseVisible(mesh => {
            if (mesh.isSkinnedMesh) assert.equal(mesh.geometry, sourceOver.getObjectByName(mesh.name).geometry, label);
          });
        } finally { model.dispose(); }
      }
    }
  } finally { await vite.close(); }
});

test('the Village skirt and belt cover reused Laced and Sweetheart tucked fits', async t => {
  const paths = [
    villagerDir + 'villager-female.portrait.glb',
    garmentDir + 'corsets/gothic-laced-bodice.garage.glb',
    bundledDir + 'gothic-02.mobile.glb',
  ];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir)).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  })));
  if (bytes.some(file => !file || isLfsPointer(file))) return skipMissingAsset(t, 'Run git lfs pull and build the character LODs.');
  const [base, laced, sweetheart] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = sweetheart.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  const models = [];
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const skirt = getWardrobeGarment('village-skirt');
    const belt = getWardrobeGarment('village-belt');
    const skirtMesh = base.getObjectByName(skirt.villageNode);
    const skirtGeometry = skirtMesh.geometry;
    const prepare = (set, scene, withBelt) => {
      const garments = (withBelt ? [skirt, belt] : [skirt]).map(item => ({ item, scene: base }));
      const probe = t.mock.method(MeshBVH.prototype, 'raycastFirst');
      let model;
      try {
        model = prepareVillager(base, { fitted: true, garmentBody, corsetSource: { set, scene }, garments });
      } finally { probe.mock.restore(); }
      models.push(model);
      applyVillagerLook(model, characterLook({
        ...DEFAULT_CHARACTER,
        garments: { skirt: skirt.id, ...(withBelt && { belt: belt.id }) },
        wardrobeTrial: { set, waist: 'tucked', shirt: 'none' },
      }));
      const tucked = model.detachedCorset.group.getObjectByName('CLOTH_CORSET_TUCKED');
      const meshes = [];
      tucked.traverseVisible(mesh => {
        if (mesh.isSkinnedMesh) meshes.push(mesh);
      });
      const body = model.root.getObjectByName('fitting-room-body').geometry;
      return { meshes, body, rays: probe.mock.callCount() };
    };
    const visibleIndices = ({ index, drawRange: { start, count } }) => index.array.subarray(start, start + count);
    for (const [set, scene, file] of [['gothic-01', laced, bytes[1]], ['gothic-02', sweetheart, bytes[2]]]) {
      const first = prepare(set, scene, false);
      const warm = prepare(set, scene, true);
      const cold = prepare(set, await loadGeometry(file), true);
      assert(first.rays > 3000, `${set} samples the first waistband`);
      assert(cold.rays - warm.rays > 3000, `${set} reuses waistband samples with an explicit belt`);
      assert(warm.meshes.length, `${set} has visible tucked geometry`);
      assert.deepEqual(warm.meshes.map(mesh => mesh.name), cold.meshes.map(mesh => mesh.name));
      for (const [i, mesh] of warm.meshes.entries()) {
        const positions = mesh.geometry.getAttribute('position');
        assert.deepEqual(positions.array, cold.meshes[i].geometry.getAttribute('position').array, `${set} ${mesh.name}`);
      }
      const source = scene.getObjectByName('CLOTH_CORSET_TUCKED');
      const fitted = warm.meshes.find(mesh => mesh.geometry !== source.getObjectByName(mesh.name)?.geometry);
      assert(fitted, `${set} has a fitted mesh`);
      assert.notEqual(fitted.geometry, first.meshes.find(mesh => mesh.name === fitted.name).geometry);
      assert.notEqual(warm.body.index, cold.body.index);
      assert(warm.body.drawRange.count > 0, `${set} has visible skin`);
      assert.deepEqual(warm.body.drawRange, cold.body.drawRange);
      assert.deepEqual(visibleIndices(warm.body), visibleIndices(cold.body));
    }
    const { start, count } = skirtGeometry.drawRange;
    try {
      const end = Math.min(skirtGeometry.index.count, start + count);
      skirtGeometry.setDrawRange(start, end - start - 3);
      const changed = prepare('gothic-01', laced, true);
      const warm = prepare('gothic-01', laced, true);
      assert(changed.rays - warm.rays > 3000, 'a changed skirt draw range samples a new waistband');
    } finally { skirtGeometry.setDrawRange(start, count); }
    const otherSkirt = skirtGeometry.clone();
    try {
      skirtMesh.geometry = otherSkirt;
      const changed = prepare('gothic-01', laced, true);
      skirtMesh.geometry = skirtGeometry;
      const warm = prepare('gothic-01', laced, true);
      assert(changed.rays - warm.rays > 3000, 'only the same skirt geometry can reuse sampled waistbands');
    } finally {
      skirtMesh.geometry = skirtGeometry;
      otherSkirt.dispose();
    }
  } finally {
    for (const model of models) model.dispose();
    await vite.close();
  }
});

test('the authored Sweetheart reuses original skin matches and resamples changed geometry', async t => {
  const paths = [villagerDir + 'villager-female.portrait.glb', bundledDir + 'gothic-02.mobile.glb'];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize Sweetheart and the Village outfit.');
  const [base, sweetheart, coldBase, coldSweetheart] = await Promise.all([...bytes, ...bytes].map(loadGeometry));
  const original = base.getObjectByName('BODY_OUTFIT_CUT').geometry;
  const coldOriginal = coldBase.getObjectByName('BODY_OUTFIT_CUT').geometry;
  const donor = sweetheart.getObjectByName('BODY_WARDROBE').geometry;
  const coldDonor = coldSweetheart.getObjectByName('BODY_WARDROBE').geometry;
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const look = characterLook({
      ...DEFAULT_CHARACTER,
      garments: { skirt: 'village-skirt', belt: 'village-belt' },
      wardrobeTrial: { set: 'gothic-02', waist: 'tucked', shirt: 'none' },
    });
    function preview(scene, corset) {
      const garments = ['village-skirt', 'village-belt'].map(id => ({ item: getWardrobeGarment(id), scene }));
      const model = prepareVillager(scene, {
        fitted: true, garmentBody: corset.getObjectByName('BODY_WARDROBE'),
        corsetSource: { set: 'gothic-02', scene: corset }, garments,
      });
      const closest = t.mock.method(MeshBVH.prototype, 'closestPointToPoint');
      const coverage = t.mock.method(MeshBVH.prototype, 'shapecast');
      try {
        applyVillagerLook(model, look);
        const { index, drawRange: { start, count } } = model.root.getObjectByName('fitting-room-body').geometry;
        assert(count > 0, 'the preview keeps visible skin');
        return { mask: index.array.slice(start, start + count), closest: closest.mock.callCount(), coverage: coverage.mock.callCount() };
      } finally {
        closest.mock.restore();
        coverage.mock.restore();
        model.dispose();
      }
    }

    function compare(label) {
      const first = preview(base, sweetheart);
      const warm = preview(base, sweetheart);
      const cold = preview(coldBase, coldSweetheart);
      assert(first.closest > 0, `${label} samples original-body membership`);
      assert.equal(cold.closest, first.closest, `${label} samples independently parsed geometry`);
      assert.equal(warm.closest, 0, `${label} reuses membership in another actor`);
      assert(warm.coverage > 0, `${label} still checks cloth coverage`);
      assert.deepEqual(first.mask, cold.mask, label);
      assert.deepEqual(warm.mask, cold.mask, label);
      return warm.mask;
    }

    const initial = compare('original inputs');
    for (const geometry of [original, coldOriginal]) {
      geometry.setDrawRange(0, Math.floor(geometry.index.count / 6) * 3);
    }
    const reduced = compare('reduced original draw range');
    assert.notDeepEqual(reduced, initial, 'cut-body draw range changes visible skin');

    for (const geometry of [donor, coldDonor]) {
      const position = geometry.getAttribute('position');
      for (let vertex = 0; vertex < position.count; vertex++) position.setX(vertex, position.getX(vertex) + .006);
      position.needsUpdate = true;
    }
    const shifted = compare('changed donor positions');
    assert.notDeepEqual(shifted, reduced, 'donor bind-space positions change visible skin');

    for (const geometry of [donor, coldDonor]) {
      const index = geometry.getIndex();
      const half = Math.floor(index.count / 6) * 3;
      const first = index.array.slice(0, half);
      index.array.copyWithin(0, half, 2 * half);
      index.array.set(first, half);
      index.needsUpdate = true;
    }
    compare('reordered donor triangles');
  } finally { await vite.close(); }
});

test('Ruffled Corset keeps the upper torso and rear waist inside both detail budgets', async t => {
  const paths = [
    villagerDir + 'villager-female.garage.glb', villagerDir + 'villager-female.portrait.glb',
    bundledDir + 'gothic-03.garage.glb', bundledDir + 'gothic-03.mobile.glb', bundledDir + 'gothic-02.mobile.glb',
  ];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the Ruffled Corset and Village outfit.');
  const [garage, portrait, high, low, donor] = await Promise.all(bytes.map(loadGeometry));
  const vite = await createServer({ define: { __VILLAGER_MODEL_URL__: JSON.stringify('/' + paths[0]) }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook, villagerModelUrl } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { characterLook, DEFAULT_CHARACTER } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const { corsetModelUrl, corsetRenderChoice, wardrobeModelUrl } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const choice = { set: 'gothic-03', shirt: 'none', waist: 'tucked' };
    for (const [kind, suffix] of [['garage', 'garage'], ['portrait', 'mobile']]) {
      const model = `/gothic-03.${suffix}.glb`;
      assert(wardrobeModelUrl(choice, kind)?.endsWith(model), `${kind} uses its bundled LOD`);
      assert(corsetModelUrl(choice, kind)?.endsWith(model), `${kind} uses its standalone LOD`);
    }
    const assembled = characterLook({ ...DEFAULT_CHARACTER, wardrobe: choice, garments: { skirt: 'village-skirt' } });
    assert.deepEqual(corsetRenderChoice(assembled), choice);
    assert(villagerModelUrl(assembled, 'garage')?.endsWith('/villager-female.garage.glb'));
    const waistSurface = mesh => {
      const { index, drawRange, attributes: { position } } = mesh.geometry;
      const points = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
      const point = new Vector3();
      for (let v = 0; v < position.count; v++) {
        mesh.getVertexPosition(v, point).applyMatrix4(mesh.matrixWorld);
        points.setXYZ(v, point.x, point.y, point.z);
      }
      const faces = [];
      for (let i = drawRange.start; i < Math.min(index.count, drawRange.start + drawRange.count); i += 3) {
        const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const y = vertices.reduce((sum, v) => sum + position.getY(v), 0) / 3;
        const z = vertices.reduce((sum, v) => sum + position.getZ(v), 0) / 3;
        if (y > 1.016 && y < 1.16 && z < .038) faces.push(...vertices);
      }
      return new BufferGeometry().setAttribute('position', points).setIndex(faces);
    };
    function assertUpperTorso(source, fitted, label) {
      const original = source.getIndex();
      const active = fitted.getIndex();
      const { start, count } = fitted.drawRange;
      const position = source.getAttribute('position');
      const key = (index, i) => `${index.getX(i)},${index.getX(i + 1)},${index.getX(i + 2)}`;
      const shown = new Set();
      let sampled = 0;
      for (let i = start; i < Math.min(start + count, active.count); i += 3) shown.add(key(active, i));
      for (let i = 0; i < original.count; i += 3) {
        const vertices = [original.getX(i), original.getX(i + 1), original.getX(i + 2)];
        if (vertices.every(v => position.getY(v) >= 1.15)) {
          assert(shown.has(key(original, i)), `${label} removed an upper-body triangle`);
          sampled++;
        }
      }
      assert(sampled > 1000, `${label} checked the complete upper body`);
    }
    for (const [base, corset, budget] of [[garage, high, 7000], [portrait, low, 3000]]) {
      const bundledBody = corset.getObjectByName('BODY_WARDROBE');
      const donorBody = donor.getObjectByName('BODY_WARDROBE');
      const body = new MeshBVH(bundledBody.geometry.clone());
      const ray = new Ray(new Vector3(), new Vector3(0, 0, -1));
      for (const cut of ['OVER', 'TUCKED']) {
        const garment = corset.getObjectByName(`CLOTH_CORSET_${cut}`);
        assert(garment.userData.fit_version >= 9, 'the close rear neckline is present');
        const bundledModel = prepareVillager(corset, { fitted: true });
        try {
          applyVillagerLook(bundledModel, characterLook({ ...DEFAULT_CHARACTER, wardrobe: { ...choice, waist: cut.toLowerCase() } }));
          assertUpperTorso(bundledBody.geometry, bundledModel.root.getObjectByName('BODY_WARDROBE').geometry, `bundled ${budget} ${cut}`);
        } finally { bundledModel.dispose(); }
        const meshes = garment.children;
        assert.equal(meshes.length, 3, 'shell, ruffles, and both ties use three draw calls');
        assert(meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0) <= budget);
        const shell = new MeshBVH(meshes.find(mesh => mesh.material.name === 'MAT_CORSET_03_Brocade').geometry.clone());
        try {
          for (const side of [-1, 1]) for (let ix = 0; ix <= 15; ix++) for (let iy = 0; iy <= 16; iy++) {
            const x = side * (.034 + ix * .004);
            const y = 1.195 + iy * .0045;
            ray.origin.set(x, y, .31);
            const garmentHit = shell.raycastFirst(ray, DoubleSide);
            const bodyHit = body.raycastFirst(ray, DoubleSide);
            assert(garmentHit && bodyHit && bodyHit.distance - garmentHit.distance > .0005,
              `${budget} triangle tier ${cut} cup clears the body at ${x.toFixed(3)}, ${y.toFixed(3)}`);
          }
          ray.direction.set(0, 0, 1);
          let rearSamples = 0;
          for (const x of [-.08, -.06, -.04, -.02, 0, .02, .04, .06, .08]) {
            for (const y of [1.196, 1.208, 1.22, 1.232, 1.244, 1.248]) {
              ray.origin.set(x, y, -.28);
              const cloth = shell.raycastFirst(ray, DoubleSide, 0, .265);
              const skin = body.raycastFirst(ray, DoubleSide, 0, .265);
              if (!cloth || !skin) continue;
              const gap = skin.distance - cloth.distance;
              rearSamples++;
              assert(gap > .0007 && gap < .0105, `${budget} ${cut} rear fit gap ${gap} m at ${x}, ${y}`);
            }
          }
          assert(rearSamples >= 45, 'sampled both sides and center of the rear panel');
          ray.direction.set(0, 0, -1);
        } finally { shell.geometry.dispose(); }
      }
      body.geometry.dispose();
      for (const explicit of [false, true]) {
        const skirts = explicit ? [{ item: getWardrobeGarment('village-skirt'), scene: base }] : [];
        const model = prepareVillager(base, { fitted: true, garments: skirts, garmentBody: donorBody,
          corsetSource: { set: 'gothic-03', scene: corset } });
        try {
          applyVillagerLook(model, explicit ? assembled : characterLook({ ...DEFAULT_CHARACTER, wardrobeTrial: choice }));
          const { root } = model;
          const fittedBody = root.getObjectByName('fitting-room-body');
          assertUpperTorso(donorBody.geometry, fittedBody.geometry, `standalone ${budget} ${explicit}`);
          const fit = explicit ? { wardrobe: { ...choice, waist: 'over' }, garments: { skirt: 'village-skirt' } }
            : { wardrobeTrial: { ...choice, waist: 'over' } };
          applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, ...fit }));
          assertUpperTorso(donorBody.geometry, fittedBody.geometry, `standalone over ${budget} ${explicit}`);
          applyVillagerLook(model, explicit ? assembled : characterLook({ ...DEFAULT_CHARACTER, wardrobeTrial: choice }));
          const fittedCorset = model.detachedCorset.group.getObjectByName('CLOTH_CORSET_TUCKED');
          const skirt = explicit ? root.getObjectByName('wardrobe-village-skirt').children[0] : root.getObjectByName('CLOTH_BOTTOM_SKIRT');
          const belt = root.getObjectByName('ACC_BELT');
          const mixer = new AnimationMixer(root);
          for (const [emote, progress] of [[undefined, 0], ['002', .39], ['008', .46], ['006', .47]]) {
            mixer.stopAllAction();
            if (emote) {
              const [clip] = buildEmoteClips(root, [findGaragePreviewEmote(emote, false)]);
              mixer.clipAction(clip).play();
              mixer.setTime(clip.duration * progress);
            }
            root.updateMatrixWorld(true);
            belt.skeleton.update();
            const outer = [skirt, belt].map(mesh => new MeshBVH(waistSurface(mesh)));
            try {
              for (const mesh of fittedCorset.children) {
                const inner = waistSurface(mesh);
                try {
                  if (inner.index.count) for (const covering of outer) {
                    assert(!covering.intersectsGeometry(inner, new Matrix4()), `rear waist intersects in ${emote ?? 'idle'}`);
                  }
                } finally { inner.dispose(); }
              }
            } finally { for (const { geometry } of outer) geometry.dispose(); }
          }
        } finally { model.dispose(); }
      }
    }
  } finally { await vite.close(); }
});

test('High Collar cup and Vesper remain visible when a desktop outfit bundle fails', async t => {
  const garage = '/' + bundledDir + 'gothic-05.garage.glb';
  const mobile = '/' + bundledDir + 'gothic-05.mobile.glb';
  const corset = '/' + garmentDir + 'corsets/gothic-high-collar.garage.glb';
  const village = '/' + villagerDir + 'villager-female.portrait.glb';
  const donor = '/' + bundledDir + 'gothic-02.mobile.glb';
  const urls = [garage, mobile, corset, village, donor];
  const inputs = await Promise.all(urls.map(url => readFile(new URL(url.slice(1), publicDir))));
  if (inputs.some(isLfsPointer)) return skipMissingAsset(t, 'Pull the High Collar, outfit bundles, and Village models.');
  const scenes = Object.fromEntries(await Promise.all(inputs.map(async (bytes, index) => [urls[index], await loadGeometry(bytes)])));
  const vite = await createServer({
    define: { __VILLAGER_PORTRAIT_URL__: JSON.stringify(village) },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  });
  try {
    const { villagerModelUrl, prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { resolveWardrobePreview } = await vite.ssrLoadModule('/src/game/characters/wardrobePreviewAssets.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const look = characterLook({ ...DEFAULT_CHARACTER, wardrobe: { set: 'gothic-05', waist: 'tucked', shirt: 'none' } });
    const preferredUrl = villagerModelUrl(look, 'garage', 'portrait');
    assert.equal(preferredUrl, garage);
    const resolve = (sources, previous) => resolveWardrobePreview({ preferredUrl, look, kind: 'garage', villageKind: 'portrait', sources, previous });

    for (const [actor, failures] of [
      [garage, {}], [mobile, { [garage]: null }], [mobile, { [garage]: scenes[corset] }],
      [village, { [garage]: null, [mobile]: null }],
    ]) {
      const sources = {};
      const requested = new Set();
      let result = resolve(sources);
      while (result.pendingUrls.length) {
        for (const url of result.pendingUrls) {
          assert(!requested.has(url), 'each failed load settles before the next candidate');
          requested.add(url);
          sources[url] = Object.hasOwn(failures, url) ? failures[url] : scenes[url] ?? null;
        }
        result = resolve(sources);
      }
      const preview = result.preview;
      assert(preview?.scene === scenes[actor], 'a usable desktop outfit, alternate outfit, or Village actor renders on first load');
      assert(preview.corsetScene === scenes[corset], 'each actor keeps the authored Garage corset');
      const model = prepareVillager(preview.scene, {
        fitted: true, garments: preview.garments, garmentBody: preview.garmentBody,
        corsetSource: { scene: preview.corsetScene, set: preview.corsetSet },
      });
      try {
        applyVillagerLook(model, look);
        const visible = [];
        model.root.traverseVisible(node => { if (node.isSkinnedMesh && node.geometry.drawRange.count > 0) visible.push(node); });
        assert(visible.some(mesh => mesh.name === 'fitting-room-body'), 'the live body is visible');
        assert(visible.some(mesh => mesh.material.name === 'Corset05_Main'), 'the High Collar fabric is visible');
        assert(Number.isFinite(model.root.position.y), 'the dressed actor is inside the scene');
      } finally { model.dispose(); }
      assert(resolve(sources, preview).preview === preview, 'complete previews keep their rig on subsequent renders');
      const pending = resolve({ [garage]: null, [corset]: scenes[corset] }, preview);
      assert(pending.pendingUrls.includes(mobile) && pending.preview === preview, 'the last complete actor stays on screen while the alternate loads');
    }

    // A Garage-only install may have a complete actor in this same set's bundle but neither shared donor.
    const trial = characterLook({ ...DEFAULT_CHARACTER, wardrobeTrial: { set: 'gothic-05', shirt: 'none', waist: 'over' } });
    const sources = {
      [village]: scenes[village], [corset]: scenes[corset],
      ['/' + garmentDir + 'vesper-body.glb']: null, [donor]: null,
    };
    const resolveTrial = () => resolveWardrobePreview({
      preferredUrl: villagerModelUrl(trial, 'garage', 'portrait'), look: trial, kind: 'garage', villageKind: 'portrait', sources,
    });
    assert(resolveTrial().pendingUrls.includes(garage), 'try-on requests the matching desktop bundle for a complete body');
    sources[garage] = scenes[garage];
    const result = resolveTrial();
    assert.deepEqual(result.pendingUrls, []);
    assert(result.preview?.scene === scenes[village] && result.preview.corsetScene === scenes[corset]);
    assert(result.preview.garmentBody === scenes[garage].getObjectByName('BODY_WARDROBE'), 'the matched bundle supplies the missing fitting body');
  } finally { await vite.close(); }
});

test('High Collar cup edges cover the inner bust on both waist fits and leave the keyhole open', async t => {
  const set = 'gothic-05';
  const paths = [bundledDir + 'gothic-02.mobile.glb', ...['garage', 'mobile'].flatMap(tier => [
    villagerDir + `villager-female.${tier === 'garage' ? 'garage' : 'portrait'}.glb`,
    garmentDir + `corsets/gothic-high-collar.${tier}.glb`,
  ])];
  const inputs = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (inputs.some(isLfsPointer)) return skipMissingAsset(t, 'Pull the High Collar and fitting-room models.');
  const [bundle, garage, high, portrait, low] = await Promise.all(inputs.map(loadGeometry));
  const donor = bundle.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  const bindSkin = new MeshBVH(donor.geometry, { indirect: true });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const front = new Vector3(0, 0, -1);
    // Track the inner margins of both pigmented areas on the complete donor, including skin masked at runtime.
    const samples = [-.094, -.084, 0, .084, .094].flatMap(x => [1.255, 1.258].map(y => {
      const hit = bindSkin.raycastFirst(new Ray(new Vector3(x, y, .4), front), DoubleSide);
      assert(hit, 'the unmasked donor includes the sampled skin');
      return { x, y, face: hit.face, weights: hit.barycoord };
    }));
    for (const [tier, base, scene] of [['Garage', garage, high], ['Mobile', portrait, low]]) {
      const model = prepareVillager(base, { fitted: true, garmentBody: donor, corsetSource: { set, scene } });
      model.detachedCorset.group.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        const { normal, tangent } = mesh.geometry.attributes;
        if (!tangent) return; // Three derives the frame from UVs when no tangent attribute is supplied.
        const n = new Vector3(), t = new Vector3();
        for (let i = 0; i < tangent.count; i++) {
          n.fromBufferAttribute(normal, i);
          t.fromBufferAttribute(tangent, i);
          assert(n.cross(t).lengthSq() > 1e-6 && Math.abs(tangent.getW(i)) > .9,
            'the High Collar has a valid shading frame for desktop HDR and bloom');
        }
      });
      try {
        const skin = model.root.getObjectByName('fitting-room-body');
        const mixer = new AnimationMixer(model.root);
        for (const waist of ['tucked', 'over']) {
          applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, wardrobeTrial: { set, waist, shirt: 'none' } }));
          const garment = model.detachedCorset.group.getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`);
          const cup = garment.getObjectsByProperty('isSkinnedMesh', true)
            .filter(mesh => ['Corset05_Main', 'Corset05_Trim'].includes(mesh.material.name));
          assert(garment.visible && cup.length > 0, 'the selected cup fabric is visible');
          for (const [pose, phase] of [['idle', 0], ['002', .38], ['008', .5], ['heart-overhead', .5]]) {
            let action;
            if (pose !== 'idle') {
              const [clip] = buildEmoteClips(model.root, [findGaragePreviewEmote(pose, false)]);
              action = mixer.clipAction(clip).play();
              mixer.setTime(clip.duration * phase);
            }
            model.root.updateMatrixWorld(true);
            model.detachedCorset.updateShoulders?.();
            const surfaces = cup.map(posedSurface);
            try {
              for (const { x, y, face, weights } of samples) {
                const point = new Vector3();
                for (const [index, weight] of [[face.a, weights.x], [face.b, weights.y], [face.c, weights.z]]) {
                  point.addScaledVector(skin.getVertexPosition(index, new Vector3()), weight);
                }
                point.applyMatrix4(skin.matrixWorld).z += .1;
                const ray = new Ray(point, front);
                const covered = surfaces.some(surface => surface.raycastFirst(ray, DoubleSide, 0, .1));
                assert.equal(covered, x !== 0, `${tier} ${waist}, pose ${pose}, skin at ${x}, ${y}`);
              }
            } finally {
              surfaces.forEach(surface => surface.geometry.dispose());
              action?.stop();
            }
          }
        }
      } finally { model.dispose(); }
    }
  } finally { await vite.close(); }
});

test('Ruffled Corset and High Collar apply independent dyes on Garage and Mobile materials', async t => {
  const specs = [
    { set: 'gothic-03', asset: 'gothic-03', dyes: { color: '#123456', panel: '#654321', laces: '#abcdef' },
      groups: { MAT_CORSET_03_Brocade: 'color', MAT_CORSET_03_Ruffles: 'panel', MAT_CORSET_03_Ribbon: 'laces' } },
    { set: 'gothic-05', asset: 'gothic-high-collar', dyes: { color: '#123456', panel: '#654321', laces: '#abcdef', lining: '#321abc', hardware: '#fe7412' },
      groups: { Corset05_Main: 'color', Corset05_Inset: 'panel', Corset05_Laces: 'laces', Corset05_Trim: 'lining', Corset05_Metal: 'hardware' } },
  ];
  const tiers = ['garage', 'mobile'];
  const basePath = villagerDir + 'villager-female.portrait.glb';
  const donorPath = bundledDir + 'gothic-02.mobile.glb';
  const bundleFor = (set, tier) => `${bundledDir}${set}.${tier}.glb`;
  const assetFor = (asset, tier) => `${garmentDir}corsets/${asset}.${tier}.glb`;
  const tracked = [basePath, donorPath, ...specs.flatMap(({ set, asset }) => tiers.flatMap(tier => [
    bundleFor(set, tier), ...(set === asset ? [] : [assetFor(asset, tier)]),
  ]))];
  const inputs = await Promise.all(tracked.map(path => readFile(new URL(path, publicDir))));
  if (inputs.some(isLfsPointer)) return skipMissingAsset(t, 'Pull the fitting-room and authored corset Git LFS models.');
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/build-wardrobe-pieces.mjs', import.meta.url))]);
  const scenes = new Map(await Promise.all(tracked.map(async (path, i) => [path, await loadGeometry(inputs[i])])));
  const body = scenes.get(donorPath).getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { withClothingColors } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    for (const { set, asset, dyes, groups } of specs) for (const tier of tiers) {
      const assetPath = assetFor(asset, tier);
      const source = scenes.get(assetPath) ?? await readFile(new URL(assetPath, publicDir)).then(loadGeometry);
      for (const field of ['wardrobeTrial', 'wardrobe']) {
        const bundled = field === 'wardrobe';
        const base = scenes.get(bundled ? bundleFor(set, tier) : basePath);
        const model = prepareVillager(base, { fitted: true,
          ...(!(bundled && set === asset) && { garmentBody: body, corsetSource: { set, scene: source } }) });
        try {
          for (const waist of ['over', 'tucked']) {
            const selection = { ...DEFAULT_CHARACTER, [field]: { set, waist, shirt: 'none' } };
            const garment = (model.detachedCorset?.group ?? model.root).getObjectByName(`CLOTH_CORSET_${waist.toUpperCase()}`);
            const slots = new Map();
            garment.traverse(mesh => { if (mesh.isSkinnedMesh) slots.set(mesh.material.name, mesh.material); });
            assert.deepEqual([...slots.keys()].sort(), Object.keys(groups).sort());
            applyVillagerLook(model, characterLook(selection));
            assert(garment.visible, `${set} ${tier} ${waist} ${field}`);
            const originals = [...slots.values()].map(material => material.color.getHexString());
            applyVillagerLook(model, characterLook(withClothingColors(selection, 'corset', dyes)));
            for (const [name, key] of Object.entries(groups)) {
              assert.equal(slots.get(name).color.getHexString(), dyes[key].slice(1), `${set} ${tier} ${waist} ${field} ${name}`);
            }
            if (set === 'gothic-03') {
              applyVillagerLook(model, characterLook(withClothingColors(selection, 'corset', { accent: '#fedcba' })));
              assert.equal(slots.get('MAT_CORSET_03_Ruffles').color.getHexString(), 'fedcba');
              assert.equal(slots.get('MAT_CORSET_03_Ribbon').color.getHexString(), 'fedcba');
            }
            applyVillagerLook(model, characterLook(selection));
            assert.deepEqual([...slots.values()].map(material => material.color.getHexString()), originals);
          }
        } finally { model.dispose(); }
      }
    }
  } finally { await vite.close(); }
});

test('Laced Bodice straps clear the rear shoulders and Tucked lacing shows skin', async t => {
  const set = 'gothic-01';
  const item = catalog.find(garment => garment.id === 'skirt-02');
  const paths = ['garage', 'mobile'].flatMap(tier => [
    bundledDir + `${set}.${tier}.glb`, villagerDir + `villager-female.${tier === 'mobile' ? 'portrait' : 'garage'}.glb`,
  ]);
  paths.push(bundledDir + 'gothic-02.mobile.glb', item.url.slice(1), item.mobileUrl.slice(1));
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
  const [garageBundle, garage, mobileBundle, portrait, donor, skirtGarage, skirtMobile] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    for (const [bundle, base, skirt] of [[garageBundle, garage, skirtGarage], [mobileBundle, portrait, skirtMobile]]) {
      for (const standalone of [false, true]) {
        const options = standalone ? { garmentBody, corsetSource: { set, scene: bundle }, garments: [{ item, scene: skirt }] } : {};
        const model = prepareVillager(standalone ? base : bundle, { fitted: true, ...options });
        try {
          const source = standalone ? garmentBody : bundle.getObjectByName('BODY_WARDROBE');
          const body = model.root.getObjectByName(standalone ? 'fitting-room-body' : 'BODY_WARDROBE');
          const position = source.geometry.attributes.position;
          const straps = model.root.getObjectByName('CLOTH_CORSET_FACING');
          const facing = straps.geometry;
          const panel = new MeshBVH(new BufferGeometry().setAttribute('position', facing.attributes.position)
            .setIndex(facing.index.clone()));
          const frontRay = new Ray(new Vector3(), new Vector3(0, 0, -1));
          try {
            for (const side of [-1, 1]) {
              for (const x of [.095, .111]) {
                frontRay.origin.set(side * x, 1.318, .24);
                assert(panel.raycastFirst(frontRay, DoubleSide, 0, .24), 'The strap reaches the bodice panel.');
              }
              for (const x of [.060, .148]) {
                frontRay.origin.set(side * x, 1.318, .24);
                assert(!panel.raycastFirst(frontRay, DoubleSide, 0, .24), 'The upper chest and armhole remain open.');
              }
            }
            frontRay.origin.set(.035, 1.318, .24);
            assert(!panel.raycastFirst(frontRay, DoubleSide, 0, .24), 'The center neckline stays open.');
          } finally {
            panel.geometry.dispose();
          }
          for (const waist of ['tucked', 'over']) {
            const choice = { ...DEFAULT_CHARACTER, [standalone ? 'wardrobeTrial' : 'wardrobe']: { set, waist, shirt: 'none' } };
            applyVillagerLook(model, characterLook(choice));
            const backing = model.root.getObjectByName(`CLOTH_CORSET_WAIST_${waist.toUpperCase()}`);
            const otherBacking = model.root.getObjectByName(`CLOTH_CORSET_WAIST_${waist === 'over' ? 'TUCKED' : 'OVER'}`);
            assert(backing.visible && !otherBacking.visible);
            const lining = new MeshBVH(new BufferGeometry().setAttribute('position', backing.geometry.attributes.position)
              .setIndex(backing.geometry.index.clone()));
            try {
              for (const side of [-1, 1]) {
                for (const y of [waist === 'over' ? 1.05 : 1.075, 1.095, 1.14, 1.165]) {
                  const x = waist === 'tucked' && side > 0 ? .045 : 0;
                  const ray = new Ray(new Vector3(x, y, .30 * side), new Vector3(0, 0, -side));
                  assert(lining.raycastFirst(ray, DoubleSide, 0, .28), `${waist} waist backs the ${side > 0 ? 'front' : 'rear'} seam at ${y}`);
                }
              }
            } finally {
              lining.geometry.dispose();
            }
            const shown = new Set();
            const active = body.geometry.index.array;
            for (let i = 0; i < body.geometry.drawRange.count; i += 3) shown.add(active.subarray(i, i + 3).join(','));
            const cloth = [];
            model.root.traverseVisible(mesh => {
              if (!mesh.isSkinnedMesh || mesh.userData.clothingPiece !== 'corset' || mesh.material.transparent
                || mesh.material.userData.color_slot === 'hardware') return;
              const faces = mesh.geometry.index.array.slice(0, mesh.geometry.drawRange.count);
              cloth.push(new MeshBVH(new BufferGeometry().setAttribute('position', mesh.geometry.attributes.position)
                .setIndex(Array.from(faces))));
            });
            try {
              if (waist === 'tucked') {
                const skin = new MeshBVH(new BufferGeometry().setAttribute('position', body.geometry.attributes.position)
                  .setIndex(Array.from(active.slice(0, body.geometry.drawRange.count))));
                try {
                  for (const y of [1.100, 1.140, 1.175, 1.210]) {
                    const ray = new Ray(new Vector3(.010, y, .30), new Vector3(0, 0, -1));
                    const belly = skin.raycastFirst(ray, DoubleSide, 0, .28);
                    assert(belly, `Tucked lacing retains real skin at ${y}`);
                    assert(cloth.every(surface => !surface.raycastFirst(ray, DoubleSide, 0, belly.distance - .0005)),
                      `Tucked lacing shows skin between the laces at ${y}`);
                  }
                } finally {
                  skin.geometry.dispose();
                }
              }
              if (standalone) {
                const belt = [];
                model.root.getObjectByName(`wardrobe-${item.id}`).traverseVisible(mesh => {
                  if (!mesh.isSkinnedMesh) return;
                  belt.push(new MeshBVH(new BufferGeometry().setAttribute('position', mesh.geometry.attributes.position)
                    .setIndex(mesh.geometry.index.clone())));
                });
                try {
                  const ray = new Ray(new Vector3(.15, 1.14, .025 - .15 * Math.sqrt(3)),
                    new Vector3(-.5, 0, Math.sqrt(3) / 2));
                  const distance = surfaces => Math.min(...surfaces.map(surface => surface.raycastFirst(ray, DoubleSide, 0, .30)?.distance ?? Infinity));
                  const bodiceDistance = distance(cloth), beltDistance = distance(belt);
                  assert(Number.isFinite(bodiceDistance) && Number.isFinite(beltDistance));
                  assert(waist === 'over' ? bodiceDistance < beltDistance - .002 : beltDistance < bodiceDistance - .002,
                    `Skirt 02's high rear waistband stays on the correct side of the ${waist} bodice`);
                } finally {
                  for (const surface of belt) surface.geometry.dispose();
                }
              }
              const a = new Vector3(), b = new Vector3(), c = new Vector3(), center = new Vector3(), normal = new Vector3(), edge = new Vector3();
              const ray = new Ray();
              let maskedFaces = 0;
              const original = source.geometry.index.array;
              for (let i = 0; i < original.length; i += 3) {
                const face = original.subarray(i, i + 3);
                if (shown.has(face.join(','))) continue;
                a.fromBufferAttribute(position, face[0]);
                b.fromBufferAttribute(position, face[1]);
                c.fromBufferAttribute(position, face[2]);
                center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
                if (center.y <= 1.272 || Math.abs(center.x) < .067 || Math.abs(center.x) > .173) continue;
                maskedFaces++;
                normal.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
                ray.direction.copy(normal);
                for (const sample of [center, a, b, c]) {
                  ray.origin.copy(center).lerp(sample, .8).addScaledVector(normal, -.012);
                  assert(cloth.some(surface => surface.raycastFirst(ray, DoubleSide, 0, .052)),
                    `${standalone ? 'Standalone' : 'Bundled'} ${waist} masks an exposed shoulder near triangle ${face}`);
                }
              }
              assert(maskedFaces > 0, 'The fabric interior still masks covered skin.');
            } finally {
              for (const surface of cloth) surface.geometry.dispose();
            }
            if (waist === 'tucked' && standalone) {
              const mixer = new AnimationMixer(model.root);
              const [clap] = buildEmoteClips(model.root, [findGaragePreviewEmote('013', false)]);
              const point = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
              const normal = new Vector3(), delta = new Vector3();
              for (const pose of ['idle', 'clap']) {
                if (pose === 'clap') {
                  mixer.clipAction(clap).play();
                  mixer.setTime(clap.duration * .45);
                }
                model.root.updateMatrixWorld(true);
                const posed = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
                for (let vertex = 0; vertex < position.count; vertex++) {
                  body.getVertexPosition(vertex, point).applyMatrix4(body.matrixWorld);
                  posed.setXYZ(vertex, point.x, point.y, point.z);
                }
                const skin = new MeshBVH(new BufferGeometry().setAttribute('position', posed).setIndex(source.geometry.index.clone()));
                try {
                  const strapPosition = facing.attributes.position;
                  const samples = [0, 0];
                  for (let vertex = 0; vertex < strapPosition.count; vertex++) {
                    point.fromBufferAttribute(strapPosition, vertex);
                    if (point.z > -.038 || point.y < 1.274 || point.y > 1.39) continue;
                    samples[Number(point.x > 0)]++;
                    straps.getVertexPosition(vertex, point).applyMatrix4(straps.matrixWorld);
                    const hit = skin.closestPointToPoint(point);
                    const index = skin.geometry.index;
                    a.fromBufferAttribute(posed, index.getX(hit.faceIndex * 3));
                    b.fromBufferAttribute(posed, index.getX(hit.faceIndex * 3 + 1));
                    c.fromBufferAttribute(posed, index.getX(hit.faceIndex * 3 + 2));
                    normal.copy(b).sub(a).cross(c.sub(a)).normalize();
                    assert(delta.copy(point).sub(hit.point).dot(normal) > -.0005, `${pose} rear strap crosses the shoulder skin`);
                  }
                  assert(samples.every(count => count > 10), 'both rear strap roots are sampled');
                } finally {
                  skin.geometry.dispose();
                }
              }
              mixer.stopAllAction();
            }
          }
        } finally {
          model.dispose();
        }
      }
    }
  } finally {
    await vite.close();
  }
});

test('all four socks cover the instep with Mary Janes on and the foot top with shoes off', async t => {
  const socks = catalog.filter(item => /^socks-0[1-4]$/.test(item.id));
  const paths = [
    garmentDir + 'vesper-body.glb',
    villagerDir + 'villager-female.garage.glb',
    villagerDir + 'villager-female.portrait.glb',
    ...socks.map(item => item.url.slice(1)),
  ];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return t.skip('Run git lfs pull to materialize the fitting-room models.');
  const [donor, garage, portrait, ...sockScenes] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const point = new Vector3();
  const footSurface = mesh => {
    const { position } = mesh.geometry.attributes, index = mesh.geometry.index;
    const posed = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
    const faces = [];
    for (let i = 0; i < index.count; i += 3) {
      const face = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (face.every(vertex => position.getY(vertex) < .20)) faces.push(...face);
    }
    for (const vertex of new Set(faces)) {
      mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
      posed.setXYZ(vertex, point.x, point.y, point.z);
    }
    return new MeshBVH(new BufferGeometry().setAttribute('position', posed).setIndex(faces));
  };
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3(), edge = new Vector3();
  const center = () => point.copy(a).add(b).add(c).multiplyScalar(1 / 3);
  const surfaceNormal = () => normal.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
  const ray = new Ray();
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    for (const [tier, base] of [['garage', garage], ['compact', portrait]]) {
      for (const [index, item] of socks.entries()) {
        for (const shoesOn of [true, false]) {
          const removedClothing = shoesOn ? [] : ['shoes'];
          const model = prepareVillager(base, { garmentBody, removedClothing, garments: [{ item, scene: sockScenes[index] }] });
          try {
            const { root } = model;
            applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, garments: { socks: item.id }, removedClothing }));
            const sock = root.getObjectByName(`wardrobe-${item.id}`).children[0];
            const shoes = shoesOn ? root.getObjectByName('CLOTH_FEET_SHOES') : undefined;
            const skin = root.getObjectByName(shoesOn ? 'BODY_OUTFIT_CUT' : 'fitting-room-body');
            const authored = shoesOn ? skin.geometry : garmentBody.geometry;
            const faces = [];
            for (let i = 0; i < authored.index.count; i += 3) {
              const face = [authored.index.getX(i), authored.index.getX(i + 1), authored.index.getX(i + 2)];
              a.fromBufferAttribute(authored.attributes.position, face[0]);
              b.fromBufferAttribute(authored.attributes.position, face[1]);
              c.fromBufferAttribute(authored.attributes.position, face[2]);
              center();
              if (point.y > .020 && point.y < .120 && point.z > .006 && surfaceNormal().y > .35) faces.push(face);
            }
            const [walk] = buildEmoteClips(root, [findGaragePreviewEmote('walk-casual', false)]);
            const mixer = new AnimationMixer(root);
            for (const phase of [0, .25]) {
              if (phase) {
                mixer.clipAction(walk).play();
                mixer.setTime(walk.duration * phase);
              }
              root.updateMatrixWorld(true);
              const sockSurface = footSurface(sock), shoeSurface = shoes && footSurface(shoes);
              let visible = 0, covered = 0;
              try {
                for (const [fa, fb, fc] of faces) {
                  skin.getVertexPosition(fa, a).applyMatrix4(skin.matrixWorld);
                  skin.getVertexPosition(fb, b).applyMatrix4(skin.matrixWorld);
                  skin.getVertexPosition(fc, c).applyMatrix4(skin.matrixWorld);
                  center();
                  if (shoesOn) surfaceNormal();
                  else normal.set(0, 1, 0);
                  ray.origin.copy(point).addScaledVector(normal, .045);
                  ray.direction.copy(normal).negate();
                  const shoe = shoeSurface?.raycastFirst(ray, DoubleSide, 0, .07)?.distance ?? Infinity;
                  const cloth = sockSurface.raycastFirst(ray, DoubleSide, 0, .07)?.distance ?? Infinity;
                  if (shoe < .0444) {
                    assert(cloth >= shoe - .0006, `${item.id} ${tier} keeps fabric behind the shoe`);
                    covered++;
                  } else {
                    assert(cloth <= .0448, `${item.id} ${tier} covers the visible foot at phase ${phase}`);
                    visible++;
                  }
                }
                assert(visible > (shoesOn ? 30 : 600));
                if (shoesOn) assert(covered > 150);
              } finally {
                sockSurface.geometry.dispose();
                shoeSurface?.geometry.dispose();
                mixer.stopAllAction();
              }
            }
          } finally {
            model.dispose();
          }
        }
      }
    }
  } finally {
    await vite.close();
  }
});

test('Socks 04 keep exposed fabric and clear the body of Gothic Skirt 04 in motion', async t => {
  const socks = catalog.find(item => item.id === 'socks-04');
  const skirt = catalog.find(item => item.id === 'gothic-skirt-04');
  const paths = [garmentDir + 'vesper-body.glb', villagerDir + 'villager-female.garage.glb', socks.url.slice(1), skirt.url.slice(1)];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return t.skip('Run git lfs pull to materialize the fitting-room models.');
  const [donor, garage, sockScene, skirtScene] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const sockSource = { item: socks, scene: sockScene };
    const withSkirt = prepareVillager(garage, { fitted: true, garmentBody, garments: [sockSource, { item: skirt, scene: skirtScene }] });
    const withoutSkirt = prepareVillager(garage, { fitted: true, garmentBody, garments: [sockSource], removedClothing: ['skirt'] });
    try {
      applyVillagerLook(withSkirt, characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: skirt.id, socks: socks.id } }));
      applyVillagerLook(withoutSkirt, characterLook({ ...DEFAULT_CHARACTER, garments: { socks: socks.id }, removedClothing: ['skirt'] }));
      const garment = model => model.root.getObjectByName('wardrobe-socks-04').children[0];
      const fitted = garment(withSkirt), exposed = garment(withoutSkirt);
      const raw = sockScene.getObjectByName(fitted.name).geometry;
      assert.equal(exposed.geometry, raw, 'the complete sock stays visible without a skirt');
      assert(fitted.geometry.index.count < raw.index.count, 'the concealed upper sock has fewer faces');
      assert.deepEqual(fitted.geometry.attributes.position.array, raw.attributes.position.array);
      assert.deepEqual(fitted.geometry.attributes.skinWeight.array, raw.attributes.skinWeight.array);
      const kept = new Set();
      for (let i = 0; i < fitted.geometry.index.count; i += 3) kept.add(fitted.geometry.index.array.subarray(i, i + 3).join(','));
      for (let i = 0; i < raw.index.count; i += 3) {
        const face = raw.index.array.subarray(i, i + 3);
        if (face.every(index => raw.attributes.position.getY(index) < .40)) assert(kept.has(face.join(',')), 'faces below the hem stay visible');
      }

      const fabric = withSkirt.root.getObjectByName('wardrobe-gothic-skirt-04').children.find(mesh => mesh.material.name.endsWith('Fabric_0'));
      const identity = new Matrix4(), point = new Vector3();
      const posed = mesh => {
        const position = new Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count * 3), 3);
        for (let vertex = 0; vertex < position.count; vertex++) {
          mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
          position.setXYZ(vertex, point.x, point.y, point.z);
        }
        return position;
      };
      const mixer = new AnimationMixer(withSkirt.root);
      for (const [emote, phase] of [['001', .49], ['walk-casual', .16], ['heart-overhead', .47]]) {
        const [clip] = buildEmoteClips(withSkirt.root, [findGaragePreviewEmote(emote, false)]);
        mixer.clipAction(clip).play();
        mixer.setTime(clip.duration * phase);
        withSkirt.root.updateMatrixWorld(true);
        const sockPosition = posed(fitted);
        const shell = new BufferGeometry().setAttribute('position', posed(fabric)).setIndex(fabric.geometry.index.clone());
        const skirtBVH = new MeshBVH(shell);
        const contacts = index => {
          const sock = new BufferGeometry().setAttribute('position', sockPosition).setIndex(index.clone());
          let count = 0;
          try {
            skirtBVH.bvhcast(new MeshBVH(sock), identity, {
              intersectsTriangles: (cloth, sock) => { if (cloth.intersectsTriangle(sock)) count++; return false; },
            });
            return count;
          } finally {
            sock.dispose();
          }
        };
        try {
          const original = contacts(raw.index), next = contacts(fitted.geometry.index);
          if (emote === '001') assert.equal(next, 0, 'the relaxed skirt remains clear');
          else {
            assert(original > 0, `the original sock reproduces the ${emote} overlap`);
            assert(next < original * .25, `${emote} leaves only small hem contacts (${next}/${original})`);
          }
        } finally {
          shell.dispose();
          mixer.stopAllAction();
        }
      }
    } finally {
      withSkirt.dispose();
      withoutSkirt.dispose();
    }
  } finally {
    await vite.close();
  }
});

test('each Gothic skirt closes its waistband gap and clears the animated torso', async t => {
  const skirts = catalog.filter(item => /^gothic-skirt-0[1-5]$/.test(item.id))
    .map(item => ({ ...item, url: `/${garmentDir}skirts/gothic-skirt/${item.id}.glb` }))
    .sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(skirts.length, 5);
  const paths = [garmentDir + 'vesper-body.glb', villagerDir + 'villager-female.garage.glb', ...skirts.map(item => item.url.slice(1))];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (bytes.some(isLfsPointer)) return t.skip('Run git lfs pull to materialize the fitting-room models.');
  const [donor, garage, ...skirtScenes] = await Promise.all(bytes.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const { position, skinIndex, skinWeight } = garmentBody.geometry.attributes;
  const armJoints = garmentBody.skeleton.bones.map(bone => /arm|hand|finger|thumb|index|middle|ring|pinky/.test(bone.name));
  const isTorso = index => position.getY(index) > .88 && position.getY(index) < 1.24 && Math.abs(position.getX(index)) < .22
    && [0, 1, 2, 3].reduce((weight, channel) => weight
      + (armJoints[skinIndex.getComponent(index, channel)] ? skinWeight.getComponent(index, channel) : 0), 0) < .5;
  const torsoFaces = [];
  const indices = garmentBody.geometry.index;
  for (let i = 0; i < indices.count; i += 3) {
    const triangle = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    if (triangle.every(isTorso)) torsoFaces.push(...triangle);
  }
  const waistMaterial = ['Fabric_1', 'Trim_1', 'Trim_1', 'Fabric_0', 'Fabric_0'];
  // 02/05 retain their high waistband just under the cups. The other three
  // skirts keep their accepted nudge and their original geometry checks.
  const maximumDrops = [.022, .038, .015, .015, .014];
  const identity = new Matrix4();
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { handkerchiefSkirtPanelLayers } = await vite.ssrLoadModule('/src/game/characters/gothicSkirtPanels.ts');
    for (const [index, item] of skirts.entries()) {
      const scene = skirtScenes[index];
      const fittedHem = item.id === 'gothic-skirt-03' || item.id === 'gothic-skirt-05';
      const model = prepareVillager(garage, { fitted: true, garments: [{ item, scene }], garmentBody });
      try {
        applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: item.id } }));
        const { root } = model;
        const body = root.getObjectByName('fitting-room-body');
        const { children } = root.getObjectByName(`wardrobe-${item.id}`);
        let roundedCorners = 0;
        let taperedTips = 0;
        for (const mesh of children) {
          const source = scene.getObjectByName(mesh.name).geometry;
          const handkerchief = item.id === 'gothic-skirt-01' && mesh.material.name === 'MAT_GOTHIC_01_Fabric_1'
            ? handkerchiefSkirtPanelLayers(source) : undefined;
          const { position: cloth, uv, skinWeight, skinIndex } = mesh.geometry.attributes;
          const original = source.attributes.position;
          if (item.id === 'gothic-skirt-05' && mesh.material.name === 'MAT_GOTHIC_05_Fabric_0') {
            const waistband = [];
            for (let face = 0; face < source.index.count; face += 3) {
              const triangle = [source.index.getX(face), source.index.getX(face + 1), source.index.getX(face + 2)];
              if (triangle.every(vertex => original.getY(vertex) > 1)) waistband.push(...triangle);
            }
            assert.deepEqual(Array.from(mesh.geometry.index.array), waistband, '05 keeps exactly the authored waistband faces');
          } else assert.deepEqual(mesh.geometry.index.array, source.index.array, item.id);
          assert.deepEqual(uv.array, source.attributes.uv.array, item.id);
          for (let i = 0; i < original.count; i++) {
            if (!fittedHem || original.getY(i) >= .91) {
              for (const channel of [0, 1, 2, 3]) {
                assert.equal(skinWeight.getComponent(i, channel), source.attributes.skinWeight.getComponent(i, channel), item.id);
                assert.equal(skinIndex.getComponent(i, channel), source.attributes.skinIndex.getComponent(i, channel), item.id);
              }
            } else {
              const total = skinWeight.getX(i) + skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i);
              assert(Math.abs(total - 1) < .00001, `${item.id} normalizes the refitted hem weights`);
            }
            if (item.id === 'gothic-skirt-04' && original.getY(i) < .76 && original.getZ(i) > .035) {
              const lift = cloth.getY(i) - original.getY(i);
              assert(lift >= 0 && lift <= .024001, 'the front corners lift gently');
              assert(Math.abs(cloth.getX(i) - original.getX(i)) <= .012001, 'the front taper is local');
              if (lift > .010) roundedCorners++;
              continue;
            }
            if (original.getY(i) <= .78) assert.equal(cloth.getY(i), original.getY(i), `${item.id} preserves the hem`);
            else {
              const drop = original.getY(i) - cloth.getY(i);
              assert(drop >= -1e-6 && drop <= maximumDrops[index] + 1e-6,
                `${item.id} keeps the upper-skirt drop subtle (${drop} m)`);
            }
            if (original.getY(i) >= .90) continue;
            if (handkerchief?.inner[i] && original.getY(i) > .60) {
              const before = Math.hypot(original.getX(i), original.getZ(i) - .025);
              const after = Math.hypot(cloth.getX(i), cloth.getZ(i) - .025);
              assert(before - after >= -1e-6 && before - after <= .012001,
                'only the covered inner handkerchief panel seats inward by at most 12 mm');
              continue;
            }
            if (item.id === 'gothic-skirt-03' && mesh.material.name === 'MAT_GOTHIC_03_Trim_1' && original.getY(i) > .78) {
              const before = Math.hypot(original.getX(i), original.getZ(i) - .025);
              const after = Math.hypot(cloth.getX(i), cloth.getZ(i) - .025);
              assert(before - after >= -.021001 && before - after <= .040001,
                'the covered Ruffled lining combines its accepted stride room with a bounded inward layer fit');
              continue;
            }
            if (fittedHem && original.getY(i) < .84) {
              assert(Math.hypot(cloth.getX(i) - original.getX(i), cloth.getZ(i) - original.getZ(i)) <= .032001,
                `${item.id} keeps the hem adjustment local`);
              const radius = attribute => Math.hypot(attribute.getX(i), attribute.getZ(i) - .025);
              if (original.getY(i) < .52 && radius(original) - radius(cloth) > .006) taperedTips++;
              continue;
            }
            assert.equal(cloth.getX(i), original.getX(i), item.id);
            assert.equal(cloth.getZ(i), original.getZ(i), item.id);
          }
        }
        if (item.id === 'gothic-skirt-04') assert(roundedCorners > 20, 'the front hem rounds while the rear stays unchanged');
        if (fittedHem) assert(taperedTips > 10, `${item.id} draws in its widest lower tips`);
        const mesh = children.find(part => part.material.name.endsWith(waistMaterial[index]));
        const cloth = mesh.geometry.attributes.position;
        const rim = Math.max(...children.map(part => {
          const positions = part.geometry.attributes.position;
          return Math.max(...Array.from({ length: positions.count }, (_, i) => positions.getY(i)));
        }));
        const originalRim = Math.max(...children.map(part => {
          const positions = scene.getObjectByName(part.name).geometry.attributes.position;
          return Math.max(...Array.from({ length: positions.count }, (_, i) => positions.getY(i)));
        }));
        assert(originalRim - rim > .001 && originalRim - rim <= maximumDrops[index] + 1e-6,
          `${item.id} lowers its own waistband only slightly (${originalRim - rim} m)`);
        assert(rim < 1.184, `${item.id} keeps its waistband below the lower bust`);
        if (item.id === 'gothic-skirt-02' || item.id === 'gothic-skirt-05') {
          assert(rim >= 1.180 - 1e-6, `${item.id} retains its high waistband just under the cups`);
        }
        const front = Array.from({ length: cloth.count }, (_, i) => i)
          .filter(i => cloth.getZ(i) - .042 > Math.abs(cloth.getX(i)));
        const crest = Math.max(...front.map(i => cloth.getY(i)));
        const waist = front.filter(i => cloth.getY(i) > crest - .026);
        const median = list => list.sort((a, b) => a - b)[Math.floor(list.length / 2)];
        const bindBody = new MeshBVH(garmentBody.geometry.clone());
        const waistGaps = waist.map(i => {
          const x = cloth.getX(i), y = cloth.getY(i), depth = cloth.getZ(i) - .025;
          const ray = new Ray(new Vector3(0, y, .025), new Vector3(x, 0, depth).normalize());
          const skin = bindBody.raycastFirst(ray, DoubleSide, 0, .21);
          return skin ? Math.hypot(x, depth) - skin.distance : Infinity;
        });
        bindBody.geometry.dispose();
        const waistEase = median(waistGaps);
        assert(waistEase >= .005 && waistEase < .035, `${item.id} seats the lowered front band against the body (${waistEase} m)`);
        if (item.revisionUrl) {
          // Exercise the authored-geometry path even before an optional replacement is installed.
          const revision = prepareVillager(garage, { fitted: true, garments: [{ item, scene, authoredFit: true }], garmentBody });
          try {
            let highest = -Infinity;
            for (const mesh of revision.root.getObjectByName(`wardrobe-${item.id}`).children) {
              const author = scene.getObjectByName(mesh.name).geometry.attributes;
              const fitted = mesh.geometry.attributes;
              assert.deepEqual(fitted.skinWeight.array, author.skinWeight.array, 'the revision supplies its own drape weights');
              for (let i = 0; i < fitted.position.count; i++) {
                highest = Math.max(highest, fitted.position.getY(i));
                if (author.position.getY(i) > .78) continue;
                for (const axis of [0, 1, 2]) {
                  assert.equal(fitted.position.getComponent(i, axis), author.position.getComponent(i, axis),
                    'the revision supplies its own hemline');
                }
              }
            }
            assert(Math.abs(highest - rim) < .0001, `${item.id} applies the same subtle drop to the authored waistband`);
          } finally {
            revision.dispose();
          }
        }
        const mixer = new AnimationMixer(root);
        for (const [emote, phase] of [['001', .49], ['heart-overhead', .49], ['walk-casual', .39]]) {
          const [clip] = buildEmoteClips(root, [findGaragePreviewEmote(emote, false)]);
          mixer.clipAction(clip).play();
          mixer.setTime(clip.duration * phase);
          root.updateMatrixWorld(true);
          const point = new Vector3();
          const posed = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
          for (let i = 0; i < position.count; i++) {
            body.getVertexPosition(i, point).applyMatrix4(body.matrixWorld);
            posed.setXYZ(i, point.x, point.y, point.z);
          }
          const torso = new BufferGeometry().setAttribute('position', posed).setIndex(torsoFaces);
          try {
            const surface = new MeshBVH(torso), triangles = torso.index;
            const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3();
            const hit = { point: new Vector3(), distance: 0, faceIndex: 0 };
            for (const part of children) {
              const positions = part.geometry.attributes.position;
              const posedCloth = new Float32BufferAttribute(new Float32Array(positions.count * 3), 3);
              for (let i = 0; i < positions.count; i++) {
                if (positions.getY(i) < .970) continue;
                part.getVertexPosition(i, point).applyMatrix4(part.matrixWorld);
                posedCloth.setXYZ(i, point.x, point.y, point.z);
                surface.closestPointToPoint(point, hit);
                const offset = hit.faceIndex * 3;
                a.fromBufferAttribute(posed, triangles.getX(offset));
                b.fromBufferAttribute(posed, triangles.getX(offset + 1));
                c.fromBufferAttribute(posed, triangles.getX(offset + 2));
                normal.copy(b).sub(a).cross(c.sub(a)).normalize();
                assert(point.sub(hit.point).dot(normal) > 0, `${item.id} keeps ${part.material.name} above the skin in ${emote}`);
              }
              const faces = [];
              const index = part.geometry.index;
              for (let i = 0; i < index.count; i += 3) {
                const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
                if (triangle.every(vertex => positions.getY(vertex) >= .970)) faces.push(...triangle);
              }
              if (!faces.length) continue;
              const cloth = new BufferGeometry().setAttribute('position', posedCloth).setIndex(faces);
              try {
                let contact;
                const intersects = surface.bvhcast(new MeshBVH(cloth), identity, {
                  intersectsTriangles: (skin, fabric) => {
                    if (!skin.intersectsTriangle(fabric)) return false;
                    contact = { skin: [skin.a.toArray(), skin.b.toArray(), skin.c.toArray()], fabric: [fabric.a.toArray(), fabric.b.toArray(), fabric.c.toArray()] };
                    return true;
                  },
                });
                assert(!intersects, `${item.id} ${part.material.name} waistband faces clear the torso in ${emote}: ${JSON.stringify(contact)}`);
              } finally {
                cloth.dispose();
              }
            }
          } finally {
            torso.dispose();
            mixer.stopAllAction();
          }
        }
        if (fittedHem) {
          const trim = children.find(part => part.material.name.endsWith('Trim_1'));
          const [walk] = buildEmoteClips(root, [findGaragePreviewEmote('walk-casual', false)]);
          mixer.clipAction(walk).play();
          mixer.setTime(walk.duration * .45);
          root.updateMatrixWorld(true);
          const { position } = trim.geometry.attributes;
          const posed = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
          const point = new Vector3(), lowerFaces = [];
          for (let i = 0; i < position.count; i++) {
            trim.getVertexPosition(i, point).applyMatrix4(trim.matrixWorld);
            posed.setXYZ(i, point.x, point.y, point.z);
          }
          for (let i = 0; i < trim.geometry.index.count; i += 3) {
            const face = [trim.geometry.index.getX(i), trim.geometry.index.getX(i + 1), trim.geometry.index.getX(i + 2)];
            if (face.every(vertex => position.getY(vertex) >= .40 && position.getY(vertex) <= .82)) lowerFaces.push(...face);
          }
          assert(lowerFaces.length > 100);
          const hem = new BufferGeometry().setAttribute('position', posed).setIndex(lowerFaces);
          try {
            const surface = new MeshBVH(hem);
            const crossing = { start: new Vector3(), end: new Vector3() };
            let crossings = 0;
            surface.bvhcast(surface, identity, {
              intersectsTriangles: (a, b, ai, bi) => {
                if (ai >= bi || [a.a, a.b, a.c].some(p => [b.a, b.b, b.c].some(q => p.distanceToSquared(q) < 1e-12))) return false;
                if (a.intersectsTriangle(b, crossing) && crossing.start.distanceToSquared(crossing.end) >= .002 ** 2) crossings++;
                return false;
              },
            });
            assert(crossings < 60, `${item.id} keeps lower trim from folding through itself during a step (${crossings} crossings)`);
          } finally {
            hem.dispose();
            mixer.stopAllAction();
          }
        }
      } finally {
        model.dispose();
      }
    }
  } finally {
    await vite.close();
  }
});

// Measure the visible cloth at a given height across the skirt, including its authored folds.
function skirtDepths(surface, height, side, halfWidth = .19) {
  const depths = [];
  const ray = new Ray(new Vector3(), new Vector3(0, 0, -side));
  for (let column = -Math.round(halfWidth * 100); column <= Math.round(halfWidth * 100); column++) {
    ray.origin.set(column / 100, height, .6 * side);
    const hit = surface.raycastFirst(ray, DoubleSide);
    if (hit && hit.distance < .6) depths.push(.6 - hit.distance);
  }
  assert(depths.length > 5, 'the cross-section hits a broad cloth panel');
  return depths.sort((a, b) => a - b);
}

test('short skirts use their refined silhouettes on the Vesper rig at both detail tiers', async t => {
  const skirts = catalog.filter(item => /^skirt-0[1-4]$/.test(item.id));
  const bodyPaths = [garmentDir + 'vesper-body.glb', villagerDir + 'villager-female.garage.glb', villagerDir + 'villager-female.portrait.glb'];
  const skirtPaths = skirts.flatMap(item => [item.url, item.mobileUrl]).map(url => url.slice(1));
  const files = await Promise.all([...bodyPaths, ...skirtPaths].map(path => readFile(new URL(path, publicDir))));
  if (files.some(isLfsPointer)) return skipMissingAsset(t, 'Run git lfs pull to materialize the fitting-room models.');
  const [donor, garage, portrait, ...sources] = await Promise.all(files.map(loadGeometry));
  const garmentBody = donor.getObjectByName('BODY_WARDROBE');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { clothingPieceFor } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    for (const [index, scene] of sources.entries()) {
      const item = skirts[Math.floor(index / 2)];
      const model = prepareVillager(index % 2 ? portrait : garage, { fitted: true, garments: [{ item, scene }], garmentBody });
      try {
        applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: item.id } }));
        const { children } = model.root.getObjectByName(`wardrobe-${item.id}`);
        const wrap = item.id === 'skirt-01' || item.id === 'skirt-02';
        const lining = children.find(mesh => mesh.userData.wardrobeRole === 'shorts');
        if (wrap) {
          assert(lining, item.id);
          assert.equal(lining.geometry, scene.getObjectByName(lining.name).geometry);
        } else assert.equal(lining, undefined);
        const fabric = children.find(mesh => mesh.userData.wardrobePart === 'fabric');
        const source = scene.getObjectByName(fabric.name).geometry;
        if (item.id === 'skirt-02') {
          assert(fabric.material.map?.generateMipmaps, 'the wrap fabric has filterable surface detail at both tiers');
          assert(children.filter(mesh => mesh !== fabric).every(mesh => mesh.material.map !== fabric.material.map),
            'the weave stays on the fabric and off the fastening, lining, and trim');
        }
        const before = source.getAttribute('position');
        const after = fabric.geometry.getAttribute('position');
        assert.notEqual(after, before, item.id);
        assert.deepEqual(fabric.geometry.index.array, source.index.array, item.id);
        for (const name of ['uv', 'skinWeight', 'skinIndex']) {
          const a = fabric.geometry.getAttribute(name), b = source.getAttribute(name);
          const values = attribute => Array.from({ length: attribute.count * attribute.itemSize },
            (_, i) => attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize));
          assert.deepEqual(values(a), values(b), `${item.id} preserves ${name}`);
        }
        for (let i = 0; i < before.count; i++) {
          assert.equal(after.getY(i), before.getY(i), 'the authored hem heights remain intact');
          if (!wrap && before.getY(i) < 1.035 && before.getZ(i) < -.025) {
            assert.equal(after.getX(i), before.getX(i), `${item.id} preserves the approved rear width`);
            assert.equal(after.getZ(i), before.getZ(i), `${item.id} preserves the approved rear folds`);
          }
        }
        const band = children.find(mesh => mesh.userData.wardrobePart === 'trim');
        const bandSource = scene.getObjectByName(band.name).geometry.attributes.position;
        const bandFit = band.geometry.attributes.position;
        let seated = 0;
        for (let i = 0; i < bandSource.count; i++) {
          if (bandSource.getY(i) < 1.061) continue;
          const radius = attribute => Math.hypot(attribute.getX(i), attribute.getZ(i) - .025);
          const inset = radius(bandSource) - radius(bandFit);
          assert(inset >= -.00001 && inset < .005, 'the upper trim is drawn toward the waist by at most 5 mm');
          if (inset > .0005) seated++;
        }
        assert(seated > 0, `${item.id} takes up room in the upper waistband`);
        const authored = new MeshBVH(source.clone()), fitted = new MeshBVH(fabric.geometry.clone());
        try {
          const [upper, middle, lower] = [.99, .91, .83].map(y => skirtDepths(fitted, y, 1).at(-1));
          assert(upper < skirtDepths(authored, .99, 1).at(-1) - .004, `${item.id} brings the upper front in`);
          assert(middle > upper + .002 && lower > middle + .002,
            `${item.id} drapes gradually outward below the hip (${[upper, middle, lower].map(m => (m * 1000).toFixed(1))} mm)`);
          if (wrap) {
            const seat = skirtDepths(fitted, .95, -1).at(-1);
            assert(seat < skirtDepths(authored, .95, -1).at(-1) - .007, `${item.id} follows the seat more closely`);
          }
          if (item.id === 'skirt-02') {
            const [seat, below] = [.89, .83].map(y => {
              const depths = skirtDepths(fitted, y, -1, .11);
              return depths[Math.floor(depths.length / 2)];
            });
            assert(seat < below + .002, 'the rear cloth flows below the seat without a local bulge');
          }
        } finally {
          authored.geometry.dispose();
          fitted.geometry.dispose();
        }
        const skin = model.root.getObjectByName('fitting-room-body');
        assert(skin?.visible && skin.geometry.drawRange.count > 0);
        const clothing = [];
        model.root.traverseVisible(mesh => {
          if (mesh.isSkinnedMesh && mesh.geometry.index && clothingPieceFor(mesh)
            && mesh.material.visible && !mesh.material.transparent && !mesh.material.alphaTest) clothing.push(mesh);
        });
        const poses = auditCorsetSkinMask(model.root, skin, garmentBody.geometry, clothing, buildEmoteClips, findGaragePreviewEmote, {
          minHeight: .30, maxHeight: 1.17, halfWidth: .22,
          extraPoses: [['walk-casual', .30], ['walk-casual', .64]],
          extraViews: [[1, 0, 0], [-1, 0, 0], [0, .9, 1], [0, -.7, 1], [0, .9, -1], [0, -.7, -1]],
        });
        for (const { pose, phase, uncovered } of poses) {
          assert.equal(uncovered, 0, `${item.id} ${index % 2 ? 'Mobile' : 'Garage'} ${pose}@${phase} exposes no holes at the waist or legs`);
        }
      } finally {
        model.dispose();
      }
    }
  } finally {
    await vite.close();
  }
});

test('neck bows follow the worn neckline and the Village neck bow follows the upper rig', async t => {
  const [low, high, bow] = ['top-02', 'top-03', 'bowtie-01'].map(id => catalog.find(item => item.id === id));
  const paths = [villagerDir + 'villager-female.garage.glb', garmentDir + 'vesper-body.glb', ...[low, high, bow].map(item => item.url.slice(1))];
  const files = await Promise.all(paths.map(path => readFile(new URL(path, publicDir))));
  if (files.some(isLfsPointer)) return skipMissingAsset(t, 'Materialize the Village model, Vesper body, Tops 02/03 and Bow Tie 01.');
  const [actor, donor, lowTop, highTop, bowScene] = await Promise.all(files.map(loadGeometry));
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const garmentBody = donor.getObjectByName('BODY_WARDROBE');
    const tipHeights = [];
    for (const [item, scene] of [[low, lowTop], [high, highTop]]) {
      const look = characterLook({ ...DEFAULT_CHARACTER, garments: { top: item.id, bow: bow.id } });
      const model = prepareVillager(actor, { fitted: true, garmentBody, garments: [{ item, scene }, { item: bow, scene: bowScene }] });
      try {
        applyVillagerLook(model, look);
        const mesh = model.root.getObjectByName('wardrobe-' + bow.id).children[0];
        const source = bowScene.getObjectByName(mesh.name).geometry;
        const position = mesh.geometry.getAttribute('position'), rest = source.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          assert(position.getY(i) <= rest.getY(i) + 1e-6, 'the supported bow never lifts above its authored attachment');
        }
        let tip = 0;
        for (let i = 0; i < position.count; i++) if (rest.getY(i) < rest.getY(tip)) tip = i;
        assert(position.getY(tip) < rest.getY(tip) - .008, 'the ribbon settles down from its original tip');
        tipHeights.push(position.getY(tip));
        for (const attribute of ['normal', 'tangent']) {
          const frame = mesh.geometry.getAttribute(attribute);
          for (let i = 0; i < frame.count; i++) assert(Math.abs(Math.hypot(frame.getX(i), frame.getY(i), frame.getZ(i)) - 1) < .002);
        }
        const first = mesh.geometry;
        applyVillagerLook(model, look);
        assert.equal(mesh.geometry, first, 'unchanged clothing reuses the bow fit');
      } finally { model.dispose(); }
    }
    assert(tipHeights[1] > tipHeights[0] + .006 && tipHeights[1] < tipHeights[0] + .014,
      'the standing collar supports the bow without the previous upward lift');
    const village = getWardrobeGarment('village-bow');
    const model = prepareVillager(actor, { fitted: true, garments: [{ item: village, scene: actor }], garmentBody });
    try {
      applyVillagerLook(model, characterLook({ ...DEFAULT_CHARACTER, garments: { bow: village.id } }));
      const mesh = model.root.getObjectByName('wardrobe-village-bow').children[0];
      mesh.geometry.computeBoundingBox();
      assert(mesh.geometry.boundingBox.min.y > 1.21 && mesh.geometry.boundingBox.max.y > 1.40);
      const joints = mesh.geometry.getAttribute('skinIndex');
      for (let i = 0; i < joints.count; i++) {
        assert.equal(mesh.skeleton.bones[joints.getX(i)].name, 'spine_04');
        assert.equal(mesh.skeleton.bones[joints.getY(i)].name, 'neck_01');
      }
    } finally { model.dispose(); }
  } finally { await vite.close(); }
});
