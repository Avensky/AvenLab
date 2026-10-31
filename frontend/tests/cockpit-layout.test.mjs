import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h, Profiler } from "react";
import { createRoot } from "react-dom/client";
import {
  STALK_LAYOUTS,
  stalkPoint,
  stalkStepAngle,
  stalkTangent,
} from "../src/ui/Cockpit/stalks/geometry.ts";
import {
  IGNITION_LABEL_RADIUS,
  IGNITION_RING_RADIUS,
  ignitionTravelPath,
  ignitionViewBox,
} from "../src/ui/Cockpit/ignition/geometry.ts";

import { parkingPressureAfterHold } from "../src/ui/Cockpit/mechanical/pressure.ts";

test("parking pressure grows with held time, retains the starting tension and clamps at full", () => {
  assert.equal(parkingPressureAfterHold(0, 150), 0.25);
  assert.equal(parkingPressureAfterHold(0.37, 60), 0.47);
  assert.equal(parkingPressureAfterHold(0, 600), 1);
  assert.equal(parkingPressureAfterHold(0.8, 1200), 1);
  assert.equal(parkingPressureAfterHold(0.8, 0), 0.8);
  assert.equal(parkingPressureAfterHold(0.8, -100), 0.8);
  assert.equal(parkingPressureAfterHold(NaN, NaN), 0);
});

test("a lever and both adjacent controls share one radius and mirrored up/down placement", () => {
  for (const c of Object.values(STALK_LAYOUTS))
    for (const d of [-1, 1]) {
      const a = stalkStepAngle(c.angle, d, c.spacing),
        p = stalkPoint(a, c.reach),
        cap = stalkPoint(c.angle, c.reach);
      assert.ok(
        Math.abs(
          Math.hypot(parseFloat(p.left) - 50, parseFloat(p.top) - 50) - c.reach,
        ) < 1e-9,
      );
      assert.equal(parseFloat(p.top) < parseFloat(cap.top), d === 1);
      assert.ok(stalkTangent(a) >= -90 && stalkTangent(a) < 90);
    }
});
test("the complete ignition light and held sweep fit outside the detent labels", () => {
  assert.ok(IGNITION_RING_RADIUS > IGNITION_LABEL_RADIUS + 3);
  const [x, y, w, h] = ignitionViewBox().split(" ").map(Number);
  assert.ok(
    x < 60 - IGNITION_RING_RADIUS &&
      y < 60 - IGNITION_RING_RADIUS &&
      x + w > 60 + IGNITION_RING_RADIUS &&
      y + h > 60 + IGNITION_RING_RADIUS,
  );
  assert.match(
    ignitionTravelPath(),
    new RegExp(`A${IGNITION_RING_RADIUS} ${IGNITION_RING_RADIUS}`),
  );
});

test("cockpit layout preferences preserve electronics and physical source ownership", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
      url: "http://localhost",
      pretendToBeVisual: true,
    }),
    old = new Map();
  for (const [k, v] of Object.entries({
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
    old.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, {
      configurable: true,
      writable: true,
      value: v,
    });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  // React is imported before this test installs JSDOM; its legacy input-event
  // fallback needs these shims when the real brightness range receives focus.
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  dom.window.HTMLElement.prototype.detachEvent = () => {};
  const server = await createServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: "custom",
      logLevel: "error",
    }),
    load = (p) => server.ssrLoadModule("/src/" + p);
  let root;
  try {
    const {
        usePreferencesStore: prefs,
        DEFAULT_PREFERENCES,
        DEFAULT_HUD_GROUPS,
        sanitizePreferences,
      } = await load("store/preferences/index.ts"),
      { useInputStore: input } = await load("store/input/inputStore.ts"),
      { useUIStore: ui } = await load("store/menus/uiStore.ts"),
      { useNetworkStore: network } = await load(
        "store/session/networkStore.ts",
      ),
      { useVehicleConfigStore: config } = await load(
        "store/session/vehicleConfigStore.ts",
      ),
      { updateVehicleTelemetry } = await load(
        "store/telemetry/vehicleTelemetryStore.ts",
      ),
      { unpackCockpit } = await load("store/input/protocol/cockpitMasks.ts");
    const entity = {
      id: "me",
      kind: "car",
      vehicle_id: "brz",
      room_id: 0,
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      speed: 0,
      rpm: 850,
      gear: 3,
      fuel: 30,
      temp: 85,
      engine_torque: 0,
      vehicle_mask: 97,
      player_mask: 0,
      cockpit_mask: 192,
      cabin_mask: 4 | 4096 | (2 << 10),
      resource_mask: 0,
      cluster_mask: 0,
    };
    let tick = 0;
    const fresh = () => {
      network.getState().setConnected(true);
      network.getState().setPlayerId("me");
      config.getState().receive("me", {
        max_speed: 70,
        hud: {
          cockpit_controls: true,
          cockpit_version: 7,
          telemetry_mask: 127,
          ambient_temp_c: 25,
        },
      });
      network
        .getState()
        .setSnapshot(
          { tick: ++tick, entities: [{ ...entity }] },
          performance.now(),
        );
      updateVehicleTelemetry();
    };
    root = createRoot(document.getElementById("root"));
    const render = async (node) => {
      await act(async () => root.render(null));
      await act(async () => {
        fresh();
        root.render(node);
      });
    };
    const by = (label) => {
      const n = document.querySelector(`[aria-label="${label}"]`);
      assert.ok(n, label);
      return n;
    };
    const click = async (label) => act(async () => by(label).click());
    const text = async (label) =>
      act(async () => {
        const n = [...document.querySelectorAll("button")].find(
          (n) => n.textContent.trim() === label,
        );
        assert.ok(n, label);
        n.click();
      });
    const point = async (type, label) =>
      act(async () => {
        for (const eventType of Array.isArray(type) ? type : [type]) {
          const e = new Event(eventType, { bubbles: true, cancelable: true });
          Object.assign(e, {
            pointerId: 42,
            button: 0,
            clientX: 100,
            clientY: 100,
          });
          by(label).dispatchEvent(e);
        }
      });
    t.beforeEach(async () =>
      act(async () => {
        root.render(null);
        input.getState().releaseControls();
        input.getState().setInput({
          cockpit_mask: undefined,
          parking_brake: undefined,
          cabin_mask: undefined,
          vehicleMask: 97,
        });
        ui.setState({ screen: "sandbox", overlay: null, isModeLoading: false });
        prefs.getState().update({
          ...DEFAULT_PREFERENCES,
          hudGroups: { ...DEFAULT_HUD_GROUPS },
        });
        fresh();
      }),
    );
    await t.test(
      "all shared feature indexes resolve their public functions without circular initialization",
      async () => {
        const [s, m, i, p] = await Promise.all(
          ["stalks", "mechanical", "ignition", "panels"].map((n) =>
            load(`ui/Cockpit/${n}/index.ts`),
          ),
        );
        for (const value of [
          s.Stalk,
          s.toggleTurnSignal,
          m.DriftBrakeLever,
          m.requestParkingStrength,
          i.IgnitionArtwork,
          p.ClimatePage,
          p.HudVisibilityPanel,
          p.BrightnessPage,
        ])
          assert.equal(typeof value, "function");
      },
    );
    await t.test(
      "legacy climate layouts migrate and the old alias stays synchronized",
      async () => {
        const saved = sanitizePreferences({
          researchHud: false,
          hudGroups: { climate: true },
        });
        assert.equal(saved.hudGroups.climate, false);
        assert.equal(saved.parkingCrystals, false);
        assert.equal(saved.parkingBrakeStyle, "lever");
        await act(async () => prefs.getState().update({ researchHud: true }));
        assert.equal(prefs.getState().hudGroups.climate, true);
        await act(async () => prefs.getState().setHudGroup("climate", false));
        assert.equal(prefs.getState().researchHud, false);
        await act(async () =>
          prefs.getState().update({
            hudGroups: { ...prefs.getState().hudGroups, climate: true },
          }),
        );
        assert.equal(prefs.getState().researchHud, true);
      },
    );
    await t.test(
      "Research links to canonical controls and one HUD layout menu, with Back returning to the cockpit",
      async () => {
        const { CockpitPanel } = await load("ui/Cockpit/CockpitPanel.tsx");
        const { SettingsMenu } = await load("game/menus/SettingsMenu.tsx");
        const { COCKPIT_TABS } = await load("ui/Cockpit/panels/index.ts");
        await act(async () => ui.getState().openCockpit("research"));
        await render(h(CockpitPanel));
        assert.equal(
          document.querySelectorAll('.cockpit-research-page [role="switch"]')
            .length,
          0,
        );
        assert.equal(
          document.querySelectorAll(".research-instrumentation button").length,
          3,
        );
        const before = {
          vehicle: input.getState().input.vehicleMask,
          cabin: input.getState().input.cabin_mask,
          cockpit: input.getState().input.cockpit_mask,
        };
        for (const item of COCKPIT_TABS.filter(
          (item) => item.id !== "research",
        )) {
          await click(`Open ${item.label.toLowerCase()} controls`);
          assert.equal(ui.getState().cockpitTab, item.id);
          await act(async () => ui.getState().setCockpitTab("research"));
        }
        assert.deepEqual(
          {
            vehicle: input.getState().input.vehicleMask,
            cabin: input.getState().input.cabin_mask,
            cockpit: input.getState().input.cockpit_mask,
          },
          before,
        );
        const player = input.getState().input.playerMask;
        await text("CAN LOG");
        assert.notEqual(input.getState().input.playerMask, player);
        await click("Open HUD layout settings");
        assert.equal(ui.getState().overlay, "settings");
        assert.equal(ui.getState().settingsTab, "hud");
        await render(h(SettingsMenu));
        assert.equal(
          document.querySelectorAll('[data-menu-row="hud-climate"]').length,
          1,
        );
        assert.equal(
          document.querySelector('[data-menu-row="research-hud"]'),
          null,
        );
        assert.equal(
          document.querySelector('[data-menu-row="hud-hazards"]'),
          null,
        );
        await act(async () => ui.getState().backToParentMenu());
        assert.equal(ui.getState().overlay, "cockpit");
        assert.equal(ui.getState().cockpitTab, "research");
      },
    );
    await t.test(
      "the shared wheel selects every column page without sending a vehicle command",
      async () => {
        const { CockpitPanel } = await load("ui/Cockpit/CockpitPanel.tsx");
        await act(async () => ui.getState().openCockpit("lights"));
        await render(h(CockpitPanel));
        const before = { ...input.getState().input };
        for (const id of ["wipers", "cruise", "lights"]) {
          await click(`Select ${id} stalk`);
          assert.equal(ui.getState().cockpitTab, id);
          assert.equal(
            by(`Select ${id} stalk`).getAttribute("aria-current"),
            "page",
          );
          assert.equal(
            document.querySelectorAll(".cockpit-wheel-picker button").length,
            3,
          );
          assert.ok(
            document.querySelector(".cockpit-wheel-picker .wheel-artwork"),
          );
        }
        assert.ok(parseFloat(by("Select cruise stalk").style.left) > 50);
        assert.deepEqual(input.getState().input, before);
      },
    );
    await t.test(
      "hiding climate always removes its entire HUD while retaining hazards, size and electronics",
      async () => {
        const { ClimatePage } = await load("ui/Cockpit/panels/index.ts");
        const { DrivingHUD } = await load("ui/DrivingHUD.tsx");
        await render(h("div", null, h(ClimatePage), h(DrivingHUD)));
        const before = { ...input.getState().input };
        for (const size of ["compact", "full"])
          for (const hazards of [true, false]) {
            await act(async () =>
              prefs.getState().update({
                climateHudSize: size,
                hudGroups: {
                  ...prefs.getState().hudGroups,
                  climate: true,
                  hazards,
                },
              }),
            );
            assert.equal(
              document.querySelectorAll(".driving-hud .hud-climate").length,
              1,
            );
            await click("Climate controls on driving HUD");
            assert.equal(
              document.querySelector(".driving-hud .hud-climate"),
              null,
            );
            assert.equal(
              document.querySelector(".driving-hud .climate-panel"),
              null,
            );
            assert.equal(prefs.getState().hudGroups.hazards, hazards);
            assert.equal(prefs.getState().climateHudSize, size);
            assert.equal(prefs.getState().researchHud, false);
            assert.equal(
              by("Climate controls on driving HUD").textContent.trim(),
              "SHOW HUD",
            );
            await click("Climate controls on driving HUD");
            assert.equal(
              document.querySelectorAll(".driving-hud .hud-climate").length,
              1,
            );
          }
        await click("Climate controls on driving HUD");
        await text("COMPACT HUD");
        assert.equal(prefs.getState().hudGroups.hazards, true);
        assert.equal(
          document.querySelector(".driving-hud .hud-climate"),
          null,
          "size must not unhide the unit through its child hazard option",
        );
        assert.deepEqual(input.getState().input, before);
      },
    );
    await t.test(
      "Climate size choices update the live preview and driving HUD; compact hides dials and restores hazards",
      async () => {
        const { ClimatePage } = await load("ui/Cockpit/panels/index.ts"),
          { DrivingHUD } = await load("ui/DrivingHUD.tsx");
        await render(h(ClimatePage));
        assert.equal(
          document.querySelectorAll(".climate-panel .climate-knob").length,
          0,
        );
        await text("FULL HUD");
        assert.equal(
          document.querySelectorAll(".climate-panel .climate-knob").length,
          3,
        );
        await click("Climate controls on driving HUD");
        await text("COMPACT HUD");
        assert.equal(prefs.getState().hudGroups.hazards, true);
        assert.equal(
          document.querySelectorAll(".climate-panel .climate-knob").length,
          0,
        );
        assert.equal(by("Hazards").dataset.shape, "round");
        await render(h(DrivingHUD));
        assert.equal(
          document.querySelector(".climate-panel").dataset.size,
          "compact",
        );
        assert.equal(
          document.querySelectorAll(".climate-panel .climate-knob").length,
          0,
        );
        assert.equal(
          by("Hazards").closest(".console-clock-strip") !== null,
          true,
        );
        await act(async () =>
          prefs.getState().update({ climateHudSize: "full" }),
        );
        assert.equal(
          document.querySelectorAll(".climate-panel .climate-knob").length,
          3,
        );
        assert.equal(
          document.querySelector(
            '[aria-label="Expand climate"],[aria-label="Minimize climate"]',
          ),
          null,
        );
      },
    );
    await t.test(
      "cockpit brightness previews real instruments, persists gain and supports controller adjustment without vehicle requests",
      async () => {
        const { CockpitPanel } = await load("ui/Cockpit/CockpitPanel.tsx");
        const { default: Dashboard } = await load("ui/Dashboard/Dashboard.tsx");
        await act(async () => ui.getState().openCockpit("brightness"));
        await render(h(CockpitPanel));
        assert.ok(
          document.querySelector(
            '.cockpit-tabs [data-cockpit-tab="brightness"]',
          ),
        );
        assert.ok(
          document.querySelector(".dashboard-preview .dashboard-cluster"),
        );
        const before = { ...input.getState().input };
        const slider = by("Dashboard brightness");
        await act(async () => slider.focus());
        await act(async () =>
          slider.dispatchEvent(
            new window.KeyboardEvent("keydown", {
              key: "ArrowLeft",
              code: "ArrowLeft",
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
        assert.equal(prefs.getState().dashboardBrightness, 0.95);
        await act(async () =>
          window.dispatchEvent(
            new CustomEvent("avenlab:panel-action", { detail: "left" }),
          ),
        );
        assert.equal(prefs.getState().dashboardBrightness, 0.9);
        assert.equal(
          document.querySelector(".dashboard-preview .dashboard-cluster").style
            .filter,
          "brightness(0.9)",
        );
        assert.equal(
          JSON.parse(localStorage.getItem("avenlab-preferences-v1")).state
            .dashboardBrightness,
          0.9,
        );
        await click("Dashboard on driving HUD");
        assert.equal(prefs.getState().hudGroups.gauges, false);
        assert.ok(
          document.querySelector(".dashboard-preview .dashboard-cluster"),
          "hidden HUD still has a preview",
        );
        await text("RESET BRIGHTNESS");
        assert.equal(prefs.getState().dashboardBrightness, 1);
        assert.deepEqual(input.getState().input, before);
        assert.equal(
          sanitizePreferences({ dashboardBrightness: -8 }).dashboardBrightness,
          0.1,
        );
        assert.equal(
          sanitizePreferences({ dashboardBrightness: 8 }).dashboardBrightness,
          1,
        );
        assert.equal(
          sanitizePreferences({ dashboardBrightness: NaN }).dashboardBrightness,
          1,
        );
        await act(async () =>
          prefs.getState().update({ dashboardBrightness: 0.5 }),
        );
        await render(h(Dashboard));
        assert.equal(
          document.querySelector(".dashboard-cluster").style.filter,
          "brightness(0.5)",
        );
        try {
          await act(async () => {
            entity.vehicle_mask = 96;
            fresh();
          });
          assert.equal(
            document.querySelector(".dashboard-cluster").style.filter,
            "brightness(0.21)",
          );
          await act(async () =>
            prefs.getState().update({ highContrast: true }),
          );
          assert.equal(
            document.querySelector(".dashboard-cluster").style.filter,
            "brightness(0.5)",
          );
        } finally {
          entity.vehicle_mask = 97;
        }
      },
    );
    await t.test(
      "radio and ignition pages hide only their driving widgets, retain playback/commands and share Settings state",
      async () => {
        const { CockpitPanel } = await load("ui/Cockpit/CockpitPanel.tsx"),
          { default: ControlsPanel } = await load("ui/ControlsPanel.tsx"),
          { DrivingIgnition } = await load("ui/Cockpit/DrivingIgnition.tsx"),
          { useRadioStore: radio } = await load("store/radio/radioStore.ts");
        const before = { ...input.getState().input };
        radio.setState({ powered: true, playing: true, title: "Keep playing" });
        await act(async () => ui.getState().openCockpit("radio"));
        await render(
          h("div", null, h(CockpitPanel), h(ControlsPanel), h(DrivingIgnition)),
        );
        await click("Radio on driving HUD");
        assert.equal(
          document.querySelector('[data-hud-group="display"]'),
          null,
        );
        assert.ok(document.querySelector(".cockpit-radio-page .cockpit-radio"));
        assert.equal(radio.getState().powered, true);
        assert.equal(radio.getState().playing, true);
        assert.equal(
          by("Radio on driving HUD").getAttribute("aria-checked"),
          "false",
        );
        await act(async () => prefs.getState().setHudGroup("display", true));
        assert.ok(document.querySelector('[data-hud-group="display"]'));
        assert.equal(
          by("Radio on driving HUD").getAttribute("aria-checked"),
          "true",
        );
        await act(async () => ui.getState().setCockpitTab("ignition"));
        await click("Ignition on driving HUD");
        assert.equal(
          document.querySelector('[data-hud-group="ignition"]'),
          null,
        );
        assert.ok(
          document.querySelector(".cockpit-ignition-page .ignition-system"),
        );
        await act(async () =>
          prefs.getState().update({ ignitionVisibility: "hidden" }),
        );
        await click("Ignition on driving HUD");
        assert.equal(prefs.getState().ignitionVisibility, "auto");
        assert.ok(document.querySelector('[data-hud-group="ignition"]'));
        await click("Ignition on driving HUD");
        assert.equal(
          JSON.parse(localStorage.getItem("avenlab-preferences-v1")).state
            .hudGroups.ignition,
          false,
        );
        assert.equal(
          sanitizePreferences({ ignitionVisibility: "hidden" }).hudGroups
            .ignition,
          false,
        );
        assert.deepEqual(input.getState().input, before);
        await act(async () => radio.setState({ playing: false }));
      },
    );
    await t.test(
      "brightness accepts native pointer input, keeps HUD visibility and does not notify unrelated preference selectors",
      async () => {
        const { CockpitPanel } = await load("ui/Cockpit/CockpitPanel.tsx");
        await act(async () => ui.getState().openCockpit("brightness"));
        await render(h(CockpitPanel));
        const slider = by("Dashboard brightness");
        for (const type of ["pointerdown", "mousedown"]) {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.assign(event, { button: 0, pointerId: 81 });
          await act(async () => slider.dispatchEvent(event));
          assert.equal(
            event.defaultPrevented,
            false,
            "native range owns pointer defaults",
          );
        }
        const before = prefs.getState(),
          commands = { ...input.getState().input };
        let groupNotifications = 0;
        const unsubscribe = prefs.subscribe((state, previous) => {
          if (state.hudGroups !== previous.hudGroups) groupNotifications++;
        });
        try {
          for (let percent = 10; percent <= 100; percent += 5)
            await act(async () =>
              prefs.getState().update({ dashboardBrightness: percent / 100 }),
            );
          assert.equal(groupNotifications, 0);
          for (const key of ["hudGroups", "bindings", "favoriteVehicles"])
            assert.equal(prefs.getState()[key], before[key]);
          await click("Dashboard on driving HUD");
          assert.equal(prefs.getState().hudGroups.gauges, false);
          await act(async () => {
            fresh();
            prefs.getState().update({ dashboardBrightness: 0.55 });
          });
          assert.equal(
            prefs.getState().hudGroups.gauges,
            false,
            "brightness preserves an explicitly hidden HUD",
          );
          assert.equal(
            document.querySelector(".dashboard-cluster").style.filter,
            "brightness(0.55)",
          );
          assert.deepEqual(input.getState().input, commands);
        } finally {
          unsubscribe();
        }
      },
    );
    await t.test(
      "twenty unrelated gear, HVAC, parking and traction updates cause zero ignition commits",
      async () => {
        const { IgnitionSwitch } = await load("ui/Cockpit/IgnitionSwitch.tsx");
        const original = { ...entity };
        let commits = 0;
        await render(
          h(
            Profiler,
            { id: "ignition", onRender: () => commits++ },
            h(IgnitionSwitch),
          ),
        );
        commits = 0;
        try {
          for (let i = 0; i < 20; i++)
            await act(async () => {
              entity.gear = 1 + (i % 5);
              entity.cabin_mask ^= 64;
              entity.cockpit_mask ^= 1 << 20;
              entity.parking_brake = i / 20;
              entity.vehicle_mask ^= 32;
              input
                .getState()
                .setInput({
                  cockpit_mask: entity.cockpit_mask,
                  parking_brake: i / 20,
                });
              fresh();
            });
          assert.equal(commits, 0);
          await act(async () => {
            entity.cabin_mask ^= 1 << 10;
            fresh();
          });
          assert.ok(commits > 0, "key detents still render confirmed changes");
          console.log(
            "Ignition profile: 20 unrelated updates, 0 additional commits.",
          );
        } finally {
          delete entity.parking_brake;
          Object.assign(entity, original);
        }
      },
    );
    await t.test(
      "three assist switches are the default and saved visibility/layout never changes vehicle functions",
      async () => {
        const { AssistPreferences } = await load("ui/Cockpit/DriveAssists.tsx"),
          { DrivingHUD } = await load("ui/DrivingHUD.tsx");
        await render(h("div", null, h(AssistPreferences), h(DrivingHUD)));
        const count = () =>
          document.querySelectorAll(".hud-assists .drive-assists > button")
            .length;
        const before = input.getState().input.vehicleMask;
        assert.equal(prefs.getState().assistHudLayout, "three");
        assert.equal(count(), 3);
        await text("EXPANDED BANK");
        assert.equal(count(), 5);
        await click("Traction controls on driving HUD");
        assert.equal(count(), 0);
        await click("Traction controls on driving HUD");
        assert.equal(count(), 5);
        await text("3 SWITCHES");
        assert.equal(count(), 3);
        assert.equal(input.getState().input.vehicleMask, before);
        assert.equal(
          sanitizePreferences({ assistHudLayout: "invalid" }).assistHudLayout,
          "three",
        );
      },
    );
    await t.test(
      "precise pressure is bounded and preserves gear/assists through unrelated commands",
      async () => {
        await act(async () => input.getState().setParkingBrake(2 / 3));
        assert.equal(input.getState().input.parking_brake, 0.667);
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).parkingStrength,
          2,
        );
        await act(async () => input.getState().setAssist(1, true));
        assert.equal(input.getState().input.parking_brake, 0.667);
        await act(async () => input.getState().setParkingBrake(NaN));
        assert.equal(input.getState().input.parking_brake, 0.667);
        await act(async () => input.getState().setParkingBrake(9));
        assert.equal(input.getState().input.parking_brake, 1);
        await act(async () => input.getState().setParkingBrake(-9));
        assert.equal(input.getState().input.parking_brake, 0);
      },
    );
    await t.test(
      "a held signal advances across neutral and the complete assembly rotates while supporting two clicks",
      async () => {
        const { ColumnStalks } = await load("ui/Cockpit/ColumnStalks.tsx"),
          { requestTurnSignal } = await load("ui/Cockpit/stalks/index.ts");
        await render(h(ColumnStalks));
        await act(async () => requestTurnSignal(-1));
        const button = by("Lights and turn signal stalk up"),
          assembly = button.closest(".stalk-actuator"),
          position = assembly.style.transform;
        const targets = [...assembly.querySelectorAll("button")];
        assert.equal(targets.length, 3);
        await point("pointerdown", "Lights and turn signal stalk up");
        assert.equal(input.getState().input.vehicleMask & 12, 0);
        await act(
          async () => new Promise((resolve) => setTimeout(resolve, 370)),
        );
        assert.equal(input.getState().input.vehicleMask & 12, 8);
        assert.notEqual(assembly.style.transform, position);
        assert.equal(assembly.style.transform, "rotate(7deg)");
        assert.ok(
          targets.every(
            (target) => target.closest(".stalk-actuator") === assembly,
          ),
        );
        await point("pointerup", "Lights and turn signal stalk up");
        // Browsers dispatch a click after pointerup; it must not apply a third step.
        await click("Lights and turn signal stalk up");
        assert.equal(input.getState().input.vehicleMask & 12, 8);
        await click("Lights and turn signal stalk down");
        assert.equal(input.getState().input.vehicleMask & 12, 0);
        await click("Lights and turn signal stalk down");
        assert.equal(input.getState().input.vehicleMask & 12, 4);
        assert.equal(document.querySelector('[data-hud-held="true"]'), null);
      },
    );
    await t.test(
      "optional crystals and both parking appearances never change brake or gear requests",
      async () => {
        const { DriveControls } = await load("ui/Cockpit/DriveControls.tsx");
        await render(h(DriveControls));
        assert.equal(document.querySelectorAll(".parking-crystal").length, 0);
        assert.equal(
          document.querySelectorAll(".parking-detent-value").length,
          0,
        );
        assert.equal(
          document.querySelector(".mechanical-handbrake").textContent.trim(),
          "",
        );
        await act(async () => input.getState().setParkingBrake(2 / 3));
        const request = input.getState().input.cockpit_mask;
        await click("Parking brake crystals");
        assert.equal(document.querySelectorAll(".parking-crystal").length, 3);
        assert.equal(input.getState().input.cockpit_mask, request);
        await text("SIMPLE BUTTON");
        assert.equal(
          document.querySelector(".mechanical-handbrake").dataset.parkingStyle,
          "button",
        );
        assert.equal(input.getState().input.cockpit_mask, request);
        await text("REALISTIC LEVER");
        await click("Parking brake crystals");
        assert.equal(document.querySelectorAll(".parking-crystal").length, 0);
        assert.equal(
          unpackCockpit(input.getState().input.cockpit_mask).parkingStrength,
          2,
        );
      },
    );
    await t.test(
      "a quick tap releases cable pressure, hiding retains it, and another device keeps its momentary brake",
      async () => {
        const { DrivingHUD } = await load("ui/DrivingHUD.tsx");
        await render(h(DrivingHUD));
        await act(async () => {
          input.getState().setAnalogFromSource("keyboard", { handbrake: 0.4 });
          input.getState().setParkingBrake(0.37);
        });
        // Dispatch a quick contact together: waiting for React between these
        // events can turn a tap into a real hold on a busy test machine.
        await point(["pointerdown", "pointerup"], "Parking brake");
        assert.equal(input.getState().input.handbrake, 0.4);
        assert.equal(input.getState().input.parking_brake, 0);
        await act(async () => input.getState().setParkingBrake(0.37));
        const partial = input.getState().input.parking_brake;
        await point("pointerdown", "Parking brake");
        await act(async () => prefs.getState().setHudGroup("parking", false));
        assert.equal(input.getState().input.handbrake, 0.4);
        assert.equal(input.getState().input.parking_brake, partial);
        await act(async () => input.getState().releaseInputSource("keyboard"));
        assert.equal(input.getState().input.handbrake, 0);
        assert.equal(input.getState().input.parking_brake, partial);
      },
    );
    await t.test(
      "pedal contact releases independently of merged input, focus, cancellation and pause",
      async () => {
        const { default: Pedals } = await load("ui/Pedals.tsx");
        await render(h(Pedals));
        for (const label of ["Reverse", "Brake", "Accelerate"]) {
          for (const end of [
            "pointerup",
            "pointercancel",
            "lostpointercapture",
          ]) {
            await point("pointerdown", label);
            assert.equal(by(label).dataset.hudHeld, "true");
            assert.equal(by(label).getAttribute("aria-pressed"), "true");
            await point(end, label);
            assert.equal(by(label).hasAttribute("data-hud-held"), false);
            assert.equal(by(label).getAttribute("aria-pressed"), "false");
          }
        }
        await act(async () =>
          input.getState().setAnalogFromSource("keyboard", { throttle: 0.5 }),
        );
        await point("pointerdown", "Accelerate");
        await point("pointerup", "Accelerate");
        assert.equal(input.getState().input.throttle, 0.5);
        assert.equal(by("Accelerate").getAttribute("aria-pressed"), "true");
        assert.equal(by("Accelerate").hasAttribute("data-hud-held"), false);
        await act(async () => by("Accelerate").focus());
        assert.equal(by("Accelerate").hasAttribute("data-hud-held"), false);
        await point("pointerdown", "Brake");
        await act(async () => ui.getState().openPause());
        assert.equal(document.querySelector('[data-hud-held="true"]'), null);
        assert.equal(
          input.getState().input.brake,
          1,
          "pause owns its safety brake",
        );
        await act(async () => ui.getState().closeOverlay());
        assert.equal(input.getState().input.brake, 0);
      },
    );
    await t.test(
      "vertical indicators are exclusive; cruise attaches on the right; header has no hazard button",
      async () => {
        const { CockpitPanel } = await load("ui/Cockpit/CockpitPanel.tsx");
        await act(async () =>
          ui.setState({ overlay: "cockpit", cockpitTab: "lights" }),
        );
        await render(h(CockpitPanel));
        assert.equal(
          document.querySelector('.cockpit-header [aria-label="Hazards"]'),
          null,
        );
        assert.equal(by("Right indicator").textContent.trim(), "▲");
        assert.equal(by("Left indicator").textContent.trim(), "▼");
        await click("Right indicator");
        await click("Left indicator");
        assert.equal(input.getState().input.vehicleMask & 4, 4);
        assert.equal(input.getState().input.vehicleMask & 8, 0);
        await act(async () => ui.getState().setCockpitTab("cruise"));
        assert.ok(parseFloat(by("Select cruise stalk").style.left) > 50);
        await act(async () => ui.getState().setCockpitTab("climate"));
        assert.ok(document.querySelector(".cockpit-climate-page"));
      },
    );
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [k, v] of old) {
      if (v) Object.defineProperty(globalThis, k, v);
      else delete globalThis[k];
    }
  }
});
