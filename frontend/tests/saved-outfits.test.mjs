import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('saved outfits preserve a tuned look through a confirmed save, reconnect, and try-on', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  let root, vite, client, act;
  try {
    const { createElement, act: reactAct } = await import('react');
    const { createRoot } = await import('react-dom/client');
    act = reactAct;
    root = createRoot(document.querySelector('#root'));
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const { SavedOutfits } = await vite.ssrLoadModule('/src/game/characters/SavedOutfits.tsx');
    const { useSocialStore } = await vite.ssrLoadModule('/src/store/social/socialStore.ts');
    client = await vite.ssrLoadModule('/src/net/socialClient.ts');
    const sent = [], previews = [];
    let ended = 0;
    const connect = () => client.setSocialConnection({ readyState: WebSocket.OPEN, send: value => sent.push(JSON.parse(value)) });
    const equipped = { id: 'mara-vega', outfit: 'dockwear' };
    const tuned = {
      ...equipped,
      wardrobeTrial: { set: 'gothic-04', waist: 'over', shirt: 'none' },
      wardrobeEase: 2,
      garments: { top: 'top-01', skirt: 'gothic-skirt-04', bow: 'bowtie-01', socks: 'socks-01' },
      removedClothing: ['bow'],
      appearance: {
        hair: 'cropped', hair_color: 'original', skin: 'original', headwear: 'hat', color: 'original',
        item_colors: { 'gothic-04:corset': { color: '#473652', accent: '#c77baa' } },
      },
    };
    const oldProgression = {
      character: equipped, character_presets: {},
      character_outfits: {
        Night: { id: 'jules-okafor', outfit: 'night-run' },
        'Layer check': { ...tuned, removedClothing: ['corset', 'skirt', 'bow'] },
      },
      cosmetics_revision: 2,
    };
    const receive = progression => useSocialStore.getState().receive({
      profile: { id: 'profile', name: 'Driver', progression },
      players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [],
      maps: [], limits: { max_active_worlds: 4 }, current_world_id: null,
    });
    const name = 'Harbor practice';
    const confirmed = {
      ...oldProgression, character_outfits: { ...oldProgression.character_outfits, [name]: tuned }, cosmetics_revision: 3,
    };
    await act(async () => {
      connect();
      receive(oldProgression);
      root.render(createElement(SavedOutfits, { choice: tuned, onTryOn: choice => previews.push(choice), onEndPreview: () => ended++ }));
    });
    const button = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    assert(button('Save outfit').disabled);
    assert.equal(document.querySelector('[aria-label="Try on Night"]'), null);
    const layerCheck = document.querySelector('[aria-label="Try on Layer check"]').textContent;
    assert.match(layerCheck, /Top 01.*Socks 01/);
    assert.doesNotMatch(layerCheck, /Underbust|Gothic Skirt|Bow tie|Wide over/);
    const input = document.querySelector('input');
    const { set } = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value');
    await act(async () => {
      set.call(input, `  ${name}  `);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    assert(!button('Save outfit').disabled);
    await act(async () => button('Save outfit').click());
    assert.deepEqual(sent[0], {
      type: 'social_request', request_id: sent[0].request_id, action: 'character_outfit_save', name, character: tuned,
    });
    assert.equal(document.querySelector('[aria-label="Try on Harbor practice"]'), null);

    await act(async () => client.receiveSocialResult({ request_id: sent[0].request_id, ok: true, data: confirmed }));
    await act(async () => receive(oldProgression));
    const harborPractice = document.querySelector('[aria-label="Try on Harbor practice"]').textContent;
    assert.match(harborPractice, /Gothic Skirt 04.*Wide over/);
    assert.doesNotMatch(harborPractice, /Bow tie/);
    assert.deepEqual(useSocialStore.getState().view.profile.progression.character, equipped);

    await act(async () => client.setSocialConnection(null));
    assert.match(document.body.textContent, /Connect your player profile/);
    await act(async () => {
      connect();
      receive(confirmed);
    });
    await act(async () => document.querySelector('[aria-label="Try on Harbor practice"]').click());
    assert.deepEqual(previews, [tuned]);
    assert.equal(sent.length, 1, 'previewing a saved combination sends no equip command');
    assert(button('Update outfit'));
    await act(async () => button('Return to equipped').click());
    assert.equal(ended, 1);
    assert.equal(sent.length, 1);
    assert(button('Save outfit').disabled);

    await act(async () => document.querySelector('[aria-label="Delete Harbor practice"]').click());
    assert.equal(sent[1].action, 'character_outfit_delete');
    assert.equal(sent[1].name, name);
    assert(document.querySelector('[aria-label="Try on Harbor practice"]'));
    await act(async () => client.receiveSocialResult({
      request_id: sent[1].request_id, ok: true, data: { ...oldProgression, cosmetics_revision: 4 },
    }));
    assert.equal(document.querySelector('[aria-label="Try on Harbor practice"]'), null);
    assert.deepEqual(useSocialStore.getState().view.profile.progression.character, equipped);
  } finally {
    if (root) await act(async () => root.unmount());
    client?.setSocialConnection(null);
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
