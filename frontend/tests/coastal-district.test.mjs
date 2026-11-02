import test from "node:test";
import assert from "node:assert/strict";
import { coastalDistrict, coastalCoordinate } from "../src/worldBuilder/generation/coastalDistrict.ts";
import { layoutJSON, parseLayoutText, partTransform, MAX_LAYOUT_OBJECTS, MAX_LAYOUT_PARTS } from "../src/worldBuilder/document/layoutDocument.ts";
import { mapExport, parseMapDocument } from "../src/worldBuilder/document/mapDocument.ts";
import { readFileSync } from "node:fs";

// Probe exported faces. Fixtures use zero yaw; wedges rise toward -Z, matching
// the existing renderer/Rapier shape convention. This is geometric validation,
// not a replacement for runtime driving tests.
function worldTopAt(doc, x, z) {
  let top = -Infinity;
  for (const item of doc.objects) {
    if (!item.solid) continue;
    for (const part of item.parts) {
      if (part.solid === false) continue;
      const t = partTransform(item, part);
      assert.equal(t.yaw, 0);
      const [cx, cy, cz] = t.position, [w, h, d] = t.size;
      if (Math.abs(x - cx) <= w / 2 + 1e-7 && Math.abs(z - cz) <= d / 2 + 1e-7) {
        const y = part.shape === "wedge" ? cy - h / 2 + h * (0.5 - (z - cz) / d) : cy + h / 2;
        top = Math.max(top, y);
      }
    }
  }
  return top;
}
const topAt = (doc, x, z) => worldTopAt(doc, coastalCoordinate(x, 20), coastalCoordinate(z, 16));

test("coastal generation is deterministic, bounded, portable and validates inputs", () => {
  const a = coastalDistrict("test", 42), b = coastalDistrict("test", 42);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, coastalDistrict("test", 43));
  assert.deepEqual(parseLayoutText(layoutJSON(a)), a);
  assert.ok(a.objects.length < MAX_LAYOUT_OBJECTS);
  assert.ok(a.objects.reduce((n, o) => n + o.parts.length, 0) < MAX_LAYOUT_PARTS);
  assert.equal(new Set(a.objects.map(o => o.id)).size, a.objects.length);
  b.objects[0].position[1] = 999;
  assert.notDeepEqual(a, b);
  for (const seed of [-1, 0.5, Infinity, NaN, 4294967296]) assert.throws(() => coastalDistrict("test", seed));
  for (const surface of [NaN, Infinity, 10001]) assert.throws(() => coastalDistrict("test", 1, surface));
});
test("canals and damaged bridge retain real open collision gaps", () => {
  const d = coastalDistrict("test");
  assert.equal(d.ground, false);
  assert.equal(d.repeat, false);
  assert.equal(d.base, "replace");
  for (const [x, z] of [[0, 0], [0, 40], [-60, 0], [80, 0], [210, -140]])
    assert.equal(topAt(d, x, z), -Infinity, `${x},${z} must have no floor`);
  for (const o of d.objects.filter(o => o.piece === "coastal-water-visual")) assert.equal(o.solid, false);
  assert.ok(Number.isFinite(topAt(d, -60, -12)));
  assert.ok(Number.isFinite(topAt(d, -60, 12)));
});
test("bridges, spawn lanes and carrier access remain connected across seeds", () => {
  for (const seed of [0, 1, 42, 4294967295]) {
    const d = coastalDistrict("test", seed, 12);
    for (const spawn of d.spawns) assert.ok(Math.abs(worldTopAt(d, spawn.position[0], spawn.position[2]) - spawn.position[1]) < 1e-6);
    for (const z of [-80, 80])
      for (let x = -175; x <= 135; x++) assert.ok(Math.abs(topAt(d, x, z) - 12.08) < 1e-6, `bridge ${seed}: ${x},${z}`);
    for (let z = -140; z <= 140; z++) assert.ok(Math.abs(topAt(d, 60, z) - 12.08) < 1e-6, `avenue ${z}`);
    const path = [];
    for (let x = 60; x <= 133; x++) path.push([x, 100]);
    for (let z = 100; z <= 118; z++) path.push([133, z]);
    for (let x = 133; x <= 245; x++) path.push([x, 118]);
    for (let z = 118; z >= -75; z--) path.push([245, z]);
    let previous = 12.08;
    for (const [x, z] of path) {
      const next = topAt(d, x, z);
      assert.ok(Number.isFinite(next) && Math.abs(next - previous) < 0.1, `fleet ${seed}: ${x},${z} ${next} after ${previous}`);
      previous = next;
    }
    assert.ok(Math.abs(topAt(d, -110, 51) - 20) < 1e-6);
  }
});
test("server map export retains shapes and explicit team spawns", () => {
  const source = parseMapDocument(JSON.parse(readFileSync(new URL("../../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json", import.meta.url), "utf8")));
  const d = coastalDistrict(source.map_id, 23, source.surface.road_y);
  const map = JSON.parse(mapExport({ ...source, authored_layout: d }));
  assert.deepEqual(map.layout, { kind: "fixed_grid", origin: [0, 0], size: [1, 1] });
  assert.deepEqual(map.authored_layout, d);
  assert.equal(map.team_spawns.red.length, 3);
  assert.equal(map.team_spawns.blue.length, 3);
  assert.ok(map.cell[0] < 10000 && map.cell[1] < 10000);
});

test("generation switches to its own catalog world, keeps source drafts, confirms replacement and applies live spawns", async () => {
  const { JSDOM } = await import("jsdom"), { createServer } = await import("vite");
  const { act, createElement: h } = await import("react"), { createRoot } = await import("react-dom/client");
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" }), old = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
  let root;
  try {
    const load = path => server.ssrLoadModule('/src/' + path);
    const { useLayoutStore: layout, layoutStorageKey } = await load('worldBuilder/state/layoutStore.ts');
    const { useBuilderStore: builder } = await load('worldBuilder/state/builderStore.ts');
    const { configureBuilderMapSources, switchBuilderWorld } = await load('worldBuilder/state/builderActions.ts');
    const { coastalMap } = await load('worldBuilder/generation/coastalMap.ts');
    const { useSelectionStore: selection, mapCatalog } = await load('store/selection/selectionStore.ts');
    const { useUIStore: ui } = await load('store/menus/uiStore.ts');
    const { useSocialStore: social } = await load('store/social/socialStore.ts');
    const client = await load('net/socialClient.ts'), requests = [];
    client.setSocialConnection({ readyState: 1, send: body => {
      const m = JSON.parse(body); requests.push(m);
      setTimeout(() => client.receiveSocialResult({ request_id: m.request_id, ok: true, data: {} }), 0);
    }});
    social.setState({ view: { alpha: { active: { mode: 'editor' } } } });
    ui.setState({ screen: 'world_builder', overlay: null });
    const source = parseMapDocument(JSON.parse(readFileSync(new URL('../../avenlab-server/src/assets/blocks/road_precision_colliders.json', import.meta.url))));
    configureBuilderMapSources([source, coastalMap(99)]);
    builder.getState().load(source, 'test');
    const before = coastalDistrict('road_precision', 99);
    layout.setState({ doc: before, saved: null, past: [], future: [] });
    const { CoastalGenerator } = await load('worldBuilder/panels/CoastalGenerator.tsx');
    const { EditorWorldControls } = await load('worldBuilder/panels/EditorWorldControls.tsx');
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(h('div', null, h(CoastalGenerator), h(EditorWorldControls))));
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
    const click = node => act(async () => node.click());
    await click(button('Generate coastal district'));
    assert.equal(builder.getState().doc.map_id, 'coastal_district', layout.getState().status + ' / ' + builder.getState().status);
    assert.equal(selection.getState().getSelectedMap().id, 'coastal_district');
    assert.equal(document.querySelector('[aria-label="Editing world"]').value, 'coastal_district');
    assert.equal(mapCatalog.filter(m => m.id === 'coastal_district').length, 1);
    assert.equal(JSON.parse(localStorage.getItem(layoutStorageKey('road_precision'))).title, before.title);
    const previousCoast = layout.getState().doc;
    await click(button('Cancel'));
    assert.equal(layout.getState().doc, previousCoast);
    await click(button('Generate coastal district'));
    await click(button('Replace with coastal district'));
    await act(async () => new Promise(r => setTimeout(r, 30)));
    assert.equal(layout.getState().doc.map_id, 'coastal_district');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].action, 'editor_apply');
    assert.equal(requests[0].document.map_id, 'coastal_district');
    assert.equal(requests[0].document.team_spawns.red.length, 3);
    for (const spawn of layout.getState().doc.spawns)
      assert.ok(Math.abs(worldTopAt(layout.getState().doc, spawn.position[0], spawn.position[2]) - spawn.position[1]) < 1e-6);
    assert.equal(layout.getState().past.at(-1), previousCoast);
    await act(async () => layout.getState().undo());
    assert.equal(layout.getState().doc, previousCoast);
    await act(async () => switchBuilderWorld('road_precision'));
    assert.equal(layout.getState().doc.title, before.title);
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close(); dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("standalone coastal identity, old export recovery and full chassis spawn footprints", async () => {
  const { coastalMap, parseDistrictImport } = await import('../src/worldBuilder/generation/coastalMap.ts');
  const a = coastalMap(42), d = a.authored_layout;
  assert.equal(a.map_id, 'coastal_district');
  assert.equal(d.map_id, a.map_id);
  assert.equal(d.objects.filter(o => o.piece === 'coastal-land').length, 4);
  for (const land of d.objects.filter(o => o.piece === 'coastal-land')) {
    assert(land.size[0] >= 200 && land.size[2] >= 200, 'land supports longer chases');
  }
  for (const spawn of d.spawns) {
    assert(d.objects.some(o => o.piece === 'coastal-start' && Math.abs(o.position[0] - spawn.position[0]) <= o.size[0]/2 && Math.abs(o.position[2]-spawn.position[2]) <= o.size[2]/2));
    for (const dx of [-2, 0, 2]) for (const dz of [-3, 0, 3])
      assert(Math.abs(worldTopAt(d, spawn.position[0]+dx, spawn.position[2]+dz)-spawn.position[1])<1e-6);
  }
  assert.equal(d.objects.filter(o => ['fuel-station','repair-shop','service-center'].includes(o.piece)).length, 3);
  const legacy = { ...d, map_id: 'road_precision', title: 'My exported coastal district' };
  const recovered = parseDistrictImport(JSON.stringify({ authored_layout: legacy }), 'road_precision');
  assert.equal(recovered.layout.map_id, 'coastal_district');
  assert.equal(recovered.layout.title, legacy.title);
  assert.deepEqual(recovered.layout.spawns, legacy.spawns);
  assert.throws(() => parseDistrictImport(JSON.stringify({ ...legacy, objects: null }), 'road_precision'));
  assert.throws(() => parseDistrictImport(JSON.stringify({ ...legacy, objects: [] }), 'road_jump_lab'));
});

test('district footprint presets retain bounded colliders and a permanent safe crossing', async () => {
  const { coastalMap } = await import('../src/worldBuilder/generation/coastalMap.ts');
  for (const size of ['block','chunk','massive']) {
    const m=coastalMap(42,size),d=m.authored_layout;
    assert(d.objects.length<=256);
    assert(d.objects.some(o=>o.piece==='coastal-land-bridge'));
    assert(d.objects.every(o=>o.size[0]<=512&&o.size[2]<=512));
    assert.equal(JSON.parse(mapExport(m)).map_id,'coastal_district');
    for(const p of d.spawns)assert(Math.abs(worldTopAt(d,p.position[0],p.position[2])-p.position[1])<1e-6);
  }
  assert(!coastalMap(1,'chunk',false).authored_layout.objects.some(o=>o.piece==='coastal-land-bridge'));
});
