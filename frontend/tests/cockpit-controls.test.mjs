import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";

test("cockpit requests use one packed input field and preserve menu/input ownership", async (t) => {
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
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.getClientRects = function () {
    return this.hidden ? [] : [{ x: 0, y: 0, width: 30, height: 25 }];
  };
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  let root;
  try {
    const load = (path) => server.ssrLoadModule("/src/" + path);
    const { unpackCockpit, reviseCockpit, cockpitStatus } = await load(
      "store/input/protocol/cockpitMasks.ts",
    );
    const { useInputStore: input } = await load("store/input/inputStore.ts");
    const { useUIStore: ui } = await load("store/menus/uiStore.ts");
    const { canDrive, canNavigateMenu, routeMenuAction } = await load(
      "controls/inputRouting.ts",
    );
    const { useNetworkStore: network } = await load(
      "store/session/networkStore.ts",
    );
    const { useVehicleConfigStore: configs } = await load(
      "store/session/vehicleConfigStore.ts",
    );
    const { CockpitPanel } = await load("ui/Cockpit/CockpitPanel.tsx");
    // Refresh the authoritative receipt clock for each interaction; SSR compile
    // time must not accidentally turn a control test into the stale-signal test.
    t.beforeEach(async () => {
      const snapshot = network.getState().snapshot;
      if (snapshot)
        await act(async () => {
          network
            .getState()
            .setSnapshot(
              { ...snapshot, tick: snapshot.tick + 1 },
              performance.now(),
            );
          const { updateVehicleTelemetry } = await load(
            "store/telemetry/vehicleTelemetryStore.ts",
          );
          updateVehicleTelemetry();
        });
    });
    await t.test(
      "the cross-language golden packed word contains all requested states with a new revision",
      () => {
        const packed = reviseCockpit(
          8 << 16,
          {
            lights: 3,
            wipers: 2,
            assist: 1,
            automatic: false,
            gear: 5,
            parking: true,
            washer: false,
            cruiseEnabled: true,
            cruiseAction: 1,
          },
          2,
        );
        assert.equal(packed, 0xc2096a9b);
        assert.deepEqual(unpackCockpit(packed), {
          lights: 3,
          wipers: 2,
          assist: 1,
          automatic: false,
          gear: 5,
          parking: true,
          parkingStrength: 3,
          washer: false,
          cruiseEnabled: true,
          cruiseAction: 1,
          revision: 9,
        });
        assert.equal(
          unpackCockpit(reviseCockpit(255 << 16, {}, 0)).revision,
          0,
        );
        assert.equal(cockpitStatus(0x07000000).parkingActive, true);
        for (const level of [0, 1, 2, 3]) {
          const word = reviseCockpit(
            undefined,
            { parking: level > 0, parkingStrength: level },
            3,
          );
          assert.equal(unpackCockpit(word).parkingStrength, level);
          assert.equal(cockpitStatus((word & 0xc0ffffff) >>> 0).rejection, 0);
        }
      },
    );
    await t.test(
      "cockpit changes cannot erase steering/pedals, and release clears momentary washer/cruise while retaining parking",
      () => {
        input.getState().setInput({
          cockpit_mask: undefined,
          throttle: 0.7,
          steer: -0.3,
          brake: 0.2,
          handbrake: 0,
        });
        input.getState().setCockpit(
          {
            automatic: false,
            gear: 4,
            parking: true,
            washer: true,
            cruiseEnabled: true,
          },
          2,
        );
        assert.equal(input.getState().input.throttle, 0.7);
        assert.equal(input.getState().input.steer, -0.3);
        assert.equal(input.getState().input.brake, 0.2);
        input.getState().releaseControls();
        const state = unpackCockpit(input.getState().input.cockpit_mask);
        assert.equal(state.washer, false);
        assert.equal(state.cruiseAction, 3);
        assert.equal(state.parking, true);
        assert.equal(state.parkingStrength, 3);
        assert.equal(state.gear, 4);
        assert.equal(input.getState().input.throttle, 0);
        const released = input.getState().input;
        for (let i = 0; i < 120; i++) input.getState().releaseControls();
        assert.equal(
          input.getState().input,
          released,
          "a hidden tab must not emit fresh cockpit revisions every sender tick",
        );
        const valid = input.getState().input.cockpit_mask;
        for (const invalid of [NaN, Infinity, -1, 2 ** 32]) {
          input.getState().setInput({ cockpit_mask: invalid });
          assert.equal(input.getState().input.cockpit_mask, valid);
        }
      },
    );
    await t.test(
      "explicit traction and headlight shortcuts update the matching cockpit request instead of competing owners",
      () => {
        input.getState().setCockpit({ assist: 1 }, 1);
        input.getState().setVehicleFlag(64, true);
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).assist,
          1,
        );
        input.getState().setVehicleFlag(64, false);
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).assist,
          1,
        );
        input.getState().setVehicleFlag(2, true);
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).lights,
          2,
        );
        input.getState().setVehicleFlag(2, false);
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).lights,
          0,
        );
      },
    );
    await t.test(
      "Signal Recon cannot open driving cockpit and opening it in Sandbox transfers navigation ownership",
      () => {
        ui.setState({
          screen: "signal_recon",
          overlay: null,
          isModeLoading: false,
        });
        ui.getState().openCockpit();
        assert.equal(ui.getState().overlay, null);
        ui.getState().setOverlay("cockpit");
        assert.equal(ui.getState().overlay, null);
        ui.setState({ screen: "sandbox" });
        ui.getState().openCockpit();
        assert.equal(ui.getState().overlay, "cockpit");
        assert.equal(canDrive(), false);
        assert.equal(canNavigateMenu(), true);
      },
    );
    const calibrated = {
      max_speed: 70,
      hud: {
        cockpit_controls: true,
        cockpit_version: 2,
        cluster_fields: 1548,
        telemetry_mask: 63,
      },
    };
    input.getState().setInput({ cockpit_mask: undefined });
    network.getState().setConnected(true);
    network.getState().setPlayerId("me");
    configs.getState().receive("me", calibrated);
    network.getState().setSnapshot(
      {
        tick: 1,
        entities: [
          {
            id: "me",
            vehicle_mask: 97,
            cockpit_mask: 192,
            cluster_mask: 0,
            speed: 0,
            rpm: 850,
            gear: 0,
            vehicle_id: "brz",
          },
        ],
      },
      performance.now(),
    );
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(h(CockpitPanel)));
    const button = (label) => document.querySelector(`[aria-label="${label}"]`);
    await t.test(
      "physical parking-brake and Sport buttons emit distinct packed commands",
      async () => {
        const { usePreferencesStore } = await load(
          "store/preferences/index.ts",
        );
        await act(async () =>
          usePreferencesStore.getState().update({ parkingCrystals: true }),
        );
        await act(async () => button("Parking brake 33 percent").click());
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).parking,
          true,
        );
        assert.equal((input.getState().input.cockpit_mask >>> 24) & 15, 3);
        await act(async () => button("Parking brake 67 percent").click());
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).parkingStrength,
          2,
        );
        await act(async () => button("VSC Sport").click());
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).assist,
          1,
        );
        assert.equal((input.getState().input.cockpit_mask >>> 24) & 15, 1);
      },
    );
    await t.test(
      "holding TRAC requests full off once, and the explicit action gives controller users the same state",
      async () => {
        const later = window.setTimeout,
          clear = window.clearTimeout,
          timers = new Map();
        let id = 0;
        window.setTimeout = (callback, ms) => {
          timers.set(++id, { callback, ms });
          return id;
        };
        window.clearTimeout = (id) => timers.delete(id);
        const pointer = async (type) =>
          act(async () => {
            const event = new Event(type, { bubbles: true });
            Object.assign(event, { pointerId: 1, button: 0 });
            button("Toggle TCS").dispatchEvent(event);
          });
        try {
          await pointer("pointerdown");
          assert.equal(timers.size, 1);
          const timer = [...timers.values()][0];
          assert.equal(timer.ms, 3100);
          await act(async () => timer.callback());
          const word = input.getState().input.cockpit_mask;
          assert.equal(unpackCockpit(word).assist, 3);
          await pointer("pointerup");
          await act(async () => button("Toggle TCS").click());
          assert.equal(
            input.getState().input.cockpit_mask,
            word,
            "release click cannot undo the completed hold",
          );
          await act(async () => {
            button("TRAC and VSC off").focus();
            routeMenuAction("activate");
          });
          assert.equal(
            unpackCockpit(input.getState().input.cockpit_mask).assist,
            3,
          );
          assert.equal(
            button("TRAC and VSC off").getAttribute("aria-pressed"),
            "false",
            "request must not invent confirmation",
          );
        } finally {
          window.setTimeout = later;
          window.clearTimeout = clear;
        }
      },
    );
    await t.test(
      "old cockpit calibration cannot silently turn a fractional brake request into full braking",
      async () => {
        await act(async () => {
          configs.getState().receive("me", {
            ...calibrated,
            hud: { ...calibrated.hud, cockpit_version: 1 },
          });
          const { updateVehicleTelemetry } = await load(
            "store/telemetry/vehicleTelemetryStore.ts",
          );
          updateVehicleTelemetry();
        });
        assert.equal(button("Parking brake").disabled, true);
        assert.equal(button("VSC Sport").disabled, true);
        await act(async () => {
          configs.getState().receive("me", calibrated);
          const { updateVehicleTelemetry } = await load(
            "store/telemetry/vehicleTelemetryStore.ts",
          );
          updateVehicleTelemetry();
        });
        assert.equal(button("Parking brake").disabled, false);
      },
    );
    await t.test(
      "controller tab navigation reaches stalks and emits their own modes, with B closing without handbrake leakage",
      async () => {
        await act(async () => {
          const snap = network.getState().snapshot;
          network
            .getState()
            .setSnapshot(
              { tick: snap.tick + 1, entities: snap.entities },
              performance.now(),
            );
          const { updateVehicleTelemetry } = await load(
            "store/telemetry/vehicleTelemetryStore.ts",
          );
          updateVehicleTelemetry();
        });
        await act(async () => routeMenuAction("next_tab"));
        assert.equal(ui.getState().cockpitTab, "lights");
        await act(async () => button("Lights high").click());
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).lights,
          3,
        );
        await act(async () => routeMenuAction("next_tab"));
        assert.equal(ui.getState().cockpitTab, "wipers");
        await act(async () => button("Wipers mid").click());
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).wipers,
          2,
        );
        await act(async () => routeMenuAction("back"));
        assert.equal(ui.getState().overlay, null);
        assert.equal(input.getState().input.handbrake, 0);
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
