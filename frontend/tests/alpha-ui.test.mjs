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
      "portrait and arrow picks share server role validation and keep a denied hero locked",
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
          6,
        );
        assert.equal(document.querySelectorAll(".alpha-squad-seat").length, 5);
        await click("SUPPORT", "tab");
        await click("Next vehicle");
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
      "the portrait garage shows every hero, keeps the world bar and keeps research out of mode_join",
      async () => {
        const { HeroSelection } = await load("game/alpha/HeroSelection.tsx");
        const { useSelectionStore: selection, vehicleCatalog } = await load(
          "store/selection/selectionStore.ts",
        );
        const { joinSelectedMode } = await load("game/alpha/sessionActions.ts");
        await act(async () => {
          social.getState().receive({
            ...view,
            current_world_id: null,
            alpha: { ...view.alpha, active: null },
          });
          network.setState({
            connected: false,
            worldName: null,
            worldMap: null,
          });
          alpha.setState({ mode: "sandbox", hero: "ae86" });
        });
        await render(HeroSelection);
        const index = selection.getState().mapIndex;
        await click("Next map");
        assert.notEqual(selection.getState().mapIndex, index);
        await click("Previous map");
        assert.equal(selection.getState().mapIndex, index);
        assert.equal(document.querySelectorAll("[data-hero]").length, 7);
        assert.ok(document.querySelector('[aria-label="Next vehicle"]'));
        assert.equal(
          document.querySelectorAll(".hero-portrait-name").length,
          0,
        );
        await click("BRZ · DPS");
        assert.equal(alpha.getState().hero, "brz");
        assert.equal(
          vehicleCatalog[selection.getState().vehicleIndex].id,
          "brz",
        );
        await click("Next vehicle");
        assert.equal(alpha.getState().hero, "camaro");
        await click("Previous vehicle");
        assert.equal(alpha.getState().hero, "brz");
        const arrow = document.querySelector('[aria-label="Next vehicle"]');
        await act(async () => {
          arrow.focus();
          route("right");
        });
        assert.equal(alpha.getState().hero, "camaro");
        assert.equal(
          document.activeElement,
          arrow,
          "cycling keeps the strip focused",
        );
        await act(async () =>
          document.activeElement.dispatchEvent(
            new dom.window.KeyboardEvent("keydown", {
              key: "ArrowLeft",
              code: "ArrowLeft",
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
        assert.equal(alpha.getState().hero, "brz");
        await click("SUPPORT", "tab");
        await click("Next vehicle");
        assert.equal(alpha.getState().hero, "mechanic");
        await click("Next vehicle");
        assert.equal(alpha.getState().hero, "logistics");
        assert.equal(
          vehicleCatalog[selection.getState().vehicleIndex].id,
          "ae86",
        );
        await click("Next vehicle");
        assert.equal(
          alpha.getState().hero,
          "mechanic",
          "role cycling wraps without losing the support identity",
        );
        const mapArrow = document.querySelector('[aria-label="Next map"]');
        await act(async () => {
          mapArrow.focus();
          route("right");
        });
        assert.notEqual(selection.getState().mapIndex, index);
        await act(async () => route("left"));
        assert.equal(selection.getState().mapIndex, index);
        await click("ALL", "tab");
        await click("WORLD EDITOR");
        assert.ok(document.querySelector('[aria-label="Next map"]'));
        await click("COMPETITIVE");
        assert.equal(document.querySelector('[aria-label="Next map"]'), null);
        await click("SWARM COMMAND");
        assert.equal(document.querySelector(".alpha-deploy").disabled, true);
        await click("SIGNAL RECON");
        const before = sent.length;
        await assert.rejects(joinSelectedMode(), /driving mode/);
        await act(async () => document.querySelector(".alpha-deploy").click());
        assert.equal(ui.getState().screen, "signal_recon_setup");
        assert.equal(
          sent.length,
          before,
          "offline research entry does not request a game seat",
        );
        await act(async () => route("back"));
        assert.equal(ui.getState().screen, "hero_select");
      },
    );
    await t.test(
      "radio style buttons remove GPS, missions opens beside power, and compact climate reads only measured stats",
      async () => {
        const { RadioPage } = await load(
          "ui/Cockpit/panels/HudControlPages.tsx",
        );
        const { UtilityDock } = await load("ui/hud/UtilityDock.tsx");
        const { usePreferencesStore: prefs, sanitizePreferences } = await load(
          "store/preferences/preferencesStore.ts",
        );
        const { useHudPanelsStore: panels } = await load(
          "store/hud/hudPanelsStore.ts",
        );
        const frames = await load("performance/frameReadout.ts");
        await render(RadioPage);
        assert.equal(
          document.querySelector('select[aria-label="Radio HUD style"]'),
          null,
        );
        await click("NO TAB BAR");
        assert.equal(
          sanitizePreferences({ radioHudStyle: "no-tabs" }).radioHudStyle,
          "no-tabs",
        );
        assert.equal(
          sanitizePreferences({ radioHudStyle: "classic" }).radioHudStyle,
          "classic",
        );
        await act(async () => {
          prefs.getState().update({
            showDriveControls: true,
            climateHudSize: "compact",
            hudGroups: { display: true, climate: true },
          });
          panels.setState({ radio: true, climate: true, map: false });
          network.setState({ connected: true, pingMs: 42 });
          frames.resetHudFrames();
        });
        await render(UtilityDock);
        assert.equal(document.querySelector(".console-display-tabs"), null);
        assert.equal(
          [...document.querySelectorAll("button")].some(
            (n) => n.textContent === "GPS",
          ),
          false,
        );
        await click("Toggle missions");
        assert.ok(document.querySelector(".console-display-content"));
        await click("Toggle missions");
        assert.equal(document.querySelector(".console-display-content"), null);
        assert.match(
          document.querySelector('[aria-label="Network round trip"]')
            .textContent,
          /42/,
        );
        assert.match(
          document.querySelector('[aria-label="Frames per second"]')
            .textContent,
          /—/,
        );
        await act(async () => {
          for (let tick = 0; tick <= 30; tick++)
            frames.sampleHudFrame(tick * 20);
        });
        assert.equal(frames.useFrameReadout.getState().fps, 50);
        assert.match(
          document.querySelector('[aria-label="Frame time"]').textContent,
          /20.0/,
        );
        await act(async () => {
          frames.resetHudFrames();
          network.setState({ connected: false });
        });
        assert.match(
          document.querySelector('[aria-label="Frames per second"]')
            .textContent,
          /—/,
        );
        assert.match(
          document.querySelector('[aria-label="Network round trip"]')
            .textContent,
          /—/,
        );
        await act(async () =>
          prefs.getState().update({ radioHudStyle: "streamlined" }),
        );
        assert.equal(document.querySelector(".console-display-tabs"), null);
        await click("Toggle missions");
        assert.ok(document.querySelector(".console-display-content"));
      },
    );
    await t.test(
      "chat uses confirmed socket identity, deduplicates acknowledgements and discards old-team history",
      async () => {
        const { useChatStore: chat } = await load("store/chat/chatStore.ts");
        const { sendChat, loadChatHistory } = await load("net/chatClient.ts");
        const { LobbyChat } = await load("game/alpha/LobbyChat.tsx");
        await act(async () => {
          network.setState({ connected: true });
          client.receiveSocialState(view);
        });
        await render(LobbyChat);
        let packet = sent.at(-1);
        assert.equal(packet.action, "chat_history");
        await act(async () =>
          client.receiveSocialResult({
            request_id: packet.request_id,
            ok: true,
            data: { context: "lobby", messages: [] },
          }),
        );
        await click("TEAM");
        packet = sent.at(-1);
        await act(async () =>
          client.receiveSocialResult({
            request_id: packet.request_id,
            ok: true,
            data: { context: "team:1:red", messages: [] },
          }),
        );
        let pending;
        await act(async () => {
          pending = sendChat("team", "<b>hello</b>");
        });
        packet = sent.at(-1);
        assert.equal(packet.action, "chat_send");
        assert.equal(packet.channel, "team");
        assert.equal(packet.author_id, undefined);
        const message = {
          id: 1,
          channel: "team",
          context: "team:1:red",
          author_id: "me",
          name: "Driver",
          text: "<b>hello</b>",
          sent_at: 1234,
        };
        await act(async () => {
          chat.getState().receive(message);
          client.receiveSocialResult({
            request_id: packet.request_id,
            ok: true,
            data: { message },
          });
        });
        await pending;
        assert.equal(chat.getState().history["team:1:red"].length, 1);
        assert.match(
          document.querySelector(".chat-lines").textContent,
          /<b>hello<\/b>/,
        );
        assert.equal(
          document.querySelector(".chat-lines b"),
          null,
          "chat is text, not HTML",
        );
        await act(async () => {
          for (let id = 2; id <= 80; id++)
            chat.getState().receive({ ...message, id });
        });
        assert.equal(chat.getState().history["team:1:red"].length, 50);
        let historyPending;
        await act(async () => {
          historyPending = loadChatHistory("team");
        });
        const historyPacket = sent.at(-1);
        await act(async () =>
          client.receiveSocialState({
            ...view,
            current_world_id: 2,
            alpha: {
              ...view.alpha,
              active: { ...view.alpha.active, world_id: 2, team: "blue" },
            },
          }),
        );
        await act(async () =>
          client.receiveSocialResult({
            request_id: historyPacket.request_id,
            ok: true,
            data: { context: "team:1:red", messages: [message] },
          }),
        );
        await historyPending;
        assert.equal(chat.getState().history["team:1:red"], undefined);
        await act(async () => chat.getState().membership("me", null, null));
        const before = sent.length;
        await assert.rejects(sendChat("team", "no world"), /Join a world/);
        assert.equal(sent.length, before);
        await act(async () => client.setSocialConnection(null));
        assert.deepEqual(chat.getState().history, {});
        client.setSocialConnection(socket);
      },
    );
    await t.test(
      "queue shows the server position, cycles supplied videos and B cancels the actual ticket",
      async () => {
        const { QueueScreen } = await load("game/alpha/QueueScreen.tsx");
        await act(async () => {
          network.setState({ connected: true });
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
            radioHudStyle: "classic",
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
        assert.equal(
          input.getState().input.handbrake,
          0.4,
          "contact waits to distinguish a parking hold from a drift tap",
        );
        await point("pointerup");
        assert.equal(input.getState().input.handbrake, 1);
        await act(async () => button.click());
        assert.equal(
          input.getState().input.handbrake,
          1,
          "synthesized click cannot repeat the pulse",
        );
        await act(
          async () => new Promise((resolve) => setTimeout(resolve, 140)),
        );
        assert.equal(input.getState().input.handbrake, 0.4);
        await point("pointerdown");
        await point("pointercancel");
        assert.equal(input.getState().input.handbrake, 0.4);
        await act(async () => input.getState().releaseInputSource("keyboard"));
        assert.equal(input.getState().input.handbrake, 0);
        await point("pointerdown");
        assert.equal(input.getState().input.handbrake, 0);
        await act(
          async () => new Promise((resolve) => setTimeout(resolve, 420)),
        );
        assert.equal(
          input.getState().input.handbrake,
          0,
          "parking hold never produces a drift burst",
        );
        assert.ok(input.getState().input.parking_brake > 0);
        await point("pointerup");
        await act(async () => button.click());
        assert.equal(input.getState().input.handbrake, 0);
        assert.ok(
          input.getState().input.parking_brake > 0,
          "hold retains its parking latch",
        );
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
