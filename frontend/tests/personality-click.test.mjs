import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

test('character clicks play varied personality clips, resume held poses, and ignore dragging and reduced motion', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true }), original = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let vite, renderer;
  try {
    const { createRoot } = await import('react-dom/client');
    const moduleId = '\0fitting-test-fiber';
    vite = await createServer({ plugins: [{ name: 'frame-test', enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/GarageEmotePlayer.tsx')) return code
          .replaceAll('from "@react-three/fiber"', 'from "virtual:fitting-fiber"')
          .replace('from "./DriverBag"', 'from "virtual:fitting-fiber"');
      },
      resolveId(source, importer) { if (source === 'virtual:fitting-fiber' || (source === '@react-three/fiber' && importer?.endsWith('/GarageEmotePlayer.tsx'))) return moduleId; },
      load(id) { if (id === moduleId) return `import { useLayoutEffect } from 'react'; export const frames = new Set(); export let invalidations = 0;
        export const DriverBag = () => null;
        export function useThree(select) { return select({ invalidate: () => invalidations++ }); }
        export function useFrame(callback) { useLayoutEffect(() => { frames.add(callback); return () => frames.delete(callback); }, [callback]); }`; }
    }], server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const { GarageEmotePlayer } = await vite.ssrLoadModule('/src/game/characters/GarageEmotePlayer.tsx');
    const { frames } = await vite.ssrLoadModule('virtual:fitting-fiber');
    const { useCharacterPreviewStore: preview } = await vite.ssrLoadModule('/src/game/characters/characterPreviewStore.ts');
    const { useFittingTurnStore: turns } = await vite.ssrLoadModule('/src/game/characters/fittingControlsStore.ts');
    const { usePreferencesStore: preferences } = await vite.ssrLoadModule('/src/store/preferences/preferencesStore.ts');
    const rig = await readFile('tests/fixtures/villager-female-rig.json', 'utf8');
    const { scene } = await new GLTFLoader().parseAsync(rig, '');
    scene.name = 'garage-villager-female';
    preferences.setState({ reducedMotion: false }); preview.setState({ playbackPaused: true, automaticEmotes: false, emote: null, insideCar: false });
    turns.setState({ suppressClickUntil: 0 });
    // The DOM only hosts React hooks; the real skeleton, clip compiler and mixer are exercised below.
    const error = console.error; t.mock.method(console, 'error', (...args) => { if (/unrecognized|non-boolean attribute/.test(String(args[0]))) return; error(...args); });
    const baseClips = [], sequenceActions = [];
    const clipAction = AnimationMixer.prototype.clipAction;
    t.mock.method(AnimationMixer.prototype, 'clipAction', function (clip, ...args) {
      if (clip.name.startsWith('002 ')) baseClips.push(clip);
      const action = clipAction.call(this, clip, ...args);
      if (clip.name.startsWith('pose-sequence ')) sequenceActions.push(action);
      return action;
    });
    renderer = createRoot(document.getElementById('root'));
    const render = props => act(async () => renderer.render(h(GarageEmotePlayer, {
      root: scene, previewPacks: true, personality: 'tsundere', ...props,
    })));
    await render();
    const primitive = document.querySelector('primitive');
    const click = delta => {
      const random = Math.random; Math.random = () => 0;
      try { primitive[Object.keys(primitive).find(key => key.startsWith('__reactProps'))].onClick({ delta, stopPropagation() {} }); }
      finally { Math.random = random; }
    };
    const tick = seconds => { for (let n = 0; n < seconds * 60; n++) for (const frame of frames) frame({}, 1 / 60); };
    await act(async () => click(0)); assert.equal(preview.getState().emote.id, '041'); assert.equal(preview.getState().playbackPaused, false);
    assert.equal(frames.size, 1, 'one animation frame callback is registered');
    const shoulder = scene.getObjectByName('upperarm_r'), rest = shoulder.quaternion.clone();
    await act(async () => tick(1)); assert(rest.angleTo(shoulder.quaternion) > .01, 'a personality click produces actual skeletal animation');
    await act(async () => click(0)); assert.equal(preview.getState().emote.id, '042', 'same random input still excludes the last clip');
    const second = preview.getState().emote;
    await act(async () => click(20)); assert.equal(preview.getState().emote, second, 'drag release does not play a clip');
    turns.setState({ suppressClickUntil: performance.now() + 1000 });
    await act(async () => click(0)); assert.equal(preview.getState().emote, second, 'dragging back to the start also suppresses a click');
    turns.setState({ suppressClickUntil: 0 });
    await act(async () => preferences.setState({ reducedMotion: true }));
    await act(async () => click(0)); assert.equal(preview.getState().emote, second);

    await act(async () => preferences.setState({ reducedMotion: false }));
    await act(async () => tick(.5));
    await render({ previewPacks: false });
    assert(rest.angleTo(shoulder.quaternion) < .001, 'leaving wardrobe restores the prepared rig pose');
    await render();
    assert.equal(baseClips.length, 4, 'each playback reset binds the base tracks');
    assert(baseClips.every(clip => clip === baseClips[0]), 'the same rig reuses its compiled tracks across modes');
    assert.equal(frames.size, 1, 'switching modes retains a single frame callback');

    const { scene: replacement } = await new GLTFLoader().parseAsync(rig, '');
    await render({ root: replacement });
    assert.notEqual(baseClips.at(-1), baseClips[0], 'a new rig compiles tracks for its own joints');
    const replacementClip = baseClips.at(-1);
    assert(replacementClip.tracks.some(track => track.name === replacement.uuid + '.position'));
    await render({ root: replacement, bag: true });
    assert.notEqual(baseClips.at(-1), replacementClip, 'the held bag changes the base clip set');

    for (const model of ['female', 'male']) {
      const data = await readFile(`tests/fixtures/villager-${model}-rig.json`, 'utf8');
      const { scene: poseRig } = await new GLTFLoader().parseAsync(data, '');
      poseRig.name = `garage-villager-${model}`;
      const head = poseRig.getObjectByName('head');
      const arm = poseRig.getObjectByName('upperarm_r');
      await render({ root: poseRig });
      const play = emote => preview.setState({ emote, playbackPaused: false });
      play({ id: 'pose-attentive' });
      tick(2);
      const start = head.quaternion.clone(), restingArm = arm.quaternion.clone();
      play({ id: 'pose-weight-shift' });
      tick(2);
      const end = head.quaternion.clone();
      assert(start.angleTo(end) > .05, `${model}: standalone poses are distinct`);

      const sequence = { id: 'pose-sequence', sequence: { from: 'pose-attentive', motion: '010', to: 'pose-weight-shift' } };
      play(sequence);
      tick(1.3); // release the previous hold, then settle into the start pose
      assert(head.quaternion.angleTo(start) < .001, `${model}: sequence holds the selected start`);
      tick(1.2);
      assert(arm.quaternion.angleTo(restingArm) > .1, `${model}: the wave moves the arm between poses`);
      tick(3);
      assert(head.quaternion.angleTo(end) < .001, `${model}: sequence stays at the selected end`);

      play({ ...sequence, sequence: { ...sequence.sequence, to: 'pose-attentive' } });
      tick(5);
      assert(head.quaternion.angleTo(start) < .001, `${model}: replay uses the new endpoint`);
      play(sequence);
      tick(.1);
      assert(sequenceActions.at(-1).time > .9 && sequenceActions.at(-1).getEffectiveWeight() === 1,
        `${model}: continuing from a matching hold immediately plays the transition at full weight`);
      play(null);
      tick(1);
      assert(head.quaternion.angleTo(start) > .05, `${model}: returning to idle releases the hold`);
    }
  } finally {
    if (renderer) await act(async () => renderer.unmount()); await vite?.close(); dom.window.close();
    for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
