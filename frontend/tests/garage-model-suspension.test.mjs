import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, extend } from '@react-three/fiber';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';
import * as THREE from 'three';
import { createServer } from 'vite';

test('the fitting room detaches the car and resumes the same garage model and reveal', async () => {
  const dom = new JSDOM('<canvas></canvas>', { url: 'http://localhost/' });
  const original = new Map(), frames = new Map();
  let nextFrame = 0;
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: cb => (frames.set(++nextFrame, cb), nextFrame), cancelAnimationFrame: id => frames.delete(id),
  })) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const motion = { current: new THREE.Group() };
  const driver = { id: 'mara-vega', outfit: 'dockwear' };
  const platform = [6, 6];
  let fit, renderer, vite, store;
  const onDriverFit = value => { fit = value; };
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
      plugins: [{
        name: 'garage-model-test-asset', enforce: 'pre',
        transform(source, id) {
          if (id.endsWith('/VehiclePreviewModel.tsx')) return source.replace('@react-three/drei', 'virtual:garage-model-test-asset');
        },
        resolveId(id) { if (id === 'virtual:garage-model-test-asset') return '\0garage-model-test-asset'; },
        load(id) {
          if (id === '\0garage-model-test-asset') return `
            import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
            const scene = new Group(), chassis = new Mesh(new BoxGeometry(2, 1, 4), new MeshStandardMaterial());
            scene.name = 'test-car'; chassis.position.y = .5; scene.add(chassis);
            export const useGLTF = () => ({ scene });
          `;
        },
      }],
    });
    const { VehiclePreviewModel } = await vite.ssrLoadModule('/src/game/preview/VehiclePreviewModel.tsx');
    extend(THREE);
    renderer = createRoot(document.querySelector('canvas'));
    await renderer.configure({ frameloop: 'never', size: { width: 200, height: 200, top: 0, left: 0 },
      gl: { render() {}, setSize() {}, setPixelRatio() {}, getPixelRatio: () => 1 } });
    const render = active => act(async () => {
      store = renderer.render(h('primitive', { object: motion.current }, h(VehiclePreviewModel, {
        platform, model: 'brz', driver, onDriverFit, motion, active, summon: true, garageOpen: true, diagnostics: false,
      })));
    });
    const paint = () => act(async () => {
      const queued = [...frames.values()];
      frames.clear();
      for (const callback of queued) callback(performance.now());
    });
    let timestamp = 0;
    const step = (count = 1) => act(async () => {
      for (let i = 0; i < count; i++) store.getState().advance(timestamp += .05, false);
    });

    await render(true);
    await paint(); await paint();
    await step(7);
    const scene = store.getState().scene;
    const mounted = scene.getObjectByName('selection-vehicle-glb');
    const car = mounted.children[0], reveal = mounted.parent;
    let disposals = 0;
    car.children[0].material.addEventListener('dispose', () => disposals++);
    const cockpitAnchor = scene.getObjectByName('garage-view-Cockpit');
    const scale = reveal.scale.x;
    assert(scale > .001 && scale < 1);
    assert.equal(fit?.cockpit, undefined, 'the cockpit waits for the reveal');

    await render(false);
    await step(12);
    assert.equal(car.parent, null, 'the hidden car leaves the scene graph');
    assert.equal(reveal.scale.x, scale, 'the unfinished reveal stays paused');
    assert.equal(scene.getObjectByName('garage-view-Cockpit'), cockpitAnchor);

    await render(true);
    assert.equal(mounted.children[0], car, 'reentry reattaches the prepared car');
    await step();
    assert(reveal.scale.x > scale, 'the reveal resumes from the same progress');
    await step(20);
    assert.equal(reveal.scale.x, 1);
    const cockpit = fit?.cockpit;
    assert.equal(typeof cockpit, 'function');
    await render(false);
    await render(true);
    assert.equal(fit.cockpit, cockpit, 'the existing cockpit callback still owns the restored car');
    assert.equal(scene.getObjectByName('garage-view-Cockpit'), cockpitAnchor);
    assert.equal(disposals, 0, 'hiding the car leaves its materials ready to reuse');
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
