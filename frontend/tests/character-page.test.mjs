import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

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
    const characterViews = [];
    await act(async () => root.render(h(HeroWorkshop, { onCharacterViewChange: open => characterViews.push(open) })));
    const find = selector => document.querySelector(selector);
    const click = selector => act(async () => find(selector).click());
    const move = action => act(async () => route(action));
    const title = () => find('.menu-frame-header h1').textContent;

    assert.equal(title(), 'HEROES');
    await move('down');
    assert.equal(document.activeElement, find('[data-open-character]'));
    await move('activate');
    assert.equal(title(), 'CHARACTER');
    assert.equal(find('.hero-roster'), null);
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'mara-vega');
    assert.equal(characterViews.at(-1), true);

    await move('right');
    await move('activate');
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'jules-okafor');
    await click('.character-outfits button:last-child');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(requests.length, 0);
    await click('.character-equip button');
    assert.equal(find('.character-equip button').disabled, true);
    await act(async () => client.receiveSocialResult({ request_id: requests[0].request_id, ok: false, message: 'Try again.' }));
    assert.equal(find('.character-equip [role=status]').textContent, 'Try again.');
    assert.equal(social.getState().view.profile.progression.character, null);

    await click('.character-equip button');
    const choice = { id: 'jules-okafor', outfit: 'race-crew' };
    assert.equal(requests[1].action, 'character_equip');
    assert.deepEqual(requests[1].character, choice);
    await act(async () => {
      social.getState().receive({ ...view, profile: { ...view.profile, progression: { ...view.profile.progression, character: choice } } });
      client.receiveSocialResult({ request_id: requests[1].request_id, ok: true, data: { character: choice } });
    });
    assert.equal(find('.character-equip button').disabled, true);
    await move('back');
    assert.equal(title(), 'HEROES');
    assert.equal(characterViews.at(-1), false);
    assert.match(find('[data-open-character]').textContent, /Jules Okafor/);
    await click('[data-hero=camaro]');
    assert.equal(title(), 'GARAGE');
    assert.equal(alpha.getState().previewHero, 'camaro');
    assert.equal(loadouts.getState().defaultHero, 'brz');
    assert.deepEqual(social.getState().view.profile.progression.character, choice);
    await move('back');
    await click('[data-open-character]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(requests.length, 2);
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
