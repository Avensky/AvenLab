import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h, Fragment } from "react";

test("overlay recording, keyboard/controller shortcuts, countdown and labeled download use the real recorder", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const previous = new Map();
  let clock = 1000;
  const realPerformance = globalThis.performance;
  const testPerformance = new Proxy(realPerformance, {
    get(target, key) {
      if (key === "now") return () => clock;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage,
    performance: testPerformance,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
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
  dom.window.document.hasFocus = () => true;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const pad = {
    connected: true,
    index: 0,
    id: "capture-pad",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  dom.window.navigator.getGamepads = () => [pad];
  const { createRoot } = await import("react-dom/client");
  const downloads = [];
  dom.window.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ filename: this.download, href: this.href });
  };
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  let root;
  try {
    const load = (path) => server.ssrLoadModule(`/src/${path}`);
    const { useUIStore: ui } = await load("store/menus/uiStore.ts");
    const { useNetworkStore: network } = await load(
      "store/session/networkStore.ts",
    );
    const { useInputStore: inputs } = await load("store/input/inputStore.ts");
    const { useWorldStore: world } = await load("store/world/worldStore.ts");
    const { useRenderSettingsStore: rendering } = await load(
      "store/presentation/renderSettingsStore.ts",
    );
    const { useCaptureSettingsStore: captureSettings } = await load(
      "performance/captureSettingsStore.ts",
    );
    const { usePerformanceOverlayStore: panel } = await load(
      "performance/performanceOverlayStore.ts",
    );
    const { performanceRecorder: recorder } = await load(
      "performance/measurements.ts",
    );
    const { experimentContext } = await load("performance/context.ts");
    const { loadCaptureArchive } = await load("performance/captureArchive.ts");
    const { PerformanceOverlay } = await load(
      "performance/PerformanceOverlay.tsx",
    );
    const { DebugMenu } = await load("components/debugger/DebugMenu.tsx");
    const { Keyboard } = await load("controls/Keyboard.ts");
    const { GameController } = await load("controls/GameController.ts");
    const map = {
      map_id: "test-city",
      cell: [200, 400],
      chunks: [{ x: 1, z: 0, origin: [200, 0, 0] }],
      collider_chunks: [],
      visuals: [
        {
          id: "blocks",
          asset: "/models/chuncks/chunck_0,0_2x2_blocks_centered.glb",
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      ],
    };
    let tick = 0;
    const snapshot = () =>
      network
        .getState()
        .setSnapshot(
          {
            tick: ++tick,
            entities: [
              {
                id: "me",
                vehicle_id: "brz",
                position: [220, 1.25, -60],
                rotation: [0, 0, 0, 1],
                speed: 0,
              },
            ],
          },
          clock,
        );
    ui.setState({ screen: "sandbox", overlay: null, isModeLoading: false });
    network.getState().setConnected(true);
    network.getState().setPlayerId("me");
    snapshot();
    world.getState().setMap(map);
    rendering.getState().update({ overlay: true });
    captureSettings
      .getState()
      .update({ label: "City original full map", seconds: 5 });
    root = createRoot(document.getElementById("root"));
    await act(async () => {
      root.render(
        h(
          Fragment,
          null,
          h(PerformanceOverlay),
          h(Keyboard),
          h(GameController),
        ),
      );
    });
    const wait = async (ms = 280) =>
      act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
    const click = async (label) =>
      act(async () => {
        const element = [...document.querySelectorAll("button")].find(
          (e) => e.textContent === label,
        );
        assert.ok(element, label);
        element.click();
      });
    const control = async (label) =>
      act(async () => {
        const element = document.querySelector(`[aria-label="${label}"]`);
        assert.ok(element, label);
        element.click();
      });
    const pressPad = async (index) => {
      await act(async () => {
        pad.buttons[index] = { pressed: true, value: 1 };
        await new Promise((resolve) => setTimeout(resolve, 70));
      });
      await act(async () => {
        pad.buttons[index] = { pressed: false, value: 0 };
        await new Promise((resolve) => setTimeout(resolve, 70));
      });
    };
    const key = async (repeat = false, target = document.body) =>
      act(async () =>
        target.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            code: "F8",
            key: "F8",
            repeat,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
    const button = async (pressed) => {
      await act(async () => {
        pad.buttons[0] = { pressed, value: pressed ? 1 : 0 };
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
    };
    await wait(60);

    await t.test(
      "click starts a labeled capture and shows authoritative world/local coordinates",
      async () => {
        assert.equal(
          document.querySelector('[role="tabpanel"]'),
          null,
          "starts with the compact recorder",
        );
        await control("Open diagnostics");
        await wait();
        assert.ok(
          document.body.textContent.includes("X 220.000 · Y 1.250 · Z -60.000"),
        );
        assert.ok(
          document.body.textContent.includes("LOCAL X 20.000 / Z -60.000"),
        );
        await control("Start recording");
        assert.equal(recorder.capturing, true);
        recorder.tick(experimentContext(), clock);
        clock += 1500;
        snapshot();
        await wait();
        assert.match(
          document.querySelector('[aria-label="Capture countdown"]')
            .textContent,
          /STARTS IN 1.5 s/,
        );
        assert.ok(
          document
            .querySelector('[aria-label="Capture countdown"]')
            .className.includes("text-red-400"),
        );
        clock += 1500;
        snapshot();
        recorder.tick(experimentContext(), clock);
        for (let i = 0; i < 300; i++) {
          clock = 4000 + (i * 5000) / 300;
          snapshot();
          recorder.record("frameMs", 16.667, clock);
          recorder.packet("snapshot", 1024, 0.1, clock);
          if (i % 6 === 0) recorder.tick(experimentContext(), clock);
        }
        await wait();
        assert.match(
          document.querySelector('[aria-label="Capture countdown"]')
            .textContent,
          /RECORDING/,
        );
        clock = 9000;
        snapshot();
        recorder.tick(experimentContext(), clock);
        await wait();
        assert.equal(recorder.runs.length, 1);
        assert.equal(recorder.runs[0].label, "City original full map");
        assert.equal(
          loadCaptureArchive(localStorage).runs[0].label,
          "City original full map",
        );
      },
    );

    await t.test(
      "JSON download carries the label, frame samples, route and active centered asset URL",
      async () => {
        await control("Export captures");
        await click("EXPORT JSON");
        assert.equal(downloads.length, 1);
        assert.match(
          downloads[0].filename,
          /^avenlab-performance-city-original-full-map-.*\.json$/,
        );
        const payload = await (await fetch(downloads[0].href)).json();
        assert.equal(payload.runs[0].frameSamplesMs.length, 300);
        assert.ok(payload.runs[0].timeline.length > 20);
        assert.deepEqual(
          payload.runs[0].startLocation.position,
          [220, 1.25, -60],
        );
        assert.match(
          payload.runs[0].settings.visuals[0].asset,
          /blocks_centered\.glb$/,
        );
        assert.equal(payload.runs[0].settings.cityViewDistance, "auto");
        assert.equal(payload.runs[0].settings.cityViewDistanceMeters, 500);
        URL.revokeObjectURL(downloads[0].href);
      },
    );
    await t.test(
      "view-distance changes are included in capture metadata and invalidate a recording context",
      async () => {
        const before = experimentContext();
        await act(async () =>
          rendering.getState().update({ cityViewDistance: 1000 }),
        );
        const after = experimentContext();
        assert.equal(after.settings.cityViewDistance, 1000);
        assert.equal(after.settings.cityViewDistanceMeters, 1000);
        assert.notEqual(after.key, before.key);
        await act(async () =>
          rendering.getState().update({ cityViewDistance: "auto" }),
        );
      },
    );

    await t.test(
      "F8 starts/cancels once per press, and typing in the label cannot trigger capture",
      async () => {
        await key();
        assert.equal(recorder.capturing, true);
        await key(true);
        assert.equal(recorder.capturing, true);
        await key();
        assert.equal(recorder.capturing, false);
        const input = document.querySelector('[aria-label="Capture label"]');
        await act(async () => input.focus());
        await key(false, input);
        assert.equal(recorder.capturing, false);
        await act(async () => input.blur());
      },
    );

    await t.test(
      "A/Cross records only on a rising edge while driving with the overlay visible",
      async () => {
        await button(true);
        assert.equal(recorder.capturing, true);
        await wait(80);
        assert.equal(recorder.capturing, true, "holding A must not cancel");
        await button(false);
        await button(true);
        assert.equal(recorder.capturing, false);
        await button(false);
        await act(async () => rendering.getState().update({ overlay: false }));
        await button(true);
        assert.equal(recorder.capturing, false);
        await button(false);
        await act(async () => {
          rendering.getState().update({ overlay: true });
          ui.setState({ overlay: "debug_menu" });
        });
        await button(true);
        assert.equal(recorder.capturing, false);
        await button(false);
      },
    );
    await t.test(
      "Copy Spawn and F3/Close remain usable alongside F8 recording",
      async () => {
        await act(async () => {
          ui.setState({ overlay: null });
          rendering.getState().update({ overlay: true });
        });
        let copied = "";
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (value) => {
              copied = value;
            },
          },
        });
        await control("Open diagnostics");
        await wait();
        await click("COPY SPAWN");
        assert.deepEqual(JSON.parse(copied), {
          chunk: [1, 0],
          local: [20, -60],
          yaw: 0,
        });
        const press = async (code) =>
          act(async () =>
            document.body.dispatchEvent(
              new dom.window.KeyboardEvent("keydown", {
                code,
                key: code,
                bubbles: true,
                cancelable: true,
              }),
            ),
          );
        await press("F3");
        assert.equal(rendering.getState().overlay, false);
        await press("F8");
        assert.equal(recorder.capturing, true);
        assert.equal(rendering.getState().overlay, true);
        await press("F8");
        assert.equal(recorder.capturing, false);
        await act(async () =>
          document
            .querySelector('[aria-label="Close performance overlay"]')
            .click(),
        );
        assert.equal(rendering.getState().overlay, false);
        await press("F3");
        assert.equal(rendering.getState().overlay, true);
      },
    );
    await t.test(
      "the default debug tab opens the overlay without recording, by mouse or controller",
      async () => {
        const captures = recorder.runs.length;
        function DebugHarness() {
          const menu = ui((s) => s.overlay);
          return h(
            Fragment,
            null,
            menu === "debug_menu" && h(DebugMenu),
            h(PerformanceOverlay),
            h(Keyboard),
            h(GameController),
          );
        }
        await act(async () => {
          rendering.getState().update({ overlay: false });
          ui.setState({ overlay: "debug_menu" });
          root.render(h(DebugHarness));
        });
        await button(false);
        const row = () =>
          document.querySelector('[data-menu-row="performance-overlay"]');
        assert.match(row().textContent, /Open performance overlay/);
        await act(async () => row().click());
        assert.equal(rendering.getState().overlay, true);
        assert.equal(ui.getState().overlay, null);
        assert.equal(recorder.capturing, false);
        assert.ok(document.querySelector('[aria-label="Performance overlay"]'));
        await act(async () => {
          rendering.getState().update({ overlay: false });
          ui.setState({ overlay: "debug_menu" });
        });
        await button(true);
        assert.equal(rendering.getState().overlay, true);
        assert.equal(ui.getState().overlay, null);
        await wait(80);
        assert.equal(
          recorder.capturing,
          false,
          "holding menu A must not start a capture after resuming",
        );
        await button(false);
        assert.equal(recorder.runs.length, captures);
      },
    );
    await t.test(
      "compact mode skips invisible metric summaries and expanded mode restores live details",
      async () => {
        await act(async () => panel.getState().minimize());
        const live = recorder.live.bind(recorder);
        let reads = 0;
        recorder.live = (...args) => {
          reads++;
          return live(...args);
        };
        try {
          await wait(550);
          assert.equal(reads, 0);
          assert.equal(document.querySelector('[role="tabpanel"]'), null);
          await control("Open diagnostics");
          await wait(300);
          assert.ok(reads > 0);
          assert.match(document.body.textContent, /PLAYER POSITION/);
          await control("Minimize diagnostics");
          assert.equal(document.querySelector('[role="tabpanel"]'), null);
        } finally {
          recorder.live = live;
        }
      },
    );
    await t.test(
      "View/Select owns recorder navigation, neutral-gates held sticks, and B returns to driving without handbrake",
      async () => {
        const playerMask = inputs.getState().input.playerMask;
        pad.axes[0] = 0.8;
        await pressPad(8);
        assert.equal(panel.getState().focused, true);
        assert.equal(panel.getState().expanded, true);
        await wait(300);
        assert.equal(panel.getState().tab, "position");
        assert.equal(
          inputs.getState().input.playerMask,
          playerMask,
          "View must not toggle CAN dump",
        );
        pad.axes[0] = 0;
        await wait(60);
        await pressPad(5);
        assert.equal(panel.getState().tab, "network");
        await pressPad(5);
        assert.equal(panel.getState().tab, "assets");
        assert.match(document.body.textContent, /500 M/);
        await pressPad(4);
        assert.equal(panel.getState().tab, "network");
        await act(async () => {
          pad.buttons[1] = { pressed: true, value: 1 };
          await new Promise((resolve) => setTimeout(resolve, 80));
        });
        assert.equal(panel.getState().expanded, false);
        assert.equal(
          (await load("store/input/inputStore.ts")).useInputStore.getState()
            .input.handbrake,
          0,
        );
        await act(async () => {
          pad.buttons[1] = { pressed: false, value: 0 };
          await new Promise((resolve) => setTimeout(resolve, 60));
        });
      },
    );
    await t.test(
      "a fresh controller A starts once from the inspector and restores compact driving controls",
      async () => {
        await pressPad(8);
        assert.equal(panel.getState().focused, true);
        await button(true);
        assert.equal(recorder.capturing, true);
        assert.equal(panel.getState().focused, false);
        assert.equal(panel.getState().expanded, false);
        await wait(300);
        assert.equal(
          recorder.capturing,
          true,
          "holding A cannot immediately stop",
        );
        await button(false);
        await button(true);
        assert.equal(
          recorder.capturing,
          false,
          "a second press stops the warm-up",
        );
        await button(false);
      },
    );
    await t.test(
      "controller Export opens a format picker without exporting until a fresh confirmation",
      async () => {
        const count = downloads.length;
        await pressPad(8);
        await pressPad(13);
        assert.equal(
          document.activeElement.dataset.performanceControl,
          "export",
        );
        await pressPad(0);
        assert.equal(
          document.activeElement.dataset.performanceControl,
          "export-csv",
        );
        assert.equal(downloads.length, count);
        await pressPad(0);
        assert.equal(downloads.length, count + 1);
        assert.match(downloads.at(-1).filename, /\.csv$/);
        await pressPad(1);
        assert.equal(panel.getState().focused, false);
      },
    );
    await t.test(
      "blank names describe the actual configuration and focus is released on pause or close",
      async () => {
        await act(async () => {
          captureSettings.getState().update({ label: "" });
          ui.setState({ overlay: null });
          rendering.getState().update({ shadows: false });
        });
        await key();
        assert.match(
          recorder.progress().label,
          /BRZ \/ FAST \/ 500M \/ SHADOWS OFF/,
        );
        await key();
        await pressPad(8);
        assert.equal(panel.getState().focused, true);
        await act(async () => ui.setState({ overlay: "pause" }));
        assert.equal(panel.getState().focused, false);
        await act(async () => ui.setState({ overlay: null }));
        await pressPad(8);
        assert.equal(panel.getState().focused, true);
        await act(async () => rendering.getState().update({ overlay: false }));
        assert.equal(panel.getState().focused, false);
      },
    );
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
