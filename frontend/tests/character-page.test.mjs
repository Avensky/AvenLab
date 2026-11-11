import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { AnimationMixer, LoopOnce, Object3D, Vector3 } from 'three';

test('Heroes opens the character picker, saves one profile choice, and opens Garage from a vehicle', async t => {
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
    const { usePreviewZoom: zoom } = await load('game/preview/previewZoomStore.ts');
    const { useCharacterPreviewStore: preview } = await load('game/characters/characterPreviewStore.ts');
    const { routeMenuAction: route } = await load('controls/inputRouting.ts');
    const client = await load('net/socialClient.ts');
    const requests = [];
    client.setSocialConnection({ readyState: WebSocket.OPEN, send: value => requests.push(JSON.parse(value)) });
    const view = {
      profile: { id: 'driver', name: 'Driver', progression: { default_hero: 'brz', hero_loadouts: {}, character: null, character_presets: {}, cosmetics_revision: 0 } },
      players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [],
      current_world_id: null, limits: { max_active_worlds: 3 },
    };
    social.getState().receive(view);
    loadouts.getState().adopt('driver', 'brz');
    ui.setState({ screen: 'heroes', overlay: null, isModeLoading: false });
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    const characterViews = [], drafts = [];
    await act(async () => root.render(h(HeroWorkshop, {
      onCharacterViewChange: open => characterViews.push(open),
      onCharacterPreviewChange: choice => drafts.push(choice),
    })));
    const find = selector => document.querySelector(selector);
    const click = selector => act(async () => find(selector).click());
    const browseWardrobe = async category => {
      const back = find('[data-wardrobe-back]');
      if (back && !back.closest('[hidden]')) await click('[data-wardrobe-back]');
      await click(`[data-category=${category}]`);
    };
    const select = (label, value) => act(async () => {
      const input = find(`select[aria-label="${label}"]`);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const move = action => act(async () => route(action));
    const title = () => find('.menu-frame-header h1').textContent;

    assert.equal(title(), 'HEROES');
    await click('[aria-label="Zoom vehicle in"]');
    assert.equal(zoom.getState().level, 1);
    await click('[aria-label="Reset vehicle zoom"]');
    assert.equal(zoom.getState().level, 0);
    await click('[data-open-character]');
    assert.equal(title(), 'CHARACTER');
    assert.equal(find('.hero-roster'), null);
    assert.equal(find('[role=tab]'), null);
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'mara-vega');
    const vesperPortrait = find('[data-character-option="mara-vega"] .character-portrait');
    assert(vesperPortrait?.matches('span.character-portrait--unavailable'), 'Vesper keeps a neutral portrait when WebGL is unavailable');
    assert(![...document.querySelectorAll('.character-emotes button')].some(button => button.querySelector('.emote-name')?.textContent === 'Side step and glance'));
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '005');
    await click('[aria-label="Emote preview"] button:first-child');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 8);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '035');
    await click('[aria-label="Emote collection"] button:nth-child(3)');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 11);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '021');
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, 'robot-dance');
    await click('[aria-label="Emote collection"] button:nth-child(4)');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 11);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '035');
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, 'oh-no');
    await click('[aria-label="Emote collection"] button:nth-child(5)');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '050');
    await click('[aria-label="Emote collection"] button:nth-child(6)');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '051');
    await click('[aria-label="Emote collection"] button:nth-child(7)');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 7);
    assert.equal(find('.character-emotes button:last-child .emote-name').textContent, 'Wave them through');
    await click('[aria-label="Emote collection"] button:nth-child(8)');
    assert.equal(find('[aria-label="Emote collection"] button:nth-child(8)').textContent, 'Rivalry');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 8);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '071');
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '080');
    await click('[aria-label="Emote collection"] button:nth-child(9)');
    assert.equal(find('[aria-label="Emote collection"] button:nth-child(9)').textContent, 'Pit Crew');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 9);
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '090');
    await click('[aria-label="Emote collection"] button:nth-child(10)');
    assert.equal(find('[aria-label="Emote collection"] button:nth-child(10)').textContent, 'After Hours');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '091');
    await click('.character-emotes button:nth-child(5)');
    assert.equal(preview.getState().emote.id, '095');
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '100');
    await click('[aria-label="Emote collection"] button:nth-child(11)');
    assert.equal(find('[aria-label="Emote collection"] button:nth-child(11)').textContent, 'Showroom');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '103');
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '112');
    for (const [index, name, first, last] of [
      [12, 'Elegant', 113, 120], [14, 'Stoic', 131, 140], [15, 'Explorer', 141, 150],
      [16, 'Tech', 151, 160], [17, 'Workshop', 161, 170], [18, 'Starter', 171, 180],
      [19, 'Starter Comedy', 181, 190], [20, 'Race Reactions', 191, 198],
    ]) {
      const selector = `[aria-label="Emote collection"] button:nth-child(${index})`;
      assert.equal(find(selector).textContent, name);
      await click(selector);
      assert.equal(document.querySelectorAll('.character-emotes button').length, last - first + 1);
      await click('.character-emotes button:first-child');
      assert.equal(preview.getState().emote.id, String(first));
      await click('.character-emotes button:last-child');
      assert.equal(preview.getState().emote.id, String(last));
    }
    await click('[aria-label="Emote collection"] button:nth-child(13)');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 11);
    assert.equal(find('.character-emotes button:last-child .emote-name').textContent, 'Hands up');
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, 'hands-up-crowd');
    await click('[aria-label="Emote collection"] button:first-child');
    await click('[data-character-option="jules-okafor"]');
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'jules-okafor');
    assert.equal(requests.length, 0);
    await click('.character-equip button');
    assert.equal(requests[0].action, 'character_equip');
    const choice = { id: 'jules-okafor', outfit: 'night-run' };
    assert.deepEqual(requests[0].character, choice);
    let serverProgression = view.profile.progression;
    const acknowledge = async (request, character, publish = true) => {
      const previous = serverProgression.character;
      const presets = { ...serverProgression.character_presets };
      if (previous && previous.id !== character.id) presets[previous.id] = previous;
      delete presets[character.id];
      serverProgression = { ...serverProgression, character, character_presets: presets, cosmetics_revision: serverProgression.cosmetics_revision + 1 };
      await act(async () => {
        if (publish) social.getState().receive({ ...view, profile: { ...view.profile, progression: serverProgression } });
        client.receiveSocialResult({ request_id: request.request_id, ok: true, data: serverProgression });
      });
    };
    await acknowledge(requests[0], choice);
    assert.equal(find('[aria-label="Character model"] [data-character-option="jules-okafor"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual([...document.querySelectorAll('[role=tab]')].map(node => node.textContent), ['Identity', 'Appearance', 'Emotes']);
    await click('#character-editor-tab-emotes');
    assert(find('[aria-label="Emote results"]').classList.contains('character-controls--right'));
    assert(find('[aria-label="Emote collection"]').closest('.character-controls--left'));
    await act(async () => [...document.querySelectorAll('[aria-label="Emote collection"] button')].find(b => b.textContent === 'All').click());
    assert(document.querySelectorAll('.character-emotes button').length > 180);
    await act(async () => {
      const input = find('[aria-label="Search emotes"]');
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'applause');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert(document.querySelectorAll('.character-emotes button').length > 0);
    assert([...document.querySelectorAll('.character-emotes .emote-name')].every(n => n.textContent.toLowerCase().includes('applause')));
    await click('[aria-label="Emote collection"] button:first-child');

    const cockpitToggle = '[data-cockpit-toggle]';
    await act(async () => preview.setState({ cockpitVehicle: 'brz' }));
    assert.equal(find(cockpitToggle).disabled, false, 'the selected vehicle has its own cockpit');
    assert.equal(find('[aria-label="Driving emotes"]'), null);
    await click(cockpitToggle);
    assert.equal(preview.getState().insideCar, true);
    assert.equal(find('[aria-label="Emote collection"]'), null);
    assert.equal(find('[aria-label="Driving emotes"] button:first-child').disabled, true);
    await act(async () => preview.setState({ cockpitAvailable: true }));
    assert.equal(find('[aria-label="Driving emotes"] button:last-child .emote-name').textContent, 'Steering test · Right');
    assert.equal(find('[aria-label="Driving emotes"] button:first-child').disabled, false);
    await select('Preview camera', 'Whole car');
    await click('[aria-label="Driving emotes"] button:last-child');
    assert.equal(preview.getState().emote.id, '200');
    assert.equal(preview.getState().camera, 'Whole car');
    await select('Preview camera', 'Full body');
    await click(cockpitToggle);
    assert.equal(preview.getState().insideCar, false);
    assert.equal(preview.getState().emote, null);
    await click(cockpitToggle);
    await click('#character-editor-tab-appearance');
    await browseWardrobe('outfits');
    assert.equal(find('[aria-label="Preview camera"]').value, 'piece:coat');
    await browseWardrobe('face');
    assert(find('.dressing-toolbar button[aria-label="Hide interface"]'), 'dressing room keeps the eye beside its camera');
    assert.equal(preview.getState().camera, 'Face');
    assert.equal(preview.getState().insideCar, false);
    assert.equal(preview.getState().emote, null);
    assert.equal(find('[data-wardrobe-item="eye_color:original"]').getAttribute('aria-pressed'), 'true');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await click('[data-wardrobe-item="eye_color:obsidian"]');
    await click('[data-wardrobe-item="brow_color:copper"]');
    await browseWardrobe('accessories');
    await click('[data-wardrobe-item="glasses:aviator"]');
    assert.equal(drafts.at(-1).appearance.eye_color, 'obsidian');
    assert.equal(drafts.at(-1).appearance.brow_color, 'copper');
    assert.equal(drafts.at(-1).appearance.glasses, 'aviator');
    assert.equal(preview.getState().camera, 'Selected item');
    assert.equal(find('[aria-label="Preview camera"]').value, 'piece:glasses');
    assert.equal(find('[aria-label="Clothing piece"]'), null, 'the camera selector also inspects clothing');
    assert(find('[aria-label="Preview camera"]').closest('[hidden]'), 'camera controls start collapsed');
    await click('button[aria-label="Camera tools"]');
    assert.equal(find('[aria-label="Preview camera"]').closest('[hidden]'), null);
    assert.equal([...find('[aria-label="Preview camera"]').options].some(option => option.value === 'Whole car'), false);
    assert.equal(find('.dressing-toolbar [data-rotation=vehicle]'), null);
    await select('Preview camera', 'Full body');
    assert.equal(preview.getState().camera, 'Full body');
    await select('Preview camera', 'piece:glasses');
    assert.equal(preview.getState().selectedPiece, 'glasses');
    assert.equal(preview.getState().camera, 'Selected item');
    assert.equal(find('.dressing-color-panel').hidden, true);
    assert.equal(find('[aria-label="Open clothing colors"]').textContent, '', 'the toolbar uses a swatch icon');
    await click('[aria-label="Open clothing colors"]');
    assert.equal(find('.dressing-color-panel').hidden, false);
    assert(find('[aria-label="Preview camera"]').closest('[hidden]'), 'opening colors closes the camera tools');
    const initialMain = find('input[aria-label="Custom main color"]').value;
    await click('button[aria-label="Accent color: Crimson"]');
    assert.equal(find('input[aria-label="Custom main color"]').value, initialMain);
    await click('button[aria-label="Main color: Deep navy"]');
    assert.equal(find('input[aria-label="Custom main color"]').value, '#293953');
    assert.equal(find('input[aria-label="Custom accent color"]').value, '#ad444d');
    assert.equal(preview.getState().camera, 'Selected item', 'applying color keeps the current close-up');
    await browseWardrobe('outfits');
    assert.equal(find('.dressing-color-panel').hidden, true, 'browsing dismisses the color palette');
    await click('[data-wardrobe-item=race-crew]');
    assert.equal(find('[aria-label="Preview camera"]').value, 'piece:coat');
    await click('[aria-label="Open clothing colors"]');
    await click('button[aria-label="Gothic Pink"]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(drafts.at(-1).appearance.item_colors['aviator:glasses'].color, '#293953');
    assert.equal(drafts.at(-1).appearance.item_colors['aviator:glasses'].accent, '#ad444d');
    assert.equal(drafts.at(-1).appearance.item_colors['race-crew:coat'].color, '#101015');
    assert.equal(drafts.at(-1).appearance.color, 'original', 'piece dye leaves the overall outfit palette unchanged');
    assert.equal(find('input[aria-label="Custom accent color"]').value, '#ff2d95');
    await click('[aria-label="Close clothing colors"]');
    assert.equal(find('.dressing-color-panel').hidden, true);
    await click('[aria-label="Open clothing colors"]');
    await act(async () => {
      const preset = find('.dressing-color-preset');
      preset.focus();
      preset.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(find('.dressing-color-panel').hidden, true, 'Escape closes the palette before it can leave the fitting room');
    assert.equal(document.activeElement, find('[aria-label="Open clothing colors"]'));
    await click('#character-editor-tab-identity');
    await select('Character personality', 'tsundere');
    await click('#character-editor-tab-emotes');
    await select('Animation clothing fit', 'fitted');
    await click('#character-editor-tab-appearance');
    assert.equal(requests.length, 1);
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests.length, 2, 'rapid changes coalesce');
    assert.equal(requests[1].character.appearance.eye_color, 'obsidian');
    assert.equal(requests[1].character.appearance.brow_color, 'copper');
    assert.equal(requests[1].character.appearance.glasses, 'aviator');
    assert.equal(requests[1].character.appearance.personality, 'tsundere');
    assert.equal(requests[1].character.appearance.animation_fit, 'fitted');
    await browseWardrobe('props');
    await click('[data-wardrobe-item=shop-bag]');
    assert.equal(drafts.at(-1).prop, 'shop-bag');
    await click('#character-editor-tab-emotes');
    assert.equal(find(cockpitToggle).disabled, false, 'a prop never prevents driving previews');
    assert([...document.querySelectorAll('.character-emotes button')].some(button => button.querySelector('.emote-name')?.textContent === 'Lift the bag'));
    assert([...document.querySelectorAll('.character-emotes button')].some(button => button.querySelector('.emote-name')?.textContent === 'Hands behind back'));
    assert.equal(find('input[aria-label="Preview zoom"]').max, '1.25');
    await click(cockpitToggle);
    assert.equal(preview.getState().insideCar, true);
    assert.match(document.body.textContent, /Handheld props are stowed while driving/);
    assert.equal(drafts.at(-1).prop, 'shop-bag', 'preview stowing keeps the equipped prop');
    assert([...document.querySelectorAll('[aria-label="Driving emotes"] button')].some(button => button.querySelector('.emote-name')?.textContent === 'Honk'));
    await click(cockpitToggle);
    await click('[aria-label="Emote collection"] button:nth-child(2)');
    assert([...document.querySelectorAll('.character-emotes button')].some(button => button.querySelector('.emote-name')?.textContent === 'Happy applause'),
      'two-handed gestures remain available with a bag equipped');
    await click('[aria-label="Emote collection"] button:nth-child(16)');
    assert(document.querySelectorAll('.character-emotes button').length > 0, 'gesture-owned props remain available');
    await click('#character-editor-tab-appearance');
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'switching editor tabs keeps the selected model');
    await acknowledge(requests[1], requests[1].character);
    assert.equal(requests.length, 3, 'queued prop waits for the previous save');
    assert.equal(requests[2].character.prop, 'shop-bag');
    const staleProgression = serverProgression;
    await acknowledge(requests[2], requests[2].character, false);
    assert.equal(social.getState().view.profile.progression.character.prop, 'shop-bag', 'the acknowledgement bridges a delayed profile snapshot');
    await act(async () => social.getState().receive({ ...view, profile: { ...view.profile, progression: { ...staleProgression, level: 7 } } }));
    assert.equal(social.getState().view.profile.progression.character.prop, 'shop-bag', 'a delayed snapshot cannot revert the acknowledged outfit');
    assert.equal(social.getState().view.profile.progression.level, 7, 'unrelated progression still updates');
    await move('back');
    assert.equal(title(), 'HEROES');
    assert.equal(characterViews.at(-1), null);
    assert.equal(drafts.at(-1), null);
    assert.match(find('[data-open-character]').textContent, /Rook Okafor/);
    await click('[data-hero=camaro]');
    assert.equal(title(), 'GARAGE');
    assert.equal(alpha.getState().previewHero, 'camaro');
    assert.equal(loadouts.getState().defaultHero, 'brz');
    const garageCamera = () => find('button[aria-label^="Switch garage camera"]');
    assert.match(garageCamera().textContent, /Showroom/);
    assert(find('[aria-label="Garage camera and drive preview"] button[aria-label="Hide interface"]'), 'eye toggle lives in the bottom camera toolbar');
    await click('button[aria-label="Hide interface"]');
    assert(find('.hero-workshop').classList.contains('hero-workshop--hidden'));
    await click('button[aria-label="Show interface"]');
    assert(!find('.hero-workshop').classList.contains('hero-workshop--hidden'));
    await click('button[aria-label^="Switch garage camera"]');
    assert.match(garageCamera().textContent, /High Angle/);
    await click('button[aria-label^="Switch garage camera"]');
    assert.match(garageCamera().textContent, /Driver Door/);
    await click('button[aria-label^="Switch garage camera"]');
    assert.match(garageCamera().textContent, /Cockpit/, 'the Camaro has its own fitted cockpit');
    const { useGarageDrive } = await vite.ssrLoadModule('/src/game/preview/garageDriveStore.ts');
    const stationButton = () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Enter cockpit');
    assert(stationButton().disabled);
    await act(async () => useGarageDrive.setState({ ready: true }));
    await act(async () => stationButton().click());
    assert.equal(useGarageDrive.getState().stage, 'station');
    assert.match(garageCamera().textContent, /Cockpit/);
    assert(find('button[aria-label="Steer left"]'));
    await act(async () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Reset').click());
    assert.equal(useGarageDrive.getState().stage, 'idle');
    await act(async () => useGarageDrive.setState({ ready: true, hasDoor: true }));
    await act(async () => stationButton().click());
    assert.equal(useGarageDrive.getState().stage, 'opening', 'a rigged door plays entry before sitting');
    assert.equal(useGarageDrive.getState().sequence, 'entry', 'entry stops before driving out');
    await act(async () => useGarageDrive.getState().reset());
    await act(async () => useGarageDrive.setState({ ready: false, hasDoor: false }));
    await move('back');
    await click('[data-hero=ae86]');
    assert.match(garageCamera().textContent, /Showroom/, 'new garage preview starts from the showroom camera');
    const driveButton = () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Drive Out');
    assert(driveButton().disabled);
    await act(async () => useGarageDrive.setState({ ready: true }));
    await act(async () => driveButton().click());
    assert.equal(useGarageDrive.getState().stage, 'opening');
    assert.match(garageCamera().textContent, /Driver Door/);
    await act(async () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Reset').click());
    assert.equal(useGarageDrive.getState().stage, 'idle');
    assert.match(garageCamera().textContent, /Showroom/);
    await act(async () => useGarageDrive.setState({ ready: false }));
    await move('back');
    await click('[data-open-character]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(find('[aria-label="Character model"] [data-character-option="jules-okafor"]').getAttribute('aria-pressed'), 'true');
    await click('#character-editor-tab-appearance');
    await browseWardrobe('face');
    assert.equal(find('[data-wardrobe-item="eye_color:obsidian"]').getAttribute('aria-pressed'), 'true');
    await click('#character-editor-tab-identity');
    const identities = '[aria-label="Character identity"] button';
    assert.deepEqual([...document.querySelectorAll(identities)].map(node => node.textContent), ['Male', 'Female', 'Nonbinary']);
    assert.equal(find(identities + ':first-child').getAttribute('aria-pressed'), 'true');
    await click(identities + ':last-child');
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'identity is independent of the selected model');
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests[3].character.identity, 'nonbinary');
    await acknowledge(requests[3], requests[3].character, false);
    await move('back');
    await click('[data-open-character]');
    await click('#character-editor-tab-identity');
    assert.equal(find(identities + ':last-child').getAttribute('aria-pressed'), 'true');

    await click('#character-editor-tab-appearance');
    await click('[aria-label="Character model"] [data-character-option="mara-vega"]');
    assert.equal(drafts.at(-1).id, 'mara-vega');
    await click('[data-wardrobe-item="shop-crew"]');
    await click('[aria-label="Character model"] [data-character-option="jules-okafor"]');
    assert.equal(drafts.at(-1).outfit, 'race-crew');
    assert.equal(drafts.at(-1).appearance.eye_color, 'obsidian');
    await act(async () => social.getState().reset());
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests.length, 4);
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'a disconnect keeps the latest draft');
    await act(async () => social.getState().receive({ ...view, profile: { ...view.profile, progression: serverProgression } }));
    assert.equal(requests[4].character.outfit, 'shop-crew', 'pending female edits resume on reconnect');
    await acknowledge(requests[4], requests[4].character);
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'an acknowledgement for another model does not change the preview');
    assert.equal(requests[5].character.outfit, 'race-crew');
    await acknowledge(requests[5], requests[5].character);
    assert.equal(social.getState().view.profile.progression.character_presets['mara-vega'].outfit, 'shop-crew');

  } finally {
    t.mock.timers.reset();
    if (root) await act(async () => root.unmount());
    await vite?.close();
    dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('all emote batches return to rest and keep planted and lifted feet distinct', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { buildGarageEmotes, buildEmoteClips, driverHand, findGaragePreviewEmote, AUTOMATIC_GARAGE_EMOTE_IDS } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { createEmoteProp } = await vite.ssrLoadModule('/src/game/characters/emoteProps.ts');
    const { bindFlagPoleGrip } = await vite.ssrLoadModule('/src/game/characters/flagPoleGrip.ts');
    const { FLAG_DROP_PHASE } = await vite.ssrLoadModule('/src/game/characters/starterEmotes.ts');
    const { garageLeanPose } = await vite.ssrLoadModule('/src/game/characters/garageLean.ts');
    const { COCKPIT_TAKES } = await vite.ssrLoadModule('/src/game/characters/cockpitEmotes.ts');
    const { sampleCockpitMotion } = await vite.ssrLoadModule('/src/game/preview/garageCockpit.ts');
    const { sampleDriveOut, DRIVE_OUT_DURATION } = await vite.ssrLoadModule('/src/game/preview/garageDriveMotion.ts');
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
    const clips = buildGarageEmotes(model.root, false, true);
    const mixer = new AnimationMixer(model.root);
    const ids = clips.map(clip => clip.name.split(' ')[0]);
    const numbered = [...ids.filter(id => /^\d+$/.test(id)), ...COCKPIT_TAKES.filter(take => /^\d+$/.test(take.id)).map(take => take.id)].sort();
    assert.deepEqual(numbered, Array.from({length: 200}, (_, i) => String(i + 1).padStart(3, '0')));
    assert.deepEqual(AUTOMATIC_GARAGE_EMOTE_IDS, ['035', '002', '005', '009', '010']);
    assert(COCKPIT_TAKES.every(({ id }) => !ids.includes(id)));
    assert.equal(findGaragePreviewEmote('151', true).id, '151');
    const { keepHeldProp } = await vite.ssrLoadModule('/src/game/characters/emotePropNotes.ts');
    assert.equal(keepHeldProp('010'), true, 'friendly wave keeps the prop');
    assert.equal(keepHeldProp('013'), false, 'applause stows the prop');
    assert.equal(keepHeldProp('bag-lift', true), false, 'driving always stows handheld props');
    assert.deepEqual(ids.filter(id => id.startsWith('walk-')), ['walk-casual']);
    assert.deepEqual(buildGarageEmotes(model.root).map(clip => clip.name.split(' ')[0]), ['001', '002', '005', '009', '010', '035']);
    assert(buildGarageEmotes(model.root, true).some(clip => clip.name.startsWith('035 ')), 'bag idle rotation includes both-handed gestures with temporary stowing');
    const leanFit = { offset: .15, distance: .06 };
    const [lean] = buildEmoteClips(model.root, [garageLeanPose(leanFit)]);
    assert(lean.name.startsWith('pose-lean '));
    assert(!buildGarageEmotes(model.root, true).some(clip => clip.name.startsWith('pose-lean ')));
    assert.equal(sampleCockpitMotion('068', .4).travel, 0);
    assert(sampleCockpitMotion('068', .4).steering > .2);
    assert(sampleCockpitMotion('069', .49).travel > .85);
    assert(sampleCockpitMotion('070', .49).travel < -.72);
    for (const take of ['068', '069', '070']) {
      assert(sampleCockpitMotion(take, .12).lookYaw < -.4);
      const nod = sampleCockpitMotion(take, .22);
      assert(nod.lookPitch > .16 && nod.closeShot);
      assert(sampleCockpitMotion(take, .35).focus > .95);
    }
    for (const take of ['069', '070']) {
      assert.equal(Math.abs(sampleCockpitMotion(take, 1).along), 0);
      assert.equal(Math.abs(sampleCockpitMotion(take, 1).steering), 0);
    }
    for (const take of ['101', '102']) {
      assert.equal(sampleCockpitMotion(take, .2).gesture, 0);
      const wave = sampleCockpitMotion(take, .52);
      assert(wave.travel > .85 && wave.gesture === 1 && wave.closeShot);
      assert.equal(sampleCockpitMotion(take, .9).gesture, 0);
    }
    assert.equal(sampleCockpitMotion(null, 0).travel, 0);
    const stages = [0, 1.6, 3.3, 4.6, DRIVE_OUT_DURATION].map(sampleDriveOut);
    assert.deepEqual(stages.map(pose => pose.stage), ['opening', 'entering', 'closing', 'driving', 'finished']);
    assert.equal(stages[1].door, 1);
    assert.equal(stages[2].enter, 1);
    assert.equal(stages[2].travel, 0);
    assert.equal(stages[3].door, 0);
    assert(stages[4].travel > stages[3].travel);
    assert.deepEqual(sampleDriveOut(DRIVE_OUT_DURATION + 2), stages[4], 'the car stays parked at the rollout endpoint');
    for (const [id, direction] of [['199', 1], ['200', -1]]) {
      assert(sampleCockpitMotion(id, .5).steering * direction > .3);
      assert.equal(sampleCockpitMotion(id, .5).travel, 0);
      assert.equal(Math.abs(sampleCockpitMotion(id, 1).steering), 0);
    }
    for (const clip of clips) {
      const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.reset().play();
      mixer.update(clip.duration * .36);
      assert(capture().some((value, i) => Math.abs(value - rest[i]) > .005), clip.name);
      mixer.update(clip.duration);
      action.stop();
      assert(capture().every((value, i) => Math.abs(value - rest[i]) < 1e-6), clip.name);
    }
    const map = createEmoteProp('map');
    model.root.add(map.root);
    const [unfold] = buildEmoteClips(model.root, [findGaragePreviewEmote('141', false)], new Map([['map', map]]));
    const unfolding = mixer.clipAction(unfold).setLoop(LoopOnce, 1).play();
    mixer.update(unfold.duration * .27);
    assert(map.root.visible && map.root.scale.x > .99);
    assert(Math.abs(map.panels[0].rotation.y) < .01);
    assert(map.panels[1].rotation.y > 1);
    mixer.update(unfold.duration * .28);
    assert(Math.abs(map.panels[1].rotation.y) < .01);
    unfolding.stop();
    assert.equal(map.root.visible, false, 'interrupting an emote hides its prop');
    assert.equal(map.root.scale.x, 0);
    mixer.uncacheClip(unfold);
    map.dispose();
    assert.equal(model.root.getObjectByName('emote-prop-map'), undefined);
    const flag = createEmoteProp('flag');
    model.root.add(flag.root);
    // Give the lightweight test actor a hand rig without depending on Git LFS.
    const wrist = model.root.getObjectByName('hand_r');
    for (const [finger, across] of [['index', .026], ['middle', 0], ['ring', -.019], ['pinky', -.036], ['thumb', .039]]) {
      let parent = wrist;
      for (const segment of [1, 2, 3]) {
        const joint = new Object3D();
        joint.name = `${finger}_0${segment}_r`;
        joint.position.set(segment === 1 ? across : 0, 0, segment === 1 ? .06 : .025);
        parent.add(joint);
        parent = joint;
      }
    }
    const hand = driverHand(model.root, 'r');
    const fitFlag = bindFlagPoleGrip(model.root, flag);
    for (const id of ['183', '189']) {
      const [clip] = buildEmoteClips(model.root, [findGaragePreviewEmote(id, false)], new Map([['flag', flag]]));
      const holding = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
      for (const phase of [.35, .48, .62, .78]) {
        holding.time = clip.duration * phase;
        mixer.update(0);
        fitFlag();
        const grip = flag.flagHeld.getWorldPosition(new Vector3());
        assert(grip.distanceTo(hand.middle.getWorldPosition(new Vector3())) < .025);
        const pole = flag.flagHeld.localToWorld(new Vector3(0, 1, 0)).sub(grip).normalize();
        const fingers = hand.middle.getWorldPosition(new Vector3()).sub(hand.hand.getWorldPosition(new Vector3())).normalize();
        assert(Math.abs(pole.dot(fingers)) < .06, 'pole follows the curled hand across the knuckles');
      }
      holding.stop();
      mixer.uncacheClip(clip);
    }
    const drop = findGaragePreviewEmote('178', false);
    const [flagDrop] = buildEmoteClips(model.root, [drop], new Map([['flag', flag]]));
    const flagAction = mixer.clipAction(flagDrop).setLoop(LoopOnce, 1).play();
    mixer.update(flagDrop.duration * .37);
    const raised = flag.root.position.y;
    assert(flag.root.visible && flag.root.scale.x > .99);
    mixer.update(flagDrop.duration * (FLAG_DROP_PHASE - .37));
    assert(flag.root.position.y < raised - .35);
    assert(flag.flagCloth.morphTargetInfluences[0] > .8);
    flagAction.stop();
    assert.equal(flag.root.visible, false);
    mixer.uncacheClip(flagDrop);
    const [slip] = buildEmoteClips(model.root, [findGaragePreviewEmote('181', false)], new Map([['flag', flag]]));
    const slipAction = mixer.clipAction(slip).setLoop(LoopOnce, 1).play();
    mixer.update(slip.duration * .36);
    fitFlag();
    assert(flag.flagHeld.position.length() < 1e-6, 'a slipped flag follows its free path');
    slipAction.stop();
    mixer.uncacheClip(slip);
    flag.dispose();
    const foot = side => turntable.worldToLocal(model.root.getObjectByName('foot_' + side).getWorldPosition(new Vector3()));
    const leftRest = foot('l'), rightRest = foot('r');
    const shift = mixer.clipAction(clips[1]).reset().play();
    mixer.update(clips[1].duration * .23);
    assert(foot('l').y - leftRest.y > .03);
    assert(foot('r').distanceTo(rightRest) < .002);
    shift.stop();
    const hop = mixer.clipAction(clips[ids.indexOf('014')]).reset().play();
    mixer.update(hop.getClip().duration * .39);
    assert(foot('l').y - leftRest.y > .12 && foot('r').y - rightRest.y > .12);
    hop.stop();
    const march = mixer.clipAction(clips[ids.indexOf('026')]).reset().play();
    mixer.update(march.getClip().duration * .23);
    assert(foot('l').y - leftRest.y > .04 && foot('l').y - leftRest.y < .065 && foot('r').distanceTo(rightRest) < .002);
    mixer.update(march.getClip().duration * .2);
    assert(foot('r').y - rightRest.y > .04 && foot('r').y - rightRest.y < .065 && Math.abs(foot('l').y - leftRest.y) < .002);
    march.stop();
    const bump = mixer.clipAction(clips[ids.indexOf('090')]).reset().play();
    mixer.update(bump.getClip().duration * .31);
    assert(foot('r').y - rightRest.y > .02 && foot('l').distanceTo(leftRest) < .002);
    mixer.update(bump.getClip().duration * .16);
    assert(model.root.position.z > .04 && foot('r').z - rightRest.z > .055);
    assert(Math.abs(foot('r').y - rightRest.y) < .002 && foot('l').distanceTo(leftRest) < .002);
    bump.stop();
    const shuffle = mixer.clipAction(clips[ids.indexOf('095')]).reset().play();
    const shuffleDuration = shuffle.getClip().duration;
    mixer.update(shuffleDuration * .23);
    const leftPlant = foot('l');
    assert(leftPlant.x - leftRest.x > .12 && foot('r').distanceTo(rightRest) < .002);
    mixer.update(shuffleDuration * .10);
    assert(foot('l').distanceTo(leftPlant) < .002 && foot('r').y - rightRest.y > .025);
    mixer.update(shuffleDuration * .10);
    assert(model.root.position.x > .12 && foot('r').x - rightRest.x > .09);
    shuffle.stop();
    for (const id of ['walk-casual', '042']) {
      const clip = clips[ids.indexOf(id)];
      const walk = mixer.clipAction(clip).reset().play();
      mixer.update(clip.duration / 9);
      const planted = foot('l');
      mixer.update(clip.duration / 18);
      assert(foot('l').distanceTo(planted) < .006, id);
      const lift = foot('r').y - rightRest.y;
      if (id === 'walk-casual') assert(lift > .025 && lift < .037, id);
      else assert(lift > .04, id);
      assert(model.root.position.z > .1, id);
      assert(foot('l').distanceTo(foot('r')) > .12, id);
      walk.stop();
    }
    const robot = mixer.clipAction(clips[ids.indexOf('robot-dance')]).reset().play();
    mixer.update(robot.getClip().duration * .28);
    const robotLock = capture();
    mixer.update(robot.getClip().duration * .07);
    assert(capture().every((value, i) => Math.abs(value - robotLock[i]) < 1e-6));
    robot.stop();
    const retreat = mixer.clipAction(clips[ids.indexOf('044')]).reset().play();
    mixer.update(retreat.getClip().duration * .27);
    assert(foot('l').y - leftRest.y > .035 && foot('r').distanceTo(rightRest) < .002);
    mixer.update(retreat.getClip().duration * .12);
    assert(model.root.position.z < -.06 && foot('l').z - leftRest.z < -.06);
    retreat.stop();
    const leanAction = mixer.clipAction(lean).reset().play();
    mixer.update(lean.duration * .32);
    assert(model.root.position.z < -.205 && Math.abs(foot('r').z - rightRest.z + .15) < .02);
    const parked = foot('r');
    mixer.update(lean.duration * .2);
    assert(foot('r').distanceTo(parked) < .002);
    leanAction.stop();
    mixer.uncacheRoot(model.root);
    model.dispose();
  } finally {
    await vite.close();
  }
});
