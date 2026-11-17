import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, events, extend } from '@react-three/fiber';
import { JSDOM } from 'jsdom';
import { act, createElement as h, Fragment } from 'react';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry } from 'three';
import { createServer } from 'vite';

test('background mouse and touch drags orbit, while a direct mouse hit turns the model', async () => {
  const dom = new JSDOM('<div id="preview"><canvas></canvas></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const globals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const canvas = document.querySelector('canvas'), captured = new Set();
  canvas.setPointerCapture = id => captured.add(id);
  canvas.hasPointerCapture = id => captured.has(id);
  canvas.releasePointerCapture = id => captured.delete(id);
  const pointer = (type, pointerId, clientX, clientY, pointerType = 'mouse') => canvas.dispatchEvent(
    new dom.window.PointerEvent(type, { bubbles: true, pointerId, clientX, clientY, pointerType }),
  );
  let vite, root;
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const { FittingCameraOrbit } = await vite.ssrLoadModule('/src/game/characters/FittingCameraOrbit.tsx');
    const { CharacterTurntable } = await vite.ssrLoadModule('/src/game/characters/CharacterTurntable.tsx');
    const { useFittingTurnStore } = await vite.ssrLoadModule('/src/game/characters/fittingControlsStore.ts');
    extend({ BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry });
    const camera = new PerspectiveCamera(45, 1, .1, 100);
    camera.position.z = 4;
    root = createRoot(canvas);
    await root.configure({ events, camera, frameloop: 'never', size: { width: 200, height: 200, top: 0, left: 0 },
      gl: { render() {}, setSize() {}, setPixelRatio() {} } });
    const deltas = [];
    let store, clicks = 0;
    const render = (enabled) => act(async () => {
      store = root.render(h(Fragment, null,
        h('primitive', { object: camera }, h(FittingCameraOrbit, { onDrag: (x, y) => deltas.push([x, y]) })),
        h(CharacterTurntable, { enabled }, h('mesh', { name: 'test-driver', onClick: () => { clicks++; } },
          h('boxGeometry', { args: [1, 1, 1] }), h('meshBasicMaterial')))));
    });
    await render(true);
    store.getState().scene.updateMatrixWorld(true);
    const driver = store.getState().scene.getObjectByName('test-driver');
    const raycast = driver.raycast;
    let driverRaycasts = 0;
    driver.raycast = function (...args) {
      driverRaycasts++;
      return raycast.apply(this, args);
    };

    for (let x = 50; x < 150; x++) pointer('pointermove', 1, x, 100);
    assert.equal(driverRaycasts, 0, 'passive hovering never intersects the actor');

    pointer('pointerdown', 1, 20, 25);
    assert(captured.has(1));
    pointer('pointermove', 1, 35, 33);
    pointer('pointerup', 1, 35, 33);
    assert(!captured.has(1));
    assert.deepEqual(deltas, [[15, 8]]);
    assert.equal(useFittingTurnStore.getState().characterYaw, 0);

    pointer('pointerdown', 2, 20, 25, 'touch');
    pointer('pointermove', 2, 28, 39, 'touch');
    pointer('pointercancel', 2, 28, 39, 'touch');
    pointer('pointermove', 2, 50, 50, 'touch');
    assert.deepEqual(deltas, [[15, 8], [8, 14]], 'cancelled touches stop feeding the camera');

    pointer('pointerdown', 3, 20, 25);
    pointer('pointermove', 3, 26, 33);
    captured.delete(3);
    pointer('lostpointercapture', 3, 26, 33);
    pointer('pointermove', 3, 50, 50);
    assert.deepEqual(deltas, [[15, 8], [8, 14], [6, 8]], 'losing capture ends the drag');

    await act(async () => store.getState().events.connect(document.getElementById('preview')));
    driverRaycasts = 0;
    pointer('pointerdown', 4, 100, 100);
    assert(driverRaycasts > 0, 'the initial drag uses exact mesh picking');
    assert(captured.has(4));
    driverRaycasts = 0;
    for (let x = 101; x <= 200; x++) pointer('pointermove', 4, x, 100);
    assert.equal(driverRaycasts, 0, 'dragging off the model uses the captured pointer');
    pointer('pointerup', 4, 200, 100);
    assert.equal(deltas.length, 3, 'a near model hit takes precedence over the orbit surface');
    assert(Math.abs(useFittingTurnStore.getState().characterYaw - .8) < 1e-9);
    assert.equal(useFittingTurnStore.getState().dragging, false);
    assert(useFittingTurnStore.getState().suppressClickUntil > performance.now());
    assert(!captured.has(4));

    pointer('pointerdown', 5, 100, 100);
    pointer('pointerup', 5, 100, 100);
    pointer('click', 5, 100, 100);
    assert.equal(clicks, 1, 'a tap still reaches the actor click handler');
    assert.equal(useFittingTurnStore.getState().suppressClickUntil, 0);

    for (const end of ['pointercancel', 'lostpointercapture']) {
      pointer('pointerdown', 6, 100, 100);
      const yaw = useFittingTurnStore.getState().characterYaw;
      pointer('pointermove', 99, 145, 100);
      assert.equal(useFittingTurnStore.getState().characterYaw, yaw, 'other pointer IDs cannot turn the actor');
      if (end === 'lostpointercapture') captured.delete(6);
      pointer(end, 6, 101, 100);
      pointer('pointermove', 6, 135, 100);
      assert.equal(useFittingTurnStore.getState().characterYaw, yaw);
      assert.equal(useFittingTurnStore.getState().dragging, false);
      assert(!captured.has(6));
    }

    pointer('pointerdown', 7, 100, 100);
    assert(captured.has(7));
    await render(false);
    assert(!captured.has(7), 'switching away releases the active character drag');
    assert.equal(useFittingTurnStore.getState().dragging, false);
    driverRaycasts = 0;
    pointer('pointermove', 7, 120, 100);
    assert.equal(driverRaycasts, 0, 'a disabled turntable ignores hovering');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
