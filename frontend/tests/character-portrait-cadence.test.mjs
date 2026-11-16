import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

test('character portraits wait for a quiet main menu and reuse unchanged portraits', { timeout: 20000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const previous = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage,
    WebGLRenderingContext: class {}, WebGL2RenderingContext: class {}, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  let time = 0, serial = 0;
  const previousNow = Object.getOwnPropertyDescriptor(performance, 'now');
  Object.defineProperty(performance, 'now', { value: () => time, configurable: true });
  const timers = new Map(), idle = new Map(), idleOptions = [];
  window.setTimeout = (callback, delay = 0, ...args) => {
    timers.set(++serial, { due: time + delay, callback: () => callback(...args) });
    return serial;
  };
  window.clearTimeout = id => timers.delete(id);
  window.requestIdleCallback = (callback, options) => {
    idleOptions.push(options);
    idle.set(++serial, callback);
    return serial;
  };
  window.cancelIdleCallback = id => idle.delete(id);
  const advance = ms => {
    const end = time + ms;
    while (true) {
      const next = [...timers].filter(([, job]) => job.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, job] = next;
      timers.delete(id);
      time = job.due;
      job.callback();
    }
    time = end;
  };
  const runIdle = () => {
    for (const id of [...idle.keys()]) {
      const callback = idle.get(id);
      if (!callback) continue;
      idle.delete(id);
      callback({ didTimeout: false, timeRemaining: () => 50 });
    }
  };

  const bakeMock = 'virtual:character-portrait-bake-probe';
  const loaderMock = 'virtual:character-portrait-loader-probe';
  const modelMock = 'virtual:character-portrait-model-probe';
  const modules = new Set([bakeMock, loaderMock, modelMock]);
  let vite, root;
  try {
    vite = await createServer({
      cacheDir: 'node_modules/.vite-character-portrait-cadence',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'custom', logLevel: 'error',
      plugins: [{
        name: 'character-portrait-probe', enforce: 'pre',
        transform(source, id) {
          if (!id.endsWith('/game/characters/CharacterPortrait.tsx')) return;
          return source.replaceAll('"./bakeCharacterPortrait"', JSON.stringify(bakeMock))
            .replaceAll('"@react-three/drei"', JSON.stringify(loaderMock))
            .replaceAll('"./villagerModel"', JSON.stringify(modelMock));
        },
        resolveId(id) { if (modules.has(id)) return '\0' + id; },
        load(id) {
          if (id === '\0' + bakeMock) return `
            const images = new Map(), listeners = new Set();
            export const bakes = [];
            export const peekCharacterPortrait = key => images.get(key) ?? null;
            export function subscribeCharacterPortrait(listener) {
              listeners.add(listener);
              return () => listeners.delete(listener);
            }
            export async function bakeCharacterPortrait(look, key) {
              bakes.push({ key, hair: look.appearance.hair_color });
              const image = 'data:image/webp;base64,' + btoa(String(bakes.length));
              images.set(key, image);
              listeners.forEach(listener => listener());
              return image;
            }
          `;
          if (id === '\0' + loaderMock) return `
            const scene = { name: 'character-portrait-test-scene' };
            export const preloads = [], loads = [];
            export function useGLTF(url) {
              loads.push(url);
              return { scene };
            }
            useGLTF.preload = url => preloads.push(url);
          `;
          if (id === '\0' + modelMock) return 'export const villagerModelUrl = () => "/character-portrait-test.glb";';
        },
      }],
    });
    const { CharacterPortrait } = await vite.ssrLoadModule('/src/game/characters/CharacterPortrait.tsx');
    const { DEFAULT_CHARACTER, characterAppearance } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { useUIStore: ui } = await vite.ssrLoadModule('/src/store/menus/uiStore.ts');
    const baker = await vite.ssrLoadModule(bakeMock);
    const loader = await vite.ssrLoadModule(loaderMock);
    const choice = { ...DEFAULT_CHARACTER, appearance: characterAppearance(DEFAULT_CHARACTER) };
    const equivalent = { ...choice, appearance: { ...choice.appearance } };
    root = createRoot(document.getElementById('root'));
    const render = value => act(async () => root.render(value && h(CharacterPortrait, { choice: value, compact: true })));
    const screen = (screen, overlay = null, isModeLoading = false) => act(async () => ui.setState({ screen, overlay, isModeLoading }));
    const step = ms => act(async () => { advance(ms); runIdle(); });
    const settled = async () => {
      for (let phase = 0; phase < 4; phase++) await step(900);
    };
    const image = () => document.querySelector('img.character-portrait')?.getAttribute('src');

    await screen('world_builder');
    await render(choice);
    await settled();
    assert.deepEqual([loader.preloads.length, loader.loads.length, baker.bakes.length], [0, 0, 0],
      'fitting room never loads or bakes a portrait on a miss');

    await screen('main', null, true);
    await settled();
    assert.equal(baker.bakes.length, 0, 'a pending mode transition does not permit a bake');
    await screen('main');
    await step(850);
    assert.equal(loader.preloads.length + loader.loads.length, 0, 'entering the main menu starts a quiet period');
    await act(async () => document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 })));
    await step(899);
    assert.equal(loader.preloads.length + loader.loads.length, 0, 'recent input resets the quiet period');

    await act(async () => window.dispatchEvent(new window.CustomEvent('avenlab:main-menu-action', { detail: 'down' })));
    await step(899);
    assert.equal(idle.size, 0, 'controller navigation resets the quiet period too');
    await act(async () => advance(1));
    assert.ok(idle.size > 0, 'the settled job waits for a browser idle callback');
    assert.ok(idleOptions.every(options => options?.timeout === undefined), 'idle work is never forced by a deadline');
    await screen('mode_select');
    await settled();
    assert.deepEqual([loader.preloads.length, loader.loads.length, baker.bakes.length], [0, 0, 0],
      'navigation cancels an already idle-queued portrait');

    await screen('main');
    await step(900);
    assert.ok(loader.loads.length > 0, 'a quiet main menu can load the portrait model');
    await step(850);
    await render(equivalent);
    assert.equal(baker.bakes.length, 0);
    await step(50);
    assert.equal(baker.bakes.length, 1, 'an eligible, quiet menu creates one portrait');
    const cached = image();
    assert.ok(cached?.startsWith('data:image/webp'));
    await render({ ...choice, appearance: { ...choice.appearance, personality: 'tsundere', animation_fit: 'original' } });
    await settled();
    assert.equal(baker.bakes.length, 1, 'nonvisual settings and equivalent object updates reuse the portrait');
    assert.equal(image(), cached);

    await screen('sandbox');
    await render(null);
    const requestsBeforeRemount = loader.preloads.length + loader.loads.length;
    await render(choice);
    assert.equal(image(), cached, 'a new header instance paints the cached image immediately');
    await settled();
    assert.equal(loader.preloads.length + loader.loads.length, requestsBeforeRemount, 'a cache hit never reloads model assets');
    assert.equal(baker.bakes.length, 1);

    const dyed = { ...choice, appearance: { ...choice.appearance, hair_color: 'espresso' } };
    await render(dyed);
    await settled();
    assert.equal(baker.bakes.length, 1, 'even a visual edit must wait while gameplay is active');
    await screen('main');
    await act(async () => advance(900));
    assert.ok(idle.size > 0, 'a visual edit queues idle work when the main menu returns');
    const setVisibility = value => act(async () => {
      Object.defineProperty(document, 'visibilityState', { value, configurable: true });
      document.dispatchEvent(new window.Event('visibilitychange'));
    });
    await setVisibility('hidden');
    assert.equal(idle.size, 0, 'hiding the tab cancels already queued idle work');
    await settled();
    assert.equal(baker.bakes.length, 1, 'a hidden menu cannot bake the new look');
    await setVisibility('visible');
    await step(899);
    assert.equal(baker.bakes.length, 1, 'returning to a visible menu requires a new quiet period');
    await settled();
    assert.equal(baker.bakes.length, 2, 'a new visual appearance updates after returning to a quiet menu');
    assert.equal(baker.bakes[1].hair, 'espresso');
    assert.notEqual(image(), cached);
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    if (previousNow) Object.defineProperty(performance, 'now', previousNow);
    else delete performance.now;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
