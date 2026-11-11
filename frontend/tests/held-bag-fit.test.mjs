import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AnimationMixer, Group, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

test('the bag follows the animated grip and hangs down in world space', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { createHeldBagFit } = await vite.ssrLoadModule('/src/game/characters/heldBagFit.ts');
    const { prepareVillager } = await vite.ssrLoadModule('/src/game/characters/villagerModel.ts');
    const { buildEmoteClips, findGaragePreviewEmote } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { scene } = await new GLTFLoader().parseAsync(await readFile('tests/fixtures/villager-female-rig.json', 'utf8'), '');
    const model = prepareVillager(scene, { female: true, bag: true });
    const grip = model.root.getObjectByName('middle_01_l');
    const holder = new Group(), stand = new Group();
    const fit = createHeldBagFit(model.root);
    assert(fit);
    stand.add(model.root, holder);
    stand.position.set(1, .2, -2);
    stand.rotation.set(.19, -.7, .23);
    stand.scale.setScalar(.85);

    const mixer = new AnimationMixer(model.root);
    for (const id of ['001', 'bag-lift', 'bag-check']) {
      const [clip] = buildEmoteClips(model.root, [findGaragePreviewEmote(id, true)]);
      const action = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
      const headings = [];
      for (const phase of [0, .3, .55, .75]) {
        mixer.setTime(phase * clip.duration);
        const pose = model.root.getObjectByName('foot_l').getWorldPosition(new Vector3());
        fit(holder);
        assert(holder.getWorldPosition(new Vector3()).distanceTo(grip.getWorldPosition(new Vector3())) < 1e-7);
        const angle = holder.getWorldQuaternion(new Quaternion());
        assert(new Vector3(0, -1, 0).applyQuaternion(angle).y < -.94, 'the bag body stays below its grip');
        assert(model.root.getObjectByName('foot_l').getWorldPosition(new Vector3()).distanceTo(pose) < 1e-7);
        headings.push(new Vector3(0, 0, 1).applyQuaternion(angle).setY(0).normalize());
      }
      if (id === 'bag-lift') assert(headings[0].dot(headings[2]) < .85, 'the lifted bag follows the wrist heading');
      action.stop();
    }
    mixer.uncacheRoot(model.root);
    model.dispose();

    const simpleDriver = new Group(), hand = new Group();
    hand.name = 'hand_l';
    hand.position.set(.25, .9, .16);
    simpleDriver.add(hand);
    stand.add(simpleDriver);
    createHeldBagFit(simpleDriver)(holder);
    assert(holder.getWorldPosition(new Vector3()).distanceTo(hand.getWorldPosition(new Vector3())) < 1e-7);
    assert(new Vector3(0, -1, 0).applyQuaternion(holder.getWorldQuaternion(new Quaternion())).y < -.94);
  } finally { await vite.close(); }
});
