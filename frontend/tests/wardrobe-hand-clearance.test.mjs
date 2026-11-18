import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { AnimationMixer, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';

const publicDir = new URL('../public/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../../packages/wardrobe-catalog/character-garments.json', import.meta.url), 'utf8'));

test('bare thighs and all four slim skirts stay clear of the hands throughout idle and walking', async t => {
  const skirts = catalog.filter(item => /^skirt-0[1-4]$/.test(item.id));
  const actorPath = 'models/characters/villagers/villager-female/villager-female.garage.glb';
  const donorPath = 'models/characters/wardrobe/gothic-02.mobile.glb';
  const paths = [actorPath, donorPath, ...skirts.flatMap(item => [item.url, item.mobileUrl].map(url => url.slice(1)))];
  const bytes = await Promise.all(paths.map(path => readFile(new URL(path, publicDir)).catch(() => null)));
  if (bytes.some(file => !file || file.subarray(0, 64).toString().startsWith('version https://git-lfs.github.com/spec/v1'))) {
    const message = 'Run git lfs pull to materialize the character and slim-skirt models.';
    if (process.env.AVENLAB_WARDROBE_REQUIRE_ASSETS === '1') assert.fail(message);
    return t.skip(message);
  }
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { DEFAULT_CHARACTER, characterAppearance, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    const { usesFittedAnimation } = await vite.ssrLoadModule('/src/game/characters/animationFit.ts');
    const { buildEmoteClips, garageBreathing, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const [actor, donor] = await Promise.all(bytes.slice(0, 2).map(loadWardrobeGeometry));
    const garmentBody = donor.getObjectByName('BODY_WARDROBE');
    assert(garmentBody, 'the complete authored donor is available');
    const { index, attributes: { position, skinIndex, skinWeight } } = garmentBody.geometry;
    const handVertices = new Set(), legVertices = new Set();
    for (let vertex = 0; vertex < position.count; vertex++) {
      let hand = 0, leg = 0;
      for (let joint = 0; joint < 4; joint++) {
        const offset = vertex * 4 + joint;
        const name = garmentBody.skeleton.bones[skinIndex.array[offset]].name;
        const weight = skinWeight.array[offset];
        if (/^(hand_|thumb_|index_|middle_|ring_|pinky_)/.test(name)) hand += weight;
        if (/^(thigh_|pelvis)/.test(name)) leg += weight;
      }
      if (hand > .5) handVertices.add(vertex);
      if (leg > .5) legVertices.add(vertex);
    }
    const handFaces = [], legFaces = [];
    for (let face = 0; face < index.count; face += 3) {
      const triangle = [index.getX(face), index.getX(face + 1), index.getX(face + 2)];
      if (triangle.every(vertex => handVertices.has(vertex))) handFaces.push(...triangle);
      if (triangle.every(vertex => legVertices.has(vertex))) legFaces.push(...triangle);
    }
    assert(handFaces.length > 3000 && legFaces.length > 3000, 'both palms/fingers and the full hip/thigh region are tested');
    const sampledVertices = [...new Set([...handFaces, ...legFaces])];
    const point = new Vector3(), identity = new Matrix4();
    const emotes = [garageBreathing(), findGaragePreviewEmote('walk-casual', false)];
    const cases = [{ id: 'bare', garments: [], removedClothing: ['top', 'skirt'] }];
    for (const item of skirts) {
      for (const tier of ['url', 'mobileUrl']) {
        cases.push({ id: `${item.id}/${tier === 'url' ? 'garage' : 'mobile'}`, skirt: item.id, removedClothing: ['top'],
          garments: [{ item: getWardrobeGarment(item.id), scene: await loadWardrobeGeometry(bytes[paths.indexOf(item[tier].slice(1))]) }] });
      }
    }
    for (const sample of cases) {
      for (const animationFit of ['fitted', 'full']) {
        const look = characterLook({ ...DEFAULT_CHARACTER, removedClothing: sample.removedClothing,
          garments: sample.skirt ? { skirt: sample.skirt } : undefined,
          appearance: { ...characterAppearance(DEFAULT_CHARACTER), animation_fit: animationFit } });
        const model = prepareVillager(actor, { fitted: usesFittedAnimation(look), garmentBody,
          garments: sample.garments, removedClothing: look.removedClothing });
        try {
          applyVillagerLook(model, look);
          const body = model.root.getObjectByName('fitting-room-body');
          assert(body, `${sample.id}: visible body restored`);
          for (const emote of emotes) {
            const [clip] = buildEmoteClips(model.root, [emote]);
            const mixer = new AnimationMixer(model.root), action = mixer.clipAction(clip).play();
            try {
              for (let frame = 0; frame < 20; frame++) {
                mixer.setTime(clip.duration * frame / 20);
                model.root.updateMatrixWorld(true);
                const posed = new Float32BufferAttribute(new Float32Array(position.count * 3), 3);
                for (const vertex of sampledVertices) {
                  body.getVertexPosition(vertex, point).applyMatrix4(body.matrixWorld);
                  posed.setXYZ(vertex, point.x, point.y, point.z);
                }
                const hands = new BufferGeometry().setAttribute('position', posed).setIndex(handFaces);
                const thighs = new BufferGeometry().setAttribute('position', posed).setIndex(legFaces);
                try {
                  const handSurface = new MeshBVH(hands), thighSurface = new MeshBVH(thighs);
                  const intersects = handSurface.bvhcast(thighSurface, identity, { intersectsTriangles: (a, b) => a.intersectsTriangle(b) });
                  assert(!intersects, `${sample.id} ${animationFit} ${emote.id} at ${frame / 20}: fingers/palms intersect the thighs`);
                } finally { hands.dispose(); thighs.dispose(); }
              }
            } finally { action.stop(); mixer.uncacheRoot(model.root); }
          }
        } finally { model.dispose(); }
      }
    }
  } finally { await vite.close(); }
});
