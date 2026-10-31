import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";

test("alpha selection, queue and HUD route to their own state owners", async (t) => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const old = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
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
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  dom.window.HTMLElement.prototype.detachEvent = () => {};
  dom.window.HTMLMediaElement.prototype.play = async () => {};
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  const load = (p) => vite.ssrLoadModule("/src/" + p);
  const root = createRoot(document.getElementById("root"));
  const render = async (component) => {
    await act(async () => root.render(null));
    await act(async () => root.render(h(component)));
  };
  const click = async (label, role = "button") => {
    const node = [
      ...document.querySelectorAll(role === "tab" ? '[role="tab"]' : "button"),
    ].find(
      (n) =>
        n.getAttribute("aria-label") === label ||
        n.textContent.trim() === label,
    );
    assert.ok(node, label);
    await act(async () => node.click());
  };
  try {
    const { useUIStore: ui } = await load("store/menus/uiStore.ts");
    const { useAlphaStore: alpha } = await load("store/alpha/alphaStore.ts");
    const { useSocialStore: social } = await load(
      "store/social/socialStore.ts",
    );
    const { useNetworkStore: network } = await load(
      "store/session/networkStore.ts",
    );
    const client = await load("net/socialClient.ts");
    const { routeMenuAction: route, canDrive } = await load(
      "controls/inputRouting.ts",
    );
    const sent = [];
    const socket = {
      readyState: WebSocket.OPEN,
      send: (text) => sent.push(JSON.parse(text)),
    };
    client.setSocialConnection(socket);
    const view = {
      profile: { id: "me", name: "Driver" },
      players: [],
      teammates: [],
      requests: [],
      groups: [],
      worlds: [],
      world_invites: [],
      current_world_id: 1,
      maps: ["road_precision"],
      limits: {
        max_active_worlds: 3,
        active_worlds: 1,
        active_players: 1,
        max_players: 12,
      },
      alpha: {
        enabled: true,
        active: { mode: "quickplay", world_id: 1, hero: "tank", team: "red" },
        queue: null,
        roster: [
          {
            id: "me",
            name: "Driver",
            team: "red",
            hero: "tank",
            mode: "quickplay",
            reconnecting: false,
          },
        ],
        reconnect_grace_seconds: 30,
        reserved_players: 0,
        skins: [],
      },
    };
    await t.test(
      "role wall changes the existing preview chassis and a denied server pick keeps the locked hero",
      async () => {
        const { HeroSelection } = await load("game/alpha/HeroSelection.tsx");
        await act(async () => {
          social.getState().receive(view);
          alpha.setState({ mode: "quickplay", hero: "tank" });
          network.setState({
            connected: true,
            worldName: "Alpha match",
            worldMap: "road_precision",
          });
          ui.setState({ screen: "hero_select", overlay: null });
        });
        await render(HeroSelection);
        assert.equal(canDrive(), false);
        assert.equal(
          document.querySelectorAll(".alpha-mode-tabs button").length,
          4,
        );
        assert.equal(document.querySelectorAll(".alpha-squad-seat").length, 5);
        await click("SUPPORT", "tab");
        await click("MECHANICSUPPORT");
        const command = sent.at(-1);
        assert.equal(command.action, "hero_select");
        assert.equal(command.hero, "mechanic");
        await act(async () =>
          client.receiveSocialResult({
            request_id: command.request_id,
            ok: false,
            message: "That role would leave an invalid five-player team.",
          }),
        );
        assert.equal(alpha.getState().hero, "tank");
        assert.match(
          document.querySelector('[role="status"]').textContent,
          /invalid/,
        );
      },
    );
    await t.test(
      "queue shows the server position, cycles supplied videos and B cancels the actual ticket",
      async () => {
        const { QueueScreen } = await load("game/alpha/QueueScreen.tsx");
        await act(async () => {
          social.getState().receive({
            ...view,
            alpha: {
              ...view.alpha,
              active: null,
              queue: {
                mode: "sandbox",
                position: 3,
                size: 4,
                joined: 1,
                reason: "Waiting for the solo slot",
              },
            },
          });
          ui.setState({ screen: "queue", overlay: null });
        });
        await render(QueueScreen);
        assert.match(
          document.querySelector(".alpha-queue-position").textContent,
          /#3/,
        );
        const video = document.querySelector("video");
        assert.ok(video);
        assert.equal(video.muted, true);
        assert.equal(video.loop, false);
        await act(async () => video.dispatchEvent(new Event("ended")));
        assert.match(document.querySelector("video").src, /SEA-STRIKE-2043/);
        await act(async () => route("back"));
        const command = sent.at(-1);
        assert.equal(command.action, "mode_cancel");
        await act(async () =>
          client.receiveSocialResult({
            request_id: command.request_id,
            ok: true,
            data: {},
          }),
        );
        assert.equal(ui.getState().screen, "main");
      },
    );
    await t.test(
      "minimizing radio and climate unmounts their UI while preserving playback, settings and requests",
      async () => {
        const { UtilityDock } = await load("ui/hud/UtilityDock.tsx");
        const { useHudPanelsStore: panels } = await load(
          "store/hud/hudPanelsStore.ts",
        );
        const { usePreferencesStore: prefs } = await load(
          "store/preferences/preferencesStore.ts",
        );
        const { useInputStore: input } = await load(
          "store/input/inputStore.ts",
        );
        const { useRadioStore: radio } = await load(
          "store/radio/radioStore.ts",
        );
        await act(async () => {
          prefs.getState().update({
            showDriveControls: true,
            hudGroups: { minimap: true, display: true, climate: true },
          });
          panels.setState({ map: false, radio: true, climate: true });
        });
        await render(UtilityDock);
        const before = { ...input.getState().input },
          state = radio.getState();
        await click("Minimize radio");
        assert.equal(document.querySelector(".cockpit-radio"), null);
        assert.equal(prefs.getState().hudGroups.display, true);
        assert.equal(radio.getState().playing, state.playing);
        assert.equal(radio.getState().powered, state.powered);
        await click("Minimize climate controls");
        assert.equal(document.querySelector(".climate-panel"), null);
        assert.equal(prefs.getState().hudGroups.climate, true);
        assert.deepEqual(input.getState().input, before);
        await click("Open map");
        assert.equal(panels.getState().map, true);
        assert.equal(
          document.querySelector(".utility-launchers").dataset.onRim,
          "true",
        );
        await click("Open radio");
        assert.ok(document.querySelector(".console-display-tabs"));
        await click("MISSIONS");
        assert.ok(document.querySelector(".console-display-content"));
      },
    );

    await t.test(
      "one quick e-brake press releases only its own force and does not pulse twice",
      async () => {
        const { ProgressiveParking } = await load(
          "ui/Cockpit/mechanical/ProgressiveParking.tsx",
        );
        const { useInputStore: input } = await load(
          "store/input/inputStore.ts",
        );
        await act(async () => {
          ui.setState({
            screen: "sandbox",
            overlay: null,
            isModeLoading: false,
          });
          input.getState().releaseControls();
          input.getState().setParkingBrake(0);
          input.getState().setAnalogFromSource("keyboard", { handbrake: 0.4 });
        });
        function Lever() {
          return h(ProgressiveParking, {
            strength: 0,
            fraction: 0,
            precise: true,
            disabled: false,
            pending: false,
          });
        }
        await render(Lever);
        const button = document.querySelector('[aria-label="Parking brake"]');
        const point = async (type) =>
          act(async () => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.assign(event, { pointerId: 42, button: 0, clientY: 60 });
            button.dispatchEvent(event);
          });
        await point("pointerdown");
        assert.equal(input.getState().input.handbrake, 1);
        await point("pointerup");
        assert.equal(input.getState().input.handbrake, 0.4);
        await act(async () => button.click());
        assert.equal(input.getState().input.handbrake, 0.4);
        await point("pointerdown");
        await point("pointercancel");
        assert.equal(input.getState().input.handbrake, 0.4);
        await act(async () => input.getState().releaseInputSource("keyboard"));
        assert.equal(input.getState().input.handbrake, 0);
      },
    );
  } finally {
    await act(async () => root.unmount());
    await vite.close();
    dom.window.close();
    for (const [key, value] of old)
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
  }
});
