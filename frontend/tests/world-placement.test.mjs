import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addPiece,
  emptyLayout,
  layoutJSON,
  parseLayout,
  parseLayoutText,
  updatePiece,
} from "../src/worldBuilder/document/layoutDocument.ts";
import {
  MODEL_ASSETS,
  modelSolid,
  modelVisible,
} from "../src/worldBuilder/models/modelCatalog.ts";
import { garageRole } from "../src/worldBuilder/models/modelRoles.ts";
import { mapExport } from "../src/worldBuilder/document/mapDocument.ts";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
const source = JSON.parse(
  readFileSync(
    new URL(
      "../../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
test("the placed selection garage preserves its measured structural catalog and empty room", () => {
  const doc = addPiece(
      emptyLayout(source.map_id),
      "prefab-selection_garage",
      [12, 3, 20],
      90,
    ),
    item = doc.objects[0],
    a = MODEL_ASSETS[0];
  assert.equal(doc.ground, false);
  assert.equal(doc.repeat, false);
  assert.equal(item.parts.length, 0);
  assert.deepEqual(parseLayoutText(layoutJSON(doc)), doc);
  assert.deepEqual(
    a.colliders.map((c) => c.role),
    ["floor", "walls", "roof"],
  );
  assert.equal(
    a.colliders.reduce((n, c) => n + c.indices.length, 0),
    414,
  );
  assert.equal(garageRole("03_Piler", 3, 0), "walls");
  assert.equal(garageRole("Toit_GRILLE", 7, 1), "roof-detail");
  assert.equal(garageRole("Light", 3, 0), "details");
  assert.equal(modelVisible("roof-detail", item.model), true);
  item.model.visible.roof = false;
  assert.equal(modelSolid("roof", item.model), false);
  assert.equal(modelVisible("roof-detail", item.model), false);
  item.model.collision.floor = false;
  assert.equal(modelVisible("floor", item.model), true);
  assert.equal(modelSolid("floor", item.model), false);
  const stale = structuredClone(doc);
  stale.objects[0].model.source_sha256 = "old";
  assert.throws(() => parseLayout(stale), /revision/);
  const road = addPiece(
    emptyLayout(source.map_id),
    "glb-road_narrow",
    [0, 0, 0],
  ).objects[0].road;
  const mixed = structuredClone(doc);
  mixed.objects[0].road = road;
  assert.throws(() => parseLayout(mixed));
});
test("garage-only exports are finite and spawn on the placed display pad", () => {
  const doc = addPiece(
      emptyLayout(source.map_id),
      "prefab-selection_garage",
      [12, 3, 20],
      90,
    ),
    map = JSON.parse(mapExport({ ...source, authored_layout: doc }));
  assert.deepEqual(map.layout, {
    kind: "fixed_grid",
    origin: [0, 0],
    size: [1, 1],
  });
  assert.equal(map.surface.road_y, 3);
  assert.equal(map.authored_layout.ground, false);
  const p = map.team_spawns.red[0];
  assert.ok(Math.abs(p.local[0] - 13.4) < 1e-8);
  assert.ok(Math.abs(p.local[1] - 20) < 1e-8);
  assert.equal(p.yaw, Math.PI);
  const moved = updatePiece(doc, doc.objects[0].id, {
    position: [0, 8, 0],
    size: [30, 15, 30],
  });
  assert.equal(moved.objects[0].model.asset, "selection_garage");
});
test("theme preferences do not dirty map data; the garage places, cuts away and undoes in the real panel", async () => {
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
      { useEditorPreferences: prefs } = await load(
        "worldBuilder/state/editorPreferences.ts",
      ),
      { useUIStore: ui } = await load("store/menus/uiStore.ts"),
      { WorldBuilderPanel } = await load(
        "worldBuilder/panels/WorldBuilderPanel.tsx",
      );
    builder.getState().load(source, "Test");
    ui.setState({
      screen: "world_builder",
      overlay: null,
      isModeLoading: false,
    });
    root = createRoot(document.getElementById("root"));
    await act(async () =>
      root.render(h(WorldBuilderPanel, { planOnly: true })),
    );
    const by = (label) => document.querySelector(`[aria-label="${label}"]`),
      button = (text) =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent === text,
        ),
      click = async (b) => act(async () => b.click());
    assert.ok(by("Preview Selection-screen garage"));
    assert.equal(
      document.querySelector(".layout-editor").dataset.editorTheme,
      "shared",
    );
    const before = layout.getState().doc;
    await act(async () => {
      by("Editor theme").value = "forest";
      by("Editor theme").dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(layout.getState().doc, before);
    assert.equal(prefs.getState().theme, "forest");
    assert.equal(
      JSON.parse(localStorage.getItem("avenlab-world-editor-preferences-v1"))
        .state.theme,
      "forest",
    );
    await click(by("Place Selection-screen garage"));
    await click(button("+ Place at cursor"));
    await click(button("Finish placing · Esc"));
    assert.equal(
      layout.getState().doc.objects[0].model.asset,
      "selection_garage",
    );
    await click(by("Show garage roof"));
    assert.equal(layout.getState().doc.objects[0].model.visible.roof, false);
    await click(by("Undo layout edit"));
    assert.equal(layout.getState().doc.objects[0].model.visible.roof, true);
    await click(by("Garage walls collision"));
    assert.equal(layout.getState().doc.objects[0].model.collision.walls, false);
    await click(by("Focus selected piece"));
    assert.equal(layout.getState().focus, "selected");
    await click(button("snapping"));
    await click(by("Show chunk guide"));
    assert.equal(document.querySelectorAll("svg.layout-plan text").length, 4);
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
