import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h, useState } from 'react';

test('dressing room separates browsing from equipping, filters fitting work, and supports controller grids', async () => {
  const imports = JSON.parse(await readFile('src/game/characters/dressingRoomImports.json', 'utf8'));
  const dom = new JSDOM('<div id="root" data-controller-rows></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const original = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let vite, root;
  try {
    const { createRoot } = await import('react-dom/client');
    vite = await createServer({ define: {
      __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(imports.map(item => item.id)),
      __WARDROBE_SET_IDS__: JSON.stringify(['gothic-01', 'gothic-04']),
    }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const { DressingRoom } = await vite.ssrLoadModule('/src/game/characters/DressingRoom.tsx');
    const { DEFAULT_CHARACTER } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { useCharacterPreviewStore: preview } = await vite.ssrLoadModule('/src/game/characters/characterPreviewStore.ts');
    const { navigateFormRows } = await vite.ssrLoadModule('/src/game/social/formRows.ts');
    const changes = [];
    function Harness({ initial }) {
      const [choice, setChoice] = useState(initial);
      return h(DressingRoom, { choice, onChange: next => { changes.push(next); setChoice(next); } });
    }
    const find = selector => document.querySelector(selector);
    const click = async selector => act(async () => { assert(find(selector), selector); find(selector).click(); });
    root = createRoot(find('#root'));
    preview.setState({ camera: 'Hands', zoom: 1.2 });
    await act(async () => root.render(h(Harness, { initial: DEFAULT_CHARACTER })));
    assert.equal(document.querySelectorAll('[data-category]').length, 13);
    assert.equal(find('[data-wardrobe-item=gothic-02]').disabled, true, 'missing pack cannot be equipped');
    assert.match(find('[data-wardrobe-item=gothic-02]').textContent, /Pack not installed/);

    const found = new Set();
    for (const category of new Set(imports.map(item => item.category))) {
      await click(`[data-category=${category}]`);
      for (const item of imports.filter(item => item.category === category)) {
        const card = find(`[data-wardrobe-item="${item.id}"]`);
        assert(card?.disabled, `${item.id} is categorized but cannot be equipped before fitting`);
        assert.match(card.textContent, /Fitting pending/);
        found.add(item.id);
      }
    }
    assert.equal(found.size, imports.length, 'every imported item has a category');
    assert.equal(changes.length, 0, 'category and camera changes never alter the outfit');

    await click('[data-category=outerwear]');
    await click('[aria-label="Item availability"] button:last-child');
    assert.equal(document.querySelectorAll('[data-wardrobe-item]').length, 0);
    assert.match(find('.dressing-empty').textContent, /No separate pieces are ready/);
    await click('[aria-label="Item availability"] button:first-child');
    await click('[data-category=accessories]');
    const search = find('input[type=search]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(search, 'bow tie 14');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(document.querySelectorAll('[data-wardrobe-item]').length, 1);
    assert(find('[data-wardrobe-item=bowtie-14]'));

    await click('[data-category=tops]');
    assert.equal(document.activeElement.dataset.wardrobeItem, 'gothic-01', 'keyboard activation moves into the catalog');
    await click('[data-wardrobe-item=gothic-04]');
    assert.equal(changes.at(-1).wardrobe.shirt, 'under');
    await click('[data-category=outfits]');
    const first = find('[aria-label="Complete outfits"] [data-wardrobe-item]');
    first.focus();
    const memory = new WeakMap();
    navigateFormRows(find('#root'), first, 'right', memory);
    assert.equal(document.activeElement.dataset.wardrobeItem, 'shop-crew');
    navigateFormRows(find('#root'), document.activeElement, 'down', memory);
    assert.equal(document.activeElement.dataset.wardrobeItem, 'gothic-04', 'down enters the next section at its equipped item');
    await click('[data-wardrobe-item=shop-crew]');
    assert.equal(changes.at(-1).wardrobe, undefined, 'complete outfit replaces the corset set');

    await click('[data-category=face]');
    assert.equal(preview.getState().camera, 'Face');
    await act(async () => root.unmount()); root = null;
    assert.equal(preview.getState().camera, 'Hands', 'leaving restores the previous camera');
    assert.equal(preview.getState().zoom, 1.2);
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close(); dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
