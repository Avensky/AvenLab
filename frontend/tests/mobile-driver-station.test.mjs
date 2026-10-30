import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h, Fragment } from "react";
import { createRoot } from "react-dom/client";

test("mobile HUD groups, assisted shifter and enlarged resource dials", async (t) => {
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
  document.hasFocus = () => true;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  let root;
  try {
    const load = (path) => server.ssrLoadModule("/src/" + path);
    const {
      usePreferencesStore: prefs,
      sanitizePreferences,
      DEFAULT_HUD_GROUPS,
    } = await load("store/preferences/preferencesStore.ts");
    const { useInputStore: input } = await load("store/input/inputStore.ts"),
      { unpackCockpit } = await load("store/input/protocol/cockpitMasks.ts");
    const { useNetworkStore: network } = await load(
        "store/session/networkStore.ts",
      ),
      { useUIStore: ui } = await load("store/menus/uiStore.ts");
    const { useVehicleConfigStore: configs } = await load(
        "store/session/vehicleConfigStore.ts",
      ),
      { updateVehicleTelemetry } = await load(
        "store/telemetry/vehicleTelemetryStore.ts",
      );
    const { DrivingHUD } = await load("ui/DrivingHUD.tsx"),
      { SettingsMenu } = await load("game/menus/SettingsMenu.tsx");
    const { Keyboard } = await load("controls/Keyboard.ts"),
      { GearSelector, HandbrakeLever } = await load(
        "ui/Cockpit/MechanicalControls.tsx",
      );
    const { parkingLeverPose } = await load("ui/Cockpit/controlGeometry.ts");
    network.getState().setConnected(true);
    network.getState().setPlayerId("me");
    configs.getState().receive("me", {
      max_speed: 70,
      hud: {
        cockpit_controls: true,
        cockpit_version: 5,
        telemetry_mask: 127,
        cluster_fields: 8191,
      },
    });
    const car = {
      id: "me",
      vehicle_id: "brz",
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      speed: 0,
      rpm: 850,
      gear: 1,
      fuel: 30,
      temp: 85,
      vehicle_mask: 97,
      player_mask: 0,
      cockpit_mask: 192,
      cabin_mask: 4 | 4096 | 16384 | (2 << 10),
    };
    let tick = 0;
    const fresh = () => {
      network
        .getState()
        .setSnapshot(
          { tick: ++tick, entities: [{ ...car }] },
          performance.now(),
        );
      updateVehicleTelemetry();
    };
    fresh();
    ui.setState({ screen: "sandbox", overlay: null, isModeLoading: false });
    root = createRoot(document.getElementById("root"));
    const render = async (child) => {
      await act(async () => root.render(null));
      await act(async () => {
        fresh();
        ui.setState({ overlay: null });
        root.render(child);
      });
    };
    const by = (label) => document.querySelector(`[aria-label="${label}"]`),
      click = async (label) => act(async () => by(label).click());
    const pointer = async (node, type, x, y, id = 1) =>
      act(async () => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(e, { pointerId: id, button: 0, clientX: x, clientY: y });
        node.dispatchEvent(e);
      });
    await t.test(
      "saved visibility and wheel bounds survive corrupt/older preference payloads",
      () => {
        const cfg = sanitizePreferences({
          hudGroups: { wheel: false, parking: "bad" },
          wheelDrop: 99,
          steeringTravel: -1,
          minimapScale: 99,
          shiftLayout: "invalid",
        });
        assert.equal(cfg.hudGroups.wheel, false);
        assert.equal(cfg.hudGroups.parking, true);
        assert.equal(cfg.hudGroups.gauges, true);
        assert.equal(cfg.wheelDrop, 0.55);
        assert.equal(cfg.steeringTravel, 0.9);
        assert.equal(cfg.shiftLayout, "h-pattern");
        assert.equal(
          sanitizePreferences({ wheelDrop: NaN, steeringTravel: Infinity })
            .wheelDrop,
          0.28,
        );
        assert.equal(cfg.minimapScale, 1.25);
        assert.equal(
          sanitizePreferences({ minimapScale: -1 }).minimapScale,
          0.5,
        );
        assert.equal(
          sanitizePreferences({ minimapScale: NaN }).minimapScale,
          0.75,
        );
        assert.equal(sanitizePreferences({}).minimapScale, 0.75);
      },
    );
    await t.test(
      "parking brake recedes at rest and rises upright through the detents",
      async () => {
        const rest = parkingLeverPose(0),
          raised = parkingLeverPose(3);
        assert.ok(Math.abs(rest.angle + 115) < 1e-9);
        assert.ok(Math.abs(raised.angle + 75) < 1e-9);
        assert.ok(rest.reach < raised.reach);
        let angle = rest.angle;
        for (let level = 0.1; level <= 3; level += 0.1) {
          const pose = parkingLeverPose(level);
          assert.ok(pose.angle >= angle);
          angle = pose.angle;
        }
        assert.deepEqual(parkingLeverPose(NaN), rest);
        assert.deepEqual(parkingLeverPose(99), raised);
        await render(
          h(HandbrakeLever, { strength: 0, disabled: false, pending: false }),
        );
        assert.ok(
          Math.abs(
            parseFloat(
              document
                .querySelector(".mechanical-handbrake")
                .style.getPropertyValue("--parking-angle"),
            ) + 115,
          ) < 1e-9,
        );
        await click("Parking brake 67 percent");
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).parkingStrength,
          2,
        );
      },
    );
    await t.test(
      "the full middle H lane immediately selects neutral and forward taps preserve cable braking",
      async () => {
        await act(async () =>
          input
            .getState()
            .setCockpit(
              { automatic: true, gear: 1, parking: true, parkingStrength: 2 },
              3,
            ),
        );
        await render(
          h(GearSelector, {
            automatic: false,
            gear: 1,
            disabled: false,
            pending: false,
          }),
        );
        const gate = document.querySelector(".shift-gate");
        gate.getBoundingClientRect = () => ({
          left: 100,
          top: 100,
          x: 100,
          y: 100,
          width: 200,
          height: 100,
        });
        const knob = by("Drag gear stick");
        await pointer(knob, "pointerdown", 172, 125);
        await pointer(knob, "pointermove", 124, 151);
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).gear,
          0,
        );
        const neutral = input.getState().input.cockpit_mask;
        await pointer(knob, "pointermove", 290, 154);
        assert.equal(
          input.getState().input.cockpit_mask,
          neutral,
          "crossing the same neutral band does not emit repeated shifts",
        );
        await pointer(knob, "pointerup", 290, 154);
        assert.equal(input.getState().input.cockpit_mask, neutral);
        await pointer(knob, "pointerdown", 172, 125);
        await pointer(knob, "pointermove", 272, 178);
        await pointer(knob, "pointerup", 272, 178);
        const word = input.getState().input.cockpit_mask,
          state = unpackCockpit(word);
        assert.equal(state.gear, 6);
        assert.equal(state.automatic, true);
        assert.equal((word >>> 24) & 15, 11);
        assert.equal(state.parkingStrength, 2);
        await render(
          h(GearSelector, {
            automatic: true,
            gear: 5,
            disabled: false,
            pending: false,
          }),
        );
        assert.equal(by("Select drive").getAttribute("aria-current"), "true");
        assert.equal(
          document.querySelector(".mechanical-shifter .cockpit-segments"),
          null,
        );
      },
    );
    await t.test(
      "groups occupy separate HUD containers and hidden controls release only their source",
      async () => {
        await act(async () =>
          prefs.getState().update({
            hudGroups: { ...DEFAULT_HUD_GROUPS },
            showTouchControls: true,
            showDriveControls: true,
            steeringTravel: 1.25,
          }),
        );
        await render(h(DrivingHUD));
        assert.ok(by("Vehicle instruments").closest(".instrument-hud"));
        assert.ok(by("Steering wheel").closest(".wheel-hud"));
        assert.ok(by("Accelerate").closest(".pedal-hud"));
        assert.ok(by("Open map"));
        assert.ok(by("Ignition key"));
        assert.equal(document.querySelector(".hud-group-bar"), null);
        const wheel = by("Steering wheel");
        wheel.getBoundingClientRect = () => ({
          x: 100,
          y: 100,
          width: 100,
          height: 100,
        });
        await pointer(wheel, "pointerdown", 203.75, 150);
        assert.equal(input.getState().input.steer, 1);
        assert.ok(
          parseFloat(document.querySelector(".touch-stick-thumb").style.left) >
            100,
        );
        await pointer(by("Accelerate"), "pointerdown", 0, 0, 2);
        await act(async () =>
          input.getState().setAnalogFromSource("keyboard", { throttle: 0.6 }),
        );
        await act(async () => prefs.getState().setHudGroup("wheel", false));
        assert.equal(input.getState().input.steer, 0);
        assert.equal(input.getState().input.throttle, 0.6);
        await act(async () => input.getState().releaseInputSource("keyboard"));
        assert.equal(input.getState().input.throttle, 1);
        await act(async () => prefs.getState().setHudGroup("pedals", false));
        assert.equal(input.getState().input.throttle, 0);
        assert.ok(by("Ignition key"));
        assert.ok(by("Radio source"));
        assert.equal(
          document.querySelector(
            '.console-display [aria-label="Ignition key"]',
          ),
          null,
        );
        await act(async () => prefs.getState().setHudGroup("parking", false));
        assert.equal(by("Parking brake"), null);
        assert.ok(by("Drag gear stick"));
      },
    );
    await t.test(
      "Space brakes while HUD has focus, and all-hidden groups can be restored in Settings",
      async () => {
        await act(async () => input.getState().releaseControls());
        await render(h(Fragment, null, h(DrivingHUD), h(Keyboard)));
        const button = by("Expand radio");
        await act(async () =>
          button.dispatchEvent(
            new dom.window.KeyboardEvent("keydown", {
              key: " ",
              code: "Space",
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
        assert.equal(input.getState().input.brake, 1);
        assert.equal(document.querySelector(".climate-three-knobs"), null);
        await act(async () =>
          button.dispatchEvent(
            new dom.window.KeyboardEvent("keyup", {
              key: " ",
              code: "Space",
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
        assert.equal(input.getState().input.brake, 0);
        await act(async () =>
          prefs.getState().update({
            hudGroups: Object.fromEntries(
              Object.keys(DEFAULT_HUD_GROUPS).map((id) => [id, false]),
            ),
          }),
        );
        assert.equal(document.querySelectorAll("[data-hud-group]").length, 0);
        assert.equal(document.querySelector(".hud-group-bar"), null);
        await render(h(SettingsMenu));
        const tab = (name) =>
            [...document.querySelectorAll('[role="tab"]')].find(
              (b) => b.textContent === name,
            ),
          row = (id) => document.querySelector(`[data-menu-row="${id}"]`);
        await act(async () => tab("HUD").click());
        await act(async () => row("restore-hud").click());
        assert.deepEqual(prefs.getState().hudGroups, DEFAULT_HUD_GROUPS);
        const before = input.getState().input.cockpit_mask;
        await act(async () => tab("Drivetrain").click());
        await act(async () => row("shift-layout").click());
        assert.equal(prefs.getState().shiftLayout, "automatic");
        assert.equal(
          input.getState().input.cockpit_mask,
          before,
          "a layout preference does not send an engine/gear command",
        );
        const saved = JSON.parse(
          localStorage.getItem("avenlab-preferences-v1"),
        ).state;
        assert.equal(saved.shiftLayout, "automatic");
        assert.equal(saved.hudGroups.parking, true);
      },
    );
    await t.test(
      "HUD map size applies live, persists, and supports pointer and controller menu actions",
      async () => {
        await act(async () => prefs.getState().update({ minimapScale: 0.75 }));
        await render(h(SettingsMenu));
        const hud = [...document.querySelectorAll('[role="tab"]')].find(
          (node) => node.textContent === "HUD",
        );
        await act(async () => hud.click());
        const row = () =>
          document.querySelector('[data-menu-row="minimap-size"]');
        assert.match(row().textContent, /75%/);
        const mask = input.getState().input.cockpit_mask;
        await act(async () => row().focus());
        await act(async () => row().click());
        assert.equal(prefs.getState().minimapScale, 1);
        await act(async () =>
          window.dispatchEvent(
            new CustomEvent("avenlab:panel-action", { detail: "left" }),
          ),
        );
        assert.equal(prefs.getState().minimapScale, 0.75);
        assert.equal(
          JSON.parse(localStorage.getItem("avenlab-preferences-v1")).state
            .minimapScale,
          0.75,
        );
        assert.equal(input.getState().input.cockpit_mask, mask);
        await act(async () => prefs.getState().setHudGroup("minimap", true));
        await render(h(DrivingHUD));
        await click("Open map");
        const map = document.querySelector(".hud-minimap");
        assert.equal(map.style.getPropertyValue("--minimap-scale"), "0.75");
        await act(async () => prefs.getState().update({ minimapScale: 0.5 }));
        assert.equal(map.style.getPropertyValue("--minimap-scale"), "0.5");
        assert.ok(document.querySelector(".gps-map"));
        await act(async () => prefs.getState().update({ minimapScale: 0.75 }));
      },
    );
    await t.test(
      "larger fuel/temp arcs retain independent needles and keep every mark inside the parent rim",
      async () => {
        await render(h(DrivingHUD));
        const fuel = by("Fuel"),
          temp = by("Coolant temperature");
        assert.equal(
          fuel.querySelector(".gauge-hub").getAttribute("cx"),
          temp.querySelector(".gauge-hub").getAttribute("cx"),
        );
        for (const meter of [fuel, temp]) {
          const hub = meter.querySelector(".gauge-hub"),
            x = +hub.getAttribute("cx"),
            y = +hub.getAttribute("cy"),
            line = meter.querySelector("line");
          assert.ok(
            Math.hypot(
              +line.getAttribute("x2") - x,
              +line.getAttribute("y2") - y,
            ) >= 64,
          );
          const needle = meter
            .querySelector(".gauge-needle path")
            .getAttribute("d")
            .match(/^M ([\d.]+) ([\d.]+)/);
          assert.ok(Math.hypot(+needle[1] - x, +needle[2] - y) >= 60);
          for (const mark of meter.querySelectorAll("line"))
            for (const end of [1, 2])
              assert.ok(
                Math.hypot(
                  +mark.getAttribute(`x${end}`) - 100,
                  +mark.getAttribute(`y${end}`) - 100,
                ) < 95,
              );
        }
        assert.equal(
          document.querySelector(".chat-dock"),
          null,
          "the disconnected chat shell is omitted",
        );
      },
    );
    await t.test(
      "radio reuses a single audio player and hiding its panel does not interrupt playback",
      async () => {
        const {
          loadRadioFile,
          toggleRadio,
          setRadioVolume,
          useRadioStore: radio,
        } = await load("store/radio/radioStore.ts");
        let players = 0,
          revoked = 0;
        const audio = Object.getOwnPropertyDescriptor(globalThis, "Audio"),
          create = URL.createObjectURL,
          revoke = URL.revokeObjectURL;
        class Player {
          paused = true;
          ended = false;
          volume = 1;
          constructor() {
            players++;
          }
          pause() {
            this.paused = true;
            this.onpause?.();
          }
          async play() {
            this.paused = false;
            this.onplay?.();
          }
        }
        Object.defineProperty(globalThis, "Audio", {
          configurable: true,
          value: Player,
        });
        URL.createObjectURL = () => `blob:sample-${players}`;
        URL.revokeObjectURL = () => revoked++;
        try {
          await render(h(DrivingHUD));
          await act(async () =>
            loadRadioFile(
              new dom.window.File(["audio"], "track.ogg", {
                type: "audio/ogg",
              }),
            ),
          );
          assert.equal(radio.getState().playing, true);
          await act(async () => prefs.getState().setHudGroup("display", false));
          assert.equal(radio.getState().playing, true);
          await act(async () =>
            loadRadioFile(new dom.window.File(["more"], "next.ogg")),
          );
          assert.equal(players, 1);
          assert.equal(revoked, 1);
          await act(async () => setRadioVolume(2));
          assert.equal(radio.getState().volume, 1);
          await act(async () => toggleRadio());
          assert.equal(radio.getState().playing, false);
        } finally {
          URL.createObjectURL = create;
          URL.revokeObjectURL = revoke;
          if (audio) Object.defineProperty(globalThis, "Audio", audio);
          else delete globalThis.Audio;
        }
      },
    );
    await t.test(
      "hiding every telemetry group stops the shared display and clock timers",
      async () => {
        await act(async () => root.render(null));
        const interval = window.setInterval,
          clear = window.clearInterval,
          timers = new Map();
        let id = 0;
        window.setInterval = (fn, ms) => {
          timers.set(++id, { fn, ms });
          return id;
        };
        window.clearInterval = (id) => timers.delete(id);
        try {
          await act(async () => {
            prefs.getState().update({
              hudGroups: { ...DEFAULT_HUD_GROUPS },
              showTouchControls: true,
              showDriveControls: true,
            });
            fresh();
            root.render(h(DrivingHUD));
          });
          assert.equal(
            [...timers.values()].filter((timer) => timer.ms === 50).length,
            1,
          );
          assert.equal(
            [...timers.values()].filter((timer) => timer.ms === 30000).length,
            1,
          );
          await act(async () =>
            prefs.getState().update({
              hudGroups: Object.fromEntries(
                Object.keys(DEFAULT_HUD_GROUPS).map((id) => [id, false]),
              ),
            }),
          );
          assert.equal(timers.size, 0);
          await act(async () => prefs.getState().setHudGroup("wheel", true));
          assert.equal(timers.size, 1);
          assert.equal([...timers.values()][0].ms, 50);
          await act(async () => root.render(null));
          assert.equal(timers.size, 0);
        } finally {
          window.setInterval = interval;
          window.clearInterval = clear;
        }
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
