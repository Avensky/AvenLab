import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h, Profiler } from "react";
import { createRoot } from "react-dom/client";
import {
  emptyLayout,
  parseLayout,
} from "../src/worldBuilder/document/layoutDocument.ts";
import {
  sourceSpawns,
  exportedSpawns,
  updateSpawn,
} from "../src/worldBuilder/document/spawnDocument.ts";
import { mapExport } from "../src/worldBuilder/document/mapDocument.ts";
const source = JSON.parse(
  readFileSync(
    new URL(
      "../../avenlab-server/src/assets/blocks/road_jump_lab_colliders.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("saved spawns preserve team, world location, surface elevation and degree/radian heading", () => {
  const spawns = sourceSpawns(source),
    point = spawns[0];
  assert.ok(
    spawns.some((p) => p.team === "red") &&
      spawns.some((p) => p.team === "blue"),
  );
  let layout = updateSpawn(
    { ...emptyLayout(source.map_id), spawns },
    point.id,
    { position: [17, 12.5, -23], yaw: 90 },
  );
  const roundtrip = parseLayout(JSON.parse(JSON.stringify(layout))),
    map = JSON.parse(mapExport({ ...source, authored_layout: roundtrip }));
  assert.deepEqual(map.team_spawns.red[0].local, [17, -23]);
  assert.equal(map.team_spawns.red[0].surface_y, 12.5);
  assert.ok(Math.abs(map.team_spawns.red[0].yaw - Math.PI / 2) < 1e-10);
  assert.equal(roundtrip.spawns[0].yaw, 90);
  assert.throws(
    () => parseLayout({ ...layout, spawns: [...spawns, spawns[0]] }),
    /spawn/,
  );
  assert.throws(
    () => updateSpawn(layout, point.id, { position: [NaN, 0, 0] }),
    /spawn/,
  );
  assert.throws(
    () =>
      exportedSpawns({
        ...layout,
        spawns: spawns.filter((p) => p.team === "red"),
      }),
    /Red and one Blue/,
  );
});

test("organized feature APIs, pause braking, shared themes and bounded display updates", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
      url: "http://localhost/",
      pretendToBeVisual: true,
    }),
    previous = new Map();
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  let timer = 0;
  dom.window.setInterval = () => ++timer;
  dom.window.clearInterval = () => {};
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  const load = (path) => server.ssrLoadModule(`/src/${path}`);
  let root;
  try {
    const { useUIStore: ui } = await load("store/menus/index.ts"),
      { useInputStore: input } = await load("store/input/index.ts");
    const { usePreferencesStore: prefs, sanitizePreferences } = await load(
      "store/preferences/index.ts",
    );
    const { UI_THEMES, applyUITheme } = await load("theme/catalog.ts");
    const { useVehicleTelemetryStore: telemetry } = await load(
      "store/telemetry/vehicleTelemetryStore.ts",
    );
    await t.test(
      "pause holds the brake through device releases and child menus, then resumes neutral",
      () => {
        ui.setState({ screen: "sandbox", overlay: null, isModeLoading: false });
        input.getState().setAnalogFromSource("keyboard", { throttle: 1 });
        ui.getState().openPause();
        assert.equal(input.getState().input.brake, 1);
        assert.equal(input.getState().input.throttle, 0);
        input.getState().releaseInputSource("keyboard");
        input.getState().releaseInputSource("gamepad");
        input.getState().releaseControls();
        assert.equal(input.getState().input.brake, 1);
        ui.getState().openSettings();
        assert.equal(input.getState().input.brake, 1);
        ui.getState().backToParentMenu();
        assert.equal(input.getState().input.brake, 1);
        ui.getState().closeOverlay();
        assert.equal(input.getState().input.brake, 0);
        assert.equal(input.getState().input.throttle, 0);
        ui.setState({ screen: "main" });
        ui.getState().setOverlay("settings");
        assert.equal(input.getState().input.brake, 0);
      },
    );
    await t.test(
      "seven base palettes hydrate safely and share root tokens",
      () => {
        assert.equal(Object.keys(UI_THEMES).length, 7);
        for (const theme of Object.keys(UI_THEMES)) {
          prefs.getState().update({ theme });
          assert.equal(prefs.getState().theme, theme);
          applyUITheme(theme);
          assert.equal(document.documentElement.dataset.uiTheme, theme);
          assert.equal(
            document.documentElement.style.getPropertyValue("--app-panel"),
            UI_THEMES[theme].panel,
          );
        }
        assert.equal(sanitizePreferences({ theme: "__proto__" }).theme, "navy");
        prefs.getState().update({ theme: "navy" });
        applyUITheme("navy");
      },
    );
    await t.test(
      "map movement publishes at 10 Hz from the existing 20 Hz sampler",
      async () => {
        const { useMapTelemetryStore: map, sampleMapTelemetry } = await load(
          "store/telemetry/mapTelemetry.ts",
        );
        let publishes = 0;
        const stop = map.subscribe(() => publishes++);
        for (let i = 0; i < 20; i++)
          sampleMapTelemetry(
            { positionX: i, positionZ: 0, yawDeg: i },
            100000 + i * 50,
          );
        stop();
        assert.equal(publishes, 10);
      },
    );
    await t.test("radio shell skips moving-vehicle speed renders", async () => {
      const { CockpitPanel } = await load("ui/Cockpit/CockpitPanel.tsx");
      ui.setState({
        screen: "sandbox",
        overlay: "cockpit",
        cockpitTab: "radio",
      });
      root = createRoot(document.getElementById("root"));
      let commits = 0;
      await act(async () =>
        root.render(
          h(
            Profiler,
            { id: "cockpit", onRender: () => commits++ },
            h(CockpitPanel),
          ),
        ),
      );
      const data = {
        ...telemetry.getState().data,
        signal: "live",
        config: { ...telemetry.getState().data.config, cockpitVersion: 5 },
      };
      await act(async () => telemetry.setState({ data }));
      commits = 0;
      for (let i = 0; i < 40; i++)
        await act(async () =>
          telemetry.setState({ data: { ...data, speedKph: i + 1 } }),
        );
      assert.equal(commits, 0);
      assert.ok(document.querySelector('[aria-label="Interface theme"]'));
      assert.equal(
        document.querySelector('[data-controller-key="B"]').textContent,
        "B",
      );
      await act(async () => root.unmount());
      root = null;
    });
    await t.test(
      "spawn edits use the document undo history and browser save",
      async () => {
        const { useLayoutStore: layout } = await load(
          "worldBuilder/state/layoutStore.ts",
        );
        layout.setState({ doc: null });
        layout
          .getState()
          .initialize(
            source.map_id,
            emptyLayout(source.map_id),
            sourceSpawns(source),
          );
        const id = layout.getState().doc.spawns[0].id;
        layout.getState().selectSpawn(id);
        layout.getState().updateSpawn({ yaw: 135 });
        assert.equal(layout.getState().doc.spawns[0].yaw, 135);
        layout.getState().undo();
        assert.notEqual(layout.getState().doc.spawns[0].yaw, 135);
        layout.getState().redo();
        assert.equal(layout.getState().doc.spawns[0].yaw, 135);
        assert.equal(layout.getState().save(), true);
      },
    );
    await t.test(
      "CAN live retention is bounded while explicit playback imports remain lossless",
      async () => {
        const {
          useCanDataStore: can,
          LIVE_FRAME_LIMIT,
          CAN_LOG_LIMIT,
        } = await load("store/recon/index.ts");
        const frame = (i) => [
          String(i),
          "signal",
          i,
          "value",
          i,
          i / 1000,
          [1, 2, 3],
          3,
        ];
        const imported = Array.from({ length: LIVE_FRAME_LIMIT + 7 }, (_, i) =>
          frame(i),
        );
        can.getState().setFrames(imported);
        assert.equal(can.getState().frames, imported);
        assert.equal(can.getState().liveFrameDrops, 0);
        can.getState().clearFrames();
        can.getState().addFrames(imported);
        assert.equal(can.getState().frames.length, LIVE_FRAME_LIMIT);
        assert.equal(can.getState().frames[0][0], "7");
        assert.equal(can.getState().liveFrameDrops, 7);
        for (let i = 0; i < CAN_LOG_LIMIT + 3; i++)
          can.getState().addLog(String(i));
        assert.equal(can.getState().logs.length, CAN_LOG_LIMIT);
        assert.equal(can.getState().logs[0], "3");
      },
    );
    await t.test(
      "terminal markers use the active research owner and cannot mark imported playback",
      async () => {
        const { useCanDataStore: can, useSignalReconStore: recon } = await load(
            "store/recon/index.ts",
          ),
          { CommandLine } = await load("ui/command/CommandLine.tsx");
        const { PlayerFlags } = await load(
          "store/input/protocol/inputMasks.ts",
        );
        const previous = recon.getState().postMarker;
        let posted = 0;
        recon.setState({
          activeSessionId: "active",
          postMarker: async () => {
            posted++;
          },
        });
        can.setState({ commandOpen: true, currentSessionId: "imported" });
        input.getState().setPlayerFlag(PlayerFlags.CANDUMP, true);
        root = createRoot(document.getElementById("root"));
        await act(async () => root.render(h(CommandLine)));
        const mark = () =>
          [...document.querySelectorAll("button")].find(
            (button) => button.textContent === "MARK",
          );
        assert.equal(mark().disabled, true);
        await act(async () => can.setState({ currentSessionId: "active" }));
        assert.equal(mark().disabled, false);
        await act(async () => mark().click());
        assert.equal(posted, 1);
        await act(async () => root.unmount());
        root = null;
        can.setState({ commandOpen: false });
        recon.setState({ postMarker: previous, activeSessionId: null });
      },
    );
    await t.test(
      "mission bulletins are event-driven, deduplicated and bounded",
      async () => {
        const { useMissionRadioStore: mission } = await load(
          "store/missions/index.ts",
        );
        for (let i = 0; i < 30; i++)
          mission.getState().publish({
            id: String(i),
            title: "Delivery",
            message: "Cargo delivered",
            kind: "complete",
          });
        assert.equal(mission.getState().history.length, 12);
        mission.getState().publish({ ...mission.getState().current });
        assert.equal(mission.getState().history.length, 12);
      },
    );
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  }
});
