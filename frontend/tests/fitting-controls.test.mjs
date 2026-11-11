import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { Group, Mesh, MeshStandardMaterial, BoxGeometry, Vector3, Quaternion, AnimationMixer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const server = () => createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });

test('piece colors persist independently across garments, outfits, and actor instances', async () => {
  const vite = await server();
  try {
    const { prepareVillager, applyVillagerLook } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { characterLook, DEFAULT_CHARACTER } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { withClothingColors, clothingColors, wornClothing } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    const original = new MeshStandardMaterial({ color: '#888888' }); original.name = 'MAT_ClothUpper';
    const geometry = new BoxGeometry(.3, .3, .1), scene = new Group();
    for (const name of ['CLOTH_TOP_CORSET', 'CLOTH_BOTTOM_SKIRT', 'ACC_HAT']) {
      const mesh = new Mesh(geometry, original); mesh.name = name; scene.add(mesh);
    }
    const grouped = new Group(); grouped.userData.wardrobeRole = 'corset-tucked';
    const child = new Mesh(geometry, original); child.name = 'artist-primitive-0'; grouped.add(child); scene.add(grouped);
    const a = prepareVillager(scene), b = prepareVillager(scene);
    let choice = withClothingColors(DEFAULT_CHARACTER, 'skirt', { color: '#ff0000' });
    choice = withClothingColors(choice, 'corset', { color: '#00ff00' });
    applyVillagerLook(a, characterLook(choice)); applyVillagerLook(b, characterLook(DEFAULT_CHARACTER));
    assert.equal(a.root.getObjectByName('CLOTH_BOTTOM_SKIRT').material.color.getHexString(), 'ff0000');
    assert.equal(a.root.getObjectByName('CLOTH_TOP_CORSET').material.color.getHexString(), '00ff00');
    assert.equal(a.root.getObjectByName('artist-primitive-0').material.color.getHexString(), '00ff00', 'multi-material GLB children inherit their parent garment');
    assert.notEqual(a.root.getObjectByName('ACC_HAT').material.color.getHexString(), 'ff0000');
    assert.notEqual(b.root.getObjectByName('CLOTH_BOTTOM_SKIRT').material.color.getHexString(), 'ff0000');
    assert.equal(original.color.getHexString(), '888888', 'shared GLB material remains untouched');
    const reset = withClothingColors(choice, 'skirt'); applyVillagerLook(a, characterLook(reset));
    assert.equal(clothingColors(characterLook(reset), 'skirt'), undefined);
    assert.equal(clothingColors(characterLook(reset), 'corset').color, '#00ff00');
    assert.equal(a.root.getObjectByName('CLOTH_BOTTOM_SKIRT').material.color.getHex(), b.root.getObjectByName('CLOTH_BOTTOM_SKIRT').material.color.getHex());
    const gothic = withClothingColors({ ...choice, wardrobe: { set: 'gothic-01', shirt: 'under', waist: 'tucked' } }, 'skirt', { color: '#0011ff' });
    assert.equal(clothingColors(characterLook(gothic), 'skirt').color, '#0011ff');
    assert.equal(clothingColors(characterLook({ ...gothic, wardrobe: undefined }), 'skirt').color, '#ff0000');
    assert(!wornClothing(gothic).includes('shirt'));
    assert(!wornClothing(gothic).includes('shorts'));
    let sharedDisposed = false; original.addEventListener('dispose', () => sharedDisposed = true);
    a.dispose(); b.dispose(); assert.equal(sharedDisposed, false);
    original.dispose(); geometry.dispose();
  } finally { await vite.close(); }
});

test('item close-ups ignore hidden layers, fit both axes, and transition around the actor', async () => {
  const vite = await server();
  try {
    const { clothingFrame, blendCharacterCamera } = await vite.ssrLoadModule('/src/game/characters/clothingFraming.ts');
    const { clothingBounds } = await vite.ssrLoadModule('/src/game/characters/clothingPieces.ts');
    const root = new Group(), hidden = new Group(), visible = new Mesh(new BoxGeometry(.3, .08, .05), new MeshStandardMaterial());
    visible.userData.clothingPiece = 'glasses'; visible.position.y = 1.5; root.add(visible, hidden);
    const wrong = visible.clone(); wrong.scale.setScalar(50); hidden.add(wrong); hidden.visible = false;
    const bounds = clothingBounds(root, 'glasses'); assert(bounds.max.x < .16); assert(bounds.min.y > 1.45);
    const narrow = clothingFrame(root, 'glasses', 35, .4), wide = clothingFrame(root, 'glasses', 35, 2);
    assert(narrow.distance > wide.distance, 'wide accessories fit narrow preview windows');
    assert(Math.abs(wide.center.y - 1.5) < 1e-6);
    const position = new Vector3(0, 1, 3), target = new Vector3(0, 1, 0), next = new Vector3(0, 1, -3);
    const scratch = { eye: new Vector3(), nextEye: new Vector3(), swing: new Quaternion(), orbit: new Quaternion() };
    const start = position.clone();
    blendCharacterCamera(position, target, next, new Vector3(0, 1, 0), .15, scratch);
    assert(position.distanceTo(start) > 0 && position.distanceTo(next) > 1, 'first transition step is neither a jump nor a no-op');
    assert(Math.abs(position.distanceTo(target) - 3) < 1e-7, 'front/back transition does not pass through the body');
    for (let i = 0; i < 150; i++) blendCharacterCamera(position, target, next, new Vector3(0, 1, 0), .15, scratch);
    assert(position.distanceTo(next) < .0001);
    visible.geometry.dispose(); visible.material.dispose();
  } finally { await vite.close(); }
});

test('every personality has playable varied emotes; fitted and full poses keep complete valid animation clips', async () => {
  const vite = await server();
  try {
    const { CHARACTER_PERSONALITIES, personalityEmote } = await vite.ssrLoadModule('/src/game/characters/characterPersonality.ts');
    const { EMOTE_GROUPS, emoteCollection, findGaragePreviewEmote, buildEmoteClips } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { prepareVillager } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { fittedHandTarget, usesFittedAnimation } = await vite.ssrLoadModule('/src/game/characters/animationFit.ts');
    const { characterLook, DEFAULT_CHARACTER } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    for (const personality of CHARACTER_PERSONALITIES) {
      assert(personality.emotes.length >= 4);
      for (const id of personality.emotes) assert(findGaragePreviewEmote(id, true), `${personality.id}: ${id} exists with or without a bag`);
      const first = personalityEmote(personality.id, undefined, 0);
      assert.notEqual(personalityEmote(personality.id, first, 0), first);
      assert.equal(new Set([0, .3, .6, .99].map(random => personalityEmote(personality.id, undefined, random))).size, 4);
    }
    assert.equal(usesFittedAnimation(characterLook(DEFAULT_CHARACTER)), false);
    assert.equal(usesFittedAnimation(characterLook({ ...DEFAULT_CHARACTER, wardrobe: { set: 'gothic-01', shirt: 'none', waist: 'tucked' } })), true);
    assert(Math.abs(fittedHandTarget([1.5, -.8, .4])[0]) < 1.5);
    assert.deepEqual(fittedHandTarget([1.5, .2, .4]), [1.5, .2, .4], 'raised expressive poses remain unchanged');
    for (const gender of ['female', 'male']) {
      const { scene } = await new GLTFLoader().parseAsync(await readFile(`tests/fixtures/villager-${gender}-rig.json`, 'utf8'), '');
      const full = prepareVillager(scene, { female: gender === 'female' }), fitted = prepareVillager(scene, { female: gender === 'female', fitted: true });
      const hand = model => model.root.getObjectByName('hand_l').getWorldPosition(new Vector3());
      assert(Math.abs(hand(fitted).x) < Math.abs(hand(full).x), `${gender}: fitted idle rests closer to body`);
      const emotes = [...new Map(EMOTE_GROUPS.flatMap(group => emoteCollection(group, false)).map(emote => [emote.id, emote])).values()];
      for (const model of [full, fitted]) {
        const clips = buildEmoteClips(model.root, emotes);
        assert(clips.length >= 180);
        for (const clip of clips) {
          assert(clip.duration > 0);
          for (const track of clip.tracks) assert([...track.values].every(Number.isFinite), `${gender} ${clip.name} has finite poses`);
        }
        const mixer = new AnimationMixer(model.root), resting = hand(model);
        const clip = clips.find(item => item.name.startsWith('010 '));
        const action = mixer.clipAction(clip).play(); mixer.setTime(clip.duration); action.stop();
        assert(hand(model).distanceTo(resting) < 1e-6, 'releasing an emote restores the outfit-specific rest pose');
        model.dispose();
      }
    }
  } finally { await vite.close(); }
});

test('fitted low gestures tuck the elbows without moving the wrist or changing contact poses', async () => {
  const vite = await server();
  try {
    const { prepareVillager } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { fittedHandTarget } = await vite.ssrLoadModule('/src/game/characters/animationFit.ts');
    const low = { id: 'test-low', name: 'Relaxed arms', duration: 1, keys: [[.5, {
      leftHand: [1.38, -.79, .31], rightHand: [-1.38, -.79, .31],
    }]] };
    const lowPose = low.keys[0][1];
    const reference = { ...low, keys: [[.5, {
      leftHand: fittedHandTarget(lowPose.leftHand), rightHand: fittedHandTarget(lowPose.rightHand),
    }]] };
    const clap = findGaragePreviewEmote('013', false);
    const wave = findGaragePreviewEmote('010', false);
    for (const gender of ['female', 'male']) {
      const { scene } = await new GLTFLoader().parseAsync(await readFile(`tests/fixtures/villager-${gender}-rig.json`, 'utf8'), '');
      const model = prepareVillager(scene, { female: gender === 'female', fitted: true });
      const sample = (emote, phase, fitted) => {
        model.root.userData.fittedClothing = fitted;
        const clip = buildEmoteClips(model.root, [emote])[0];
        const mixer = new AnimationMixer(model.root);
        const action = mixer.clipAction(clip).play();
        mixer.setTime(clip.duration * phase);
        const joints = ['l', 'r'].map(side => ['upperarm', 'lowerarm', 'hand'].map(name =>
          model.root.getObjectByName(`${name}_${side}`).getWorldPosition(new Vector3())));
        action.stop();
        return joints;
      };
      const relaxed = sample(low, .5, true);
      const wide = sample(reference, .5, false);
      for (const [side, [shoulder, elbow, wrist]] of relaxed.entries()) {
        assert(Math.abs(wide[side][1].x) - Math.abs(elbow.x) > .045, `${gender}: elbow tucks by at least 4.5 cm`);
        assert(Math.abs(elbow.x) > Math.abs(shoulder.x), `${gender}: elbow remains outside the shoulder line`);
        assert(wide[side][2].distanceTo(wrist) < .00001, `${gender}: wrist target stays fixed`);
      }
      for (const [emote, referenceEmote, phase] of [
        [clap, clap, .26], [wave, wave, .35],
        [{ ...low, prop: 'map' }, { ...reference, prop: 'map' }, .5],
      ]) {
        const fitted = sample(emote, phase, true);
        const original = sample(referenceEmote, phase, false);
        const sides = emote === wave ? [1] : [0, 1];
        for (const side of sides) for (const joint of [1, 2]) {
          assert(fitted[side][joint].distanceTo(original[side][joint]) < .00001,
            `${gender}: ${emote.name} preserves the elbow and wrist`);
        }
      }
      model.dispose();
    }
  } finally { await vite.close(); }
});

test('relaxed hands clear a skirt while the same rig can keep its close trouser pose', async () => {
  const vite = await server();
  try {
    const { prepareVillager } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { buildEmoteClips, garageBreathing } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { scene } = await new GLTFLoader().parseAsync(await readFile('tests/fixtures/villager-female-rig.json', 'utf8'), '');
    const trousers = prepareVillager(scene, { fitted: true });
    const skirt = new Mesh(new BoxGeometry(.56, .20, .21), new MeshStandardMaterial());
    skirt.name = 'CLOTH_BOTTOM_SKIRT';
    skirt.position.y = .86;
    scene.add(skirt);
    const fittedDress = prepareVillager(scene, { fitted: true });
    const fullDress = prepareVillager(scene);
    const sample = model => {
      const { root } = model;
      const mixer = new AnimationMixer(root);
      const [clip] = buildEmoteClips(root, [garageBreathing()]);
      mixer.clipAction(clip).play();
      return [0, .05, .31, .48, .66, .95].map(phase => {
        mixer.setTime(clip.duration * phase);
        return ['l', 'r'].map(side => root.getObjectByName(`hand_${side}`).getWorldPosition(new Vector3()));
      });
    };
    const reference = sample(trousers);
    for (const model of [fittedDress, fullDress]) {
      sample(model).forEach((hands, frame) => hands.forEach((hand, side) => {
        assert(Math.abs(hand.x) > Math.abs(reference[frame][side].x) + .055, 'free wrist stays away from the skirt');
        assert(hand.y < 1.11, 'relaxed hands stay below the bodice');
      }));
      model.dispose();
    }
    trousers.dispose();
    skirt.geometry.dispose();
    skirt.material.dispose();
  } finally { await vite.close(); }
});
