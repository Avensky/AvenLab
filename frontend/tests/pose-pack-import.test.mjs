import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { AnimationMixer, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

test('every MakeHuman pose can be held and sequenced by both character rigs', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { CHARACTER_POSE_GROUPS, POSE_SEQUENCE_ID, posePackEmote } = await vite.ssrLoadModule('/src/game/characters/posePack.ts');
    const { buildEmoteClips } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const imported = CHARACTER_POSE_GROUPS.slice(1);
    assert.deepEqual(imported.map(group => group.poses.length), [17, 18, 23, 36, 13, 10]);
    const poses = imported.flatMap(group => group.poses);
    assert.equal(new Set(poses.map(pose => pose.id)).size, 117);

    for (const model of ['female', 'male']) {
      const data = await readFile(`tests/fixtures/villager-${model}-rig.json`, 'utf8');
      const { scene } = await new GLTFLoader().parseAsync(data, '');
      scene.userData.fittedClothing = true;
      const relaxed = posePackEmote('pose-mh-poses03-callharvey3d_standingnatural');
      const salute = posePackEmote('pose-mh-poses03-callharvey3d_salute');
      assert(Math.abs(relaxed.keys[0][1].rise) < .05 && Math.abs(salute.keys[0][1].rise) < .05,
        'absolute-offset exports must keep standing poses near the floor');
      const mixer = new AnimationMixer(scene);
      const wristAt = (emote, room, side) => {
        scene.userData.skirtHandRoom = room;
        const [clip] = buildEmoteClips(scene, [emote]);
        mixer.clipAction(clip).play();
        mixer.update(0);
        const position = scene.worldToLocal(scene.getObjectByName('hand_' + side).getWorldPosition(new Vector3()));
        mixer.uncacheAction(clip);
        return position;
      };
      const rooms = [undefined, 0, .06, .12];
      const spreads = rooms.map(room => wristAt(relaxed, room, 'l').x);
      assert(spreads.every((spread, index) => index === 0 || spread - spreads[index - 1] > .01),
        `${model}: the lowered palm-oriented wrist opens progressively with skirt room`);
      assert(wristAt(salute, 0, 'r').distanceTo(wristAt(salute, .12, 'r')) < .0001,
        `${model}: higher clearance leaves the raised salute wrist in place`);

      for (const [index, pose] of poses.entries()) {
        const next = poses[(index + 1) % poses.length];
        const [hold, sequence] = buildEmoteClips(scene, [
          posePackEmote(pose.id), posePackEmote(POSE_SEQUENCE_ID, { from: pose.id, motion: '010', to: next.id }),
        ]);
        for (const clip of [hold, sequence]) {
          assert(clip.validate(), `${model}: ${pose.id} compiles to a supported clip`);
          assert(clip.tracks.every(track => track.values.every(Number.isFinite)), `${model}: ${pose.id} yields finite joints`);
        }
        const start = new Map(sequence.tracks.map(track => [track.name, track]));
        for (const track of hold.tracks) {
          const stride = track.getValueSize();
          assert.deepEqual(start.get(track.name).values.slice(0, stride), track.values.slice(0, stride),
            `${model}: ${pose.id} has the same pose at the start of a sequence`);
        }
      }
    }
  } finally {
    await vite.close();
  }
});
