import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';

test('portraits stay available outside Heroes without character editing controls', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const original = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  })) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  HTMLElement.prototype.scrollIntoView = () => {};
  let vite, root;
  try {
    const { createRoot } = await import('react-dom/client');
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const load = path => vite.ssrLoadModule('/src/' + path);
    const { MainMenuProfile } = await load('game/menus/MainMenuProfile.tsx');
    const { ModeSelection } = await load('game/alpha/ModeSelection.tsx');
    const { MenuFrameHeader } = await load('components/menus/MenuFrame.tsx');
    const { PauseMenu } = await load('game/menus/PauseMenu.tsx');
    const { EditorDriveBar } = await load('worldBuilder/vehicleEditor/EditorDriveBar.tsx');
    const { CharacterHeaderProfile } = await load('game/characters/CharacterHeaderProfile.tsx');
    const { DEFAULT_CHARACTER } = await load('game/characters/characterCatalog.ts');
    const { writeLocalCharacter } = await load('game/characters/localOutfits.ts');
    const { useUIStore: ui } = await load('store/menus/uiStore.ts');
    const { useSocialStore: social } = await load('store/social/socialStore.ts');
    const { useNetworkStore } = await load('store/session/networkStore.ts');

    const view = {
      profile: { id: 'read-only-driver', name: 'Driver',
        progression: { character: DEFAULT_CHARACTER, cosmetics_revision: 1, tier: 'Bronze', prestige: 0, level: 1, xp: 0, required_xp: 100, credits: 0, color: '#ffffff' } },
      players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [],
      current_world_id: null, limits: { max_active_worlds: 3 },
    };
    social.getState().receive(view);
    root = createRoot(document.getElementById('root'));
    const find = selector => document.querySelector(selector);
    const show = (screen, element, more = {}) => act(async () => {
      ui.setState({ screen, overlay: null, isModeLoading: false, ...more });
      root.render(element);
    });
    const assertReadOnlyPortrait = () => {
      assert(find('.character-header-portrait'));
      assert.equal(find('[data-open-character]'), null);
      assert.equal(find('button.character-header-profile'), null);
    };

    await show('main', h(MainMenuProfile, { focusMenu: () => {} }));
    assert(find('.main-menu-profile-portrait'));
    await act(async () => find('[data-main-profile-toggle]').click());
    assert.match(find('.main-menu-profile-panel').textContent, /Continue as guest/);
    assert.doesNotMatch(find('.main-menu-profile-panel').textContent, /Edit character/i);

    await show('mode_select', h(ModeSelection));
    assertReadOnlyPortrait();

    await show('settings', h(MenuFrameHeader, { title: 'Settings', showProgress: true, backAction: { onClick: () => {} } }));
    assertReadOnlyPortrait();
    assert(find('.menu-header-actions [aria-label="Driver progression"]'));

    await show('sandbox', h(PauseMenu), { overlay: 'pause' });
    assertReadOnlyPortrait();

    const onOpen = () => assert.fail('an outside header must never open the character editor');
    await show('mode_select', h(CharacterHeaderProfile, { onOpen }));
    assertReadOnlyPortrait();
    await act(async () => writeLocalCharacter({ id: 'jules-okafor', outfit: 'race-crew' }));
    assert.match(find('.character-header-info').textContent, /Vesper Vega/, 'the profile character takes priority over a device save');
    const receiveCharacter = (character, cosmetics_revision) => act(async () => social.getState().receive({
      ...view, profile: { ...view.profile, progression: { ...view.profile.progression, character, cosmetics_revision } },
    }));
    await receiveCharacter(null, 2);
    assert.match(find('.character-header-info').textContent, /Rook Okafor/, 'a device save appears without a profile character');
    await act(async () => writeLocalCharacter(DEFAULT_CHARACTER));
    assert.match(find('.character-header-info').textContent, /Vesper Vega/);
    await receiveCharacter({ id: 'jules-okafor', outfit: 'night-run' }, 3);
    assert.match(find('.character-header-info').textContent, /Rook Okafor/, 'saved profile hydration still updates the read-only display');
    assertReadOnlyPortrait();

    await show('heroes', h(CharacterHeaderProfile, { onOpen }), { overlay: 'settings' });
    assertReadOnlyPortrait();
    await show('heroes', h(CharacterHeaderProfile, { onOpen }), { isModeLoading: true });
    assertReadOnlyPortrait();

    social.setState({ view: { ...social.getState().view, alpha: { active: { mode: 'editor', hero: 'brz' } } } });
    useNetworkStore.setState({ connected: true });
    await show('sandbox', h(EditorDriveBar));
    const hud = find('[aria-label="World editor HUD tools"]');
    assert(hud);
    assert.match(hud.textContent, /EDIT VEHICLE/);
    assert.doesNotMatch(hud.textContent, /EDIT CHARACTER/);
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
