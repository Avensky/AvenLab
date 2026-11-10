import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimationMixer, LoopOnce, Object3D } from 'three';

test('Heroes opens the character picker, saves one profile choice, and opens Garage from a vehicle', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const original = new Map();
  let vite, root;
  const globals = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, HTMLSelectElement: dom.window.HTMLSelectElement,
    Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  document.hasFocus = () => true;
  HTMLElement.prototype.scrollIntoView = () => {};
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const load = path => vite.ssrLoadModule(`/src/${path}`);
    const { HeroWorkshop } = await load('game/heroes/HeroWorkshop.tsx');
    const { useUIStore: ui } = await load('store/menus/uiStore.ts');
    const { useSocialStore: social } = await load('store/social/socialStore.ts');
    const { useHeroLoadouts: loadouts } = await load('vehicles/cosmetics/heroLoadouts.ts');
    const { useAlphaStore: alpha } = await load('store/alpha/alphaStore.ts');
    const { routeMenuAction: route } = await load('controls/inputRouting.ts');
    const client = await load('net/socialClient.ts');
    const requests = [];
    client.setSocialConnection({ readyState: WebSocket.OPEN, send: value => requests.push(JSON.parse(value)) });
    const view = {
      profile: { id: 'driver', name: 'Driver', progression: { default_hero: 'brz', character: null } },
      players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [],
      current_world_id: null, limits: { max_active_worlds: 3 },
    };
    social.getState().receive(view);
    loadouts.getState().adopt('driver', 'brz');
    ui.setState({ screen: 'heroes', overlay: null, isModeLoading: false });
    root = createRoot(document.getElementById('root'));
    const characterViews = [], drafts = [];
    await act(async () => root.render(h(HeroWorkshop, {
      onCharacterViewChange: open => characterViews.push(open),
      onCharacterPreviewChange: choice => drafts.push(choice),
    })));
    const find = selector => document.querySelector(selector);
    const click = selector => act(async () => find(selector).click());
    const move = action => act(async () => route(action));
    const title = () => find('.menu-frame-header h1').textContent;

    assert.equal(title(), 'HEROES');
    await click('[data-open-character]');
    assert.equal(title(), 'CHARACTER');
    assert.equal(find('.hero-roster'), null);
    assert.equal(find('[role=tab]'), null);
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'mara-vega');
    const vesperPortrait = find('[data-character-option="mara-vega"] .character-portrait');
    assert(vesperPortrait?.matches('span.character-portrait--unavailable'), 'Vesper keeps a neutral portrait when WebGL is unavailable');
    await click('[data-character-option="jules-okafor"]');
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'jules-okafor');
    assert.equal(requests.length, 0);
    await click('.character-equip button');
    assert.equal(requests[0].action, 'character_equip');
    const choice = { id: 'jules-okafor', outfit: 'night-run' };
    assert.deepEqual(requests[0].character, choice);
    const acknowledge = async (request, character) => {
      await act(async () => {
        social.getState().receive({ ...view, profile: { ...view.profile, progression: { ...view.profile.progression, character } } });
        client.receiveSocialResult({ request_id: request.request_id, ok: true, data: { character } });
      });
    };
    await acknowledge(requests[0], choice);
    assert.equal(find('[data-character-option]'), null);
    assert.deepEqual([...document.querySelectorAll('[role=tab]')].map(node => node.textContent), ['Appearance', 'Clothes', 'Props', 'Emotes']);
    await click('#character-editor-tab-clothes');
    await click('.character-outfits[aria-label="Outfits"] button:last-child');
    const gothic = [...document.querySelectorAll('button')].find(button => button.textContent === 'Gothic Pink');
    await act(async () => gothic.click());
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(drafts.at(-1).appearance.color, '#101015');
    assert.equal(find('input[aria-label="Clothing accent color"]').value, '#ff2d95');
    assert.equal(requests.length, 1);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    assert.equal(requests.length, 2, 'rapid changes coalesce');
    await click('#character-editor-tab-props');
    await click('.character-outfits[aria-label="Props"] button:last-child');
    assert.equal(drafts.at(-1).prop, 'shop-bag');
    await click('#character-editor-tab-emotes');
    assert([...document.querySelectorAll('.character-emotes button')].some(button => button.textContent === 'Lift the bag'));
    assert(![...document.querySelectorAll('.character-emotes button')].some(button => button.textContent === 'Hands behind back'));
    assert.equal(find('input[aria-label="Preview zoom"]').max, '1.25');
    await acknowledge(requests[1], requests[1].character);
    assert.equal(requests.length, 3, 'queued prop waits for the previous save');
    assert.equal(requests[2].character.prop, 'shop-bag');
    await acknowledge(requests[2], requests[2].character);
    await move('back');
    assert.equal(title(), 'HEROES');
    assert.equal(characterViews.at(-1), false);
    assert.equal(drafts.at(-1), null);
    assert.match(find('[data-open-character]').textContent, /Rook Okafor/);
    await click('[data-hero=camaro]');
    assert.equal(title(), 'GARAGE');
    assert.equal(alpha.getState().previewHero, 'camaro');
    assert.equal(loadouts.getState().defaultHero, 'brz');
    await move('back');
    await click('[data-open-character]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(find('[data-character-option]'), null, 'gender stays locked after reopening');

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

test('the garage emote batch has ten distinct clips that return the driver to rest', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { buildGarageEmotes } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { characterLook } = await vite.ssrLoadModule('/src/game/characters/characterCatalog.ts');
    const { prepareStylizedDriver } = await vite.ssrLoadModule('/src/game/characters/stylizedDriverModel.ts');
    const model = prepareStylizedDriver(characterLook({ id: 'jules-okafor', outfit: 'night-run' }));
    const turntable = new Object3D();
    turntable.rotation.y = 1;
    turntable.add(model.root);
    const capture = () => {
      const values = [];
      model.root.traverse(node => { if (node.isGroup) values.push(...node.position, ...node.quaternion); });
      return values;
    };
    const rest = capture();
    const clips = buildGarageEmotes(model.root);
    const mixer = new AnimationMixer(model.root);
    assert.deepEqual(clips.map(clip => clip.name.slice(0, 3)), Array.from({length: 10}, (_, i) => String(i + 1).padStart(3, '0')));
    for (const clip of clips) {
      const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.reset().play();
      mixer.update(clip.duration * .36);
      assert(capture().some((value, i) => Math.abs(value - rest[i]) > .005), clip.name);
      mixer.update(clip.duration);
      action.stop();
      assert(capture().every((value, i) => Math.abs(value - rest[i]) < 1e-6), clip.name);
    }
    mixer.uncacheRoot(model.root);
    model.dispose();
  } finally {
    await vite.close();
  }
});
