import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mapExport,
  parseMapText,
} from "../src/worldBuilder/document/mapDocument.ts";
import {
  layoutJSON,
  parseLayoutText,
  updatePiece,
} from "../src/worldBuilder/document/layoutDocument.ts";
import { roadAsset, roleSolid } from "../src/worldBuilder/roads/roadCatalog.ts";
const text = readFileSync(
  new URL(
    "../../avenlab-server/src/assets/blocks/road_jump_lab_colliders.json",
    import.meta.url,
  ),
  "utf8",
);
const map = parseMapText(text),
  doc = map.authored_layout;
const piece = (id) => doc.objects.find((o) => o.id === id);
test("installed lab roundtrips finite settings, measured roads, masks and stable IDs", () => {
  assert.equal(map.map_id, "road_jump_lab");
  assert.deepEqual(map.layout, {
    kind: "fixed_grid",
    origin: [0, 0],
    size: [1, 1],
  });
  assert.equal(doc.base, "replace");
  assert.equal(doc.ground, false);
  assert.equal(doc.repeat, false);
  assert.deepEqual(parseMapText(mapExport(map)), map);
  assert.deepEqual(parseLayoutText(layoutJSON(doc)), doc);
  assert.equal(new Set(doc.objects.map((o) => o.id)).size, doc.objects.length);
  for (const o of doc.objects.filter((o) => o.road))
    assert.deepEqual(o.size, roadAsset(o.road.asset).size);
  assert.equal(roleSolid("left-curb", piece("jump-approach").road), false);
  assert.equal(roleSolid("right-paving", piece("opposing-source").road), false);
  assert.equal(roleSolid("right-curb", piece("opposing-return").road), false);
  const road = roadAsset("road_narrow");
  assert.equal(
    piece("end-to-end-road").position[2] + road.surface.min[2],
    piece("jump-approach").position[2] + road.surface.max[2],
  );
  assert.ok(
    map.cell[1] > 960,
    "map bounds derive from full road extent rather than the 200 m guide",
  );
});
test("launch, open gap, roof and return slope stay explicit editable geometry", () => {
  const ramp = piece("launch-ramp"),
    roof = piece("landing-roof");
  assert.deepEqual(ramp.size, [8, 4, 16]);
  assert.equal(ramp.parts[0].shape, "wedge");
  assert.equal(roof.position[1] + roof.size[1], 2);
  assert.equal(
    ramp.position[2] - ramp.size[2] / 2 - (roof.position[2] + roof.size[2] / 2),
    8,
  );
  assert.equal(piece("height-limit").size[1], 24);
  // Editor modifications use the normal validated object contract.
  const edited = updatePiece(doc, ramp.id, {
    position: [2, 0, -8],
    size: [10, 4, 16],
  });
  assert.deepEqual(
    parseLayoutText(layoutJSON(edited)).objects.find((o) => o.id === ramp.id)
      .position,
    [2, 0, -8],
  );
  assert.equal(piece("roof-return-ramp").yaw, -180);
  assert.equal(
    map.roads.length + map.buildings.length,
    0,
    "legacy city boxes must not supply fallback support",
  );
});

test("lab pieces support pointer and controller edits in the installed editor", async () => {
  const { JSDOM } = await import("jsdom"),
    { createServer } = await import("vite");
  const { act, createElement: h } = await import("react"),
    { createRoot } = await import("react-dom/client");
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
      );
    const { useUIStore: ui } = await load("store/menus/uiStore.ts"),
      { routeMenuAction } = await load("controls/inputRouting.ts");
    const { WorldBuilderPanel } = await load(
      "worldBuilder/panels/WorldBuilderPanel.tsx",
    );
    builder.getState().load(map, "Road & Jump Lab");
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
        );
    await act(async () => button("scene").click());
    const launch = [...document.querySelectorAll(".le-scene-list button")].find(
      (b) => b.textContent.includes("launch-ramp"),
    );
    await act(async () => launch.click());
    assert.equal(layout.getState().selected, "launch-ramp");
    await act(async () => by("Increase Position X").click());
    assert.equal(
      layout.getState().doc.objects.find((o) => o.id === "launch-ramp")
        .position[0],
      0.5,
    );
    await act(async () => by("Undo layout edit").click());
    await act(async () => {
      by("Increase Position X").focus();
      routeMenuAction("activate");
    });
    assert.equal(
      layout.getState().doc.objects.find((o) => o.id === "launch-ramp")
        .position[0],
      0.5,
    );
    await act(async () => button("Save").click());
    const saved = JSON.parse(
      localStorage.getItem("avenlab-layout-v1:road_jump_lab"),
    );
    assert.equal(saved.ground, false);
    assert.equal(saved.repeat, false);
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
