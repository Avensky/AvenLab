import test from "node:test";
import assert from "node:assert/strict";
import { coastalDistrict } from "../src/worldBuilder/generation/coastalDistrict.ts";
import { layoutJSON, parseLayoutText, partTransform, MAX_LAYOUT_OBJECTS, MAX_LAYOUT_PARTS } from "../src/worldBuilder/document/layoutDocument.ts";
import { mapExport, parseMapDocument } from "../src/worldBuilder/document/mapDocument.ts";
import { readFileSync } from "node:fs";

// Probe exported faces. Fixtures use zero yaw; wedges rise toward -Z, matching
// the existing renderer/Rapier shape convention. This is geometric validation,
// not a replacement for runtime driving tests.
function topAt(doc, x, z) {
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
    for (const spawn of d.spawns) assert.ok(Math.abs(topAt(d, spawn.position[0], spawn.position[2]) - spawn.position[1]) < 1e-6);
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

test("generator UI confirms replacement, preserves history and cancels without touching the live world", async () => {
  const { JSDOM } = await import("jsdom");
  const { createServer } = await import("vite");
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  const old = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error" });
  let root;
  try {
    const load = path => server.ssrLoadModule('/src/' + path);
    const { useLayoutStore: layout } = await load('worldBuilder/state/layoutStore.ts');
    const { useWorldStore: world } = await load('store/world/worldStore.ts');
    const { CoastalGenerator } = await load('worldBuilder/panels/CoastalGenerator.tsx');
    const before = coastalDistrict('test', 99);
    const live = { map_id: 'live-world' };
    world.setState({ map: live });
    layout.setState({ doc: before, past: [], future: [] });
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(createElement(CoastalGenerator)));
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
    const click = node => act(async () => node.click());
    await click(button('Generate coastal district'));
    assert.equal(layout.getState().doc, before);
    await click(button('Cancel'));
    assert.equal(layout.getState().doc, before);
    await click(button('Generate coastal district'));
    await click(button('Replace with coastal district'));
    assert.equal(layout.getState().doc.title, 'Coastal district · seed 1');
    assert.equal(layout.getState().past.at(-1), before);
    assert.equal(world.getState().map, live);
    await act(async () => layout.getState().undo());
    assert.equal(layout.getState().doc, before);
    // A world switch invalidates an old confirmation.
    await click(button('Generate coastal district'));
    await act(async () => layout.setState({ doc: coastalDistrict('other') }));
    assert.ok(button('Generate coastal district'));
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close(); dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
