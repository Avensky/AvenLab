import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, extend } from '@react-three/fiber';
import { act, createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { createServer } from 'vite';

const showroom = '/fixtures/brz-showroom.glb';
const surfaces = 'virtual:heroes-vehicle-loading';

function controlledAssets() {
  const entries = new Map();
  function read(url) {
    let entry = entries.get(url);
    if (!entry) {
      const { promise, resolve } = Promise.withResolvers();
      entry = { promise, resolve };
      entries.set(url, entry);
    }
    if (entry.error) throw entry.error;
    if (!entry.result) throw entry.promise;
    return entry.result;
  }
  return {
    read,
    requests: () => [...entries.keys()],
    scene: url => entries.get(url).result.scene,
    settle(url, error) {
      const entry = entries.get(url);
      assert(entry, 'requested ' + url);
      if (error) entry.error = error;
      else {
        const scene = new THREE.Group();
        scene.name = url;
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardMaterial({ map: new THREE.Texture() })));
        entry.result = { scene };
      }
      entry.resolve();
    },
  };
}

// Render the production routing, Suspense boundaries, and car in R3F. Other
// garage art would make these request-order tests depend on installed GLBs.
function stageFixture() {
  const unrelated = ['GarageDriver', 'GarageEnvironment', 'PreviewTurntable', 'FittingMirrorDisplay', 'PreviewLoadingSeal'];
  return {
    name: 'heroes-vehicle-loading-fixture', enforce: 'pre',
    transform(source, id) {
      if (id.endsWith('/VehiclePreview.tsx')) {
        return source.replace(/from "([^"]+)"/g, (original, path) =>
          path === '@react-three/drei' || unrelated.includes(path.split('/').at(-1)) ? 'from "' + surfaces + '"' : original);
      }
      if (id.endsWith('/StagedVehiclePreviewModel.tsx') || id.endsWith('/VehiclePreviewModel.tsx'))
        return source.replace(/from ["']@react-three\/drei["']/g, 'from "' + surfaces + '"');
    },
    resolveId(id) { if (id === surfaces) return '\0' + surfaces; },
    load(id) {
      if (id === '\0' + surfaces) return `
        import { createElement, useLayoutEffect } from 'react';
        let load;
        export const setLoader = value => { load = value; };
        export const useGLTF = path => load(path);
        export const Html = () => createElement('group', { name: 'missing-car' });
        export const GarageDriver = () => null, PerspectiveCamera = () => null;
        export const FittingMirrorDisplay = () => null, PreviewLoadingStatus = () => null;
        export const PreviewTurntable = ({ children, onReady }) => createElement('group', { ref: onReady }, children);
        export const GarageEnvironment = ({ onSettled }) => {
          useLayoutEffect(() => onSettled(), [onSettled]);
          return null;
        };
      `;
    },
  };
}

test('Heroes loads the showroom car first and keeps vehicle interactions on the detailed model', async t => {
  const dom = new JSDOM('<canvas></canvas>', { url: 'http://localhost', pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let renderer, vite, store;
  try {
    vite = await createServer({ appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, ws: false }, plugins: [stageFixture()],
      define: { __HEROES_VEHICLE_PREVIEWS__: JSON.stringify({ brz: showroom }) },
    });
    const load = path => vite.ssrLoadModule('/src/' + path);
    const { VehiclePreview } = await load('game/preview/VehiclePreview.tsx');
    const { useVehicleStudioStore: studio } = await load('game/heroes/vehicleStudioStore.ts');
    const { useAlphaStore: alpha } = await load('store/alpha/alphaStore.ts');
    const { vehicleModelUrl } = await load('vehicles/assetCatalog.ts');
    const { setLoader } = await vite.ssrLoadModule(surfaces);
    const full = vehicleModelUrl('brz'), camaro = vehicleModelUrl('camaro');
    extend(THREE);
    renderer = createRoot(document.querySelector('canvas'));
    await renderer.configure({ frameloop: 'never', size: { width: 960, height: 540, top: 0, left: 0 },
      gl: { render() {}, setSize() {}, setPixelRatio() {}, getPixelRatio: () => 1 } });

    let assets, session = 0;
    const render = (props = {}) => act(async () => {
      store = renderer.render(h(VehiclePreview, { key: session, previewScreen: 'heroes', awaitingHero: true, ...props }));
    });
    const fresh = async () => {
      await act(async () => renderer.render(null));
      assets = controlledAssets();
      setLoader(assets.read);
      session++;
      alpha.getState().preview('brz');
      studio.getState().setActiveTab(null);
    };
    const settle = (url, error) => act(async () => assets.settle(url, error));
    const visibleCar = () => {
      let visible;
      store.getState().scene.traverseVisible(object => { if (assets.requests().includes(object.name)) visible = object; });
      return visible;
    };
    const garage = () => act(async () => studio.getState().setActiveTab('body'));

    await t.test('Appearance reuses the roster car and Emotes promotes it without a blank or a later downgrade', async () => {
      await fresh(); await render();
      assert.deepEqual(assets.requests(), [showroom]);
      await settle(showroom);
      const car = visibleCar();
      const source = assets.scene(showroom).children[0];
      let geometryDisposals = 0, textureDisposals = 0;
      source.geometry.addEventListener('dispose', () => geometryDisposals++);
      source.material.map.addEventListener('dispose', () => textureDisposals++);
      assert.equal(car?.name, showroom);
      await render({ wardrobeOpen: true, characterOnly: true, fittingRoom: true });
      assert.deepEqual(assets.requests(), [showroom]);
      assert.equal(visibleCar(), undefined, 'Appearance detaches the car');
      assert.deepEqual([geometryDisposals, textureDisposals], [0, 0]);
      await render({ wardrobeOpen: true });
      assert.deepEqual(assets.requests(), [showroom, full]);
      assert.equal(visibleCar(), car, 'the same showroom car stays visible while detailed Emotes loads');
      await settle(full);
      const detailed = visibleCar();
      assert.equal(detailed?.name, full);
      assert.deepEqual([geometryDisposals, textureDisposals], [1, 1], 'release the showroom GPU resources after promotion');
      await render();
      assert.equal(visibleCar(), detailed);
      await garage();
      assert.equal(visibleCar(), detailed);
      assert.deepEqual(assets.requests(), [showroom, full]);
    });

    await t.test('a late Garage upgrade cannot replace a different selected hero', async () => {
      await fresh(); await render(); await settle(showroom);
      await garage();
      assert.equal(visibleCar()?.name, showroom);
      assert.deepEqual(assets.requests(), [showroom, full]);
      await act(async () => alpha.getState().preview('camaro'));
      await settle(camaro);
      const chosen = visibleCar();
      assert.equal(chosen?.name, camaro);
      await settle(full);
      assert.equal(visibleCar(), chosen);
    });

    await t.test('unavailable showroom falls back to the full asset', async () => {
      await fresh(); await render();
      await settle(showroom, Error('Fixture showroom is unavailable'));
      assert.deepEqual(assets.requests(), [showroom, full]);
      await settle(full);
      assert.equal(visibleCar()?.name, full);
    });

    await t.test('opening Garage or Emotes directly uses the full car on the first request', async () => {
      for (const entry of ['garage', 'emotes']) {
        await fresh();
        if (entry === 'garage') await garage();
        await render({ wardrobeOpen: entry === 'emotes' });
        assert.deepEqual(assets.requests(), [full]);
        await settle(full);
        assert.equal(visibleCar()?.name, full);
      }
    });

    await t.test('a failed detailed request leaves the roster car usable when going back', async () => {
      await fresh(); await render(); await settle(showroom);
      const car = visibleCar();
      await garage();
      await settle(full, Error('Fixture detailed car is unavailable'));
      assert.equal(visibleCar(), car);
      assert.equal(studio.getState().availableVehicle, null);
      await act(async () => studio.getState().setActiveTab(null));
      assert.equal(visibleCar(), car);
      assert.equal(store.getState().scene.getObjectByName('missing-car'), undefined);
    });

    await t.test('Play and Sandbox request the detailed car directly', async () => {
      for (const previewScreen of ['hero_select', 'sandbox_setup']) {
        await fresh(); await render({ previewScreen });
        assert.deepEqual(assets.requests(), [full], previewScreen);
        await settle(full);
        assert.equal(visibleCar()?.name, full);
      }
    });
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
