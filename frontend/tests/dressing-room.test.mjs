import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h, useState } from 'react';
import { Spherical, Vector3 } from 'three';

test('the fitting camera orbits a close-up without changing its target or crossing the floor', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { orbitFittingCamera } = await vite.ssrLoadModule('/src/game/characters/clothingFraming.ts');
    const sphere = new Spherical(), target = new Vector3(.2, .92, -.15);
    const position = target.clone().add(new Vector3(0, 0, 3.6));
    const distance = position.distanceTo(target);
    orbitFittingCamera(position, target, Math.PI, 0, sphere);
    assert(position.z < target.z, 'a horizontal drag can reach the back view');
    assert(Math.abs(position.distanceTo(target) - distance) < 1e-8);
    position.set(.2, .92, 3.45);
    const applied = orbitFittingCamera(position, target, .7, 10, sphere);
    assert(position.y >= .30 - 1e-8, 'a large vertical drag stops above the floor');
    assert(Math.abs(position.distanceTo(target) - distance) < 1e-8);
    position.set(.2, .92, 3.45);
    orbitFittingCamera(position, target, .7, applied - .1, sphere);
    assert(position.y > .30, 'a small reverse drag leaves the tilt limit immediately');
    assert.deepEqual(target.toArray(), [.2, .92, -.15]);
  } finally { await vite.close(); }
});

test('dressing room keeps fitted presets and lets imported garments be tried on independently', async () => {
  const inventory = JSON.parse(await readFile(new URL('../../avenlab-server/src/assets/character-garments.json', import.meta.url), 'utf8'));
  const imports = inventory.filter(item => !item.retired && !item.outfit);
  const missingImport = 'bowtie-13';
  const missingOutfit = 'medieval-08';
  const revisedImport = 'gothic-skirt-02';
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
      __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(inventory.filter(item => item.id !== missingImport && item.id !== missingOutfit).map(item => item.id)),
      __DRESSING_ROOM_REVISION_IDS__: JSON.stringify([revisedImport]),
      __STANDALONE_CORSET_LODS__: JSON.stringify({ 'gothic-05': { garage: true, mobile: true } }),
      __WARDROBE_SET_IDS__: JSON.stringify(['gothic-01', 'gothic-03', 'gothic-04', 'gothic-05']),
    }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const { DressingRoom } = await vite.ssrLoadModule('/src/game/characters/DressingRoom.tsx');
    const { CHARACTERS, DEFAULT_CHARACTER, ROOK_ID, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { useCharacterPreviewStore: preview } = await vite.ssrLoadModule('/src/game/characters/characterPreviewStore.ts');
    const { navigateFormRows } = await vite.ssrLoadModule('/src/game/social/formRows.ts');
    const changes = [], trials = [];
    function Harness({ initial }) {
      const [choice, setChoice] = useState(initial);
      return h(DressingRoom, {
        choice,
        onChange: next => { changes.push(next); setChoice(next); },
        onTryOn: next => { trials.push(next); setChoice(next); },
      });
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
    assert.deepEqual([...document.querySelectorAll('[data-category]')].map(button => button.dataset.category),
      ['outfits', 'saved', 'layers', 'corsets', 'tops', 'bottoms', 'footwear', 'headwear', 'bows', 'accessories', 'props', 'hair', 'face', 'skin']);
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
    assert.equal(find('[data-wardrobe-item=gothic-04]'), null, 'installed retired sets are hidden from outfits');
    assert.deepEqual([...document.querySelectorAll('[data-wardrobe-item^=gothic-]')].map(button => button.dataset.wardrobeItem),
      ['gothic-02', 'gothic-03', 'gothic-05'], 'only the selected Gothic presets are listed in Outfits');
    for (const item of imports.filter(item => item.category !== 'outfits')) {
      assert(!find(`[data-wardrobe-item="${item.id}"]`), `${item.id} stays in its own category`);
    }
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
        assert(card, `${item.id} is listed in ${category}`);
        assert.equal(card.hasAttribute('data-unavailable'), item.id === missingImport);
        const availability = item.id === missingImport ? /Pack not installed/
          : item.id === revisedImport ? /Revised model/ : /Try-on/;
        assert.match(card.textContent, availability);
        found.add(item.id);
      }
    }
    assert.equal(found.size, imports.length, 'all separate garments remain discoverable');
    for (const [category, piece] of [['footwear', 'shoes'], ['headwear', 'hat']]) {
      await open(category);
      assertPiece(piece);
    }
    await open('layers');
    assert.equal(preview.getState().camera, 'Full body');
    const chooseLayer = name => act(async () => {
      const button = [...document.querySelectorAll('[aria-label="Clothing layers"] button')].find(item => item.textContent === name);
      assert(button, name);
      button.click();
    });
    assert(find('[data-wardrobe-item=socks-01]'));
    assert.equal(find('[data-wardrobe-item=top-01]'), null);
    await chooseLayer('Middle');
    assert(find('[data-wardrobe-item=top-01]'));
    assert.equal(find('[data-wardrobe-item=socks-01]'), null);
    await chooseLayer('Outer');
    assert(find('[data-wardrobe-item=gothic-skirt-04]'));
    assert.match(find('[data-wardrobe-item=gothic-skirt-02]').textContent, /Revised model/);
    assert.doesNotMatch(find('[data-wardrobe-item=gothic-skirt-03]').textContent, /Revised model/);
    assert.equal(find('[data-wardrobe-item=dress-01]'), null);
    await chooseLayer('Overwear');
    assert(find('[data-wardrobe-item=harness-01]'));
    assert.equal(find('[data-wardrobe-item=coat-01]'), null);
    await chooseLayer('Underwear');
    assert.equal(document.querySelectorAll('[data-wardrobe-item]').length, 0);
    assert.match(find('[role=status]').textContent, /standalone underwear/);
    assert.equal(changes.length + trials.length, 0, 'category and camera changes never alter the outfit');

    await open('footwear');
    await click('[aria-label="Item availability"] button:last-child');
    assert.deepEqual([...document.querySelectorAll('[data-wardrobe-item]')].map(button => button.dataset.wardrobeItem),
      ['remove-shoes', 'outfit-shoes', 'remove-socks']);
    await click('[aria-label="Item availability"] button:first-child');
    await open('bows');
    const search = find('input[type=search]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(search, 'bow tie 14');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(document.querySelectorAll('[data-wardrobe-item]').length, 1);
    assert(find('[data-wardrobe-item=bowtie-14]'));
    for (const [category, id, piece] of [['tops', 'top-01', 'shirt'], ['bottoms', 'gothic-skirt-04', 'skirt'],
      ['footwear', 'socks-01', 'socks'], ['bows', 'bowtie-14', 'bow']]) {
      await open(category);
      if (category === 'bottoms') assert.match(find('[aria-label="Gothic skirts"] [data-wardrobe-item=gothic-skirt-04]').textContent, /Gothic Skirt 04/i);
      await click(`[data-wardrobe-item=${id}]`);
      assertPiece(piece);
      assert.equal(find(`[data-wardrobe-item=${id}]`).getAttribute('aria-pressed'), 'true');
      assert.equal(find('.dressing-details dd').textContent, 'Free try-on');
    }
    assert.deepEqual(trials.at(-1).garments, { top: 'top-01', skirt: 'gothic-skirt-04', socks: 'socks-01', bow: 'bowtie-14' });
    await click('[data-remove-try-on]');
    assert.deepEqual(trials.at(-1).garments, { top: 'top-01', skirt: 'gothic-skirt-04', socks: 'socks-01' }, 'removing a bow leaves the other trial pieces in place');
    assert.equal(changes.length, 0, 'trial pieces use the session preview callback');

    await open('outfits');
    assert.equal(document.activeElement.dataset.wardrobeItem, 'dockwear', 'keyboard activation moves into the catalog');
    await click('[data-wardrobe-item=gothic-05]');
    assert.equal(changes.at(-1).wardrobe.shirt, 'none');
    assert.equal(changes.at(-1).wardrobe.waist, 'tucked');
    assert.equal(changes.at(-1).garments, undefined, 'an outfit preset clears the trial pieces');
    assertPiece('corset');
    assert.equal(find('.dressing-details h2').textContent, 'High-collar corset');
    assert.match(find('.dressing-details p').textContent, /fitted upper back/);
    assert.equal(find('.dressing-details dd').textContent, '0 credits');
    assert.equal(find('[data-dressing-piece=shirt]'), null);
    assert.equal(find('[data-dressing-piece=shorts]'), null);
    assert.equal(find('[aria-label="Shirt layer"]'), null);
    const changeCount = changes.length;
    await click('[data-dressing-piece=skirt]');
    assertPiece('skirt');
    assert.equal(changes.length, changeCount, 'inspecting a piece does not equip a new outfit');
    await open('outfits');
    await click('[data-wardrobe-item=gothic-05]');
    assertPiece('corset');
    const first = find('[aria-label="Complete outfits"] [data-wardrobe-item]');
    first.focus();
    const memory = new WeakMap();
    assert.equal(first.parentElement.dataset.controllerColumns, '1');
    navigateFormRows(find('#root'), first, 'right', memory);
    assert.equal(document.activeElement, first, 'right stays on the only item in the row');
    navigateFormRows(find('#root'), first, 'down', memory);
    assert.equal(document.activeElement.dataset.wardrobeItem, 'shop-crew');
    navigateFormRows(find('#root'), document.activeElement, 'down', memory);
    assert.equal(document.activeElement.dataset.wardrobeItem, 'gothic-05', 'down enters the next section at its equipped item');
    await click('[data-wardrobe-item=shop-crew]');
    assert.equal(changes.at(-1).wardrobe, undefined, 'complete outfit replaces the corset set');
    assertPiece('corset');

    await click('[data-wardrobe-item=medieval-08]');
    assert.equal(changes.at(-1).outfit, 'shop-crew', 'missing complete outfit cannot be equipped');
    await click('[aria-label="Sleepwear"] [data-wardrobe-item=linen-nightgown]');
    const sleepwear = changes.at(-1);
    assert.equal(sleepwear.outfit, 'linen-nightgown');
    assert.equal(sleepwear.garments, undefined, 'sleepwear uses the persisted complete-outfit selection');
    assert.equal(sleepwear.removedClothing, undefined, 'bare feet are part of the outfit itself');
    assert.deepEqual(characterLook(sleepwear).garments, { dress: 'linen-nightgown' });
    assert.deepEqual(characterLook(sleepwear).removedClothing, ['hat', 'shoes']);
    assert.equal(preview.getState().camera, 'Full body');
    assert(find('[data-dressing-piece=dress]'));
    assert.equal(find('[data-dressing-piece=shoes]'), null);
    await click('[aria-label="Medieval outfits"] [data-wardrobe-item=medieval-07]');
    assert.equal(changes.at(-1).outfit, 'medieval-07');
    assert.deepEqual(characterLook(changes.at(-1)).removedClothing, ['hat']);

    await open('bottoms');
    await click('[data-wardrobe-item=gothic-skirt-04]');
    await open('corsets');
    await click('[data-wardrobe-item=gothic-05]');
    assert.equal(trials.at(-1).wardrobeTrial.set, 'gothic-05');
    await open('tops');
    await click('[aria-label="Armor"] [data-wardrobe-item=armor-01]');
    assert.equal(trials.at(-1).wardrobeTrial, undefined);
    assert.deepEqual(trials.at(-1).garments, { skirt: 'gothic-skirt-04', top: 'armor-01' });
    assertPiece('armor');
    await open('headwear');
    await click('[aria-label="Medieval hoods"] [data-wardrobe-item=hood-02]');
    await open('accessories');
    await click('[aria-label="Bracers"] [data-wardrobe-item=bracer-01]');
    assert.deepEqual(trials.at(-1).garments, { skirt: 'gothic-skirt-04', top: 'armor-01', hat: 'hood-02', bracer: 'bracer-01' });
    const bracerToggle = '[aria-label="Bracers"] [data-wardrobe-item=remove-bracer]';
    assert.match(find(bracerToggle).textContent, /Remove bracer/);
    await click(bracerToggle);
    assert.deepEqual(trials.at(-1).removedClothing, ['bracer']);
    assert.equal(trials.at(-1).garments.bracer, 'bracer-01');
    assert.equal(characterLook(trials.at(-1)).garments.bracer, undefined);
    assert.equal(characterLook(trials.at(-1)).garments.top, 'armor-01');
    assert.match(find(bracerToggle).textContent, /Restore bracer/);
    await click(bracerToggle);
    assert.equal(characterLook(trials.at(-1)).garments.bracer, 'bracer-01');
    await open('corsets');
    await click('[data-wardrobe-item=gothic-05]');
    assert.equal(trials.at(-1).garments.top, undefined);
    assert.equal(trials.at(-1).garments.bracer, 'bracer-01');

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
    await click(`[data-wardrobe-item="${rook.outfits[0].id}"]`);
    await click('[data-dressing-piece=pants]');
    assertPiece('pants');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close(); dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
