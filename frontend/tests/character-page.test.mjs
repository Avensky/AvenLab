import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimationMixer, LoopOnce, Object3D, Vector3 } from 'three';

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
    const { usePreviewZoom: zoom } = await load('game/preview/previewZoomStore.ts');
    const { useCharacterPreviewStore: preview } = await load('game/characters/characterPreviewStore.ts');
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
    await click('.character-emotes button:nth-child(4)');
    assert.equal(preview.getState().emote.id, '004');
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
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    const reversePark = '.character-emotes button:last-child';
    assert.equal(find(reversePark).textContent, 'Reverse park');
    assert.equal(find(reversePark).disabled, true);
    await act(async () => preview.setState({ cockpitAvailable: true }));
    await click(reversePark);
    assert.equal(preview.getState().emote.id, '070');
    await act(async () => preview.setState({ cockpitAvailable: false }));
    await click('[aria-label="Emote collection"] button:nth-child(8)');
    assert.equal(find('[aria-label="Emote collection"] button:nth-child(8)').textContent, 'Rivalry');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '071');
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '080');
    await click('[aria-label="Emote collection"] button:nth-child(9)');
    assert.equal(find('[aria-label="Emote collection"] button:nth-child(9)').textContent, 'Pit Crew');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '090');
    await click('[aria-label="Emote collection"] button:last-child');
    assert.equal(find('[aria-label="Emote collection"] button:last-child').textContent, 'After Hours');
    assert.equal(document.querySelectorAll('.character-emotes button').length, 10);
    await click('.character-emotes button:first-child');
    assert.equal(preview.getState().emote.id, '091');
    await click('.character-emotes button:last-child');
    assert.equal(preview.getState().emote.id, '100');
    await click('[aria-label="Emote collection"] button:first-child');
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
    assert.deepEqual([...document.querySelectorAll('[role=tab]')].map(node => node.textContent), ['Appearance', 'Face', 'Clothes', 'Props', 'Emotes']);
    await click('#character-editor-tab-face');
    assert.equal(preview.getState().camera, 'Face');
    assert.equal(preview.getState().emote, null);
    assert.equal(find('select[aria-label="Eye color"]').value, 'original');
    await select('Eye color', 'blue');
    await select('Eyebrow tint', 'copper');
    await select('Glasses', 'aviator');
    assert.equal(drafts.at(-1).appearance.eye_color, 'blue');
    assert.equal(drafts.at(-1).appearance.brow_color, 'copper');
    assert.equal(drafts.at(-1).appearance.glasses, 'aviator');
    await click('#character-editor-tab-clothes');
    assert.equal(preview.getState().camera, 'Full body');
    await select('Outfit color', 'deep-navy');
    assert.equal(find('input[aria-label="Clothing fabric color"]').value, '#293953');
    await click('.character-outfits[aria-label="Outfits"] button:last-child');
    const gothic = [...document.querySelectorAll('button')].find(button => button.textContent === 'Gothic Pink');
    await act(async () => gothic.click());
    assert.equal(find('[data-outfit-preview]').dataset.outfitPreview, 'race-crew');
    assert.equal(drafts.at(-1).appearance.color, '#101015');
    assert.equal(find('input[aria-label="Clothing accent color"]').value, '#ff2d95');
    assert.equal(requests.length, 1);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    assert.equal(requests.length, 2, 'rapid changes coalesce');
    assert.equal(requests[1].character.appearance.eye_color, 'blue');
    assert.equal(requests[1].character.appearance.brow_color, 'copper');
    assert.equal(requests[1].character.appearance.glasses, 'aviator');
    await click('#character-editor-tab-props');
    await click('.character-outfits[aria-label="Props"] button:last-child');
    assert.equal(drafts.at(-1).prop, 'shop-bag');
    await click('#character-editor-tab-emotes');
    assert([...document.querySelectorAll('.character-emotes button')].some(button => button.textContent === 'Lift the bag'));
    assert(![...document.querySelectorAll('.character-emotes button')].some(button => button.textContent === 'Hands behind back'));
    assert.equal(find('input[aria-label="Preview zoom"]').max, '1.25');
    await click('[aria-label="Emote collection"] button:nth-child(2)');
    assert.deepEqual([...document.querySelectorAll('.character-emotes button')].map(button => button.textContent),
      ['Small fist pump', 'Blown kiss', 'Finger heart']);
    await click('[aria-label="Emote collection"] button:nth-child(3)');
    assert.deepEqual([...document.querySelectorAll('.character-emotes button')].map(button => button.textContent),
      ['Air doodle', 'Finger count mistake', 'Imaginary butterfly', 'Almost a sneeze']);
    await click('[aria-label="Emote collection"] button:nth-child(4)');
    assert.deepEqual([...document.querySelectorAll('.character-emotes button')].map(button => button.textContent),
      ['Shoetip shuffle', 'Compliment recoil', 'Timid invitation', 'Suppressed giggle', 'Gentle reassurance']);
    await click('[aria-label="Emote collection"] button:nth-child(5)');
    assert.deepEqual([...document.querySelectorAll('.character-emotes button')].map(button => button.textContent),
      ['Sideways check', 'Caught smiling', 'Dismissive hand flick', 'Private fist pump']);
    await click('[aria-label="Emote collection"] button:nth-child(6)');
    assert.deepEqual([...document.querySelectorAll('.character-emotes button')].map(button => button.textContent),
      ['Little double take', 'Peek past the palm', 'Bashful heel twist']);
    await click('[aria-label="Emote collection"] button:nth-child(8)');
    assert.deepEqual([...document.querySelectorAll('.character-emotes button')].map(button => button.textContent),
      ['Grid countdown', 'Two-finger salute', 'Photo finish', 'Call the line', 'Good race']);
    await click('[aria-label="Emote collection"] button:nth-child(9)');
    assert.deepEqual([...document.querySelectorAll('.character-emotes button')].map(button => button.textContent),
      ['Radio check', 'Last lap', 'Box this lap', 'Check the mirrors', 'Crew fist bump']);
    await click('[aria-label="Emote collection"] button:last-child');
    assert.deepEqual([...document.querySelectorAll('.character-emotes button')].map(button => button.textContent),
      ['Neck reset', 'Fix the fringe', 'Hang loose', 'Shade the lights', 'Rain check', 'Keys check']);
    await click('[aria-label="Preview gender"] [data-character-option="mara-vega"]');
    assert.equal(drafts.at(-1).id, 'mara-vega');
    assert.equal(drafts.at(-1).prop, 'shop-bag');
    await click('#character-editor-tab-appearance');
    assert.equal(drafts.at(-1).id, 'jules-okafor', 'comparison only changes the Emotes preview');
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
    await click('#character-editor-tab-face');
    assert.equal(find('select[aria-label="Eye color"]').value, 'blue');

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

test('all emote batches return to rest and keep planted and lifted feet distinct', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { buildGarageEmotes } = await vite.ssrLoadModule('/src/game/characters/garageEmotes.ts');
    const { COCKPIT_TAKES } = await vite.ssrLoadModule('/src/game/characters/roadsideEmotes.ts');
    const { sampleCockpitMotion } = await vite.ssrLoadModule('/src/game/preview/garageCockpit.ts');
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
    const numbered = [...ids.filter(id => /^\d+$/.test(id)), ...COCKPIT_TAKES.map(take => take.id)].sort();
    assert.deepEqual(numbered, Array.from({length: 100}, (_, i) => String(i + 1).padStart(3, '0')));
    assert.deepEqual(ids.filter(id => id.startsWith('walk-')), ['walk-casual', 'walk-glance']);
    assert.deepEqual(buildGarageEmotes(model.root).map(clip => clip.name.split(' ')[0]), [...ids.slice(0, 10), '035']);
    assert(!buildGarageEmotes(model.root, true).some(clip => clip.name.startsWith('035 ')));
    const leanFit = { offset: .15, distance: .06 };
    const lean = buildGarageEmotes(model.root, false, false, leanFit).at(-1);
    assert(lean.name.startsWith('pose-lean '));
    assert(!buildGarageEmotes(model.root, true, false, leanFit).some(clip => clip.name.startsWith('pose-lean ')));
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
    for (const clip of clips) {
      const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.reset().play();
      mixer.update(clip.duration * .36);
      assert(capture().some((value, i) => Math.abs(value - rest[i]) > .005), clip.name);
      mixer.update(clip.duration);
      action.stop();
      assert(capture().every((value, i) => Math.abs(value - rest[i]) < 1e-6), clip.name);
    }
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
    for (const id of ['walk-casual', 'walk-glance', '042']) {
      const clip = clips[ids.indexOf(id)];
      const walk = mixer.clipAction(clip).reset().play();
      const startsRight = id === 'walk-glance';
      const plant = startsRight ? 'r' : 'l';
      const swing = startsRight ? 'l' : 'r';
      mixer.update(clip.duration / 9);
      const planted = foot(plant);
      mixer.update(clip.duration / 18);
      assert(foot(plant).distanceTo(planted) < .006, id);
      const lift = foot(swing).y - (startsRight ? leftRest : rightRest).y;
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
