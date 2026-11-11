import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';

test('character tools preserve builder drafts, frame close-ups, and wait for appearance saves before returning', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const original = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, HTMLSelectElement: dom.window.HTMLSelectElement, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  })) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  HTMLElement.prototype.scrollIntoView = () => {};
  let vite, root;
  try {
    const { createRoot } = await import('react-dom/client');
    vite = await createServer({ define: { __WARDROBE_SET_IDS__: JSON.stringify(['gothic-01']) },
      server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const load = path => vite.ssrLoadModule('/src/' + path);
    const { CharacterEditorPanel } = await load('worldBuilder/characterEditor/CharacterEditorPanel.tsx');
    const { openCharacterEditor, leaveCharacterEditor, useCharacterEditorStore: editor, CHARACTER_SHOTS } = await load('worldBuilder/characterEditor/characterEditorStore.ts');
    const { characterFrame } = await load('worldBuilder/characterEditor/characterFraming.ts');
    const { useBuilderStore: builder } = await load('worldBuilder/state/builderStore.ts');
    const { useUIStore: ui } = await load('store/menus/uiStore.ts');
    const { useSocialStore: social } = await load('store/social/socialStore.ts');
    const { useCharacterPreviewStore: preview } = await load('game/characters/characterPreviewStore.ts');
    const { DEFAULT_CHARACTER } = await load('game/characters/characterCatalog.ts');
    const client = await load('net/socialClient.ts');
    const requests = [];
    client.setSocialConnection({ readyState: WebSocket.OPEN, send: value => requests.push(JSON.parse(value)) });
    social.setState({ view: { profile: { id: 'editor-test', name: 'Driver', progression: { character: DEFAULT_CHARACTER, tier: "Bronze", prestige: 0, level: 1, xp: 0, required_xp: 100, credits: 0, color: "#ffffff" } } } });
    const draft = { marker: 'unsaved world' }, history = [draft];
    builder.setState({ doc: draft, past: history, selected: 'road-1', workspace: 'colliders', presentation: 'hud' });
    ui.setState({ screen: 'sandbox', overlay: 'world_builder', isModeLoading: false });
    openCharacterEditor();
    assert.equal(builder.getState().workspace, 'character');
    assert.equal(preview.getState().playbackPaused, true);
    assert.equal(preview.getState().automaticEmotes, false);
    assert.equal(editor.getState().choice, DEFAULT_CHARACTER);
    assert.equal(builder.getState().doc, draft);
    assert.equal(builder.getState().past, history);

    for (const shot of CHARACTER_SHOTS) for (const aspect of [.35, 1, 2.5]) {
      const frame = characterFrame(shot, 1.7, aspect);
      assert(Number.isFinite(frame.distance) && frame.distance > .12 && frame.distance < 15);
      assert(frame.center > 0 && frame.center < 1.7);
    }
    assert(characterFrame('Face', 1.7, 1).distance < characterFrame('Full body', 1.7, 1).distance / 3);
    assert.equal(characterFrame('Back', 1.7, 1).angle, Math.PI);
    assert.equal(characterFrame('Left', 1.7, 1).angle, -characterFrame('Right', 1.7, 1).angle);

    root = createRoot(document.getElementById('root'));
    const find = selector => document.querySelector(selector);
    const click = async selector => act(async () => { assert(find(selector), selector); find(selector).click(); });
    const cameraChoice = value => `[aria-label="Character close-up"] [data-camera-choice="${value}"]`;
    await act(async () => root.render(h(CharacterEditorPanel)));
    assert(find('.menu-frame-header .character-header-portrait'));
    assert.equal(find('.menu-frame-header [data-open-character]'), null, 'the editor cannot reopen itself');
    assert.equal(find('[aria-label="Preview camera"]'), null, 'the garage camera cannot fight the editor orbit controls');
    await click('[data-category=outfits]');
    assert.equal(find(cameraChoice('piece:corset')).getAttribute('aria-pressed'), 'true');
    await click('[data-wardrobe-back]');
    await click('[data-category=props]');
    assert.equal(editor.getState().shot, 'Hands');
    await click('[data-wardrobe-item=shop-bag]');
    assert.equal(find(cameraChoice('piece:bag')).getAttribute('aria-pressed'), 'true');
    await click('[data-wardrobe-item=empty-hands]');
    assert.equal(editor.getState().shot, 'Hands');
    await click('[data-wardrobe-back]');
    await click('[data-category=face]');
    assert.equal(editor.getState().shot, 'Face');
    assert(find('.fitting-camera-panel').hidden);
    await click('.dressing-toolbar [aria-label="Camera tools"]');
    assert.equal(find('.fitting-camera-panel').hidden, false);
    await click(cameraChoice('Back'));
    assert.equal(editor.getState().shot, 'Back');
    await click(cameraChoice('piece:shoes'));
    assert.equal(editor.getState().shot, 'Selected item');
    assert.equal(preview.getState().selectedPiece, 'shoes');
    await click('[aria-label="Hide interface"]');
    assert.equal(editor.getState().panelsHidden, true);
    await act(async () => window.dispatchEvent(new Event('avenlab:character-editor-close')));
    assert.equal(editor.getState().panelsHidden, false, 'back first restores hidden editing controls');
    assert.equal(builder.getState().workspace, 'character');
    await click('#character-editor-tab-emotes');
    assert(find('.dressing-toolbar .fitting-camera-toolbar'), 'World Builder uses the same bottom toolbar for Emotes');
    assert.equal(find('[data-character-option]'), null);
    const cameraTools = '.dressing-toolbar [aria-label="Camera tools"]';
    if (find('.fitting-camera-panel').hidden) await click(cameraTools);
    await click(cameraChoice('Face'));
    assert.equal(editor.getState().shot, 'Face');
    await act(async () => {
      find(cameraChoice('Face')).focus();
      window.dispatchEvent(new CustomEvent('avenlab:panel-action', { detail: 'back' }));
    });
    assert(find('.fitting-camera-panel').hidden);
    assert.equal(document.activeElement, find(cameraTools));
    assert.equal(builder.getState().workspace, 'character', 'controller Back dismisses camera views before leaving the editor');
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().playbackPaused, false, 'choosing an emote starts it even after holding a pose');
    await click('.dressing-toolbar button[aria-label="Hold pose"]');
    assert.equal(preview.getState().playbackPaused, true);
    await click('#character-editor-tab-appearance');
    await click('[data-category=tops]');
    await click('[data-wardrobe-item=gothic-01]');
    assert.equal(editor.getState().choice.wardrobe.set, 'gothic-01');
    await click('.controller-shortcut-back');
    assert.equal(requests.length, 1);
    assert.equal(builder.getState().workspace, 'character', 'closing waits for the acknowledged save');
    await act(async () => client.receiveSocialResult({ request_id: requests[0].request_id, ok: false, error: 'Connection lost' }));
    assert.equal(builder.getState().workspace, 'character', 'failed save keeps the draft available');
    await click('.controller-shortcut-back');
    assert.equal(requests.length, 2);
    await act(async () => client.receiveSocialResult({ request_id: requests[1].request_id, ok: true, data: { character: requests[1].character } }));
    assert.equal(builder.getState().workspace, 'colliders');
    assert.equal(builder.getState().presentation, 'hud');
    assert.equal(builder.getState().doc, draft);
    assert.equal(builder.getState().past, history);
    assert.equal(builder.getState().selected, 'road-1');
    assert.equal(ui.getState().overlay, 'world_builder');
    await act(async () => root.unmount()); root = null;
    assert.equal(preview.getState().automaticEmotes, true);
    assert.equal(preview.getState().playbackPaused, false);

    // The same editor opens from Play/Explore without joining or loading a world.
    ui.setState({ screen: 'mode_select', overlay: null });
    openCharacterEditor();
    assert.equal(ui.getState().screen, 'world_builder');
    assert.equal(editor.getState().choice.wardrobe.set, 'gothic-01');
    leaveCharacterEditor();
    assert.equal(ui.getState().screen, 'mode_select');
    assert.equal(ui.getState().overlay, null);
    assert.equal(builder.getState().doc, draft);

    const { ModeSelection } = await load('game/alpha/ModeSelection.tsx');
    social.setState({ view: { ...social.getState().view, players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [],
      current_world_id: null, limits: { max_active_worlds: 3 } } });
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(h(ModeSelection)));
    await click('[data-open-character]');
    assert.equal(ui.getState().screen, 'world_builder', 'the actual Play/Explore profile opens the editor');
    await act(async () => root.unmount()); root = null;
    leaveCharacterEditor();

    const { MenuFrameHeader } = await load('components/menus/MenuFrame.tsx');
    ui.setState({ screen: 'settings', overlay: null });
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(h(MenuFrameHeader, { title: 'Settings', showProgress: true })));
    assert.equal(document.querySelectorAll('.character-header-portrait').length, 1);
    assert(find('.menu-header-actions [aria-label="Driver progression"]'));
    await click('.menu-header-actions [data-open-character]');
    assert.equal(ui.getState().screen, 'world_builder');
    leaveCharacterEditor();
    assert.equal(ui.getState().screen, 'settings');
    await act(async () => root.unmount()); root = null;

    const { MainMenu } = await load('game/menus/MainMenu.tsx');
    dom.window.HTMLMediaElement.prototype.play = async () => {};
    dom.window.HTMLMediaElement.prototype.pause = () => {};
    ui.setState({ screen: 'main', overlay: null });
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(h(MainMenu)));
    await click('header [data-main-profile-toggle]');
    await click('header [data-open-character]');
    assert.equal(ui.getState().screen, 'world_builder', 'the main-menu portrait opens the same editor');
    await act(async () => root.unmount()); root = null;
    leaveCharacterEditor();
    assert.equal(ui.getState().screen, 'main', 'returning restores the main menu');

    // Vehicle tuning stays mounted, but its controller listener is suspended.
    const { WorldBuilderPanel } = await load('worldBuilder/panels/WorldBuilderPanel.tsx');
    social.setState({ view: { ...social.getState().view, alpha: { active: { mode: 'editor', hero: 'brz' } } } });
    builder.setState({ workspace: 'vehicle', doc: null });
    ui.setState({ screen: 'sandbox', overlay: 'world_builder' });
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(h(WorldBuilderPanel)));
    const getVehicle = requests.at(-1);
    await act(async () => client.receiveSocialResult({ request_id: getVehicle.request_id, ok: true,
      data: { vehicle: 'brz', factory: { mass: 1350 }, current: { mass: 1500 } } }));
    const vehiclePanel = find('[aria-label="Vehicle editor"]');
    const vehicleRequestCount = requests.length;
    await act(async () => vehiclePanel.querySelector('header [data-open-character]').click());
    assert.equal(vehiclePanel, find('[aria-label="Vehicle editor"]'));
    assert.equal(vehiclePanel.parentElement.hidden, true);
    await act(async () => window.dispatchEvent(new CustomEvent('avenlab:panel-action', { detail: 'back' })));
    assert.equal(builder.getState().workspace, 'vehicle', 'the hidden tuning panel cannot also handle Back and exit to Layout');
    assert.equal(vehiclePanel, find('[aria-label="Vehicle editor"]'), 'returning reuses the same tuning form');
    assert.equal(vehiclePanel.parentElement.hidden, false);
    assert.equal(requests.length, vehicleRequestCount, 'opening character tools never reloads the tuning draft');
    assert.equal(vehiclePanel.querySelector('input[type=number]').value, '1500');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite?.close(); dom.window.close();
    for (const [key, value] of original) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
  }
});
