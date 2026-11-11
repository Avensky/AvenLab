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
    const { CHARACTERS, DEFAULT_CHARACTER, ROOK_ID } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { useCharacterPreviewStore: preview } = await vite.ssrLoadModule('/src/game/characters/characterPreviewStore.ts');
    const { navigateFormRows } = await vite.ssrLoadModule('/src/game/social/formRows.ts');
    const changes = [];
    function Harness({ initial }) {
      const [choice, setChoice] = useState(initial);
      return h(DressingRoom, { choice, onChange: next => { changes.push(next); setChoice(next); } });
    }
    const find = selector => document.querySelector(selector);
    const click = async selector => act(async () => { assert(find(selector), selector); find(selector).click(); });
    const open = async category => {
      if (!find('.dressing-catalog').hidden) await click('[data-wardrobe-back]');
      await click(`[data-category=${category}]`);
    };
    root = createRoot(find('#root'));
    preview.setState({ camera: 'Hands', zoom: 1.2 });
    await act(async () => root.render(h(Harness, { initial: DEFAULT_CHARACTER })));
    assert.equal(document.querySelectorAll('[data-category]').length, 12);
    assert.equal(find('[data-category=colors]'), null, 'presets live in the color toolbar');
    assert.deepEqual([...find('.dressing-room-title').children].map(label => label.textContent), ['Fitting room', 'Vesper Vega']);
    assert.equal(find('.dressing-catalog').hidden, true);
    assert.equal(find('.dressing-details').hidden, true);
    assert.equal(find('.dressing-catalog').parentElement, find('.dressing-categories').parentElement, 'catalog shares the left wardrobe rail');
    assert.equal(preview.getState().camera, 'Full body');
    const assertPiece = piece => {
      assert.equal(preview.getState().camera, 'Selected item');
      assert.equal(preview.getState().selectedPiece, piece);
    };
    await open('outfits');
    assertPiece('corset');
    assert.equal(find('.dressing-categories').hidden, true);
    assert.match(find('[data-wardrobe-item=gothic-02]').textContent, /Pack not installed/);
    await click('[data-wardrobe-item=gothic-02]');
    assert.equal(find('.dressing-details').hidden, false, 'unavailable cards can still be inspected');
    assert.equal(find('.dressing-details dd').textContent, 'Not listed');
    assert.equal(changes.length, 0, 'inspecting a missing pack never equips it');
    await click('[data-wardrobe-back]');
    assert.equal(find('.dressing-details').hidden, true);
    assert.equal(document.activeElement.dataset.category, 'outfits');
    const revision = preview.getState().focusRevision;
    await open('outfits');
    assert(preview.getState().focusRevision > revision, 'reopening a category restores its close-up');

    const found = new Set();
    for (const category of new Set(imports.map(item => item.category))) {
      await open(category);
      for (const item of imports.filter(item => item.category === category)) {
        const card = find(`[data-wardrobe-item="${item.id}"]`);
        assert(card?.hasAttribute('data-unavailable'), `${item.id} is categorized but cannot be equipped before fitting`);
        assert.match(card.textContent, /Fitting pending/);
        found.add(item.id);
      }
    }
    assert.equal(found.size, imports.length, 'every imported item has a category');
    for (const [category, piece] of [['bottoms', 'skirt'], ['footwear', 'shoes'], ['headwear', 'hat']]) {
      await open(category);
      assertPiece(piece);
    }
    assert.equal(changes.length, 0, 'category and camera changes never alter the outfit');

    await open('outerwear');
    await click('[aria-label="Item availability"] button:last-child');
    assert.equal(document.querySelectorAll('[data-wardrobe-item]').length, 0);
    assert.match(find('.dressing-empty').textContent, /No separate pieces are ready/);
    await click('[aria-label="Item availability"] button:first-child');
    await open('accessories');
    const search = find('input[type=search]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(search, 'bow tie 14');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(document.querySelectorAll('[data-wardrobe-item]').length, 1);
    assert(find('[data-wardrobe-item=bowtie-14]'));

    await open('tops');
    assert.equal(document.activeElement.dataset.wardrobeItem, 'gothic-01', 'keyboard activation moves into the catalog');
    await click('[data-wardrobe-item=gothic-04]');
    assert.equal(changes.at(-1).wardrobe.shirt, 'under');
    assertPiece('corset');
    assert.equal(find('.dressing-details h2').textContent, 'Underbust vest');
    assert.match(find('.dressing-details p').textContent, /requires a shirt layer/);
    assert.equal(find('.dressing-details dd').textContent, '0 credits');
    const changeCount = changes.length;
    await click('[data-dressing-piece=shirt]');
    assertPiece('shirt');
    assert.equal(changes.length, changeCount, 'inspecting a piece does not equip a new outfit');
    await open('bottoms');
    await click('[data-wardrobe-item=gothic-04]');
    assertPiece('skirt');
    await open('outfits');
    await click('[data-wardrobe-item=gothic-04]');
    assertPiece('corset');
    const first = find('[aria-label="Complete outfits"] [data-wardrobe-item]');
    first.focus();
    const memory = new WeakMap();
    navigateFormRows(find('#root'), first, 'right', memory);
    assert.equal(document.activeElement.dataset.wardrobeItem, 'shop-crew');
    navigateFormRows(find('#root'), document.activeElement, 'down', memory);
    assert.equal(document.activeElement.dataset.wardrobeItem, 'gothic-04', 'down enters the next section at its equipped item');
    await click('[data-wardrobe-item=shop-crew]');
    assert.equal(changes.at(-1).wardrobe, undefined, 'complete outfit replaces the corset set');
    assertPiece('corset');

    await open('face');
    assert.equal(preview.getState().camera, 'Face');
    await act(async () => root.unmount()); root = null;
    assert.equal(preview.getState().camera, 'Hands', 'leaving restores the previous camera');
    assert.equal(preview.getState().zoom, 1.2);

    const rook = CHARACTERS.find(character => character.id === ROOK_ID);
    root = createRoot(find('#root'));
    await act(async () => root.render(h(Harness, { initial: { id: rook.id, outfit: rook.outfits[0].id } })));
    await open('outfits');
    assertPiece('coat');
    await open('bottoms');
    assertPiece('pants');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close(); dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
