import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h, Fragment } from "react";
import { createRoot } from "react-dom/client";

test("parking brake requests cannot move the selector or mark other controls pending", async (t) => {
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
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  let root;
  try {
    const load = (path) => server.ssrLoadModule("/src/" + path);
    const { useInputStore: input } = await load("store/input/inputStore.ts"),
      { useNetworkStore: network } = await load(
        "store/session/networkStore.ts",
      );
    const { useVehicleConfigStore: configs } = await load(
        "store/session/vehicleConfigStore.ts",
      ),
      { updateVehicleTelemetry } = await load(
        "store/telemetry/vehicleTelemetryStore.ts",
      );
    const { DriveGearControl, ParkingBrakeControl } = await load(
        "ui/Cockpit/DriveControls.tsx",
      ),
      { DriveAssists } = await load("ui/Cockpit/DriveAssists.tsx");
    const { unpackCockpit, reviseCockpit, cockpitCommandPending } = await load(
        "store/input/protocol/cockpitMasks.ts",
      ),
      { usePreferencesStore: prefs } = await load(
        "store/preferences/preferencesStore.ts",
      );
    const { useUIStore: ui } = await load("store/menus/uiStore.ts");
    network.getState().setConnected(true);
    network.getState().setPlayerId("me");
    configs
      .getState()
      .receive("me", {
        max_speed: 70,
        hud: {
          telemetry_mask: 127,
          cockpit_controls: true,
          cockpit_version: 5,
        },
      });
    ui.setState({ screen: "sandbox", overlay: null, isModeLoading: false });
    prefs.getState().update({ shiftLayout: "h-pattern" });
    let tick = 0;
    const snapshot = (mask, gear = 6) => {
      network
        .getState()
        .setSnapshot(
          {
            tick: ++tick,
            entities: [
              {
                id: "me",
                vehicle_id: "brz",
                position: [0, 1, 0],
                rotation: [0, 0, 0, 1],
                speed: 0,
                rpm: 850,
                gear,
                vehicle_mask: 97,
                player_mask: 0,
                cockpit_mask: mask,
              },
            ],
          },
          performance.now(),
        );
      updateVehicleTelemetry();
    };
    root = createRoot(document.getElementById("root"));
    const by = (label) => document.querySelector(`[aria-label="${label}"]`);
    await t.test(
      "unacknowledged brake changes leave sixth gear and assist indicators alone",
      async () => {
        await act(async () => {
          input
            .getState()
            .setInput({ cockpit_mask: undefined, vehicleMask: 97 });
          snapshot(192);
          root.render(
            h(
              Fragment,
              null,
              h(DriveGearControl),
              h(ParkingBrakeControl),
              h(DriveAssists, { compact: true }),
            ),
          );
        });
        assert.equal(by("Select gear 6").getAttribute("aria-current"), "true");
        const knob = by("Drag gear stick"),
          left = knob.style.left,
          top = knob.style.top;
        await act(async () => by("Parking brake 67 percent").click());
        assert.equal(knob.style.left, left);
        assert.equal(knob.style.top, top);
        assert.equal(by("Select gear 6").getAttribute("aria-current"), "true");
        assert.equal(
          document.querySelector(".shift-gate").getAttribute("aria-busy"),
          "false",
        );
        assert.equal(by("Toggle TCS").getAttribute("aria-busy"), "false");
        assert.equal(by("VSC Sport").getAttribute("aria-busy"), "false");
        assert.equal(by("Parking brake").getAttribute("aria-busy"), "true");
        assert.equal(by("Parking brake").hasAttribute("data-pending"), false);
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).parkingStrength,
          2,
        );
        assert.equal((input.getState().input.cockpit_mask >>> 24) & 15, 3);
      },
    );
    await t.test(
      "first brake and assist requests preserve confirmed Neutral instead of defaulting to Drive",
      async () => {
        await act(async () => {
          input.getState().setInput({ cockpit_mask: undefined });
          snapshot(64, 0);
          input.getState().setCockpit({ parking: true, parkingStrength: 1 }, 3);
        });
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).gear,
          0,
        );
        assert.equal(by("Select neutral").getAttribute("aria-current"), "true");
        await act(async () => {
          input.getState().setInput({ cockpit_mask: undefined });
          input.getState().setAssist(1, true);
        });
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).gear,
          0,
        );
      },
    );
    await t.test(
      "acknowledged rejection cannot replay a Park request on a brake click",
      async () => {
        const rejected = reviseCockpit(undefined, { gear: 8 }, 2),
          revision = unpackCockpit(rejected).revision;
        await act(async () => {
          input.getState().setInput({ cockpit_mask: rejected });
          snapshot((192 | (revision << 16) | (2 << 28)) >>> 0, 3);
          input.getState().setCockpit({ parking: true, parkingStrength: 3 }, 3);
        });
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).gear,
          1,
        );
        assert.equal(by("Select gear 3").getAttribute("aria-current"), "true");
      },
    );
    await t.test(
      "genuine gear and assist requests retain their own acknowledgement feedback",
      async () => {
        const gear = reviseCockpit(192, { gear: 4 }, 11),
          assist = reviseCockpit(192, { assist: 1 }, 1),
          brake = reviseCockpit(192, { parking: true }, 3);
        assert.equal(cockpitCommandPending(gear, 192, 2, 11), true);
        assert.equal(cockpitCommandPending(assist, 192, 1), true);
        assert.equal(cockpitCommandPending(brake, 192, 2, 11), false);
        assert.equal(cockpitCommandPending(brake, 192, 1), false);
        assert.equal(cockpitCommandPending(gear, gear, 2, 11), false);
        await act(async () => {
          input.getState().setInput({ cockpit_mask: gear });
          snapshot(192, 3);
          input.getState().setCockpit({ parking: true, parkingStrength: 1 }, 3);
        });
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).gear,
          4,
          "a brake request preserves an explicitly queued, unacknowledged gear selection",
        );
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
