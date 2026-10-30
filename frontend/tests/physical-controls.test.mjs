import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h, useRef } from "react";
import { createRoot } from "react-dom/client";
import { SpotLight } from "three";
import { createStarterRelayAudio } from "../src/ui/Cockpit/starterRelayAudio.ts";
import { applyHeadlightBeam } from "../src/vehicles/tools/headlightBeam.ts";

test("relay clicks share one scheduler and stop all voices on confirmed release", () => {
  const timers = new Map(),
    voices = [];
  let next = 0,
    closed = false;
  const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const context = {
    state: "running",
    currentTime: 4,
    destination: {},
    createOscillator() {
      const voice = {
        frequency: parameter,
        stops: 0,
        connect(node) {
          return node;
        },
        start() {},
        stop() {
          this.stops++;
        },
        disconnect() {},
      };
      voices.push(voice);
      return voice;
    },
    createGain() {
      return {
        gain: parameter,
        connect() {
          return this;
        },
        disconnect() {},
      };
    },
    close() {
      closed = true;
      return Promise.resolve();
    },
  };
  const audio = createStarterRelayAudio(
    () => context,
    (callback) => {
      timers.set(++next, callback);
      return next;
    },
    (id) => timers.delete(id),
  );
  const a = Symbol(),
    b = Symbol();
  audio.unlock();
  assert.equal(timers.size, 0, "unlocking alone cannot invent cranking");
  audio.setCranking(a, true);
  audio.setCranking(b, true);
  assert.equal(timers.size, 1);
  assert.equal(voices.length, 1);
  [...timers.values()][0]();
  assert.equal(voices.length, 2);
  audio.setCranking(a, false);
  assert.equal(timers.size, 1);
  audio.setCranking(b, false);
  assert.equal(timers.size, 0);
  assert.ok(voices.every((v) => v.stops >= 2));
  audio.dispose();
  assert.equal(closed, true);
});

test("existing lamps raise and brighten for high beams, then restore exact low-beam settings", () => {
  const lamp = new SpotLight(0xffffff, 5, 40);
  lamp.position.y = 0.7;
  lamp.target.position.y = -0.6;
  applyHeadlightBeam(lamp, true, true);
  assert.equal(lamp.visible, true);
  assert.equal(lamp.intensity, 9);
  assert.equal(lamp.distance, 60);
  assert.ok(lamp.target.position.y > 0.7);
  applyHeadlightBeam(lamp, true, true); // repeated frames cannot compound brightness
  assert.equal(lamp.intensity, 9);
  applyHeadlightBeam(lamp, true, false);
  assert.equal(lamp.intensity, 5);
  assert.equal(lamp.distance, 40);
  assert.equal(lamp.target.position.y, -0.6);
  applyHeadlightBeam(lamp, false, false);
  assert.equal(lamp.visible, false);
});

test("physical switches release contact independently of their confirmed system state", async (t) => {
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
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  let root;
  try {
    const load = (path) => server.ssrLoadModule("/src/" + path);
    const { useInputStore: input } = await load("store/input/inputStore.ts"),
      { useVehicleTelemetryStore: telemetry } = await load(
        "store/telemetry/vehicleTelemetryStore.ts",
      ),
      { useUIStore: ui } = await load("store/menus/uiStore.ts"),
      { useNetworkStore: network } = await load(
        "store/session/networkStore.ts",
      ),
      { HEADLIGHT_FLASH: FLASH, reviseCabin } = await load(
        "store/input/protocol/cabinMasks.ts",
      );
    ui.setState({ screen: "sandbox", overlay: null, isModeLoading: false });
    network.setState({ connected: true });
    const live = (patch = {}) =>
      telemetry.setState({
        data: {
          ...telemetry.getState().data,
          signal: "live",
          speedKph: 0,
          tcsEnabled: true,
          absEnabled: true,
          cockpitMask: 192,
          cabinMask: 4 | 4096 | (2 << 10),
          config: { ...telemetry.getState().data.config, cockpitVersion: 6 },
          ...patch,
        },
      });
    live();
    root = createRoot(document.getElementById("root"));
    const render = async (Component) => {
      await act(async () => root.render(null));
      await act(async () => root.render(h(Component)));
    };
    const by = (label) => document.querySelector(`[aria-label="${label}"]`);
    const pointer = async (label, type, id = 4) =>
      act(async () => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, {
          pointerId: id,
          button: 0,
          clientX: 0,
          clientY: 0,
        });
        by(label).dispatchEvent(event);
      });
    const key = async (label, type, value, repeat = false) =>
      act(async () =>
        by(label).dispatchEvent(
          new dom.window.KeyboardEvent(type, {
            key: value,
            code: value === " " ? "Space" : value,
            bubbles: true,
            cancelable: true,
            repeat,
          }),
        ),
      );
    await t.test(
      "TCS contact clears on release, pointer cancellation, keyup and blur while enabled state remains accessible",
      async () => {
        const { DriveAssists } = await load("ui/Cockpit/DriveAssists.tsx");
        await render(DriveAssists);
        const label = "Toggle TCS";
        await act(async () => by(label).focus());
        await pointer(label, "pointerdown");
        assert.notEqual(document.activeElement, by(label));
        assert.equal(by(label).dataset.hudHeld, "true");
        await pointer(label, "pointerup");
        assert.equal(by(label).hasAttribute("data-hud-held"), false);
        assert.equal(by(label).getAttribute("aria-pressed"), "true");
        await pointer(label, "pointerdown");
        await pointer(label, "pointercancel");
        assert.equal(by(label).hasAttribute("data-hud-held"), false);
        await act(async () => by(label).focus());
        await key(label, "keydown", " ");
        assert.equal(by(label).dataset.hudHeld, "true");
        await key(label, "keyup", " ");
        assert.equal(by(label).hasAttribute("data-hud-held"), false);
        await pointer(label, "pointerdown");
        await act(async () => window.dispatchEvent(new Event("blur")));
        assert.equal(by(label).hasAttribute("data-hud-held"), false);
      },
    );
    await t.test(
      "a held light cap flashes without a separate label or a rotary change on release",
      async () => {
        const { ColumnStalks } = await load("ui/Cockpit/ColumnStalks.tsx");
        await render(ColumnStalks);
        const label = "Lights and turn signal stalk";
        assert.equal(by("Hold to flash high beams"), null);
        assert.equal(document.querySelector('[data-hud-held="true"]'), null);
        await act(async () =>
          input.getState().setInput({ cabin_mask: undefined }),
        );
        const later = window.setTimeout,
          clear = window.clearTimeout,
          timers = new Map();
        let next = 0;
        window.setTimeout = (fn, ms) => {
          timers.set(++next, { fn, ms });
          return next;
        };
        window.clearTimeout = (id) => timers.delete(id);
        const hold = async () =>
          act(async () => {
            const entry = [...timers].find(([, v]) => v.ms === 220);
            assert.ok(entry);
            timers.delete(entry[0]);
            entry[1].fn();
          });
        try {
          const rotary = input.getState().input.cockpit_mask;
          await pointer(label, "pointerdown");
          assert.equal((input.getState().input.cabin_mask ?? 0) & FLASH, 0);
          await hold();
          assert.ok(input.getState().input.cabin_mask & FLASH);
          assert.equal(input.getState().input.cabin_mask & 8192, 0);
          await act(async () => input.getState().setCabin({ fan: 3 }));
          assert.ok(input.getState().input.cabin_mask & FLASH);
          await act(async () =>
            input.getState().setHeadlightFlash("keyboard", true),
          );
          await pointer(label, "pointerup");
          assert.equal(
            input.getState().input.cockpit_mask,
            rotary,
            "hold release cannot also rotate lights",
          );
          assert.ok(input.getState().input.cabin_mask & FLASH);
          await act(async () =>
            input.getState().releaseInputSource("keyboard"),
          );
          assert.equal(input.getState().input.cabin_mask & FLASH, 0);
          await pointer(label, "pointerdown");
          await hold();
          await pointer(label, "pointercancel");
          assert.equal(input.getState().input.cabin_mask & FLASH, 0);
          await key(label, "keydown", " ");
          await hold();
          assert.ok(input.getState().input.cabin_mask & FLASH);
          await key(label, "keyup", " ");
          assert.equal(input.getState().input.cabin_mask & FLASH, 0);
          await pointer(label, "pointerdown");
          await hold();
          await act(async () => ui.setState({ overlay: "pause" }));
          assert.equal(input.getState().input.cabin_mask & FLASH, 0);
          await act(async () => ui.setState({ overlay: null }));
          await pointer(label, "pointerdown");
          await hold();
          await act(async () => root.render(null));
          assert.equal(input.getState().input.cabin_mask & FLASH, 0);
          assert.ok(reviseCabin(FLASH | 4 | 8192, { fan: 1 }) & FLASH);
          for (const ignition of [0, 1, 2]) {
            const pending = 4 | 4096 | 8192 | (ignition << 10) | FLASH;
            await act(async () => {
              input.getState().setInput({ cabin_mask: pending });
              input.getState().releaseControls();
            });
            assert.equal(input.getState().input.cabin_mask, pending & ~FLASH);
          }
          await render(ColumnStalks);
          await pointer(label, "pointerdown");
          await hold();
          await act(async () =>
            live({
              config: {
                ...telemetry.getState().data.config,
                cockpitVersion: 5,
              },
            }),
          );
          assert.equal(
            input.getState().input.cabin_mask & FLASH,
            0,
            "a capability downgrade releases the original hold owner",
          );
          await pointer(label, "pointerdown");
          assert.equal(
            [...timers.values()].some((v) => v.ms === 220),
            false,
          );
          await pointer(label, "pointerup");
        } finally {
          window.setTimeout = later;
          window.clearTimeout = clear;
        }
      },
    );
    await t.test(
      "controller A holds physical switches until release and disconnect cancels a held START",
      async () => {
        const { GameController } = await load("controls/GameController.ts"),
          { usePhysicalMenuPress } = await load(
            "controls/physicalMenuPress.ts",
          ),
          { IgnitionSwitch } = await load("ui/Cockpit/IgnitionSwitch.tsx"),
          { DriveAssists } = await load("ui/Cockpit/DriveAssists.tsx");
        const raf = globalThis.requestAnimationFrame,
          cancel = globalThis.cancelAnimationFrame,
          timeout = window.setTimeout,
          clear = window.clearTimeout,
          focus = document.hasFocus,
          getPads = navigator.getGamepads;
        let next = 0,
          connected = true;
        const frames = new Map(),
          timers = new Map(),
          pad = {
            index: 0,
            id: "physical-test-pad",
            connected: true,
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 18 }, () => ({
              pressed: false,
              value: 0,
            })),
          };
        globalThis.requestAnimationFrame = (fn) => {
          frames.set(++next, fn);
          return next;
        };
        globalThis.cancelAnimationFrame = (id) => frames.delete(id);
        window.setTimeout = (fn, ms) => {
          timers.set(++next, { fn, ms });
          return next;
        };
        window.clearTimeout = (id) => timers.delete(id);
        document.hasFocus = () => true;
        navigator.getGamepads = () => (connected ? [pad] : []);
        const frame = async () =>
          act(async () => {
            const [id, fn] = frames.entries().next().value;
            frames.delete(id);
            fn();
          });
        const a = async (pressed) => {
          pad.buttons[0] = { pressed, value: Number(pressed) };
          await frame();
        };
        const advance = async (ms) =>
          act(async () => {
            const [id, timer] = [...timers].find(
              ([, timer]) => timer.ms === ms,
            );
            timers.delete(id);
            timer.fn();
          });
        function Rig() {
          const ref = useRef(null);
          usePhysicalMenuPress(ref);
          return h(
            "section",
            { ref },
            h(GameController),
            h(IgnitionSwitch),
            h(DriveAssists),
          );
        }
        try {
          await act(async () => {
            live({ engineOn: false, resourceMask: 0, cabinMask: 4 | 4096 });
            input.getState().setInput({ cabin_mask: undefined });
            ui.setState({ overlay: "cockpit" });
          });
          await render(Rig);
          await frame();
          await act(async () => by("Toggle ABS").focus());
          const before = input.getState().input.vehicleMask;
          await a(true);
          assert.equal(by("Toggle ABS").dataset.hudHeld, "true");
          assert.equal(input.getState().input.vehicleMask, before);
          await frame();
          assert.equal(
            by("Toggle ABS").dataset.hudHeld,
            "true",
            "the next pad poll cannot release the physical hold",
          );
          await a(false);
          assert.equal(input.getState().input.vehicleMask, before ^ 32);
          assert.equal(by("Toggle ABS").hasAttribute("data-hud-held"), false);
          await act(async () => by("Ignition key").focus());
          await a(true);
          await advance(250);
          await advance(300);
          await advance(300);
          assert.equal((input.getState().input.cabin_mask >>> 10) & 3, 3);
          assert.equal(timers.size, 0);
          await a(false);
          assert.equal((input.getState().input.cabin_mask >>> 10) & 3, 2);
          assert.equal(by("Ignition key").hasAttribute("data-hud-held"), false);
          await a(true);
          await advance(250);
          await advance(300);
          await advance(300);
          connected = false;
          await frame();
          assert.equal((input.getState().input.cabin_mask >>> 10) & 3, 2);
          assert.equal(timers.size, 0);
        } finally {
          await act(async () => root.render(null));
          globalThis.requestAnimationFrame = raf;
          globalThis.cancelAnimationFrame = cancel;
          window.setTimeout = timeout;
          window.clearTimeout = clear;
          document.hasFocus = focus;
          navigator.getGamepads = getPads;
          await act(async () => ui.setState({ overlay: null }));
        }
      },
    );
    await t.test(
      "ignition ring follows confirmed cranking; End starts only while held and returns to ON on release",
      async () => {
        const { IgnitionSwitch } = await load("ui/Cockpit/IgnitionSwitch.tsx");
        await act(async () =>
          live({ engineOn: false, resourceMask: 0, cabinMask: 4 | 4096 }),
        );
        await render(IgnitionSwitch);
        const label = "Ignition key",
          system = () => document.querySelector(".ignition-system");
        assert.equal(
          document.querySelector(".ignition-ring").tagName,
          "circle",
        );
        await key(label, "keydown", "End");
        assert.equal((input.getState().input.cabin_mask >>> 10) & 3, 3);
        assert.equal(
          system().dataset.cranking,
          "false",
          "a request cannot paint an acknowledgement",
        );
        await act(async () => live({ engineOn: false, resourceMask: 1 }));
        assert.equal(system().dataset.cranking, "true");
        await key(label, "keyup", "End");
        assert.equal((input.getState().input.cabin_mask >>> 10) & 3, 2);
        assert.equal(system().dataset.holding, "false");
        await act(async () => live({ engineOn: true, resourceMask: 0 }));
        assert.equal(system().dataset.engineState, "running");
        assert.equal(system().dataset.cranking, "false");
        await act(async () =>
          live({ signal: "stale", engineOn: false, resourceMask: 1 }),
        );
        assert.equal(system().dataset.cranking, "false");
      },
    );
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
