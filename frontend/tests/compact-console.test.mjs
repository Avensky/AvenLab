import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";

test("compact cockpit, GPS and inspection preserve authoritative state", async (t) => {
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
    const load = (path) => server.ssrLoadModule("/src/" + path);
    const { useNetworkStore: network } = await load(
        "store/session/networkStore.ts",
      ),
      { useVehicleConfigStore: config } = await load(
        "store/session/vehicleConfigStore.ts",
      );
    const { updateVehicleTelemetry } = await load(
        "store/telemetry/vehicleTelemetryStore.ts",
      ),
      { useInputStore: input } = await load("store/input/inputStore.ts");
    const { usePreferencesStore: prefs, DEFAULT_HUD_GROUPS } = await load(
        "store/preferences/preferencesStore.ts",
      ),
      { useUIStore: ui } = await load("store/menus/uiStore.ts");
    const { useWorldStore: world } = await load("store/world/worldStore.ts"),
      { useGameStore: game } = await load("store/presentation/gameStore.ts");
    network.getState().setConnected(true);
    network.getState().setPlayerId("me");
    config.getState().receive("me", {
      max_speed: 70,
      hud: {
        cockpit_controls: true,
        cockpit_version: 5,
        ambient_temp_c: 25,
        telemetry_mask: 127,
        cluster_fields: 8191,
      },
    });
    const entity = {
      id: "me",
      vehicle_id: "brz",
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      speed: 0,
      rpm: 850,
      gear: 6,
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
        .setSnapshot({ tick: ++tick, entities: [entity] }, performance.now());
      updateVehicleTelemetry();
    };
    fresh();
    ui.setState({ screen: "sandbox", overlay: null, isModeLoading: false });
    root = createRoot(document.getElementById("root"));
    const render = async (component) => {
      await act(async () => root.render(null));
      await act(async () => {
        fresh();
        root.render(component);
      });
    };
    const by = (label) => document.querySelector(`[aria-label="${label}"]`),
      click = async (label) => act(async () => by(label).click());
    await t.test(
      "NOS ends at 7.5 and ultimate mirrors the condition arc",
      async () => {
        const { ResourceRing } = await load("ui/Dashboard/ResourceRings.tsx");
        await render(h(ResourceRing, { kind: "rpm", fraction: 1 }));
        const d = document
            .querySelector(".resource-ring-track")
            .getAttribute("d"),
          end = d.trim().split(/\s+/).slice(-2).map(Number);
        const angle = 135 + (7.5 / 9) * (355 - 135);
        assert.ok(
          Math.abs(end[0] - (100 + 103 * Math.cos((angle * Math.PI) / 180))) <
            0.001,
        );
        assert.ok(
          Math.abs(end[1] - (100 + 103 * Math.sin((angle * Math.PI) / 180))) <
            0.001,
        );
        await render(h(ResourceRing, { kind: "speed", fraction: 0.8 }));
        const condition = document.querySelector("path").getAttribute("d");
        await render(h(ResourceRing, { kind: "hero", fraction: 1 }));
        assert.equal(
          document.querySelector("path").getAttribute("d"),
          condition,
        );
        assert.equal(
          document.querySelector("path").getAttribute("transform"),
          "translate(200 0) scale(-1 1)",
        );
        assert.equal(
          document.querySelector("[data-ready]").dataset.ready,
          "true",
        );
      },
    );
    await t.test(
      "extended climate bits round-trip without granting ignition or snapshot flags",
      async () => {
        const { reviseCabin, unpackCabin } = await load(
          "store/input/protocol/cabinMasks.ts",
        );
        const prior = 4 | 4096 | (2 << 10) | 0xc000;
        const packed = reviseCabin(prior, {
          airflow: 4,
          fan: 4,
          temperatureC: 30,
        });
        assert.equal(packed & 0xe000, 0);
        assert.ok(packed & (1 << 19));
        assert.equal(unpackCabin(packed).fan, 4);
        assert.equal(unpackCabin(packed).airflow, 4);
        assert.equal(unpackCabin(packed).ignition, 2);
        input.getState().setInput({ cabin_mask: packed });
        input.getState().setInput({ cabin_mask: packed | 0x4000 });
        assert.equal(input.getState().input.cabin_mask, packed);
        assert.equal(
          unpackCabin(reviseCabin(packed, { fan: 2, airflow: 99 })).fan,
          2,
        );
        assert.equal(
          unpackCabin(reviseCabin(packed, { airflow: 99 })).airflow,
          4,
        );
      },
    );
    await t.test(
      "default console has no close bars; climate knobs use a saved size without local arrows",
      async () => {
        const { DrivingHUD } = await load("ui/DrivingHUD.tsx");
        prefs.getState().update({
          hudGroups: { ...DEFAULT_HUD_GROUPS },
          showDriveControls: true,
          showTouchControls: true,
          researchHud: true,
        });
        await render(h(DrivingHUD));
        assert.equal(
          document.querySelector(
            ".hud-group-bar,.hud-group-header,.drive-dock-header",
          ),
          null,
        );
        assert.equal(
          [...document.querySelectorAll("button")].filter((b) =>
            (b.getAttribute("aria-label") ?? "").startsWith("Hide "),
          ).length,
          0,
        );
        assert.ok(by("Ignition key"));
        assert.equal(
          document.querySelectorAll("[data-key-position]").length,
          4,
        );
        assert.equal(by("Ambient temperature").textContent, "77°F");
        assert.equal(document.querySelector(".climate-three-knobs"), null);
        await act(async () =>
          prefs.getState().update({ climateHudSize: "full" }),
        );
        assert.ok(document.querySelector(".climate-three-knobs"));
        assert.ok(document.querySelector(".console-display-tabs"));
        const dock = document.querySelector(".drive-dock");
        assert.ok(
          dock
            .querySelector(".console-foot-controls")
            ?.contains(document.querySelector(".pedal-hud")),
        );
        assert.equal(
          document
            .querySelector(".mechanical-shifter")
            .closest(".transmission-console"),
          document
            .querySelector(".mechanical-handbrake")
            .closest(".transmission-console"),
        );
        assert.equal(by("Expand climate"), null);
        assert.equal(
          document.querySelectorAll(".climate-three-knobs .climate-knob")
            .length,
          3,
        );
        assert.match(by("TEMP").getAttribute("aria-valuetext"), /°F$/);
        await act(async () =>
          prefs.getState().update({ climateHudSize: "full" }),
        );
        assert.equal(
          document.querySelector(".climate-panel").dataset.size,
          "full",
        );
        assert.ok(by("Minimize climate controls"));
        assert.ok(by("Minimize radio"));
        assert.equal(
          [...document.querySelectorAll(".console-display-tabs button")].some(
            (b) => b.textContent === "KEYBINDS",
          ),
          false,
        );
        assert.ok(
          [...document.querySelectorAll(".console-display-tabs button")].some(
            (b) => b.textContent === "MISSIONS",
          ),
        );
        assert.equal(ui.getState().overlay, null);
      },
    );
    const box = (id, x, z, hx, hz, kind = "road") => ({
      id,
      center: [x, 0, z],
      half_extents: [hx, 1, hz],
      kind,
      visual: "",
    });
    await t.test(
      "GPS follows intersecting roads, rejects disconnected routes and bounds malformed data",
      async () => {
        const { buildRoadGraph, nearestRoad, roadRoute, pathDistance } =
          await load("navigation/roadNavigation.ts");
        const graph = buildRoadGraph([
          box("a", 0, 0, 100, 5),
          box("b", 80, 80, 5, 100),
          box("d", 1000, 1000, 5, 50),
          box("duplicate", 0, 0, 100, 5),
          box("building", 0, 0, 9, 9, "building"),
          box("bad", NaN, 0, 4, 4),
        ]);
        assert.equal(graph.roads.length, 3);
        assert.deepEqual(roadRoute(graph, 0, 1), [{ x: 80, z: 0 }]);
        assert.equal(roadRoute(graph, 0, 2), null);
        assert.equal(roadRoute(graph, -1, 1), null);
        assert.deepEqual(nearestRoad(graph, { x: 4, z: 2 }).point, {
          x: 4,
          z: 0,
        });
        assert.equal(
          pathDistance([
            { x: 0, z: 0 },
            { x: 80, z: 0 },
            { x: 80, z: 80 },
          ]),
          160,
        );
        assert.equal(
          buildRoadGraph(
            Array.from({ length: 1100 }, (_, i) =>
              box(String(i), i * 30, 0, 5, 5),
            ),
          ).roads.length,
          1024,
        );
      },
    );
    await t.test(
      "minimap creates a GPS route using existing position telemetry",
      async () => {
        const { Minimap } = await load("ui/Minimap/Minimap.tsx"),
          { useNavigationStore: nav } = await load(
            "store/world/navigationStore.ts",
          );
        world.getState().setMap({
          schema_version: 1,
          map_id: "test",
          coordinate_system: {
            units: "meters",
            up_axis: "Y",
            forward_axis: "+Z",
          },
          cell: [200, 200],
          surface: { road_y: 0 },
          layout: { kind: "fixed_grid", origin: [0, 0], size: [1, 1] },
          visuals: [],
          chunks: [],
          collider_chunks: [
            {
              x: 0,
              z: 0,
              boxes: [box("a", 0, 0, 5, 300), box("b", 80, 150, 100, 5)],
            },
          ],
        });
        await render(h(Minimap));
        assert.equal(document.querySelector(".gps-map"), null);
        await click("Open map");
        assert.equal(document.querySelectorAll(".gps-map rect").length, 2);
        // Map pose is intentionally sampled at 10 Hz. Allow its first tick after
        // mounting, rather than racing a previously stale/null map projection.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 110));
          fresh();
        });
        await click("GPS destination ahead");
        assert.ok(nav.getState().destination);
        assert.ok(document.querySelector(".gps-map polyline"));
        assert.notEqual(
          document.querySelector(".gps-status").textContent,
          "NO ROUTE",
        );
        await click("Clear GPS destination");
        assert.equal(nav.getState().destination, null);
        await click("Minimize map");
        assert.equal(document.querySelector(".gps-map"), null);
      },
    );
    await t.test(
      "circular HUD map uses its rim controls and rejects clicks outside the circle",
      async () => {
        const { Minimap } = await load("ui/Minimap/Minimap.tsx"),
          { useNavigationStore: nav } = await load(
            "store/world/navigationStore.ts",
          );
        await render(h(Minimap));
        assert.equal(by("Open map").textContent, "");
        assert.ok(by("Open map").querySelector("svg"));
        await click("Open map");
        const map = document.querySelector(".gps-map"),
          bounds = map.getAttribute("viewBox").split(" ").map(Number);
        assert.equal(bounds[2], bounds[3]);
        assert.equal(map.parentElement.dataset.circular, "true");
        assert.equal(document.querySelector(".map-heading"), null);
        map.getBoundingClientRect = () => ({
          left: 20,
          top: 30,
          width: 180,
          height: 180,
        });
        await act(async () =>
          map.dispatchEvent(
            new dom.window.MouseEvent("click", {
              bubbles: true,
              clientX: 110,
              clientY: 165,
            }),
          ),
        );
        assert.deepEqual(nav.getState().destination, { x: 0, z: 150 });
        await click("Clear GPS destination");
        await act(async () =>
          map.dispatchEvent(
            new dom.window.MouseEvent("click", {
              bubbles: true,
              clientX: 20,
              clientY: 30,
            }),
          ),
        );
        assert.equal(
          nav.getState().destination,
          null,
          "transparent corners are not part of the map",
        );
        await click("Map zoom in");
        assert.equal(
          document
            .querySelector(".gps-map")
            .getAttribute("viewBox")
            .split(" ")[2],
          "300",
        );
        await click("Map zoom out");
        await click("Minimize map");
        assert.equal(document.querySelector(".gps-map"), null);
        await click("Open map");
        assert.ok(by("GPS destination ahead"));
        await render(h(Minimap, { forceExpanded: true }));
        const full = document
          .querySelector(".gps-map")
          .getAttribute("viewBox")
          .split(" ")
          .map(Number);
        assert.equal(full[2], full[3]);
        assert.equal(document.querySelector(".map-toggle"), null);
      },
    );
    await t.test(
      "automatic H animation goes directly through neutral without sending fake shifts",
      async () => {
        const { GearSelector } = await load(
          "ui/Cockpit/MechanicalControls.tsx",
        );
        prefs.getState().update({ reducedMotion: false });
        await render(
          h(GearSelector, {
            automatic: false,
            gear: 6,
            disabled: false,
            pending: false,
          }),
        );
        const gate = document.querySelector(".shift-gate"),
          knob = by("Drag gear stick");
        gate.getBoundingClientRect = () => ({ width: 100, height: 100 });
        let frames;
        knob.animate = (keyframes, options) => {
          frames = keyframes;
          assert.equal(options.duration, 260);
          return { cancel() {} };
        };
        const before = input.getState().input.cockpit_mask;
        await act(async () =>
          root.render(
            h(GearSelector, {
              automatic: false,
              gear: 1,
              disabled: false,
              pending: false,
            }),
          ),
        );
        assert.equal(frames.length, 4);
        assert.match(frames[1].transform, /50px, 26px/);
        assert.match(frames[2].transform, /0px, 26px/);
        assert.equal(knob.style.left, "36%");
        assert.equal(input.getState().input.cockpit_mask, before);
      },
    );
    await t.test(
      "driving views cycle without gallery and bird view stays world aligned",
      async () => {
        const { nextDrivingView, specialCameraPreset } = await load(
            "utils/drivingViews.ts",
          ),
          { VehicleCameraFollower } = await load("utils/cameraFollow.ts");
        assert.equal(nextDrivingView("DEFAULT"), "FIRST_PERSON");
        assert.equal(nextDrivingView("FIRST_PERSON"), "BIRDS_EYE");
        assert.equal(nextDrivingView("BIRDS_EYE"), "DEFAULT");
        const preset = specialCameraPreset("BIRDS_EYE", "brz"),
          f = new VehicleCameraFollower();
        f.update(
          {
            position: [10, 2, 20],
            rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
          },
          preset.offset,
          preset.targetOffset,
          0,
          0,
          7,
          10,
          1 / 60,
          preset.worldAligned,
        );
        assert.ok(f.position.distanceTo({ x: 10, y: 38, z: 19.99 }) < 0.001);
        assert.equal(
          specialCameraPreset("FIRST_PERSON", "tank").worldAligned,
          false,
        );
      },
    );
    await t.test(
      "inspection releases input and restores diagnostic preferences on exit",
      async () => {
        const { enterInspection, leaveInspection } = await load(
            "store/presentation/inspectionActions.ts",
          ),
          { canDrive } = await load("controls/inputRouting.ts");
        game.getState().setEditor(false);
        world.setState({ debugEnabled: false, debugMask: 32, mode: "glb" });
        input
          .getState()
          .setAnalogFromSource("keyboard", { throttle: 1, steer: 0.5 });
        ui.setState({ overlay: null });
        await act(async () => enterInspection("collider"));
        assert.equal(input.getState().input.throttle, 0);
        assert.equal(game.getState().editor, true);
        assert.equal(canDrive(), false);
        assert.equal(world.getState().mode, "hybrid");
        await act(async () => enterInspection("handling"));
        await act(async () => leaveInspection());
        assert.equal(world.getState().debugMask, 32);
        assert.equal(world.getState().debugEnabled, false);
        assert.equal(world.getState().mode, "glb");
        assert.equal(game.getState().editor, false);
        await act(async () => enterInspection());
        await act(async () => ui.setState({ screen: "main" }));
        assert.equal(game.getState().editor, false);
        assert.equal(
          world.getState().debugMask,
          32,
          "leaving a session cannot strand the next game in the inspector",
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
