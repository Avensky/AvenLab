import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PIECES,
  addPiece,
  emptyLayout,
  parseLayout,
  layoutJSON,
} from "../src/worldBuilder/document/layoutDocument.ts";
import { mapExport } from "../src/worldBuilder/document/mapDocument.ts";
import { vehicleDetailIds } from "../src/worldBuilder/vehicles/vehicleCatalog.ts";
import { normalizedVehicleTemplate } from "../src/worldBuilder/vehicles/vehicleTemplate.ts";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
const fixture = (id) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../avenlab-server/src/assets/blocks/${id}_colliders.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
const source = fixture("streaming_endless_city");

test("every library prefab exports valid explicit geometry or an approved decorative vehicle", () => {
  for (const piece of PIECES) {
    const doc = addPiece(
        emptyLayout(source.map_id),
        piece.id,
        [17, 3, -11],
        90,
      ),
      map = JSON.parse(mapExport({ ...source, authored_layout: doc }));
    assert.deepEqual(
      map.authored_layout,
      JSON.parse(layoutJSON(doc)),
      piece.id,
    );
    assert.ok(doc.objects[0].parts.length <= 32, piece.id);
  }
  for (const id of ["chunk-2x2", "chunk-3x3"]) {
    const item = addPiece(emptyLayout("test"), id, [0, 0, 0]).objects[0];
    assert.ok(
      item.parts.some((p) => p.position[1] < 0),
      "roads are explicit surfaces at the base",
    );
    assert.ok(
      !item.parts.some(
        (p) => p.position[0] === 0 && p.position[2] === 0 && p.size[1] > 0.5,
      ),
      "no enclosing chunk collider",
    );
  }
  for (const id of [
    "route-arrow",
    "finish-line",
    "ctf-red",
    "ctf-blue",
    "payload-route",
  ]) {
    const item = addPiece(emptyLayout("test"), id, [0, 0, 0]).objects[0];
    assert.equal(item.solid, false);
    assert.ok(item.parts.every((p) => p.solid === false));
  }
});
test("background vehicles roundtrip as props and reject physics, mixed assets and unknown URLs", () => {
  const doc = addPiece(emptyLayout(source.map_id), "vehicle-brz", [4, 2, 7]),
    item = doc.objects[0];
  assert.equal(item.solid, false);
  assert.equal(item.parts.length, 0);
  assert.equal(item.vehicle.asset, "brz");
  for (const mutate of [
    (o) => (o.solid = true),
    (o) => (o.vehicle.asset = "https://example.com/car.glb"),
    (o) => (o.vehicle.lod = "unlimited"),
    (o) =>
      (o.parts = [{ shape: "box", position: [0, 0.5, 0], size: [1, 1, 1] }]),
    (o) =>
      (o.road = addPiece(
        emptyLayout("test"),
        "glb-road_narrow",
        [0, 0, 0],
      ).objects[0].road),
  ]) {
    const broken = structuredClone(doc);
    mutate(broken.objects[0]);
    assert.throws(() => parseLayout(broken));
  }
});
test("vehicle LOD bounds full-model demand, keeps distant cars instanced and uses hysteresis", () => {
  const cars = Array.from({ length: 100 }, (_, i) => ({
    id: `car-${i}`,
    position: [i, 0, 0],
    vehicle: { asset: "brz", lod: "auto" },
  }));
  assert.equal(vehicleDetailIds(cars, [0, 0, 0], "auto").length, 6);
  assert.equal(vehicleDetailIds(cars, [0, 0, 0], "high").length, 12);
  assert.deepEqual(vehicleDetailIds(cars, [0, 0, 0], "low"), []);
  assert.deepEqual(vehicleDetailIds(cars, [1000, 0, 0], "auto"), []);
  const edge = [{ ...cars[0], position: [95, 0, 0] }];
  assert.deepEqual(vehicleDetailIds(edge, [0, 0, 0], "auto"), []);
  assert.deepEqual(
    vehicleDetailIds(edge, [0, 0, 0], "auto", new Set(["car-0"])),
    ["car-0"],
  );
  assert.deepEqual(
    vehicleDetailIds(
      [{ ...cars[0], vehicle: { asset: "brz", lod: "proxy" } }],
      [0, 0, 0],
      "high",
    ),
    [],
  );
});
test("vehicle normalization preserves mirrored face transforms and shares geometry between independent placements", () => {
  const source = new Group(),
    geometry = new BoxGeometry(2, 3, 4),
    material = new MeshStandardMaterial(),
    wheel = new Mesh(geometry, material);
  wheel.name = "mirrored-wheel";
  wheel.scale.x = -1;
  wheel.position.set(3, 2, 1);
  source.add(wheel);
  source.updateMatrixWorld(true);
  const original = wheel.matrixWorld.toArray(),
    template = normalizedVehicleTemplate(source, "supra", Math.PI / 2),
    a = cloneSkeleton(template),
    b = cloneSkeleton(template),
    am = a.getObjectByName("mirrored-wheel"),
    bm = b.getObjectByName("mirrored-wheel");
  a.updateMatrixWorld(true);
  assert.ok(
    am.matrixWorld.determinant() < 0,
    "renderer keeps the source front-face flip",
  );
  assert.equal(am.geometry, geometry);
  assert.equal(am.geometry, bm.geometry);
  assert.notEqual(am, bm);
  a.position.x += 10;
  assert.notEqual(a.position.x, b.position.x);
  assert.deepEqual(
    wheel.matrixWorld.toArray(),
    original,
    "source GLB stays immutable",
  );
  const size = new Box3().setFromObject(template).getSize(new Vector3());
  for (const v of size.toArray()) assert.ok(Math.abs(v - 1) < 1e-9);
  geometry.dispose();
  material.dispose();
});

test("universal editor switches independent world drafts, rejects stale loads and keeps the live map untouched", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
      url: "http://localhost/",
      pretendToBeVisual: true,
    }),
    old = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  old.set("fetch", Object.getOwnPropertyDescriptor(globalThis, "fetch"));
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  let root;
  try {
    const load = (p) => server.ssrLoadModule("/src/" + p),
      { useBuilderStore: builder } = await load(
        "worldBuilder/state/builderStore.ts",
      ),
      { useLayoutStore: layout } = await load(
        "worldBuilder/state/layoutStore.ts",
      ),
      { useUIStore: ui } = await load("store/menus/uiStore.ts"),
      { useWorldStore: world } = await load("store/world/worldStore.ts"),
      actions = await load("worldBuilder/state/builderActions.ts"),
      { WorldBuilderPanel } = await load(
        "worldBuilder/panels/WorldBuilderPanel.tsx",
      );
    const maps = Object.fromEntries(
      [
        "streaming_endless_city",
        "road_jump_lab",
        "workshop_yard",
        "road_precision",
      ].map((id) => [id, fixture(id)]),
    );
    globalThis.fetch = async (url) => ({
      ok: true,
      text: async () =>
        JSON.stringify(maps[String(url).match(/([^/]+)_colliders/)[1]]),
    });
    builder.getState().load(source, "Installed city");
    ui.setState({
      screen: "world_builder",
      overlay: null,
      isModeLoading: false,
    });
    const live = { map_id: "running-session" };
    world.setState({ map: live });
    root = createRoot(document.getElementById("root"));
    await act(async () =>
      root.render(h(WorldBuilderPanel, { planOnly: true })),
    );
    const by = (label) => document.querySelector(`[aria-label="${label}"]`),
      button = (text) =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent === text,
        ),
      click = async (b) => act(async () => b.click()),
      tab = (text) =>
        [...document.querySelectorAll('[role="tab"]')].find(
          (b) => b.textContent === text,
        );
    assert.equal(by("Editing world").value, source.map_id);
    assert.equal(by("Editing world").options.length, 4);
    assert.ok(by("Editor theme").closest("header"));
    assert.ok(by("Editor detail").closest("header"));
    assert.doesNotMatch(
      document.body.textContent,
      /playground|Make a place worth exploring|Make room/,
    );
    await click(tab("Vehicles"));
    await click(by("Place BRZ background"));
    await click(button("+ Place at cursor"));
    await click(button("Finish placing · Esc"));
    assert.equal(layout.getState().doc.objects[0].vehicle.asset, "brz");
    assert.equal(by("Physical collisions"), null);
    await act(async () => actions.switchBuilderWorld("road_jump_lab"));
    assert.equal(by("Editing world").value, "road_jump_lab");
    assert.equal(
      layout.getState().doc.objects.length,
      maps.road_jump_lab.authored_layout.objects.length,
    );
    await click(tab("Objectives"));
    await click(by("Place Red CTF area"));
    await click(button("+ Place at cursor"));
    await click(button("Finish placing · Esc"));
    const jumpCount = layout.getState().doc.objects.length;
    await act(async () => actions.switchBuilderWorld(source.map_id));
    assert.equal(layout.getState().doc.objects.length, 1);
    assert.equal(layout.getState().doc.objects[0].vehicle.asset, "brz");
    assert.equal(layout.getState().past.length, 1);
    await click(by("Undo layout edit"));
    assert.equal(layout.getState().doc.objects.length, 0);
    await click(by("Redo layout edit"));
    assert.equal(layout.getState().doc.objects.length, 1);
    await act(async () => actions.switchBuilderWorld("road_jump_lab"));
    assert.equal(layout.getState().doc.objects.length, jumpCount);
    await click(tab("3×3 chunks"));
    assert.ok(by("Place 3×3 starter chunk"));
    await click(tab("Garages / small"));
    assert.ok(by("Place Selection-screen garage"));
    const pending = [];
    globalThis.fetch = (url) =>
      new Promise((resolve) => pending.push({ url, resolve }));
    let first, second;
    await act(async () => {
      first = actions.switchBuilderWorld("workshop_yard");
      second = actions.switchBuilderWorld("road_precision");
    });
    await act(async () => {
      pending[1].resolve({
        ok: true,
        text: async () => JSON.stringify(maps.road_precision),
      });
      await second;
    });
    await act(async () => {
      pending[0].resolve({
        ok: true,
        text: async () => JSON.stringify(maps.workshop_yard),
      });
      await first;
    });
    assert.equal(builder.getState().doc.map_id, "road_precision");
    assert.equal(layout.getState().doc.map_id, "road_precision");
    assert.equal(world.getState().map, live);
    globalThis.fetch = async () => ({ ok: false });
    await act(async () => actions.switchBuilderWorld("workshop_yard"));
    assert.equal(builder.getState().doc.map_id, "road_precision");
    assert.equal(by("Editing world").value, "road_precision");
    assert.match(layout.getState().status, /unavailable/);
    assert.equal(world.getState().map, live);
    // The advanced editor must import against its header world, not the running
    // multiplayer session, and must still preserve that unrelated live session.
    await click(by("Hide inspector"));
    assert.equal(document.getElementById("world-inspector"), null);
    await click(by("Show inspector"));
    await click(by("Minimize inspector"));
    assert.equal(
      document.getElementById("world-inspector").dataset.compact,
      "true",
    );
    await click(by("Expand inspector"));
    await click(button("files"));
    await click(document.querySelector(".le-collision-link"));
    const imported = {
        ...maps.road_precision,
        metadata: {
          ...maps.road_precision.metadata,
          editor_import: "selected-world",
        },
      },
      text = JSON.stringify(imported),
      file = by("Import server map JSON");
    Object.defineProperty(file, "files", {
      configurable: true,
      value: [{ size: text.length, text: async () => text }],
    });
    await act(async () => {
      file.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(
      builder.getState().doc.metadata.editor_import,
      "selected-world",
    );
    assert.equal(builder.getState().doc.map_id, "road_precision");
    assert.equal(world.getState().map, live);
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, value] of old) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  }
});
