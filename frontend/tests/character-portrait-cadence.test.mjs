import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { DefaultLoadingManager } from 'three';

const serverOptions = {
  configFile: false,
  define: {
    __VILLAGER_PORTRAIT_URL__: JSON.stringify('/character-portrait-test/vega.glb'),
    __CHARACTER_MODEL_FALLBACKS__: JSON.stringify({ 'http://localhost/packed.gltf': 'http://localhost/cut-driver.gltf' }),
    __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(['linen-nightgown']),
    __DRESSING_ROOM_MOBILE_IDS__: JSON.stringify(['linen-nightgown']),
    __DRESSING_ROOM_REVISION_IDS__: '[]',
    __WARDROBE_SET_IDS__: '[]',
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
};

function installGlobals(values) {
  const originals = Object.entries(values).map(([key, value]) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    return [key, original];
  });
  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

test('portraits create one background job for each quiet, visible main-menu request', { timeout: 20000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const workers = [], mainRequests = [];
  class FakeWorker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      workers.push(this);
    }
    postMessage(input) { this.input = structuredClone(input); }
    terminate() { this.terminated = true; }
    finish() { this.onmessage({ data: { image: new Blob(['test portrait'], { type: 'image/webp' }) } }); }
  }
  const restore = installGlobals({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage,
    Worker: FakeWorker, OffscreenCanvas: class {}, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async url => { mainRequests.push(url); throw Error('Unexpected main-thread portrait fetch'); },
  });

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
    for (const [id, callback] of [...idle]) {
      if (!idle.delete(id)) continue;
      callback({ didTimeout: false, timeRemaining: () => 50 });
    }
  };

  let vite, root;
  try {
    vite = await createServer({
      ...serverOptions,
      cacheDir: 'node_modules/.vite-character-portrait-cadence',
    });
    const { CharacterPortrait } = await vite.ssrLoadModule('/src/game/characters/CharacterPortrait.tsx');
    const { DEFAULT_CHARACTER, characterAppearance } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { useUIStore: ui } = await vite.ssrLoadModule('/src/store/menus/uiStore.ts');
    const choice = { ...DEFAULT_CHARACTER, appearance: characterAppearance(DEFAULT_CHARACTER) };
    const equivalent = { ...choice, appearance: { ...choice.appearance } };
    root = createRoot(document.getElementById('root'));
    const render = (...values) => act(async () => root.render(values.map((value, key) =>
      h(CharacterPortrait, { choice: value, compact: true, key }))));
    const screen = (screen, overlay = null, isModeLoading = false) => act(async () => ui.setState({ screen, overlay, isModeLoading }));
    const step = ms => act(async () => { advance(ms); runIdle(); });
    const image = () => document.querySelector('img.character-portrait')?.getAttribute('src');
    const finish = worker => act(async () => worker.finish());
    const setVisibility = value => act(async () => {
      Object.defineProperty(document, 'visibilityState', { value, configurable: true });
      document.dispatchEvent(new window.Event('visibilitychange'));
    });

    await screen('world_builder');
    await render(choice);
    await step(900);
    await screen('main', null, true);
    await step(900);
    assert.equal(workers.length, 0, 'other screens and mode transitions start no workers');

    await screen('main');
    await step(850);
    assert.equal(workers.length, 0, 'entering Main starts a quiet period');
    await act(async () => document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 })));
    await step(899);
    assert.equal(workers.length, 0, 'recent pointer input resets the quiet period');
    await act(async () => window.dispatchEvent(new window.CustomEvent('avenlab:main-menu-action', { detail: 'down' })));
    await step(899);
    assert.equal(idle.size, 0, 'controller navigation also resets the quiet period');
    await act(async () => advance(1));
    assert.ok(idle.size > 0, 'work is scheduled only after a quiet period');
    assert.equal(workers.length, 0, 'a settled request still waits for the browser idle callback');
    assert.ok(idleOptions.every(options => options?.timeout === undefined), 'idle work is never forced by a deadline');
    await screen('mode_select');
    await step(900);
    assert.equal(workers.length, 0, 'navigation cancels already queued idle work');

    await render(choice, equivalent);
    await screen('main');
    await step(850);
    await render(equivalent, choice);
    await step(50);
    assert.equal(workers.length, 1, 'two visible consumers of the same portrait share one worker');
    assert.equal(workers[0].options.type, 'module');
    assert.match(workers[0].url.pathname, /characterPortrait\.worker/);
    assert.equal(workers[0].input.modelUrl, '/character-portrait-test/vega.glb');
    await render(choice);
    assert.equal(workers[0].terminated, undefined, 'unmounting one consumer leaves the shared job running');
    await finish(workers[0]);
    assert.equal(workers[0].terminated, true, 'a completed worker is released');
    const cached = image();
    assert.ok(cached?.startsWith('blob:'));
    await render({ ...choice, appearance: { ...choice.appearance, personality: 'tsundere', animation_fit: 'original' } });
    await step(900);
    assert.equal(workers.length, 1, 'nonvisual settings reuse the existing portrait');
    assert.equal(image(), cached);

    await screen('sandbox');
    await render();
    await render(choice);
    assert.equal(image(), cached, 'a remounted header shows the cached image immediately');
    const dyed = { ...choice, appearance: { ...choice.appearance, hair_color: 'espresso' } };
    await render(dyed);
    await step(900);
    assert.equal(workers.length, 1, 'new visual edits wait while gameplay is active');

    await screen('main');
    await step(900);
    assert.equal(workers.length, 2);
    await screen('mode_select');
    assert.equal(workers[1].terminated, true, 'leaving Main cancels a running worker');
    await finish(workers[1]);
    assert.equal(image(), undefined, 'a canceled worker cannot cache a late result');
    await screen('main');
    await step(900);
    assert.equal(workers.length, 3, 'returning to Main retries the canceled portrait');

    await setVisibility('hidden');
    assert.equal(workers[2].terminated, true, 'hiding the tab cancels a running worker');
    await finish(workers[2]);
    await step(900);
    assert.equal(workers.length, 3);
    assert.equal(image(), undefined);
    await setVisibility('visible');
    await step(899);
    assert.equal(workers.length, 3, 'returning to a visible tab requires a new quiet period');
    await step(1);
    assert.equal(workers.length, 4);
    assert.equal(workers[3].input.look.appearance.hair_color, 'espresso');
    await finish(workers[3]);
    assert.ok(image());
    assert.notEqual(image(), cached);

    await render({ ...choice, outfit: 'linen-nightgown' });
    await step(900);
    assert.equal(workers.length, 5);
    assert.equal(workers[4].input.dress.item.id, 'linen-nightgown');
    assert.match(workers[4].input.dress.url, /linen-nightgown\.mobile\.glb$/);
    await finish(workers[4]);
    const outfitPortrait = image();
    assert.ok(outfitPortrait);
    await screen('heroes');
    assert.equal(image(), outfitPortrait, 'Heroes reuses the visible outfit portrait');
    assert.deepEqual(mainRequests, [], 'GLTF requests never run on the main thread');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    if (previousNow) Object.defineProperty(performance, 'now', previousNow);
    else delete performance.now;
    restore();
  }
});

test('portrait worker isolates GLTF loading and retains its model fallbacks', { timeout: 20000 }, async () => {
  const dom = new JSDOM();
  const NativeRequest = globalThis.Request;
  const nativeFetch = globalThis.fetch;
  const rig = JSON.parse(await readFile(new URL('./fixtures/villager-female-rig.json', import.meta.url), 'utf8'));
  function skinnedModel(name) {
    const attributes = [
      { data: new Float32Array([-.2, 1, 0, .2, 1, 0, 0, 1.4, 0]), componentType: 5126, type: 'VEC3',
        min: [-.2, 1, 0], max: [.2, 1.4, 0] },
      { data: new Uint8Array(12), componentType: 5121, type: 'VEC4' },
      { data: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), componentType: 5126, type: 'VEC4' },
      { data: new Uint16Array([0, 1, 2]), componentType: 5123, type: 'SCALAR' },
    ];
    const bytes = Buffer.concat(attributes.map(({ data }) => Buffer.from(data.buffer)));
    let byteOffset = 0;
    const bufferViews = attributes.map(({ data }) => {
      const view = { buffer: 0, byteOffset, byteLength: data.byteLength };
      byteOffset += data.byteLength;
      return view;
    });
    return JSON.stringify({
      ...rig,
      scenes: [{ nodes: [...rig.scenes[0].nodes, rig.nodes.length] }],
      nodes: [...rig.nodes, { name, mesh: 0, skin: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, indices: 3 }] }],
      buffers: [{ uri: 'data:application/octet-stream;base64,' + bytes.toString('base64'), byteLength: bytes.length }],
      bufferViews,
      accessors: attributes.map(({ data, ...accessor }, bufferView) => ({ ...accessor, bufferView, count: 3 })),
    });
  }
  const fullBody = skinnedModel('BODY_WARDROBE');
  const cutBody = skinnedModel('BODY_OUTFIT_CUT');
  const dressModel = skinnedModel('CLOTH_DRESS');
  const invalidBody = JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'BODY_WARDROBE' }],
  });
  const dedicated = '/models/characters/female/wardrobe/vesper-body.glb';
  const legacy = '/models/characters/wardrobe/gothic-02.mobile.glb';
  const files = new Map([
    ['/full-driver.gltf', fullBody],
    ['/cut-driver.gltf', cutBody],
    ['/dress.gltf', dressModel],
  ]);
  const requests = [];
  let handler, response, deferredDonor, modeLoadStarts = 0;
  const restore = installGlobals({
    ProgressEvent: dom.window.ProgressEvent,
    Request: class extends NativeRequest {
      constructor(url, options) {
        super(typeof url === 'string' && url.startsWith('/') ? 'http://localhost' + url : url, options);
      }
    },
    fetch: async request => {
      if (request.url.startsWith('data:')) return nativeFetch(request);
      const { pathname } = new URL(request.url);
      requests.push(pathname);
      if (pathname === dedicated && deferredDonor) return deferredDonor.promise;
      const file = files.get(pathname);
      return file ? new Response(file) : new Response(null, { status: 404 });
    },
    self: {
      addEventListener(type, callback, options) {
        assert.equal(type, 'message');
        assert.equal(options.once, true);
        handler = callback;
      },
      postMessage(value) { response = value; },
    },
    OffscreenCanvas: class {
      constructor(width, height) { assert.deepEqual([width, height], [192, 192]); }
      async convertToBlob(options) {
        assert.deepEqual(options, { type: 'image/webp', quality: .90 });
        return new Blob(['test portrait'], { type: options.type });
      }
    },
  });
  const previousStart = DefaultLoadingManager.onStart;
  DefaultLoadingManager.onStart = () => modeLoadStarts++;

  const rendererMock = 'virtual:character-portrait-worker-renderer';
  let vite;
  try {
    vite = await createServer({
      ...serverOptions,
      plugins: [{
        name: 'character-portrait-worker-probe', enforce: 'pre',
        transform(source, id) {
          if (id.endsWith('/characterPortrait.worker.ts')) return source.replace('"three"', JSON.stringify(rendererMock));
        },
        resolveId(id) { if (id === rendererMock) return '\0' + id; },
        load(id) {
          if (id === '\0' + rendererMock) return `
            export * from 'three';
            export const renderedModels = [], renderedDresses = [];
            export class WebGLRenderer {
              constructor({ canvas }) { if (!(canvas instanceof OffscreenCanvas)) throw Error('Missing offscreen canvas'); }
              setSize(width, height, updateStyle) { if (updateStyle) throw Error('An offscreen canvas has no style'); }
              setClearColor() {}
              render(scene) {
                const model = scene.children[0];
                renderedModels.push(model.name);
                renderedDresses.push(model.getObjectByName('wardrobe-linen-nightgown')?.visible === true);
              }
              dispose() {}
              forceContextLoss() {}
            }
          `;
        },
      }],
    });
    const { characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { getWardrobeGarment } = await vite.ssrLoadModule('/src/game/characters/wardrobeGarments.ts');
    await vite.ssrLoadModule('/src/game/characters/characterPortrait.worker.ts');
    const { renderedModels, renderedDresses } = await vite.ssrLoadModule(rendererMock);
    const rook = characterLook({ id: 'jules-okafor', outfit: 'night-run' });
    const vega = characterLook({ id: 'mara-vega', outfit: 'linen-nightgown' });

    await handler({ data: { look: rook, modelUrl: 'http://localhost/missing.gltf' } });
    assert.equal(response.image?.type, 'image/webp', response.error);
    assert.equal(renderedModels.at(-1), 'garage-jules-stylized', 'a missing Rook GLTF falls back to the stylized driver');

    await handler({ data: { look: vega, modelUrl: 'http://localhost/missing.gltf' } });
    assert.match(response.error, /character model is unavailable/, 'a missing Vega GLTF shows the neutral tile');

    for (const [packedFile, expected] of [
      [cutBody, ['/packed.gltf']],
      [undefined, ['/packed.gltf', '/cut-driver.gltf']],
      ['invalid glTF', ['/packed.gltf', '/cut-driver.gltf']],
    ]) {
      files.set('/packed.gltf', packedFile);
      requests.length = 0;
      await handler({ data: { look: vega, modelUrl: 'http://localhost/packed.gltf' } });
      assert.equal(response.image?.type, 'image/webp', response.error);
      assert.deepEqual(requests, expected);
    }

    const dress = { url: 'http://localhost/dress.gltf', item: getWardrobeGarment('linen-nightgown') };
    for (const { label, actor, primary, fallback, donorRequests, fitted } of [
      { label: 'full actor uses its own skin', actor: 'full-driver.gltf', donorRequests: [], fitted: true },
      { label: 'dedicated donor is usable', primary: fullBody, fallback: fullBody, donorRequests: [dedicated], fitted: true },
      { label: 'missing dedicated donor falls back', fallback: fullBody, donorRequests: [dedicated, legacy], fitted: true },
      { label: 'malformed dedicated donor falls back', primary: invalidBody, fallback: fullBody,
        donorRequests: [dedicated, legacy], fitted: true },
      { label: 'exhausted donors retain the stock look', primary: invalidBody, donorRequests: [dedicated, legacy], fitted: false },
    ]) {
      requests.length = 0;
      files.set(dedicated, primary);
      files.set(legacy, fallback);
      await handler({ data: { look: vega, modelUrl: 'http://localhost/' + (actor ?? 'cut-driver.gltf'), dress } });
      assert.equal(response.image?.type, 'image/webp', response.error ?? label);
      assert.deepEqual(requests.filter(url => url === dedicated || url === legacy), donorRequests, label);
      assert.equal(renderedDresses.at(-1), fitted, label);
    }

    requests.length = 0;
    deferredDonor = Promise.withResolvers();
    let deadline;
    try {
      await Promise.race([
        handler({ data: {
          look: vega, modelUrl: 'http://localhost/cut-driver.gltf',
          dress: { ...dress, url: 'http://localhost/missing-dress.gltf' },
        } }),
        new Promise((_, reject) => {
          deadline = setTimeout(() => reject(Error('A missing dress waited for a pending donor')), 2000);
        }),
      ]);
      assert.equal(response.image?.type, 'image/webp', response.error);
      assert.equal(renderedModels.at(-1), 'garage-villager-female', 'a missing dress uses the stock character');
      assert.equal(renderedDresses.at(-1), false);
      assert.deepEqual(requests.filter(url => url === dedicated || url === legacy), [dedicated],
        'a missing dress does not request the legacy donor');
    } finally {
      clearTimeout(deadline);
      deferredDonor.resolve(new Response(null, { status: 404 }));
    }
    assert.equal(modeLoadStarts, 0, 'portrait assets never set the shared mode loading state');
  } finally {
    await vite?.close();
    DefaultLoadingManager.onStart = previousStart;
    dom.window.close();
    restore();
  }
});
