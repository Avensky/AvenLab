import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";

test("instrument scales, confirmed warning lamps and display power states", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const previous = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    localStorage: dom.window.localStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
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
    const load = (path) => server.ssrLoadModule(`/src/${path}`);
    const geometry = await load("ui/Dashboard/gaugeGeometry.ts");
    const {
      MPH_TICKS,
      KPH_TICKS,
      MPH_TO_KPH,
      SPEED_START,
      SPEED_SWEEP,
      speedAngle,
    } = geometry;
    await t.test(
      "every 20 MPH interval has exactly four identical five-MPH divisions, including zero to twenty",
      () => {
        assert.equal(MPH_TICKS.length, 33);
        assert.deepEqual(
          MPH_TICKS.filter((t) => t.major).map((t) => t.value),
          [0, 20, 40, 60, 80, 100, 120, 140, 160],
        );
        for (let group = 0; group < 8; group++)
          assert.equal(
            MPH_TICKS.filter(
              (t) => t.value > group * 20 && t.value <= (group + 1) * 20,
            ).length,
            4,
          );
        const step = MPH_TICKS[1].angle - MPH_TICKS[0].angle;
        for (let i = 1; i < MPH_TICKS.length; i++)
          assert.ok(
            Math.abs(MPH_TICKS[i].angle - MPH_TICKS[i - 1].angle - step) <
              1e-12,
          );
      },
    );
    await t.test(
      "km/h is a rebuilt open zero-to-260 arc with uniform five-km/h ticks and no duplicate endpoints",
      () => {
        assert.equal(KPH_TICKS.length, 53);
        assert.deepEqual(
          KPH_TICKS.filter((t) => t.major).map((t) => t.value),
          Array.from({ length: 14 }, (_, i) => i * 20),
        );
        const step = KPH_TICKS[1].angle - KPH_TICKS[0].angle;
        for (let i = 1; i < KPH_TICKS.length; i++)
          assert.ok(
            Math.abs(KPH_TICKS[i].angle - KPH_TICKS[i - 1].angle - step) <
              1e-12,
          );
        assert.equal(KPH_TICKS[0].angle, SPEED_START);
        assert.ok(
          Math.abs(KPH_TICKS.at(-1).angle - SPEED_START - SPEED_SWEEP) < 1e-12,
        );
        assert.ok(SPEED_SWEEP < 2 * Math.PI);
        assert.ok(SPEED_SWEEP <= (4 * Math.PI) / 3);
        assert.equal(
          new Set(KPH_TICKS.map((t) => t.value)).size,
          KPH_TICKS.length,
        );
      },
    );
    await t.test(
      "both scales refer to the same needle speed rather than treating 160 MPH as exactly 260 km/h",
      () => {
        for (const tick of MPH_TICKS)
          assert.ok(
            Math.abs(tick.angle - speedAngle(tick.value * MPH_TO_KPH)) < 1e-12,
          );
        assert.ok(MPH_TICKS.at(-1).angle < KPH_TICKS.at(-1).angle);
        assert.ok(Math.abs(160 * MPH_TO_KPH - 257.49504) < 1e-9);
      },
    );
    const { displayPower } = await load("ui/Dashboard/dashboardModel.ts");
    await t.test(
      "cranking is driven by confirmed start telemetry, with no stale or offline amber displays",
      () => {
        assert.equal(
          displayPower({ signal: "live", engineOn: false, resourceMask: 0 }),
          "off",
        );
        assert.equal(
          displayPower({ signal: "live", engineOn: false, resourceMask: 1 }),
          "cranking",
        );
        assert.equal(
          displayPower({ signal: "live", engineOn: true, resourceMask: 0 }),
          "running",
        );
        assert.equal(
          displayPower({
            signal: "live",
            engineOn: false,
            resourceMask: 0,
            cabinMask: 16384 | (2 << 10),
          }),
          "on",
        );
        assert.equal(
          displayPower({
            signal: "live",
            engineOn: false,
            resourceMask: 0,
            cabinMask: 16384 | (1 << 10),
          }),
          "off",
        );
        for (const signal of ["waiting", "offline", "stale"])
          assert.equal(
            displayPower({ signal, engineOn: true, resourceMask: 1 }),
            "unavailable",
          );
      },
    );
    const { useNetworkStore: network } = await load(
      "store/session/networkStore.ts",
    );
    const { useVehicleConfigStore: configs, parseGaugeConfig } = await load(
      "store/session/vehicleConfigStore.ts",
    );
    const {
      useVehicleTelemetryStore: telemetry,
      updateVehicleTelemetry,
      projectVehicleTelemetry,
    } = await load("store/telemetry/vehicleTelemetryStore.ts");
    const { ClusterFlags } = await load("store/telemetry/clusterMasks.ts");
    const { default: Dashboard } = await load("ui/Dashboard/Dashboard.tsx");
    const { useInputStore: inputs } = await load("store/input/inputStore.ts");
    const base = {
      id: "me",
      vehicle_id: "brz",
      speed: 0,
      rpm: 0,
      gear: 0,
      fuel: 25,
      temp: 85,
      condition: 1,
      boost_fraction: 1,
      vehicle_mask: 97,
      player_mask: 0,
      resource_mask: 0,
    };
    const calibrated = {
      max_speed: 80,
      hud: {
        telemetry_mask: 63,
        cockpit_controls: true,
        cluster_fields: 8191,
        max_rpm: 9000,
        redline_rpm: 7500,
        fuel_capacity_liters: 50,
        min_temp_c: 40,
        overheat_c: 110,
        critical_c: 130,
      },
    };
    await t.test(
      "unsupported, invalid and stale warning data is unavailable instead of an invented fault",
      () => {
        const config = parseGaugeConfig(calibrated);
        for (const cluster_mask of [undefined, -1, 1.25, NaN, Infinity, 65536])
          assert.equal(
            projectVehicleTelemetry(
              { ...base, cluster_mask },
              true,
              1000,
              1001,
              config,
            ).clusterMask,
            null,
          );
        assert.equal(
          projectVehicleTelemetry(
            { ...base, cluster_mask: 0 },
            true,
            1000,
            1001,
            config,
          ).clusterMask,
          0,
        );
        assert.equal(
          projectVehicleTelemetry(
            { ...base, cluster_mask: 65535 },
            true,
            1000,
            1501,
            config,
          ).clusterMask,
          null,
        );
      },
    );
    network.getState().setConnected(true);
    network.getState().setPlayerId("me");
    configs.getState().receive("me", calibrated);
    let tick = 0;
    const publish = async (overrides) =>
      act(async () => {
        network
          .getState()
          .setSnapshot(
            { tick: ++tick, entities: [{ ...base, ...overrides }] },
            performance.now(),
          );
        updateVehicleTelemetry();
      });
    await publish({});
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(h(Dashboard)));
    const displays = () => document.querySelector(".gauge-displays");
    await t.test(
      "RPM has the lowered label and a wider lower gear display in place of the odometer",
      () => {
        assert.equal(
          document.querySelector(".gauge-rpm-unit").textContent,
          "RPMx1000",
        );
        const gear = document.querySelector('[data-readout="gear"] rect'),
          speed = document.querySelector('[data-readout="speed"] rect');
        assert.ok(
          +gear.getAttribute("y") >
            +speed.getAttribute("y") + +speed.getAttribute("height"),
        );
        assert.ok(+gear.getAttribute("width") > +speed.getAttribute("width"));
        assert.equal(
          document.querySelector(
            '.dashboard-speed [aria-label="Vehicle condition"]',
          ) !== null,
          true,
        );
        assert.equal(
          document.querySelector(".dashboard-heading button"),
          null,
          "assists are in Drive, not on the instruments",
        );
      },
    );
    await t.test(
      "the DOM contains the exact mathematical scale and a two-door icon following the adjacent RPM rim",
      () => {
        assert.equal(
          document.querySelectorAll('[data-scale="mph"] [data-tick]').length,
          33,
        );
        assert.equal(
          document.querySelectorAll('[data-scale="kmh"] [data-tick]').length,
          53,
        );
        assert.equal(
          document.querySelector('[data-scale="kmh"] circle'),
          null,
          "no complete kilometer circle",
        );
        const door = document.querySelector('[data-lamp="Two-door open"]');
        assert.match(
          door.style.getPropertyValue("--lamp-icon"),
          /door-open-coupe\.svg/,
        );
        for (const lamp of document.querySelectorAll(
          ".speedometer-lights .instrument-lamp",
        ))
          assert.ok(
            parseFloat(lamp.style.left) > 75,
            "lamps follow the neighboring RPM rim, away from the speed hub",
          );
      },
    );
    await t.test(
      "only confirmed engine power illuminates displays, and crank/running/off transitions are reversible",
      async () => {
        assert.equal(displays().dataset.power, "running");
        assert.equal(
          document.querySelector('[data-readout="gear"] text:last-child')
            .textContent,
          "N",
        );
        await publish({ vehicle_mask: 96 });
        assert.equal(displays().dataset.power, "off");
        assert.equal(
          document.querySelector(".gauge-lcd-illumination").textContent,
          "",
        );
        await act(async () => inputs.getState().setInput({ vehicleMask: 97 }));
        assert.equal(
          displays().dataset.power,
          "off",
          "a requested engine bit does not confirm a running engine",
        );
        await publish({ vehicle_mask: 96, resource_mask: 1 });
        assert.equal(displays().dataset.power, "cranking");
        await publish({
          vehicle_mask: 97,
          resource_mask: 0,
          gear: 2,
          speed: 10,
        });
        assert.equal(displays().dataset.power, "running");
        assert.equal(
          document.querySelector('[data-readout="gear"] text:last-child')
            .textContent,
          "2",
        );
        await act(async () => network.getState().setConnected(false));
        await act(async () => updateVehicleTelemetry());
        assert.equal(displays().dataset.power, "unavailable");
        assert.equal(
          document.querySelector(".gauge-lcd-illumination").textContent,
          "",
        );
        network.getState().setConnected(true);
        network.getState().setPlayerId("me");
        configs.getState().receive("me", calibrated);
      },
    );
    await t.test(
      "confirmed lamp bits change indicators independently, without changing the input mask",
      async () => {
        const before = inputs.getState().input.vehicleMask;
        await publish({
          cluster_mask:
            ClusterFlags.DOOR_OPEN |
            ClusterFlags.TIRE_PRESSURE_LOW |
            ClusterFlags.HIGH_BEAM,
        });
        for (const name of ["Two-door open", "Low tire pressure", "High beam"])
          assert.equal(
            document.querySelector(`[data-lamp="${name}"]`).dataset.active,
            "true",
          );
        assert.equal(
          document.querySelector('[data-lamp="Cruise control"]').dataset.active,
          "false",
        );
        assert.equal(inputs.getState().input.vehicleMask, before);
        await publish({ cluster_mask: ClusterFlags.CRUISE_ON });
        assert.equal(
          document.querySelector('[data-lamp="Two-door open"]').dataset.active,
          "false",
        );
        assert.equal(
          document.querySelector('[data-lamp="Cruise control"]').dataset.active,
          "true",
        );
      },
    );
    await t.test(
      "engine-off needle parking does not overwrite fuel or coolant telemetry, and both hubs remain symmetric inside the rim",
      async () => {
        const fuel = () => document.querySelector('[aria-label="Fuel"]'),
          temp = () =>
            document.querySelector('[aria-label="Coolant temperature"]');
        await publish({
          vehicle_mask: 96,
          resource_mask: 0,
          fuel: 25,
          temp: 100,
        });
        assert.equal(fuel().getAttribute("aria-valuenow"), "25");
        assert.equal(temp().getAttribute("aria-valuenow"), "100");
        assert.ok(
          parseFloat(
            fuel()
              .querySelector(".gauge-needle")
              .style.transform.match(/rotate\(([^d]+)/)[1],
          ) > 0,
          "fuel parks below E",
        );
        assert.equal(
          temp().querySelector(".gauge-needle").style.transform,
          "rotate(45deg)",
        );
        const hubF = fuel().querySelector(".gauge-hub"),
          hubT = temp().querySelector(".gauge-hub");
        assert.equal(hubF.getAttribute("cx"), hubT.getAttribute("cx"));
        assert.equal(+hubF.getAttribute("cy") + +hubT.getAttribute("cy"), 200);
        assert.equal(
          200 - +hubF.getAttribute("cx"),
          +hubF.getAttribute("cy"),
          "fuel pivot has equal top/right inset",
        );
        await publish({ vehicle_mask: 97, fuel: 50, temp: 40 });
        assert.equal(
          fuel().querySelector(".gauge-needle").style.transform,
          "rotate(-90deg)",
        );
        assert.equal(
          temp().querySelector(".gauge-needle").style.transform,
          "rotate(90deg)",
        );
      },
    );
    await t.test(
      "ultimate charge requires advertised server damage telemetry and never falls back to NOS or own condition loss",
      async () => {
        const config = parseGaugeConfig(calibrated);
        const data = {
          ...base,
          condition: 0.2,
          boost_fraction: 0.72,
          ultimate_fraction: 0.37,
        };
        assert.equal(
          projectVehicleTelemetry(data, true, 1000, 1001, config)
            .ultimateFraction,
          null,
        );
        const capable = { ...config, telemetryMask: 127 };
        for (const value of [undefined, NaN, Infinity])
          assert.equal(
            projectVehicleTelemetry(
              { ...data, ultimate_fraction: value },
              true,
              1000,
              1001,
              capable,
            ).ultimateFraction,
            null,
          );
        configs
          .getState()
          .receive("me", {
            ...calibrated,
            hud: { ...calibrated.hud, telemetry_mask: 127 },
          });
        await publish(data);
        assert.equal(
          document
            .querySelector('[aria-label="Ultimate charge"]')
            .getAttribute("aria-valuenow"),
          "37",
        );
        assert.equal(
          document
            .querySelector(".resource-ring-hero .resource-ring-fill")
            .getAttribute("stroke-dashoffset"),
          "63",
        );
        assert.equal(
          document
            .querySelector('.dashboard-rpm [aria-label="NOS reserve"]')
            .getAttribute("aria-valuenow"),
          "72",
        );
        assert.equal(
          document
            .querySelector('.dashboard-speed [aria-label="Vehicle condition"]')
            .getAttribute("aria-valuenow"),
          "20",
        );
        assert.ok(
          document.querySelector(".fuel-temp-wrapper .resource-ring-hero"),
        );
        assert.match(
          document.querySelector(".gauge-lcd-clock").textContent,
          /\d{2}:\d{2}/,
        );
        await publish({ ...data, condition: 0.1 });
        assert.equal(
          document
            .querySelector('[aria-label="Ultimate charge"]')
            .getAttribute("aria-valuenow"),
          "37",
        );
        configs.getState().receive("me", calibrated);
      },
    );
    await t.test(
      "frequent speed/RPM updates never mutate or rebuild the static scale faces",
      async () => {
        let changes = 0;
        const observer = new dom.window.MutationObserver(
          (records) => (changes += records.length),
        );
        for (const selector of [
          ".speedometer-face",
          ".revolutions-face",
          ".fuel-face",
          ".temperature-face",
        ])
          observer.observe(document.querySelector(selector), {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true,
          });
        try {
          for (let i = 0; i < 20; i++)
            await publish({ speed: i, rpm: 1000 + i * 100 });
          await Promise.resolve();
          assert.equal(changes, 0);
          assert.equal(telemetry.getState().data.rpm, 2900);
        } finally {
          observer.disconnect();
        }
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
