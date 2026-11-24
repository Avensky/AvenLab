import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { AnimationMixer, LoopOnce, Object3D, Vector3 } from 'three';

function characterTestDom() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const original = new Map();
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
  return {
    dom,
    close() {
      dom.window.close();
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('Heroes opens the character picker, saves one profile choice, and opens Garage from a vehicle', async t => {
  const { close } = characterTestDom();
  let vite, root;
  try {
    vite = await createServer({ define: { __DRESSING_ROOM_IMPORTED_IDS__: JSON.stringify(['gothic-skirt-04', 'top-01']) },
      server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
      plugins: [{
        name: 'count-fit-review-keys',
        enforce: 'pre',
        transform(source, id) {
          if (!id.endsWith('/fitReviewStore.ts')) return;
          return source.replace('export function fitReviewKey(', 'function buildFitReviewKey(') + `
            export let fitReviewKeyCalls = 0;
            export function fitReviewKey(...args: Parameters<typeof buildFitReviewKey>) {
              fitReviewKeyCalls++;
              return buildFitReviewKey(...args);
            }
          `;
        },
      }],
    });
    const load = path => vite.ssrLoadModule(`/src/${path}`);
    const { HeroWorkshop } = await load('game/heroes/HeroWorkshop.tsx');
    const { readLocalCharacter } = await load('game/characters/localOutfits.ts');
    const { useUIStore: ui } = await load('store/menus/uiStore.ts');
    const { useSocialStore: social } = await load('store/social/socialStore.ts');
    const { useHeroLoadouts: loadouts, FACTORY_APPEARANCE } = await load('vehicles/cosmetics/heroLoadouts.ts');
    const { useAlphaStore: alpha } = await load('store/alpha/alphaStore.ts');
    const { usePreviewZoom: zoom } = await load('game/preview/previewZoomStore.ts');
    const { useCharacterPreviewStore: preview } = await load('game/characters/characterPreviewStore.ts');
    const fitKeys = await load('game/characters/fitReviewStore.ts');
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
    loadouts.getState().adopt('driver', 'brz', { brz: { ...FACTORY_APPEARANCE, body: '#ef2244' } });
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
    const openEmotes = () => click('.character-emote-toggle[aria-expanded="false"]');
    const chooseEmoteGroup = group => click(`[data-emote-group="${group}"]`);
    const openCollections = () => act(async () => [...document.querySelectorAll(".character-emote-browser button")].find(button => button.textContent === "Collections").click());
    const playEmote = async selector => {
      await click(selector);
      assert(find('[aria-label="Emote details"]'));
      await click('.character-emote-back');
    };
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
    const slide = (selector, value) => act(async () => {
      const input = find(selector);
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setValue.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const cameraTools = 'button[aria-label="Camera tools"]';
    const cameraView = label => [...document.querySelectorAll('[aria-label="Preview camera"] button, .dressing-wearable-shortcuts button')]
      .find(button => button.getAttribute('aria-label') === label);
    const chooseCameraView = label => act(async () => {
      const button = cameraView(label);
      assert(button && !button.closest('[hidden]'), `${label} is an available camera view`);
      button.click();
    });
    const move = action => act(async () => route(action));
    const title = () => find('.menu-frame-header h1').textContent;

    assert.equal(title(), 'HEROES');
    const headerPortrait = () => find('[data-customize-vehicle] .hero-portrait-art');
    assert.equal(headerPortrait().dataset.style, 'deferred', 'the roster header waits to bake a custom vehicle portrait');
    assert.equal(find('[data-hero=brz] .hero-portrait-art').dataset.style, 'deferred');
    await click('[aria-label="Zoom vehicle in"]');
    assert.equal(zoom.getState().level, 1);
    await click('[aria-label="Reset vehicle zoom"]');
    assert.equal(zoom.getState().level, 0);
    await click('[data-open-character]');
    assert.equal(title(), 'CHARACTER');
    assert.equal(headerPortrait().dataset.style, 'deferred', 'wardrobe entry keeps the cold vehicle bake deferred');
    assert.equal(find('.hero-roster'), null);
    assert.equal(find('[role=tab]'), null);
    assert.equal(find('[data-character-preview]').dataset.characterPreview, 'mara-vega');
    const vesperPortrait = find('[data-character-option="mara-vega"] .character-portrait');
    assert(vesperPortrait?.matches('span.character-portrait--unavailable'), 'Vesper keeps a neutral portrait when WebGL is unavailable');
    assert.equal(find('.character-emote-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(find('.character-emotes'), null);
    await openEmotes();
    await chooseEmoteGroup('Pose pack');
    const poseButton = label => act(async () => {
      [...document.querySelectorAll('[aria-label="Emote results"] button')].find(button => button.textContent === label).click();
    });
    await select('Start pose', 'pose-attentive');
    await poseButton('Hold start pose');
    assert.equal(preview.getState().emote.id, 'pose-attentive');
    await select('Animation', 'walk-casual');
    assert.equal(find('select[aria-label="Start pose"]').options.length, 121);
    assert.equal(find('select[aria-label="End pose"]').options.length, 121);
    const importedPose = 'pose-mh-poses03-anrico_standing10';
    await select('End pose', importedPose);
    await poseButton('Play sequence');
    assert.deepEqual(preview.getState().emote, {
      id: 'pose-sequence', sequence: { from: 'pose-attentive', motion: 'walk-casual', to: importedPose },
    });
    await poseButton('Return to idle');
    assert.equal(preview.getState().emote, null);
    await chooseEmoteGroup('Garage');
    assert(![...document.querySelectorAll('.character-emotes button')].some(button => button.querySelector('.emote-name')?.textContent === 'Side step and glance'));
    await playEmote('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '005');
    await chooseEmoteGroup('Best');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 8);
    await playEmote('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '035');
    await openCollections();
    await chooseEmoteGroup('Playful');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 11);
    await playEmote('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '021');
    await playEmote('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, 'robot-dance');
    await chooseEmoteGroup('Shy');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 11);
    await playEmote('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '035');
    await playEmote('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, 'oh-no');
    await chooseEmoteGroup('Tsundere');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await playEmote('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '050');
    await chooseEmoteGroup('Expressions');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await playEmote('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '051');
    await chooseEmoteGroup('Roadside');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 7);
    assert.equal(find('.character-emotes button:last-child .emote-name').textContent, 'Wave them through');
    await chooseEmoteGroup('Rivalry');
    assert.equal(find('[data-emote-group="Rivalry"]').textContent, 'Rivalry');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 8);
    await playEmote('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '071');
    await playEmote('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '080');
    await chooseEmoteGroup('Pit Crew');
    assert.equal(find('[data-emote-group="Pit Crew"]').textContent, 'Pit Crew');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 9);
    await playEmote('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '090');
    await chooseEmoteGroup('After Hours');
    assert.equal(find('[data-emote-group="After Hours"]').textContent, 'After Hours');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await playEmote('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '091');
    await playEmote('.character-emotes button:nth-child(5)');
    assert.equal(preview.getState().emote.id, '095');
    await playEmote('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '100');
    await chooseEmoteGroup('Showroom');
    assert.equal(find('[data-emote-group="Showroom"]').textContent, 'Showroom');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await playEmote('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '103');
    await playEmote('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '112');
    for (const [name, first, last] of [
      ['Elegant', 113, 120], ['Stoic', 131, 140], ['Explorer', 141, 150],
      ['Tech', 151, 160], ['Workshop', 161, 170], ['Starter', 171, 180],
      ['Starter Comedy', 181, 190], ['Race Reactions', 191, 198],
    ]) {
      await chooseEmoteGroup(name);
      assert.equal(document.querySelectorAll('.character-emotes button').length, last - first + 1);
      await playEmote('.character-emotes button:first-child');
      assert.equal(preview.getState().emote.id, String(first));
      await playEmote('.character-emotes button:last-child');
      assert.equal(preview.getState().emote.id, String(last));
    }
    await chooseEmoteGroup('Performer');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 11);
    assert.equal(find('.character-emotes button:last-child .emote-name').textContent, 'Hands up');
    await playEmote('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, 'hands-up-crowd');
    await chooseEmoteGroup('Garage');
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
    const characterTabs = '[role=tablist][aria-label="CHARACTER sections"]';
    const identityTab = `${characterTabs} #character-editor-tab-identity`;
    const identityControl = find(identityTab);
    assert.deepEqual([...document.querySelectorAll(`${characterTabs} [role=tab]`)].map(node => node.textContent),
      ['Identity', 'Appearance', 'Emotes']);
    assert.equal(find(`${characterTabs} [aria-selected="true"]`).id, 'character-editor-tab-appearance');
    await move('previous_tab');
    assert.equal(characterViews.at(-1), 'identity');
    assert.equal(document.activeElement, identityControl);
    assert.equal(identityControl.getAttribute('aria-selected'), 'true');
    assert.equal(identityControl.tabIndex, 0);
    const panel = document.getElementById(identityControl.getAttribute('aria-controls'));
    assert.equal(panel.getAttribute('role'), 'tabpanel');
    assert.equal(panel.getAttribute('aria-labelledby'), identityControl.id);
    await move('down');
    assert(document.activeElement.closest('[aria-label="Identity appearance"]'));
    await move('next_tab');
    assert.equal(characterViews.at(-1), 'appearance');
    assert.equal(identityControl.getAttribute('aria-selected'), 'false');
    assert.equal(identityControl.tabIndex, -1);
    await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, identityControl);
    await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyE', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, find('#character-editor-tab-appearance'));
    await click(identityTab);
    assert.equal(find('[aria-label="Character model"] [data-character-option="jules-okafor"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual([...document.querySelectorAll('[aria-label="Character model"] button')].map(node => node.textContent),
      ['Vesper Vega', 'Rook Okafor']);
    await click('#character-editor-tab-emotes');
    assert.equal(find(identityTab), identityControl);
    assert(find('[aria-label="Emote results"]').classList.contains('character-controls--right'));
    assert(find('[aria-label="Emote collection"]').closest('.character-controls--left'));
    assert.equal(find('[data-character-option]'), null, 'Emotes uses the model chosen in Identity');
    assert(find('.dressing-toolbar .fitting-camera-toolbar'), 'Emotes uses the Dressing Room camera toolbar');
    assert(find('.dressing-toolbar button[aria-label="Hide interface"]'));
    assert.equal(find('select[aria-label="Preview camera"]'), null);
    await openEmotes();
    await chooseEmoteGroup('All');
    assert.equal(find('[aria-label="Emote logic review"]'), null, 'fit review opens with the chosen emote');
    const emoteCount = document.querySelectorAll('.character-emotes button').length;
    assert(emoteCount > 180);
    const firstEmote = find('.character-emotes button');
    await act(async () => firstEmote.focus());
    const fitKeyCalls = fitKeys.fitReviewKeyCalls;
    assert(fitKeyCalls >= emoteCount, 'the open list computes a fit key for each emote');
    await act(async () => preview.setState({ camera: 'Face', zoom: 1.1 }));
    assert.equal(find('input[aria-label="Preview zoom"]').value, '1.1');
    assert.equal(fitKeys.fitReviewKeyCalls, fitKeyCalls, 'camera and zoom updates leave emote review rows alone');
    assert.equal(document.activeElement, firstEmote);
    await act(async () => {
      const input = find('[aria-label="Emote results"] input[type="search"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'applause');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert(document.querySelectorAll('.character-emotes button').length > 0);
    assert([...document.querySelectorAll('.character-emotes .emote-name')].every(n => n.textContent.toLowerCase().includes('applause')));
    const emoteName = find('.character-emotes button .emote-name').textContent;
    await click('[aria-label="Emote results"] .character-emotes button:first-child');
    const fitReview = find('[aria-label="Emote details"] [aria-label="Emote logic review"]');
    assert(fitReview.textContent.includes(emoteName), 'the review identifies the selected emote');
    assert(fitReview.querySelector("textarea"));
    await click('[aria-label="Emote logic review"] input[type="checkbox"]');
    assert(fitReview.querySelector('input[type="checkbox"]').checked, 'the selected emote review can be edited beside the results');
    await click('.character-emote-back');
    const reviewedEmote = find('.character-emotes button:first-child');
    assert(reviewedEmote.querySelector('[aria-label="Fit partial"]'), 'the updated review appears in the results');
    assert.equal(document.activeElement, reviewedEmote, 'back restores focus to the reviewed emote');
    const { useFittingTurnStore: turns } = await vite.ssrLoadModule('/src/game/characters/fittingControlsStore.ts');
    await act(async () => {
      turns.setState({ characterYaw: Math.PI });
      preview.setState({ camera: 'Face', zoom: 1.2 });
    });
    await chooseEmoteGroup('Garage');
    assert.equal(turns.getState().characterYaw, 0);
    assert.equal(preview.getState().camera, 'Full body');
    assert.equal(preview.getState().zoom, 1);
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
    const cameraAngles = 'button[aria-label="Camera angles"]';
    await click(cameraAngles);
    assert.equal(cameraView('Driver').getAttribute('aria-pressed'), 'true');
    await chooseCameraView('Whole vehicle');
    await click('[aria-label="Driving emotes"] button:last-child');
    assert.equal(preview.getState().emote.id, '200');
    assert.equal(preview.getState().camera, 'Whole car');
    assert(find('.fitting-camera-angles').hidden, 'selecting an emote dismisses the camera popover');
    await click(cameraAngles);
    assert.equal(cameraView('Whole vehicle').getAttribute('aria-pressed'), 'true');
    await chooseCameraView('Driver');
    assert.equal(preview.getState().camera, 'Full body');
    await click(cockpitToggle);
    assert.equal(preview.getState().insideCar, false);
    assert.equal(preview.getState().emote, null);
    await click(cockpitToggle);
    await click('#character-editor-tab-appearance');
    assert.equal(find('[data-character-option]'), null, 'the Dressing Room uses the model chosen in Identity');
    await browseWardrobe('outfits');
    assert.equal(cameraView('Coat').getAttribute('aria-pressed'), 'true');
    for (const category of ['hair', 'face', 'skin']) assert.equal(find(`[data-category=${category}]`), null);
    assert(find('.dressing-toolbar button[aria-label="Hide interface"]'), 'dressing room keeps the eye beside its camera');
    assert.equal(preview.getState().insideCar, false);
    assert.equal(preview.getState().emote, null);
    await click('#character-editor-tab-identity');
    assert.equal(find('select[aria-label="Eye color"]').value, 'original');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await select('Eye color', 'obsidian');
    await select('Eyebrow tint', 'copper');
    await select('Skin tone', 'deep');
    await select('Hair color', 'espresso');
    assert.equal(preview.getState().camera, 'Face');
    await click('#character-editor-tab-appearance');
    await browseWardrobe('accessories');
    await click('[data-wardrobe-item="glasses:aviator"]');
    assert.equal(drafts.at(-1).appearance.eye_color, 'obsidian');
    assert.equal(drafts.at(-1).appearance.brow_color, 'copper');
    assert.equal(drafts.at(-1).appearance.glasses, 'aviator');
    assert.equal(preview.getState().camera, 'Selected item');
    assert.equal(cameraView('Glasses').getAttribute('aria-pressed'), 'true');
    assert.equal(find('[aria-label="Clothing piece"]'), null, 'the camera selector also inspects clothing');
    assert(find('.dressing-camera-shortcuts [aria-label="Preview camera"]'), "camera shortcuts stay on the wardrobe rail");
    assert(find('.fitting-camera-panel:not(.fitting-camera-angles)').hidden, 'camera adjustments start collapsed');
    const fittingZoom = '.dressing-preview-zoom input[aria-label="Preview zoom"][aria-orientation="vertical"]';
    assert(find(fittingZoom));
    await slide(fittingZoom, 1.2);
    assert.equal(preview.getState().zoom, 1.2);
    await slide(fittingZoom, 1);
    await click(cameraTools);
    assert.equal(find('.fitting-camera-panel:not(.fitting-camera-angles)').hidden, false);
    assert(find('.fitting-camera-panel:not(.fitting-camera-angles)').contains(document.activeElement), 'keyboard activation focuses a camera adjustment');
    assert.equal(find('.fitting-camera-panel:not(.fitting-camera-angles)').textContent.trim(), '', 'the camera popup uses icons');
    await click('.fitting-camera-panel [aria-label="Look away"]');
    assert.equal(preview.getState().emote?.id, 'look-away', 'wardrobe can play the glance on its own stage');
    await act(async () => preview.setState({ emote: null }));
    for (const [label, id] of [['Check makeup', 'makeup-check'], ['Redo lipstick', 'redo-lipstick'], ['Apply eyeliner', 'apply-eyeliner']]) {
      await click(`.fitting-camera-panel [aria-label="${label}"]`);
      assert.equal(preview.getState().emote?.id, id);
      assert.equal(preview.getState().camera, 'Face');
    }
    await act(async () => preview.setState({ emote: null, camera: 'Full body' }));
    assert(cameraView('Glasses').querySelector('svg'), 'the clothing close-up has a labeled icon');
    await click('.fitting-camera-panel [aria-label="Zoom in"]');
    assert.equal(preview.getState().zoom, 1.05);
    await click('.fitting-camera-panel [aria-label="Zoom out"]');
    assert.equal(preview.getState().zoom, 1);
    await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
    })));
    assert(find('.fitting-camera-panel:not(.fitting-camera-angles)').hidden);
    assert.equal(document.activeElement, find(cameraTools));
    assert.equal(cameraView('Whole car'), undefined);
    assert.equal(find('.dressing-toolbar [data-rotation=vehicle]'), null);
    await chooseCameraView('Full body');
    assert.equal(preview.getState().camera, 'Full body');
    await chooseCameraView('Glasses');
    assert.equal(preview.getState().selectedPiece, 'glasses');
    assert.equal(preview.getState().camera, 'Selected item');
    assert.equal(find('.dressing-color-panel').hidden, true);
    const paletteToggle = find('[aria-label="Open clothing colors"]');
    const palette = document.getElementById(paletteToggle.getAttribute('aria-controls'));
    assert.equal(palette.childElementCount, 0, 'the closed palette keeps its panel ID without mounting swatches');
    assert.equal(paletteToggle.textContent, '', 'the toolbar uses a swatch icon');
    await click(cameraTools);
    await click('[aria-label="Open clothing colors"]');
    assert.equal(find('.dressing-color-panel').hidden, false);
    assert(find('.fitting-camera-panel').hidden, 'opening colors closes the zoom and rotation popup');
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
    assert.equal(cameraView('Coat').getAttribute('aria-pressed'), 'true');
    await click('[aria-label="Open clothing colors"]');
    const themes = find('[aria-label="Color combinations"]');
    for (const name of ['Pink', 'Pastels', 'Vibrant', 'White', 'Yellow', 'Blue', 'Red', 'Red + Black', 'Black + Red']) {
      assert(themes.querySelector(`button[aria-label="${name}"]`), `${name} has a theme shortcut`);
    }
    const mainColor = () => find('input[aria-label="Custom main color"]').value;
    const accentColor = () => find('input[aria-label="Custom accent color"]').value;
    await click('button[aria-label="Red + Black"]');
    assert.deepEqual([mainColor(), accentColor()], ['#b62235', '#101015']);
    await click('button[aria-label="Black + Red"]');
    assert.deepEqual([mainColor(), accentColor()], ['#101015', '#b62235']);
    assert.equal(find('button[aria-label="Red + Black"]').getAttribute('aria-pressed'), 'false');
    assert.equal(find('button[aria-label="Black + Red"]').getAttribute('aria-pressed'), 'true');
    await click('button[aria-label="Gothic Pink"]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(drafts.at(-1).appearance.item_colors['aviator:glasses'].color, '#293953');
    assert.equal(drafts.at(-1).appearance.item_colors['aviator:glasses'].accent, '#ad444d');
    assert.equal(drafts.at(-1).appearance.item_colors['race-crew:coat'].color, '#101015');
    assert.equal(drafts.at(-1).appearance.color, 'original', 'piece dye leaves the overall outfit palette unchanged');
    assert.equal(find('input[aria-label="Custom accent color"]').value, '#ff2d95');
    await click('[aria-label="Close clothing colors"]');
    assert.equal(find('.dressing-color-panel').hidden, true);
    assert.equal(find('.dressing-color-panel').childElementCount, 0);
    await click('[aria-label="Open clothing colors"]');
    assert.deepEqual([mainColor(), accentColor()], ['#101015', '#ff2d95']);
    assert.equal(document.activeElement, find('.dressing-color-preset'), 'keyboard activation focuses the first swatch');
    await act(async () => {
      const preset = find('.dressing-color-preset');
      preset.focus();
      preset.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    });
    assert.equal(find('.dressing-color-panel').hidden, true, 'Escape closes the palette before it can leave the fitting room');
    assert.equal(find('.dressing-color-panel').childElementCount, 0);
    assert.equal(document.activeElement, find('[aria-label="Open clothing colors"]'));
    await click('#character-editor-tab-identity');
    assert(find('select[aria-label="Eye color"]'));
    assert(find('select[aria-label="Skin tone"]'));
    await select('Character personality', 'tsundere');
    await click('#character-editor-tab-emotes');
    await openEmotes();
    await select('Animation clothing fit', 'fitted');
    await click('#character-editor-tab-appearance');
    assert.equal(requests.length, 1);
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests.length, 2, 'rapid changes coalesce');
    assert.equal(requests[1].character.appearance.eye_color, 'obsidian');
    assert.equal(requests[1].character.appearance.brow_color, 'copper');
    assert.equal(requests[1].character.appearance.skin, 'deep');
    assert.equal(requests[1].character.appearance.hair_color, 'espresso');
    assert.equal(requests[1].character.appearance.glasses, 'aviator');
    assert.equal(requests[1].character.appearance.personality, 'tsundere');
    assert.equal(requests[1].character.appearance.animation_fit, 'fitted');
    await browseWardrobe('props');
    await click('[data-wardrobe-item=shop-bag]');
    assert.equal(drafts.at(-1).prop, 'shop-bag');
    await click('#character-editor-tab-emotes');
    await openEmotes();
    await chooseEmoteGroup('Garage');
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
    await openCollections();
    await chooseEmoteGroup('Victory');
    assert([...document.querySelectorAll('.character-emotes button')].some(button => button.querySelector('.emote-name')?.textContent === 'Happy applause'),
      'two-handed gestures remain available with a bag equipped');
    await chooseEmoteGroup('Tech');
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
    assert.equal(headerPortrait().dataset.cacheOnly, 'false', 'the full garage can prepare a custom vehicle portrait');
    assert.equal(alpha.getState().previewHero, 'camaro');
    assert.equal(loadouts.getState().defaultHero, 'brz');
    const garageCamera = () => find('[aria-label="Garage camera and drive preview"] [data-camera-choice][aria-pressed="true"]').getAttribute('aria-label');
    assert.equal(garageCamera(), 'Showroom');
    assert.equal(find(cameraAngles).getAttribute('aria-expanded'), 'false');
    const garageZoom = '.vehicle-studio .hero-preview-zoom--vertical input[aria-label="Zoom vehicle"][aria-orientation="vertical"]';
    assert(find(garageZoom));
    await slide(garageZoom, 2);
    assert.equal(zoom.getState().level, 2);
    assert.equal(find(garageZoom).getAttribute('aria-valuetext'), '135%');
    await click('.hero-preview-zoom--vertical [aria-label="Reset vehicle zoom"]');
    assert.equal(zoom.getState().level, 0);
    assert(find('[aria-label="Garage camera and drive preview"] button[aria-label="Hide interface"]'), 'eye toggle lives in the bottom camera toolbar');
    await click('button[aria-label="Hide interface"]');
    assert(find('.hero-workshop').classList.contains('hero-workshop--hidden'));
    await click('button[aria-label="Show interface"]');
    assert(!find('.hero-workshop').classList.contains('hero-workshop--hidden'));
    await click(cameraAngles);
    await chooseCameraView('High Angle');
    assert.equal(garageCamera(), 'High Angle');
    await chooseCameraView('Driver Door');
    assert.equal(garageCamera(), 'Driver Door');
    await chooseCameraView('Cockpit');
    assert.equal(garageCamera(), 'Cockpit', 'the Camaro has its own fitted cockpit');
    const driveControls = 'button[aria-label="Drive preview controls"]';
    await click(driveControls);
    const { useGarageDrive } = await vite.ssrLoadModule('/src/game/preview/garageDriveStore.ts');
    const stationButton = () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Enter cockpit');
    assert(stationButton().disabled);
    await act(async () => useGarageDrive.setState({ ready: true }));
    await act(async () => stationButton().click());
    assert.equal(useGarageDrive.getState().stage, 'station');
    assert.equal(garageCamera(), 'Cockpit');
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
    assert.equal(garageCamera(), 'Showroom', 'new garage preview starts from the showroom camera');
    await click(driveControls);
    const driveButton = () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Drive Out');
    assert(driveButton().disabled);
    await act(async () => useGarageDrive.setState({ ready: true }));
    await act(async () => driveButton().click());
    assert.equal(useGarageDrive.getState().stage, 'opening');
    assert.equal(garageCamera(), 'Driver Door');
    await act(async () => [...document.querySelectorAll('button')].find(node => node.textContent === 'Reset').click());
    assert.equal(useGarageDrive.getState().stage, 'idle');
    assert.equal(garageCamera(), 'Showroom');
    await act(async () => useGarageDrive.setState({ ready: false }));
    await move('back');
    await click('[data-open-character]');
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(find('[data-character-option]'), null);
    await click('#character-editor-tab-identity');
    assert.equal(find('select[aria-label="Eye color"]').value, 'obsidian');
    assert.equal(find('select[aria-label="Skin tone"]').value, 'deep');
    assert.equal(find('[aria-label="Character model"] [data-character-option="jules-okafor"]').getAttribute('aria-pressed'), 'true');
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

    await click('[aria-label="Character model"] [data-character-option="mara-vega"]');
    assert.equal(drafts.at(-1).id, 'mara-vega');
    await click('#character-editor-tab-appearance');
    await browseWardrobe('underwear');
    await click('[data-wardrobe-item=underwear-briefs]');
    await click('[aria-label="Briefs style"] button:last-child');
    assert.equal(drafts.at(-1).appearance.briefs_style, 'boxer-briefs');
    assert.equal(drafts.at(-1).removedClothing, undefined, 'choosing underwear preserves the outer layers');
    await click('[data-wardrobe-remove=bottom]');
    assert.deepEqual(drafts.at(-1).removedClothing, ['skirt']);
    await click('.dressing-details [aria-label="Open clothing colors"]');
    await click('.dressing-details button[aria-label="Gothic Pink"]');
    assert.equal(drafts.at(-1).appearance.item_colors['underwear:briefs'].accent, '#ff2d95');
    await click('[aria-label="Clear Underwear"]');
    assert.equal(drafts.at(-1).removedClothing, undefined);
    assert.equal(drafts.at(-1).appearance.item_colors['underwear:briefs'].accent, '#ff2d95', 'clearing the preview leaves its separate color available to save');
    assert.equal(drafts.at(-1).appearance.briefs_style, 'boxer-briefs', 'restoring the skirt keeps the chosen cut');
    await browseWardrobe('bottoms');
    await click('[data-wardrobe-item=gothic-skirt-04]');
    await browseWardrobe('tops');
    await click('[data-wardrobe-item=top-01]');
    assert.deepEqual(drafts.at(-1).garments, { skirt: 'gothic-skirt-04', top: 'top-01' });
    await click('[aria-label="Open clothing colors"]');
    await click('button[aria-label="Gothic Pink"]');
    assert.equal(drafts.at(-1).appearance.item_colors['top-01:shirt'].accent, '#ff2d95');
    await click('#character-editor-tab-identity');
    await select('Hairstyle', 'cropped');
    assert.equal(drafts.at(-1).appearance.hair, 'cropped');
    assert.equal(drafts.at(-1).appearance.item_colors['top-01:shirt'].accent, '#ff2d95', 'identity edits preserve trial garment colors');
    await click('#character-editor-tab-emotes');
    assert.deepEqual(drafts.at(-1).garments, { skirt: 'gothic-skirt-04', top: 'top-01' });
    await openEmotes();
    await select('Animation clothing fit', 'fitted');
    assert.equal(drafts.at(-1).appearance.animation_fit, 'fitted');
    await click('#character-editor-tab-appearance');
    await browseWardrobe('outfits');
    await click('[data-wardrobe-item="shop-crew"]');
    assert.equal(drafts.at(-1).garments, undefined);
    assert.deepEqual(drafts.at(-1).appearance?.item_colors, { 'underwear:briefs': { color: '#101015', accent: '#ff2d95' } },
      'underwear dye persists across outfits while the trial top dye stays in its preview');
    await click('#character-editor-tab-identity');
    await click('[aria-label="Character model"] [data-character-option="jules-okafor"]');
    assert.equal(drafts.at(-1).outfit, 'race-crew');
    assert.equal(drafts.at(-1).appearance.eye_color, 'obsidian');
    await act(async () => social.getState().reset());
    await select('Hair color', 'copper');
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests.length, 4);
    assert.equal(readLocalCharacter(), undefined, 'a known profile continues queuing edits while disconnected');
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'a disconnect keeps the latest draft');
    await act(async () => social.getState().receive({ ...view, profile: { ...view.profile, progression: serverProgression } }));
    assert.equal(requests[4].character.outfit, 'shop-crew', 'pending female edits resume on reconnect');
    assert.equal(requests[4].character.garments, undefined, 'trial pieces stay out of character equip messages');
    assert.equal(requests[4].character.appearance.hair, 'cropped');
    await acknowledge(requests[4], requests[4].character);
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'an acknowledgement for another model does not change the preview');
    assert.equal(requests[5].character.outfit, 'race-crew');
    assert.equal(requests[5].character.appearance.hair_color, 'copper');
    await acknowledge(requests[5], requests[5].character);
    assert.equal(social.getState().view.profile.progression.character_presets['mara-vega'].outfit, 'shop-crew');

    const customization = find('[aria-label="Customization"]');
    assert(customization.querySelector('[data-open-character][aria-current="page"]'));
    assert(customization.querySelector('[data-customize-vehicle] .hero-portrait-art'));
    await click('[data-customize-vehicle]');
    assert(find('.vehicle-studio'));
    assert(find('[data-customize-vehicle][aria-current="page"]'));

    await click('[data-open-character]');
    await click('#character-editor-tab-identity');
    await select('Eye color', 'original');
    assert.equal(drafts.at(-1).appearance.eye_color, 'original');
    const requestCount = requests.length;
    const draftCount = drafts.length;
    const staleEyes = find('select[aria-label="Eye color"]');
    await act(async () => {
      ui.getState().setScreen('mode_select');
      staleEyes.value = 'obsidian';
      staleEyes.dispatchEvent(new Event('change', { bubbles: true }));
      t.mock.timers.tick(350);
    });
    assert.equal(requests.length, requestCount, 'a queued equip cannot dispatch after leaving Heroes');
    assert(!drafts.slice(draftCount).some(choice => choice?.appearance?.eye_color === 'obsidian'),
      'a stale control cannot change the character preview outside Heroes');
    assert.equal(social.getState().view.profile.progression.character.appearance.eye_color, 'obsidian');

    await act(async () => root.render(null));
    await act(async () => {
      ui.getState().setScreen('heroes');
      root.render(h(HeroWorkshop));
    });
    await click('[data-open-character]');
    await click('#character-editor-tab-identity');
    await select('Eye color', 'original');
    await act(async () => t.mock.timers.tick(350));
    const inFlight = requests.at(-1);
    assert.equal(requests.length, requestCount + 1);
    assert.equal(inFlight.character.appearance.eye_color, 'original');
    await select('Skin tone', 'original');
    await act(async () => ui.getState().setOverlay('settings'));
    await acknowledge(inFlight, inFlight.character, false);
    assert.equal(requests.length, requestCount + 1, 'an in-flight save cannot dispatch later queued edits under an overlay');
    assert.equal(social.getState().view.profile.progression.character.appearance.eye_color, 'original',
      'the profile still acknowledges a request dispatched while Heroes was active');
    assert.equal(social.getState().view.profile.progression.character.appearance.skin, 'deep');
    await act(async () => ui.getState().closeOverlay());
    assert.equal(requests.length, requestCount + 2, 'queued edits resume when Heroes becomes active again');
    const resumed = requests.at(-1);
    assert.equal(resumed.character.appearance.skin, 'original');
    await acknowledge(resumed, resumed.character, false);
  } finally {
    t.mock.timers.reset();
    if (root) await act(async () => root.unmount());
    await vite?.close();
    close();
  }
});

test('device character edits stay local when the connected profile has no character support', async t => {
  const { dom, close } = characterTestDom();
  let vite, root, client;
  try {
    vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
    const load = path => vite.ssrLoadModule(`/src/${path}`);
    const { CharacterPage } = await load('game/characters/CharacterPage.tsx');
    const { readLocalCharacter, writeLocalOutfit } = await load('game/characters/localOutfits.ts');
    const { useSocialStore } = await load('store/social/socialStore.ts');
    const { useUIStore } = await load('store/menus/uiStore.ts');
    client = await load('net/socialClient.ts');
    const requests = [];
    client.setSocialConnection({ readyState: WebSocket.OPEN, send: value => requests.push(JSON.parse(value)) });
    useSocialStore.getState().receive({
      profile: { id: 'legacy', name: 'Driver', progression: {} },
      players: [], teammates: [], requests: [], groups: [], worlds: [], world_invites: [], maps: [],
      current_world_id: null, limits: { max_active_worlds: 3 },
    });
    useUIStore.getState().setScreen('heroes');
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    const props = { onReady: () => {}, beforeClose: { current: null } };
    const show = tab => act(async () => root.render(h(CharacterPage, { ...props, tab })));
    const click = selector => act(async () => document.querySelector(selector).click());
    const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);

    await show('identity');
    await click('[data-character-option="jules-okafor"]');
    await act(async () => button('Use locally').click());
    assert.equal(readLocalCharacter().id, 'jules-okafor');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await act(async () => button('Nonbinary').click());
    await act(async () => t.mock.timers.tick(350));
    assert.equal(requests.length, 0);
    assert.equal(readLocalCharacter().identity, 'nonbinary');

    const failedWrite = t.mock.method(dom.window.Storage.prototype, 'setItem', () => { throw new Error('Storage unavailable'); });
    await act(async () => button('Female').click());
    assert.equal(readLocalCharacter().identity, 'nonbinary');
    assert(button('Retry'));
    failedWrite.mock.restore();
    await act(async () => button('Retry').click());
    assert.equal(readLocalCharacter().identity, 'female');

    writeLocalOutfit('Race fit', { ...readLocalCharacter(), outfit: 'race-crew' });
    await show('appearance');
    await click('[data-category=saved]');
    await click('[aria-label="Try on Race fit"]');
    assert(!document.querySelector('[aria-label="Clear saved outfit preview"]').disabled);
    await show('identity');
    t.mock.method(dom.window.Storage.prototype, 'setItem', () => { throw new Error('Storage unavailable'); });
    const eyeColor = document.querySelector('select[aria-label="Eye color"]');
    await act(async () => {
      eyeColor.value = 'obsidian';
      eyeColor.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => button('Revert unsaved').click());
    await show('appearance');
    await click('[data-category=saved]');
    assert(document.querySelector('[aria-label="Clear saved outfit preview"]').disabled);
  } finally {
    t.mock.timers.reset();
    if (root) await act(async () => root.unmount());
    client?.setSocialConnection(null);
    await vite?.close();
    close();
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
