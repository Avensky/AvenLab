import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h, useState } from 'react';
import { MeshStandardMaterial, Spherical, Vector3 } from 'three';

test('corset palettes save independent colors and the Laced Bodice finish', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const original = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let vite, root;
  try {
    const { createRoot } = await import('react-dom/client');
    vite = await createServer({ define: {
      __STANDALONE_CORSET_LODS__: JSON.stringify({
        'gothic-laced-bodice': { garage: true, mobile: true }, 'gothic-high-collar': { garage: true, mobile: true },
        'gothic-underbust-vest': { garage: true, mobile: true },
      }),
      __BUNDLED_WARDROBE_LODS__: JSON.stringify({ 'gothic-03': { garage: true, mobile: true } }),
    }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const { ClothingColorToolbar } = await vite.ssrLoadModule('/src/game/characters/ClothingColorToolbar.tsx');
    const { DEFAULT_CHARACTER, characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { WARDROBE_CORSETS } = await vite.ssrLoadModule('/src/game/characters/wardrobe.ts');
    const { getCorsetDyeProfile, applyCorsetDye } = await vite.ssrLoadModule('/src/game/characters/corsetDye.ts');
    const { readLocalOutfits, writeLocalOutfit } = await vite.ssrLoadModule('/src/game/characters/localOutfits.ts');
    for (const set of WARDROBE_CORSETS) {
      const look = characterLook({ ...DEFAULT_CHARACTER, wardrobeTrial: { set: set.id, waist: 'over', shirt: 'none' } });
      const profile = getCorsetDyeProfile(look);
      const fields = (profile?.themeGroups ?? []).map(group => group.key).filter(key => key !== 'color' && key !== 'accent');
      if (profile?.finishes) fields.push('finish');
      assert.deepEqual(new Set(fields), new Set(set.extraDyeFields), `${set.name} controls match the profile save fields`);
    }
    function Palette({ set, waist, saved = false, name = 'Laced Bodice' }) {
      const selection = { set, waist, shirt: 'none' };
      const [choice, change] = useState(saved
        ? { ...DEFAULT_CHARACTER, wardrobe: selection }
        : { ...DEFAULT_CHARACTER, wardrobeTrial: selection });
      return h(ClothingColorToolbar, { choice, piece: 'corset', onChange: next => {
        change(next);
        writeLocalOutfit(name, next);
      } });
    }
    const pick = async selector => act(async () => {
      const button = document.querySelector(selector);
      assert(button, selector);
      button.click();
    });
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(h(Palette, { key: 'over', set: 'gothic-01', waist: 'over' })));
    await pick('[aria-label="Open clothing colors"]');
    const finish = () => [...document.querySelectorAll('[aria-label="Fabric finish"] button')];
    assert.deepEqual(finish().map(button => button.textContent), ['Original', 'Matte', 'Satin', 'Glossy']);
    await act(async () => finish().at(-1).click());
    for (const group of ['Fabric', 'Trim', 'Laces', 'Eyelets', 'Zipper']) {
      await pick(`[aria-label="${group} color: White"]`);
    }
    assert.deepEqual(readLocalOutfits()['Laced Bodice'].appearance.item_colors['gothic-01:corset'], {
      finish: 'glossy', color: '#ffffff', panel: '#ffffff', laces: '#ffffff', hardware: '#ffffff', closure: '#ffffff',
    });
    assert.equal(finish().at(-1).getAttribute('aria-pressed'), 'true');
    await pick('[aria-label="Reset piece appearance"]');
    assert.equal(finish()[0].getAttribute('aria-pressed'), 'true');
    assert.equal(readLocalOutfits()['Laced Bodice'].appearance.item_colors, undefined);

    await act(async () => root.render(h(Palette, { key: 'tucked', set: 'gothic-01', waist: 'tucked' })));
    await pick('[aria-label="Open clothing colors"]');
    assert.equal(finish().length, 4);
    assert(!document.querySelector('[aria-label="Zipper color"]'), 'Tucked hides its covered zipper');
    await act(async () => root.render(h(Palette, { key: 'sweetheart-over', name: 'Sweetheart', set: 'gothic-02', waist: 'over' })));
    await pick('[aria-label="Open clothing colors"]');
    assert.equal(finish().length, 0, 'the Sweetheart has no Laced Bodice finish controls');
    const swatches = [
      ['Fabric', 'Crimson', 'fabric', '#ad444d'], ['Front laces', 'Forest', 'laces', '#5f8962'],
      ['Hip laces', 'Navy', 'accent', '#4b79a4'], ['Eyelets', 'Ink', 'hardware', '#262630'],
      ['Front fasteners', 'White', 'closure', '#ffffff'],
    ];
    for (const [group, color] of swatches) await pick(`[aria-label="${group} color: ${color}"]`);
    const dye = readLocalOutfits().Sweetheart.appearance.item_colors['gothic-02:corset'];
    assert.deepEqual(dye, { color: '#ad444d', laces: '#5f8962', panel: '#4b79a4', hardware: '#262630', closure: '#ffffff' });
    for (const [, , slot, hex] of swatches) {
      const source = new MeshStandardMaterial({ color: '#706c73' });
      source.userData = { authoredSweetheartDye: true, color_slot: slot };
      const material = source.clone();
      assert.equal(applyCorsetDye(source, material, { ...dye, accent: '#ccbbaa' }, undefined, undefined), true);
      assert.equal(material.color.getHexString(), hex.slice(1));
      if (slot !== 'fabric') {
        applyCorsetDye(source, material, { accent: '#ccbbaa' }, undefined, undefined);
        assert.equal(material.color.getHexString(), 'ccbbaa', 'saved accents retain their previous tint');
      }
      source.dispose();
      material.dispose();
    }
    await act(async () => root.render(h(Palette, { key: 'sweetheart-tucked', name: 'Sweetheart', set: 'gothic-02', waist: 'tucked', saved: true })));
    await pick('[aria-label="Open clothing colors"]');
    assert(!document.querySelector('[aria-label="Hip laces color"]'), 'the tucked fit hides the hip laces');
    await pick('[aria-label="Front fasteners color: Forest"]');
    assert.deepEqual(readLocalOutfits().Sweetheart.appearance.item_colors['gothic-02:corset'], { closure: '#5f8962' });

    for (const { name, set, waist, groups, values } of [
      { name: 'Ruffled', set: 'gothic-03', waist: 'over',
        groups: [['Fabric', 'Crimson'], ['Ruffles', 'Forest'], ['Ribbon', 'Navy']],
        values: { color: '#ad444d', panel: '#5f8962', laces: '#4b79a4' } },
      { name: 'High Collar', set: 'gothic-05', waist: 'tucked',
        groups: [['Main', 'Crimson'], ['Inset', 'Forest'], ['Laces', 'Navy'], ['Trim', 'Ink'], ['Metal', 'White']],
        values: { color: '#ad444d', panel: '#5f8962', laces: '#4b79a4', lining: '#262630', hardware: '#ffffff' } },
    ]) {
      await act(async () => root.render(h(Palette, { key: set, name, set, waist, saved: true })));
      await pick('[aria-label="Open clothing colors"]');
      for (const [group, color] of groups) await pick(`[aria-label="${group} color: ${color}"]`);
      assert.deepEqual(readLocalOutfits()[name].appearance.item_colors[`${set}:corset`], values);
      for (const [group, color] of groups) {
        assert.equal(document.querySelector(`[aria-label="${group} color: ${color}"]`).getAttribute('aria-pressed'), 'true');
      }
      await pick('[aria-label="Reset piece colors"]');
      assert.equal(readLocalOutfits()[name].appearance.item_colors, undefined);
    }
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('the fitting camera orbits a close-up without changing its target or crossing the floor', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] } });
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
  const inventory = JSON.parse(await readFile(new URL('../../packages/wardrobe-catalog/character-garments.json', import.meta.url), 'utf8'));
  const imports = inventory.filter(item => !item.retired && !item.outfit);
  const missingImport = 'bowtie-13';
  const missingOutfit = 'medieval-08';
  const installed = inventory.filter(item => item.id !== missingImport && item.id !== missingOutfit);
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
      __VILLAGER_MODEL_URL__: JSON.stringify("/models/characters/villagers/villager-female/villager-female.garage.glb"),
      __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(installed.map(item => item.id)),
      __DRESSING_ROOM_MOBILE_IDS__: JSON.stringify(installed.filter(item => item.mobileUrl).map(item => item.id)),
      __DRESSING_ROOM_REVISION_IDS__: JSON.stringify([revisedImport]),
      __STANDALONE_CORSET_LODS__: JSON.stringify({ 'gothic-04': { garage: true, mobile: true }, 'gothic-05': { garage: true, mobile: true } }),
      __WARDROBE_SET_IDS__: JSON.stringify(['gothic-01', 'gothic-03', 'gothic-04', 'gothic-05']),
    }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
      optimizeDeps: { noDiscovery: true, include: [] } });
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
      ['outfits', 'saved', 'layers', 'underwear', 'corsets', 'tops', 'bottoms', 'footwear', 'headwear', 'bows', 'accessories', 'props']);
    assert.equal(find('.dressing-camera-block').previousElementSibling, find('.dressing-wardrobe'));
    assert.equal(find('.dressing-room-title').nextElementSibling, find('.dressing-camera-shortcuts'));
    assert(find('[data-wearable-quick-select="corset"]'));
    assert(!find('[data-wearable-quick-select="bra"]'));
    assert.equal(find('[data-category=colors]'), null, 'presets live in the color toolbar');
    assert.deepEqual([...find('.dressing-room-title').children].map(label => label.textContent), ['Fitting room', 'Vesper Vega']);
    assert.equal(find('.dressing-catalog').hidden, true);
    assert.equal(find('.dressing-catalog [data-wardrobe-item]'), null, 'entering the fitting room mounts only visible wardrobe controls');
    assert.equal(find('.dressing-details').hidden, true);
    assert.equal(find('.dressing-catalog').parentElement, find('.dressing-categories').parentElement, 'catalog shares the left wardrobe rail');
    assert.equal(preview.getState().camera, 'Full body');
    const assertPiece = piece => {
      assert.equal(preview.getState().camera, 'Selected item');
      assert.equal(preview.getState().selectedPiece, piece);
    };
    await click('[data-camera-choice="Full body"]');
    assert.equal(find('[data-inspected]').dataset.wardrobeItem, 'dockwear', 'reselecting the active camera reveals the worn outfit');
    await click('[data-camera-choice="Face"]');
    assert.equal(preview.getState().camera, 'Face');
    assert.equal(find('[data-inspected]').dataset.wardrobeItem, 'village-bonnet');
    await click('[data-camera-choice="Hands"]');
    assert.equal(preview.getState().camera, 'Hands');
    assert.equal(find('.dressing-details').hidden, true, 'an empty camera region never inspects an unrelated garment');
    assert.equal(trials.length + changes.length, 0);
    await open('outfits');
    assertPiece('corset');
    assert.equal(find('.dressing-categories').hidden, true);
    const toolbar = find('.dressing-catalog-toolbar');
    assert(toolbar.contains(find('[data-wardrobe-back]')), 'Back stays in the pinned catalog toolbar');
    assert(toolbar.contains(find('.dressing-catalog-heading h3')), 'the current section stays with Back');
    assert(toolbar.contains(find('[aria-label="Search Outfits"]')), 'search shares the pinned toolbar');
    assert.equal(toolbar.nextElementSibling.querySelector('[data-remove-outfit]').textContent, 'Remove outfit');
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
    assert.equal(find('.fit-review-toggle').getAttribute('aria-expanded'), 'false');
    await click('.fit-review-toggle');
    assert.equal(find('.fit-review-toggle').getAttribute('aria-expanded'), 'true');
    const note = find('[aria-label="Clipping / fit review"] textarea');
    assert(note, 'missing items can still have issue notes');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(note, 'Verify strap in idle');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => [...document.querySelectorAll('.fit-review-actions button')].find(button => button.textContent.includes('Copy ticket draft')).click());
    assert.match(find('[aria-label="Ticket draft"]').value, /gothic-02[\s\S]+Verify strap in idle/);
    assert.equal(changes.length, 0, 'inspecting a missing pack never equips it');
    await click('[data-wardrobe-back]');
    assert.equal(find('.dressing-catalog [data-wardrobe-item]'), null, 'returning to categories releases the previous item list');
    assert.equal(find('.dressing-details').hidden, true);
    assert.equal(document.activeElement.dataset.category, 'outfits');
    const revision = preview.getState().focusRevision;
    await open('outfits');
    assert(preview.getState().focusRevision > revision, 'reopening a category restores its close-up');

    assert(find('[aria-label="Clear Complete outfits"]').disabled, 'the default outfit has nothing to reset');
    const found = new Set();
    for (const category of new Set(imports.map(item => item.category))) {
      await open(category);
      for (const item of imports.filter(item => item.category === category)) {
        const card = find(`[data-wardrobe-item="${item.id}"]`);
        assert(card, `${item.id} is listed in ${category}`);
        assert.equal(card.querySelector('.dressing-item-name').textContent, item.label);
        assert.equal(card.hasAttribute('data-unavailable'), item.id === missingImport);
        const status = item.piece === 'socks' ? 'passed' : item.piece === 'skirt' || item.piece === 'underskirt' ? 'near-pass' : 'development';
        const grade = status === 'passed' ? 'Alpha Pass' : status === 'near-pass' ? 'Alpha — Nearly Passing' : 'Under Development';
        assert.equal(card.dataset.alphaStatus, status, `${item.id} has the correct project alpha grade`);
        assert.equal(card.querySelector('.dressing-alpha-badge').textContent, grade);
        assert.equal(card.disabled, false, 'development and unavailable items remain inspectable');
        const availability = item.id === missingImport ? /Pack not installed/
          : item.id === revisedImport ? /Revised model/ : /Try-on/;
        assert.match(card.textContent, availability);
        found.add(item.id);
      }
    }
    assert.equal(found.size, imports.length, 'all separate garments remain discoverable');
    await open('footwear');
    await click('.dressing-filter button:last-child');
    assert(find('[data-wardrobe-item=socks-01]'), 'imported socks are available through the alpha filter');
    assert.equal(find('.dressing-catalog .dressing-item[data-alpha-status=development]'), null, 'the alpha filter excludes unfinished shoes');
    assert.equal(find('[data-wardrobe-item=remove-socks]').dataset.alphaStatus, undefined, 'removal controls are not graded as garments');
    await open('bottoms');
    assert(find('[data-wardrobe-item=gothic-skirt-02]'), 'nearly passing skirts remain available through the alpha filter');
    assert.equal(find('[data-wardrobe-item=village-petticoat]').dataset.alphaStatus, 'near-pass');
    await open('corsets');
    assert.equal(find('.dressing-catalog .dressing-alpha-badge'), null, 'unfinished corsets are excluded from the alpha filter');
    await click('.dressing-filter button:first-child');
    assert(find('[data-wardrobe-item=gothic-05]'), 'all items restores development garments');
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
    assert.deepEqual([...document.querySelectorAll('[data-wardrobe-item]')].map(button => button.dataset.wardrobeItem),
      ['underwear-bra', 'underwear-briefs']);
    assert.equal(changes.length + trials.length, 0, 'category and camera changes never alter the outfit');

    await open('underwear');
    assert(find('[aria-label="Clear Underwear"]').disabled);
    await click('[data-wardrobe-item=underwear-bra]');
    assertPiece('bra');
    assert.equal(trials.length, 0, 'inspecting a covered base layer preserves the outfit');
    assert.equal(find('.dressing-details .dressing-color-toggle').title, 'Bra colors');
    await click('[data-wardrobe-remove=top]');
    assert.deepEqual(trials.at(-1).removedClothing, ['top', 'corset']);
    assert(find('[data-wardrobe-remove=top]').disabled);
    assert.equal(find('[data-wardrobe-item=underwear-briefs]').getAttribute('aria-pressed'), 'false');
    await click('[data-wardrobe-remove=bottom]');
    assertPiece('briefs');
    assert.deepEqual(trials.at(-1).removedClothing, ['top', 'corset', 'skirt']);
    assert.equal(find('.dressing-details .dressing-color-toggle').title, 'Briefs colors');
    const briefsStyles = '[aria-label="Briefs style"] button';
    assert.equal(find(`${briefsStyles}:first-child`).getAttribute('aria-pressed'), 'true');
    await click(`${briefsStyles}:last-child`);
    assert.equal(trials.at(-1).appearance.briefs_style, 'boxer-briefs');
    assert.equal(find(`${briefsStyles}:last-child`).getAttribute('aria-pressed'), 'true');
    await click('.dressing-details .dressing-color-toggle');
    await click('.dressing-details [aria-label="Main color: White"]');
    assert.deepEqual(changes.at(-1).appearance.item_colors, { 'underwear:briefs': { color: '#ffffff' } });
    assert.equal(changes.at(-1).appearance.briefs_style, 'boxer-briefs', 'boxer briefs share the base layer dye controls');
    await click(`${briefsStyles}:first-child`);
    assert.equal(trials.at(-1).appearance.briefs_style, undefined, 'switching back restores the legacy default');
    await click('[aria-label="Clear Underwear"]');
    assert.equal(trials.at(-1).removedClothing, undefined);
    assert.equal(trials.at(-1).outfit, DEFAULT_CHARACTER.outfit);
    assert.deepEqual(trials.at(-1).appearance.item_colors, changes.at(-1).appearance.item_colors);
    trials.length = changes.length = 0;

    await open('footwear');
    await click('[aria-label="Alpha readiness"] button:last-child');
    assert.deepEqual(new Set([...document.querySelectorAll('[data-wardrobe-item]')].map(button => button.dataset.wardrobeItem)),
      new Set(['remove-shoes', 'remove-socks', ...imports.filter(item => item.piece === 'socks').map(item => item.id)]));
    await click('[aria-label="Alpha readiness"] button:first-child');
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
    const trialCount = trials.length;
    await click('[aria-label="Alpha readiness"] button:last-child');
    await click('[data-wearable-quick-select=shirt]');
    assert(find('[data-wardrobe-item=top-01]'), 'camera shortcuts reveal a worn development item even while alpha filtering is active');
    assert.equal(find('[data-inspected]').dataset.wardrobeItem, 'top-01', 'the shortcut opens the exact fitted top');
    await click('[data-wearable-quick-select=bow]');
    assert.equal(find('[data-inspected]').dataset.wardrobeItem, 'bowtie-14');
    assert.equal(trials.length, trialCount, 'inspecting a worn item does not re-equip it');
    await click('[aria-label="Clear Bow ties"]');
    assert.deepEqual(trials.at(-1).garments, { top: 'top-01', skirt: 'gothic-skirt-04', socks: 'socks-01' }, 'removing a bow leaves the other trial pieces in place');
    assert.equal(changes.length, 0, 'trial pieces use the session preview callback');
    await open('bottoms');
    assert(find('[aria-label="Clear Skirts"]').disabled, 'base skirt section cannot clear a Gothic skirt');
    await click('[aria-label="Clear Gothic skirts"]');
    assert.deepEqual(trials.at(-1).garments, { top: 'top-01', socks: 'socks-01' }, 'section clear keeps other selections');
    assert(find('[aria-label="Clear Gothic skirts"]').disabled);
    await open('tops');
    await click('[aria-label="Clear Tops"]');
    assert.deepEqual(trials.at(-1).garments, { socks: 'socks-01' });
    assert.deepEqual(trials.at(-1).removedClothing, ['skirt', 'top'], 'clearing each section leaves its base layers exposed');

    await open('outfits');
    assert.equal(document.activeElement.dataset.wardrobeItem, 'dockwear', 'keyboard activation moves into the catalog');
    await click('[data-wardrobe-item=gothic-05]');
    assert.equal(changes.at(-1).wardrobe.shirt, 'none');
    assert.equal(changes.at(-1).wardrobe.waist, 'tucked');
    assert.equal(changes.at(-1).garments, undefined, 'an outfit preset clears the trial pieces');
    assertPiece('corset');
    assert.equal(find('.dressing-details h2').textContent, 'High-collar corset');
    assert.match(find('.dressing-item-description').textContent, /fitted upper back/);
    assert.equal(find('.dressing-details dd').textContent, '0 credits');
    assert.equal(find('[data-dressing-piece=shirt]'), null);
    assert.equal(find('[data-dressing-piece=shorts]'), null);
    assert.equal(find('[aria-label="Shirt layer"]'), null);
    await open('footwear');
    await click('[data-wearable-quick-select=skirt]');
    assert.equal(find('[data-inspected]').dataset.wardrobeItem, 'gothic-05', 'a bundled skirt opens its parent outfit');
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
    assert.equal(document.activeElement.getAttribute('aria-label'), 'Clear Gothic collection', 'the next section starts at its clear control');
    navigateFormRows(find('#root'), document.activeElement, 'down', memory);
    assert.equal(document.activeElement.dataset.wardrobeItem, 'gothic-05', 'down enters the next section at its equipped item');
    await click('[data-wardrobe-item=shop-crew]');
    assert.equal(changes.at(-1).wardrobe, undefined, 'complete outfit replaces the corset set');
    await click('[aria-label="Clear Complete outfits"]');
    assert.equal(changes.at(-1).outfit, DEFAULT_CHARACTER.outfit);
    await click('[data-wardrobe-item=shop-crew]');
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
    await open('underwear');
    await click('[data-wardrobe-remove=top]');
    assert.deepEqual(trials.at(-1).removedClothing, ['dress', 'top', 'corset']);
    assert.equal(characterLook(trials.at(-1)).garments, undefined);
    assert.deepEqual(characterLook(trials.at(-1)).outfitRemovals, ['hat', 'shoes'], 'previewing the bra retains the barefoot outfit settings');
    await click('[aria-label="Bra style"] button:last-child');
    assert.equal(trials.at(-1).appearance.bra_style, 'push-up');
    assert.equal(trials.at(-1).bra, true);
    assert.equal(find('[aria-label="Bra style"] button:last-child').getAttribute('aria-pressed'), 'true');
    await click('[aria-label="Clear Underwear"]');
    assert.equal(trials.at(-1).outfit, sleepwear.outfit);
    assert.equal(trials.at(-1).removedClothing, undefined);
    assert.deepEqual(characterLook(trials.at(-1)).garments, { dress: 'linen-nightgown' });
    await open('outfits');
    await click('[aria-label="Medieval kaftans"] [data-wardrobe-item=medieval-kaftan-01]');
    const sleeveToggle = '[data-wardrobe-remove=sleeves]';
    const detailSleeveToggle = `.dressing-details ${sleeveToggle}`;
    assert.equal(find(detailSleeveToggle).textContent.trim(), 'Remove sleeves');
    await click(detailSleeveToggle);
    assert.deepEqual(trials.at(-1).removedClothing, ['sleeves']);
    assert.deepEqual(characterLook(trials.at(-1)).garments, { dress: 'medieval-kaftan-01' });
    assert.equal(find(detailSleeveToggle).textContent.trim(), 'Restore sleeves');
    await open('underwear');
    assert.equal(find(sleeveToggle).textContent.trim(), 'Restore sleeves');
    await click(sleeveToggle);
    assert.equal(trials.at(-1).removedClothing, undefined);
    await open('corsets');
    await click('.dressing-catalog [data-wardrobe-remove=sleeves]');
    assert.deepEqual(trials.at(-1).removedClothing, ['sleeves']);
    assert.equal(trials.at(-1).garments.dress, 'medieval-kaftan-01', 'corset-section sleeve controls preserve the equipped dress');
    await open('tops');
    assert.equal(find('.dressing-catalog [data-wardrobe-remove=sleeves]').textContent.trim(), 'Restore sleeves');
    await click('.dressing-catalog [data-wardrobe-remove=sleeves]');
    assert.equal(trials.at(-1).removedClothing, undefined);
    await open('outfits');
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

    assertPiece('corset');
    await act(async () => root.unmount()); root = null;
    assert.equal(preview.getState().camera, 'Hands', 'leaving restores the previous camera');
    assert.equal(preview.getState().zoom, 1.2);

    root = createRoot(find('#root'));
    await act(async () => root.render(h(Harness, { initial: DEFAULT_CHARACTER })));
    await open('corsets');
    await click('.dressing-catalog [data-wardrobe-remove=sleeves]');
    assert(!find('[data-wearable-quick-select=sleeves]'));
    assert(find('[data-wearable-quick-select=corset]'), 'removing stock sleeves keeps the bodice');
    await open('tops');
    await click('.dressing-catalog [data-wardrobe-remove=sleeves]');
    assert(find('[data-wearable-quick-select=sleeves]'), 'Tops can restore the same sleeves');
    await open('bottoms');
    await click('[data-wardrobe-item=village-petticoat]');
    await click('[data-wardrobe-item=village-skirt]');
    await click('[data-remove-try-on]');
    assert(!find('[data-wearable-quick-select=skirt]'));
    assert(!find('[data-wearable-quick-select=underskirt]'));
    assert(find('[data-wearable-quick-select=briefs]'));
    await click('[data-wardrobe-item=remove-skirt]');
    assert(find('[data-wearable-quick-select=skirt]') && find('[data-wearable-quick-select=underskirt]'));
    await click('[data-wardrobe-item=skirt-01]');
    await click('[data-remove-try-on]');
    assert(find('[data-wearable-quick-select=briefs]') && !find('[data-wearable-quick-select=underskirt]'));
    assert.equal(trials.at(-1).garments.skirt, 'skirt-01', 'Restore skirt remembers the imported skirt');
    await click('[data-wardrobe-item=village-petticoat]');
    assert(!find('[data-wearable-quick-select=skirt]') && !find('[data-wearable-quick-select=belt]'));
    assert(find('[data-wearable-quick-select=underskirt]'), 'the petticoat can be worn on its own');
    await click('[data-wardrobe-item=remove-skirt]');
    assert.equal(characterLook(trials.at(-1)).garments.skirt, 'skirt-01', 'restoring remembers what was under review');
    const legacy = characterLook({ ...DEFAULT_CHARACTER, garments: { skirt: 'skirt-03' }, removedClothing: ['village-skirt'] });
    assert.equal(legacy.garments.skirt, 'skirt-03', 'a saved Village-only removal leaves the imported skirt on');
    await open('tops');
    await click('[data-wardrobe-item=top-02]');
    assert.equal(find('.dressing-catalog [data-wardrobe-remove=sleeves]'), null, 'a top without removable sleeves has no ineffective sleeve action');
    await click('[data-remove-try-on]');
    assert(find('[data-wearable-quick-select=bra]') && !find('[data-wearable-quick-select=corset]'));
    await click('[data-wardrobe-item=remove-top]');
    assert(find('[data-wearable-quick-select=shirt]') && !find('[data-wearable-quick-select=bra]'));
    await open('corsets');
    await click('[data-wardrobe-item=gothic-04]');
    await click('[data-remove-try-on]');
    assert(find('[data-wearable-quick-select=bra]') && !find('[data-wearable-quick-select=corset]'));
    await open('outfits');
    await click('[data-wardrobe-item=dockwear]');
    await open('tops');
    await click('[data-wardrobe-item=village-sleeves]');
    assert.equal(find('.dressing-details [data-wardrobe-remove=sleeves]').textContent.trim(), 'Remove sleeves');
    await click('[data-remove-try-on]');
    assert.deepEqual(trials.at(-1).removedClothing, ['sleeves']);
    assert(!find('[data-wearable-quick-select=sleeves]'));
    assert(find('[data-wearable-quick-select=corset]'));
    await click('[data-wardrobe-item=village-sleeves]');
    assert.equal(trials.at(-1).garments.sleeves, 'village-sleeves');
    await open('outfits');
    await click('[data-remove-outfit]');
    assert.deepEqual([...document.querySelectorAll('[data-wearable-quick-select]')].map(node => node.dataset.wearableQuickSelect).sort(), ['bra', 'briefs']);
    await click('[data-wardrobe-item=dockwear]');
    await click('[data-wardrobe-item=linen-nightgown]');
    await click('[data-remove-try-on]');
    assert(!find('[data-wearable-quick-select=dress]'));
    assert(!find('[data-wearable-quick-select=sleeves]'));
    await click('[data-wardrobe-item=dockwear]');
    await open('underwear');
    await click('[data-wardrobe-remove=top]');
    assertPiece('bra');
    assert(find('[data-wearable-quick-select="bra"]'));
    await click('[data-wardrobe-remove=bottom]');
    assertPiece('briefs');
    assert(find('[data-wearable-quick-select="briefs"]'));
    await click('[data-wearable-quick-select="bra"]');
    assertPiece('bra');
    assert.equal(find('.dressing-details h2').textContent, 'Bra');
    await open('outfits');
    await click('[data-wardrobe-item=dockwear]');
    const braToggle = '[data-wardrobe-toggle=bra]';
    const braCard = '[data-wardrobe-item=underwear-bra]';
    const wearingBra = () => find(braCard).getAttribute('aria-pressed') === 'true';
    await open('underwear');
    await click(braCard);
    assert(find(braToggle).disabled, 'the bundled bodice blocks the bra');
    await click('[data-wardrobe-remove=top]');
    assert(wearingBra());
    await click(braToggle);
    assert(!wearingBra(), 'removing the bra does not restore the removed tops');
    assert.deepEqual(trials.at(-1).removedClothing, ['top', 'corset']);
    await click(braToggle);
    await open('corsets');
    await click('[data-wardrobe-item=gothic-04]');
    assert.equal(trials.at(-1).bra, undefined, 'choosing the vest removes the bra');
    await open('underwear');
    await click(braCard);
    assert(!wearingBra() && !find(braToggle).disabled, 'the Underbust Vest allows an optional bra');
    await click(braToggle);
    assert(wearingBra());
    assert.equal(characterLook(trials.at(-1)).corset.set, 'gothic-04', 'the bra does not remove the vest');
    await open('corsets');
    await click('[data-wardrobe-item=gothic-04]');
    assert.equal(trials.at(-1).bra, true, 'inspecting the same vest retains the bra layering choice');
    await open('tops');
    await click('[data-wardrobe-item=top-02]');
    assert.equal(trials.at(-1).bra, undefined, 'choosing a top removes the bra');
    await open('underwear');
    await click(braCard);
    assert(!wearingBra() && find(braToggle).disabled, 'the selected top blocks the bra');
    await act(async () => root.unmount()); root = null;

    const rook = CHARACTERS.find(character => character.id === ROOK_ID);
    root = createRoot(find('#root'));
    await act(async () => root.render(h(Harness, { initial: { id: rook.id, outfit: rook.outfits[0].id } })));
    await open('outfits');
    assertPiece('coat');
    await click(`[data-wardrobe-item="${rook.outfits[0].id}"]`);
    await click('[data-camera-choice=Hands]');
    assert.equal(preview.getState().camera, 'Hands');
    assert.equal(find('[data-inspected]').dataset.wardrobeItem, rook.outfits[0].id, 'outfit gloves resolve to Rook’s equipped outfit');
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
