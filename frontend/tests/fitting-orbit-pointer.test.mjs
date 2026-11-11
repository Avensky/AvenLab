import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoot, events, extend } from '@react-three/fiber';
import { JSDOM } from 'jsdom';
import { act, createElement as h, Fragment } from 'react';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry } from 'three';
import { createServer } from 'vite';

test('background mouse and touch drags orbit, while a direct mouse hit turns the model', async () => {
  const dom = new JSDOM('<canvas></canvas>', { url: 'http://localhost/', pretendToBeVisual: true });
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
    let store;
    await act(async () => {
      store = root.render(h(Fragment, null,
        h('primitive', { object: camera }, h(FittingCameraOrbit, { onDrag: (x, y) => deltas.push([x, y]) })),
        h(CharacterTurntable, { enabled: true }, h('mesh', null,
          h('boxGeometry', { args: [1, 1, 1] }), h('meshBasicMaterial')))));
    });
    store.getState().scene.updateMatrixWorld(true);

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

    pointer('pointerdown', 4, 100, 100);
    pointer('pointermove', 4, 113, 100);
    pointer('pointerup', 4, 113, 100);
    assert.equal(deltas.length, 3, 'a near model hit takes precedence over the orbit surface');
    assert(useFittingTurnStore.getState().characterYaw > 0);
    assert.equal(useFittingTurnStore.getState().dragging, false);
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
