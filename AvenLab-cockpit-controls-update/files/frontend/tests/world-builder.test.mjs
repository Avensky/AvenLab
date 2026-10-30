import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import {
  parseMapDocument,
  parseMapText,
  editableBoxes,
  editBox,
  addBox,
  removeBox,
  mapExport,
  planPoint,
  pickBox,
  planBounds,
  snapValue,
  MAX_BOXES,
} from "../src/worldBuilder/document/mapDocument.ts";
const source = JSON.parse(
  readFileSync(
    new URL(
      "../../avenlab-server/src/assets/blocks/streaming_endless_city_colliders.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("builder round-trips the real map and converts the legacy collider axes exactly once", () => {
  const doc = parseMapDocument(source),
    boxes = editableBoxes(doc),
    road = boxes.find((b) => b.kind === "road");
  assert.equal(boxes.length, 35);
  assert.ok(Math.abs(road.center[1] + road.half[1] - 0.32) < 1e-9);
  assert.equal(
    JSON.stringify(JSON.parse(mapExport(doc))),
    JSON.stringify(source),
  );
  const b = boxes.find((b) => b.collection === "buildings"),
    before = JSON.stringify(doc),
    updated = editBox(doc, b.id, [10, 20, -30], [2, 3, 4]),
    raw = updated.buildings.find((v) => v.id === b.id);
  assert.deepEqual(raw.pos, [10, 30, 20]);
  assert.deepEqual(raw.half_extents, [2, 4, 3]);
  assert.deepEqual(
    editableBoxes(updated).find((v) => v.id === b.id).center,
    [10, 20, -30],
  );
  assert.equal(JSON.stringify(doc), before);
  assert.deepEqual(updated.team_spawns, source.team_spawns);
  assert.deepEqual(updated.visuals, source.visuals);
  assert.deepEqual(updated.metadata, source.metadata);
  const added = addBox(updated, "road");
  assert.equal(added.roads.length, 2);
  const newRoad = editableBoxes(added).find((v) =>
    v.id.startsWith("authored_"),
  );
  assert.equal(newRoad.center[1] + newRoad.half[1], doc.surface.road_y);
  assert.equal(removeBox(added, newRoad.id).roads.length, 1);
});
test("builder rejects malformed or unsupported definitions before replacing a draft", () => {
  const mutate = (fn) => {
    const d = structuredClone(source);
    fn(d);
    assert.throws(() => parseMapDocument(d));
  };
  mutate((d) => d.buildings.push({ ...d.buildings[0] }));
  mutate((d) => (d.buildings[0].half_extents[0] = 0));
  mutate((d) => (d.buildings[0].pos[2] = Infinity));
  mutate((d) => (d.buildings[0].rot = [0, 0.7, 0, 0.7]));
  mutate((d) => (d.buildings[0].destructible = "yes"));
  mutate((d) => (d.visuals[0].asset = "/models/../secret.glb"));
  mutate((d) => (d.coordinate_system.forward_axis = 3));
  mutate((d) => (d.team_spawns.red[0].local = [NaN, 0]));
  const d = structuredClone(source);
  d.buildings = Array.from({ length: MAX_BOXES }, (_, i) => ({
    ...d.buildings[0],
    id: `b_${i}`,
  }));
  assert.throws(() => parseMapDocument(d), /2048/);
  assert.throws(() => parseMapDocument(source, "another_map"), /different map/);
  assert.throws(() => parseMapText(" ".repeat(2 * 1024 * 1024 + 1)), /2 MiB/);
});
test("plan picking respects letterboxing, picks buildings above the road slab and snaps without drift", () => {
  const rect = { left: 10, top: 20, width: 500, height: 200 },
    view = { x: 0, z: 0, width: 100, depth: 100 };
  assert.deepEqual(planPoint(260, 120, rect, view), [50, 50]);
  assert.equal(planPoint(11, 120, rect, view), null);
  assert.equal(planPoint(260, 120, { ...rect, height: 0 }, view), null);
  const boxes = editableBoxes(parseMapDocument(source)),
    b = boxes.find((b) => b.collection === "buildings");
  assert.equal(pickBox(boxes, b.center[0], b.center[2]).id, b.id);
  assert.equal(pickBox(boxes, 10000, 10000), null);
  assert.equal(snapValue(0.74, 0.5), 0.5);
  assert.equal(snapValue(-0.76, 0.5), -1);
});

test("world builder edits drafts without changing live physics or stealing driving input", async (t) => {
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
  document.hasFocus = () => true;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  dom.window.HTMLElement.prototype.detachEvent = () => {};
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  let root;
  const originalFetch = globalThis.fetch;
  try {
    const load = (path) => server.ssrLoadModule("/src/" + path),
      { useBuilderStore: builder } = await load(
        "worldBuilder/state/builderStore.ts",
      ),
      actions = await load("worldBuilder/state/builderActions.ts");
    const { useUIStore: ui } = await load("store/menus/uiStore.ts"),
      { useWorldStore: world } = await load("store/world/worldStore.ts"),
      { useInputStore: input } = await load("store/input/inputStore.ts");
    const { canDrive, canNavigateMenu, routeMenuAction } = await load(
        "controls/inputRouting.ts",
      ),
      { CollisionBuilderPanel: WorldBuilderPanel } = await load(
        "worldBuilder/panels/CollisionBuilderPanel.tsx",
      ),
      { Keyboard } = await load("controls/Keyboard.ts");
    const doc = parseMapDocument(source),
      live = {
        ...source,
        chunks: [{ x: 0, z: 0, origin: [0, 0, 0] }],
        collider_chunks: [
          {
            x: 0,
            z: 0,
            boxes: editableBoxes(doc).map((b) => ({
              id: b.id,
              kind: b.kind,
              center: b.center,
              half_extents: b.half,
              visual: b.visual,
            })),
          },
        ],
      };
    world.getState().setMap(live);
    ui.setState({ screen: "sandbox", overlay: null, isModeLoading: false });
    root = createRoot(document.getElementById("root"));
    const render = async () =>
      act(async () =>
        root.render(h("div", null, h(Keyboard), h(WorldBuilderPanel))),
      );
    const by = (label) => document.querySelector(`[aria-label="${label}"]`),
      button = (text) =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent === text,
        ),
      click = async (node) => act(async () => node.click());
    await t.test(
      "opening and closing isolate controls, cancel stale loads, and guard analysis modes",
      async () => {
        let resolve;
        globalThis.fetch = () => new Promise((r) => (resolve = r));
        input
          .getState()
          .setAnalogFromSource("keyboard", { throttle: 0.7, steer: 0.5 });
        const pending = actions.openWorldBuilder();
        assert.equal(ui.getState().overlay, "world_builder");
        assert.equal(input.getState().input.throttle, 0);
        assert.equal(canDrive(), false);
        assert.equal(canNavigateMenu(), true);
        actions.closeWorldBuilder();
        resolve({ ok: true, text: async () => JSON.stringify(source) });
        await pending;
        assert.equal(builder.getState().doc, null);
        assert.equal(ui.getState().overlay, "pause");
        globalThis.fetch = async () => ({
          ok: true,
          text: async () => JSON.stringify(source),
        });
        await actions.openWorldBuilder();
        assert.equal(builder.getState().doc.map_id, source.map_id);
        assert.match(builder.getState().source, /matches/);
        ui.setState({ screen: "signal_recon", overlay: null });
        ui.getState().setOverlay("world_builder");
        assert.equal(ui.getState().overlay, null);
        await actions.openWorldBuilder();
        assert.equal(ui.getState().overlay, null);
        ui.setState({ screen: "sandbox", overlay: "world_builder" });
      },
    );
    await t.test(
      "numeric edits, add/delete, undo and save preserve source metadata and the live map",
      async () => {
        builder.getState().load(doc, "Test source");
        builder.getState().select(doc.buildings[0].id);
        await render();
        const before = editableBoxes(builder.getState().doc).find(
          (b) => b.id === builder.getState().selected,
        );
        await click(by("Increase position X"));
        let current = editableBoxes(builder.getState().doc).find(
          (b) => b.id === before.id,
        );
        assert.equal(current.center[0], before.center[0] + 0.5);
        assert.equal(world.getState().map, live);
        assert.deepEqual(
          builder.getState().doc.team_spawns,
          source.team_spawns,
        );
        await click(button("UNDO"));
        assert.equal(
          editableBoxes(builder.getState().doc).find((b) => b.id === before.id)
            .center[0],
          before.center[0],
        );
        await click(button("REDO"));
        assert.equal(
          editableBoxes(builder.getState().doc).find((b) => b.id === before.id)
            .center[0],
          before.center[0] + 0.5,
        );
        const field = by("Box height"),
          savedDoc = builder.getState().doc;
        await act(async () => {
          field.focus();
          field.value = "-20";
          field.blur();
        });
        assert.equal(builder.getState().doc, savedDoc);
        assert.equal(Number(field.value), before.half[1] * 2);
        assert.match(by("World builder").textContent, /positive/);
        await click(button("+ BUILDING BOX"));
        assert.equal(editableBoxes(builder.getState().doc).length, 36);
        await click(button("DELETE SELECTED"));
        assert.equal(editableBoxes(builder.getState().doc).length, 35);
        await click(button("UNDO"));
        assert.equal(editableBoxes(builder.getState().doc).length, 36);
        await click(button("SAVE"));
        const text = localStorage.getItem(
          `avenlab-world-builder-v1:${source.map_id}`,
        );
        assert.ok(text);
        assert.equal(JSON.parse(text).buildings.length, 35);
        assert.deepEqual(JSON.parse(text).visuals, source.visuals);
        await click(button("DELETE SELECTED"));
        await click(button("LOAD"));
        assert.equal(editableBoxes(builder.getState().doc).length, 36);
        assert.equal(world.getState().map, live);
      },
    );
    await t.test(
      "plan dragging commits once on release, cancel restores, and pointer moves never rewrite the document",
      async () => {
        await act(async () => {
          builder.getState().load(doc, "Test");
          builder.setState({ tool: "move" });
        });
        const svg = document.querySelector(".wb-plan"),
          bounds = planBounds(doc),
          rect = { left: 0, top: 0, width: 500, height: 500 };
        svg.getBoundingClientRect = () => rect;
        const b = editableBoxes(doc).find((v) => v.collection === "buildings"),
          ratio = Math.min(500 / bounds.width, 500 / bounds.depth),
          cx =
            (b.center[0] - bounds.x) * ratio + (500 - bounds.width * ratio) / 2,
          cy =
            (b.center[2] - bounds.z) * ratio + (500 - bounds.depth * ratio) / 2;
        const pointer = async (type, x, y, id = 1) =>
          act(async () => {
            const e = new Event(type, { bubbles: true, cancelable: true });
            Object.assign(e, {
              pointerId: id,
              button: 0,
              clientX: x,
              clientY: y,
            });
            svg.dispatchEvent(e);
          });
        let edits = 0;
        const stop = builder.subscribe((next, prior) => {
          if (next.doc !== prior.doc) edits++;
        });
        await pointer("pointerdown", cx, cy);
        for (let i = 1; i <= 20; i++)
          await pointer("pointermove", cx + i * 0.25 * ratio, cy);
        assert.equal(edits, 0);
        await pointer("pointerup", cx + 5 * ratio, cy);
        assert.equal(edits, 1);
        assert.equal(builder.getState().past.length, 1);
        assert.equal(
          editableBoxes(builder.getState().doc).find((v) => v.id === b.id)
            .center[0],
          snapValue(b.center[0] + 5, 0.5),
        );
        const stable = builder.getState().doc;
        await pointer("pointerdown", cx + 5 * ratio, cy);
        await pointer("pointermove", cx + 10 * ratio, cy);
        await pointer("pointercancel", cx + 10 * ratio, cy);
        assert.equal(builder.getState().doc, stable);
        stop();
      },
    );
    await t.test(
      "controller panel actions edit only the draft and the undo budget stays bounded",
      async () => {
        await act(async () => {
          builder.getState().load(doc, "Test");
          builder.getState().select(doc.buildings[0].id);
        });
        const id = builder.getState().selected,
          before = editableBoxes(builder.getState().doc).find(
            (b) => b.id === id,
          ).center[0],
          mask = input.getState().input.vehicleMask;
        await act(async () => by("Increase position X").focus());
        await act(async () => routeMenuAction("activate"));
        assert.equal(
          editableBoxes(builder.getState().doc).find((b) => b.id === id)
            .center[0],
          before + 0.5,
        );
        assert.equal(input.getState().input.vehicleMask, mask);
        assert.equal(input.getState().input.throttle, 0);
        await act(async () => routeMenuAction("next_tab"));
        assert.notEqual(builder.getState().selected, id);
        await act(async () => routeMenuAction("previous_tab"));
        assert.equal(builder.getState().selected, id);
        await act(async () => {
          for (let i = 0; i < 40; i++) {
            const b = editableBoxes(builder.getState().doc).find(
              (v) => v.id === id,
            );
            builder
              .getState()
              .edit([b.center[0] + 0.5, b.center[1], b.center[2]], b.half);
          }
        });
        assert.equal(builder.getState().past.length, 32);
        await act(async () => routeMenuAction("back"));
        assert.equal(ui.getState().overlay, "pause");
        assert.equal(world.getState().map, live);
      },
    );
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    globalThis.fetch = originalFetch;
    for (const [key, value] of old) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  }
});
