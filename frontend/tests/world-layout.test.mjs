import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {act, createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {addPiece, duplicatePiece, emptyLayout, exampleLayout, footprint, layoutJSON, parseLayout, parseLayoutText, partTransform, removePiece, updatePiece} from '../src/worldBuilder/layoutDocument.ts';
import {parseMapDocument, mapExport} from '../src/worldBuilder/mapDocument.ts';
const source = JSON.parse(readFileSync(new URL('../../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json', import.meta.url), 'utf8'));

test('layouts preserve explicit compound shapes and runtime Y-up transforms through server export', () => {
  const doc = exampleLayout(source.map_id, source.surface.road_y), garage = doc.objects.find(o => o.piece === 'garage'), ramp = doc.objects.find(o => o.piece === 'ramp');
  assert.equal(garage.parts.length, 7); assert.equal(ramp.parts[0].shape, 'wedge');
  assert.deepEqual(parseLayoutText(layoutJSON(doc)), doc);
  const exported = JSON.parse(mapExport({...parseMapDocument(source), authored_layout: doc}));
  assert.deepEqual(exported.authored_layout, doc); assert.deepEqual(exported.team_spawns, source.team_spawns); assert.deepEqual(exported.visuals, source.visuals);
  const transform = partTransform({...ramp, position: [10, 2, 20], yaw: 90}, {shape: 'box', position: [0, .5, -.5], size: [1, 1, 1]});
  assert.deepEqual(transform.position.map(Math.round), [2, 4, 20]); assert.deepEqual(transform.size, ramp.size);
  const corners = footprint({...ramp, position: [10, 2, 20], yaw: 90});
  assert.ok(Math.abs(Math.min(...corners.map(p => p[0])) - 2) < 1e-6);
  assert.ok(Math.abs(Math.max(...corners.map(p => p[1])) - 24) < 1e-6);
});
test('invalid imports cannot replace a layout; locked pieces cannot be edited or deleted', () => {
  const doc = addPiece(emptyLayout('test'), 'wall', [1, 0, 2]), id = doc.objects[0].id, before = layoutJSON(doc);
  const locked = updatePiece(doc, id, {locked: true});
  assert.throws(() => updatePiece(locked, id, {position: [2, 0, 0]}), /Unlock/); assert.throws(() => removePiece(locked, id), /Unlock/);
  assert.equal(duplicatePiece(locked, id, .5).objects.at(-1).locked, false); assert.equal(layoutJSON(doc), before);
  for (const mutate of [d => d.objects.push(d.objects[0]), d => d.objects[0].size[0] = 0, d => d.objects[0].position[1] = Infinity, d => d.objects[0].parts[0].shape = 'mesh', d => d.base = 'unknown']) {const d = structuredClone(doc); mutate(d); assert.throws(() => parseLayout(d));}
  assert.throws(() => parseLayout(doc, 'another'), /different map/); assert.throws(() => parseLayoutText(' '.repeat(2 * 1024 * 1024 + 1)), /2 MiB/);
});

test('layout UI places, edits, locks, undoes, saves and routes controller actions without touching the live world', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost/', pretendToBeVisual: true}), old = new Map();
  for (const [key, value] of Object.entries({window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true})) {old.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});}
  document.hasFocus = () => true; dom.window.HTMLElement.prototype.scrollIntoView = () => {}; dom.window.HTMLElement.prototype.attachEvent = () => {}; dom.window.HTMLElement.prototype.detachEvent = () => {};
  const server = await createServer({server: {middlewareMode: true, hmr: false, ws: false}, appType: 'custom', logLevel: 'error'}); let root;
  try {
    const load = path => server.ssrLoadModule('/src/' + path);
    const {useBuilderStore: builder} = await load('worldBuilder/builderStore.ts'), {useLayoutStore: layout} = await load('worldBuilder/layoutStore.ts');
    const {useUIStore: ui} = await load('store/uiStore.ts'), {useWorldStore: world} = await load('store/worldStore.ts'), {canDrive, routeMenuAction} = await load('store/tools/inputRouting.ts');
    const {WorldBuilderPanel} = await load('worldBuilder/WorldBuilderPanel.tsx');
    builder.getState().load(parseMapDocument(source), 'Test map'); ui.setState({screen: 'world_builder', overlay: null, isModeLoading: false}); const live = {map_id: 'live'}; world.setState({map: live});
    root = createRoot(document.getElementById('root')); await act(async () => root.render(h(WorldBuilderPanel, {planOnly: true})));
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text), by = label => document.querySelector(`[aria-label="${label}"]`);
    const click = async node => act(async () => node.click());
    await click(by('Place Open garage')); await click(button('+ Place at cursor')); assert.equal(layout.getState().doc.objects.length, 1); assert.equal(canDrive(), false);
    await click(button('Finish placing · Esc')); const id = layout.getState().selected; assert.ok(id); const input = by('Position X');
    await act(async () => {input.focus(); input.value = '8.5'; input.blur();}); assert.equal(layout.getState().doc.objects[0].position[0], 8.5);
    await click(button('Duplicate')); assert.equal(layout.getState().doc.objects.length, 2); await click(by('Undo layout edit')); assert.equal(layout.getState().doc.objects.length, 1);
    await click(by('Redo layout edit')); assert.equal(layout.getState().doc.objects.length, 2);
    await click(button('Save')); assert.equal(JSON.parse(localStorage.getItem(`avenlab-layout-v1:${source.map_id}`)).objects.length, 2);
    const selected = layout.getState().selected; await act(async () => routeMenuAction('previous_tab')); assert.notEqual(layout.getState().selected, selected);
    const beforeNudge=layout.getState().doc.objects.find(o=>o.id===layout.getState().selected).position[0];
    await act(async()=>{by('Increase Position X').focus();routeMenuAction('activate');});
    assert.equal(layout.getState().doc.objects.find(o=>o.id===layout.getState().selected).position[0],beforeNudge+.5);
    await act(async()=>{by('Grid snap').focus();routeMenuAction('right');});assert.equal(layout.getState().snap,1);
    await act(async()=>routeMenuAction('left'));assert.equal(layout.getState().snap,.5);
    await act(async () => {button('Duplicate').focus(); routeMenuAction('activate');}); assert.equal(layout.getState().doc.objects.length, 3);
    assert.equal(world.getState().map, live);
    await act(async () => routeMenuAction('back')); assert.equal(ui.getState().screen, 'main'); assert.equal(world.getState().map, live);
  } finally {if (root) await act(async () => root.unmount()); await server.close(); dom.window.close(); for (const [key, value] of old) {if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key];}}
});
