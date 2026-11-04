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
      "portrait picks preserve server role validation and keep a denied hero locked",
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
          0,
        );
        assert.equal(document.querySelectorAll(".match-composition-seat").length, 5);
        await click("SUPPORT", "tab");
        await click("CX-30 RESCUE · SUPPORT");
        const command = sent.at(-1);
        assert.equal(command.action, "hero_select");
        assert.equal(command.hero, "cx30");
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
      "one mode owner edits the environment, ignores Tab, and A continues without footer focus",
      async () => {
        const { ModeSelection } = await load("game/alpha/ModeSelection.tsx");
        const { useSelectionStore: selection, mapCatalog } = await load(
          "store/selection/selectionStore.ts",
        );
        const { useCanBusStore: bus } = await load(
          "store/recon/canBusStore.ts",
        );
        const { usePreferencesStore: prefs } = await load(
          "store/preferences/preferencesStore.ts",
        );
        await act(async () => {
          social.getState().receive({
            ...view,
            current_world_id: null,
            alpha: { ...view.alpha, active: null },
          });
          network.setState({
            connected: true,
            worldName: null,
            worldMap: null,
          });
          prefs.getState().update({ favoriteVehicles: ["brz"] });
          alpha.getState().clearHero();
          alpha.getState().chooseMode("sandbox");
          ui.setState({ screen: "mode_select", overlay: null });
        });
        await render(ModeSelection);
        assert.equal(selection.getState().getSelectedVehicle().id, "brz");
        assert.equal(alpha.getState().hero, null);
        assert.equal(
          document.querySelectorAll("[data-hero], .match-composition-seat").length,
          0,
        );
        assert.ok(
          document.activeElement.matches('[aria-label="Game mode selection"]'),
        );
        assert.equal(
          document.querySelector("[data-controller-selector]").dataset.quiet,
          "true",
        );
        const start = selection.getState().mapIndex;
        await act(async () => route("right"));
        assert.equal(
          selection.getState().mapIndex,
          (start + 1) % mapCatalog.length,
        );
        await act(async () => {
          route("down");
          route("up");
        });
        assert.ok(
          document.activeElement.matches('[aria-label="Game mode selection"]'),
        );
        for (let i = 1; i < mapCatalog.length; i++)
          await act(async () => route("right"));
        assert.equal(selection.getState().mapIndex, start);
        const event = new dom.window.KeyboardEvent("keydown", {
          code: "Tab",
          key: "Tab",
          bubbles: true,
          cancelable: true,
        });
        await act(async () => document.activeElement.dispatchEvent(event));
        assert.equal(event.defaultPrevented, true);
        assert.equal(alpha.getState().mode, "sandbox");
        await act(async () => route("next_tab"));
        assert.equal(alpha.getState().mode, "editor");
        await act(async () => route("next_tab"));
        assert.equal(alpha.getState().mode, "signal_recon");
        assert.equal(
          document.querySelector('[data-can-field="0"]').dataset.active,
          "true",
        );
        const iface = bus.getState().selectedInterface;
        await act(async () => route("right"));
        assert.notEqual(bus.getState().selectedInterface, iface);
        await act(async () => route("left"));
        assert.equal(bus.getState().selectedInterface, iface);
        await act(async () => route("next_option"));
        assert.equal(
          document.querySelector('[data-can-field="1"]').dataset.active,
          "true",
        );
        await act(async () => route("right"));
        assert.equal(bus.getState().selectedMode, "live");
        await act(async () => route("left"));
        assert.equal(bus.getState().selectedMode, "simulation");
        await act(async () => route("activate"));
        assert.equal(ui.getState().screen, "hero_select");
        assert.equal(alpha.getState().hero, null);
      },
    );
    await t.test(
      "focus leaves preview unchanged; A selects the focused portrait and a second A advances",
      async () => {
        const { HeroSelection } = await load("game/alpha/HeroSelection.tsx");
        const { useSelectionStore: selection } = await load(
          "store/selection/selectionStore.ts",
        );
        await act(async () => {
          alpha.getState().clearHero();
          alpha.getState().chooseMode("signal_recon");
          ui.setState({ screen: "hero_select" });
        });
        await render(HeroSelection);
        assert.equal(document.querySelectorAll("[data-hero]").length, 10);
        assert.equal(
          document.querySelectorAll(
            ".alpha-mode-tabs,[data-can-field],[data-controller-selector]",
          ).length,
          0,
        );
        assert.equal(alpha.getState().previewHero, null);
        await act(async () => route("right"));
        assert.equal(document.activeElement.dataset.hero, "tank");
        assert.equal(alpha.getState().previewHero, null);
        assert.equal(alpha.getState().hero, null);
        await act(async () => route("right"));
        await act(async () => route("down"));
        assert.equal(document.activeElement.dataset.hero, "supra");
        await act(async () =>
          document.activeElement.dispatchEvent(
            new dom.window.KeyboardEvent("keydown", {
              code: "Numpad4",
              key: "4",
              bubbles: true,
              cancelable: true,
            }),
          ),
        );
        assert.equal(document.activeElement.dataset.hero, "camaro");
        await act(async () => route("activate"));
        assert.equal(alpha.getState().hero, "camaro");
        assert.equal(ui.getState().screen, "hero_select");
        await act(async () =>
          document.querySelector('[data-hero="brz"]').focus(),
        );
        assert.equal(alpha.getState().previewHero, "camaro");
        assert.equal(alpha.getState().hero, "camaro");
        assert.equal(selection.getState().getSelectedVehicle().id, "camaro");
        await act(async () => route("activate"));
        assert.equal(alpha.getState().hero, "brz");
        assert.equal(ui.getState().screen, "hero_select");
        const before = sent.length;
        await act(async () => route("activate"));
        assert.equal(ui.getState().screen, "signal_recon");
        assert.equal(sent.length, before);
      },
    );
    await t.test(
      "Back clears a preview/pick to the empty ghost stage before returning to modes",
      async () => {
        const { HeroSelection } = await load("game/alpha/HeroSelection.tsx");
        await act(async () => {
          alpha.getState().chooseMode("signal_recon");
          alpha.getState().chooseHero("brz");
          ui.setState({ screen: "hero_select" });
        });
        await render(HeroSelection);
        await act(async () => route("back"));
        assert.equal(alpha.getState().hero, null);
        assert.equal(alpha.getState().previewHero, null);
        assert.equal(ui.getState().screen, "hero_select");
        assert.equal(
          document.querySelector('[data-hero][aria-pressed="true"]'),
          null,
        );
        await act(async () => route("back"));
        assert.equal(ui.getState().screen, "mode_select");
      },
    );
    await t.test(
      "delayed lobby picks cannot undo a newer Back clear after its acknowledgement",
      async () => {
        const { HeroSelection } = await load("game/alpha/HeroSelection.tsx");
        const unpicked = {
          ...view,
          alpha: { ...view.alpha, active: { ...view.alpha.active, hero: "" } },
        };
        await act(async () => {
          alpha.getState().chooseMode("quickplay");
          alpha.getState().clearHero();
          social.getState().receive(unpicked);
          ui.setState({ screen: "hero_select" });
        });
        await render(HeroSelection);
        await act(async () =>
          document.querySelector('[data-hero="brz"]').focus(),
        );
        await act(async () => route("activate"));
        const pick = sent.at(-1);
        assert.equal(pick.hero, "brz");
        await act(async () =>
          client.receiveSocialResult({
            request_id: pick.request_id,
            ok: true,
            data: { hero: "brz" },
          }),
        );
        assert.equal(alpha.getState().hero, "brz");
        await act(async () => route("back"));
        const clear = sent.at(-1);
        assert.equal(clear.hero, "");
        await act(async () =>
          client.receiveSocialResult({
            request_id: clear.request_id,
            ok: true,
            data: { hero: "" },
          }),
        );
        await act(async () =>
          social.getState().receive({
            ...view,
            alpha: {
              ...view.alpha,
              active: { ...view.alpha.active, hero: "brz" },
            },
          }),
        );
        assert.equal(alpha.getState().hero, null);
        assert.equal(alpha.getState().previewHero, null);
        await act(async () => social.getState().receive(unpicked));
        assert.equal(alpha.getState().hero, null);
        assert.equal(ui.getState().screen, "hero_select");
      },
    );
    await t.test(
      "an immediately admitted mode goes straight to heroes without the black queue transition or a stale loading gate",
      async () => {
        const { ModeSelection } = await load("game/alpha/ModeSelection.tsx");
        await act(async () => {
          alpha.getState().chooseMode("sandbox");
          alpha.getState().clearHero();
          network.setState({ connected: true, worldName: null });
          social.getState().receive({
            ...view,
            alpha: { ...view.alpha, active: { ...view.alpha.active, mode: "sandbox", hero: "tank" }, queue: null },
          });
          ui.setState({ isModeLoading: true });
          ui.getState().setScreen("mode_select");
        });
        assert.equal(ui.getState().isModeLoading, false);
        await render(ModeSelection);
        const screens = [];
        const stop = ui.subscribe((state) => screens.push(state.screen));
        try {
          await act(async () => route("activate"));
          const command = sent.at(-1);
          assert.equal(command.action, "mode_join");
          await act(async () =>
            client.receiveSocialResult({
              request_id: command.request_id,
              ok: true,
              data: { status: "joined", hero: "" },
            }),
          );
          assert.equal(ui.getState().screen, "hero_select");
          assert.ok(!screens.includes("queue"));
          assert.equal(alpha.getState().hero, null);
          const { HeroSelection } = await load("game/alpha/HeroSelection.tsx");
          await render(HeroSelection);
          assert.equal(
            alpha.getState().hero,
            null,
            "an older server view cannot select a fresh admission",
          );
        } finally {
          stop();
        }
      },
    );
    await t.test(
      "matchmaking still reserves an unpicked seat before portraits and team cards appear",
      async () => {
        const { ModeSelection } = await load("game/alpha/ModeSelection.tsx");
        const { HeroSelection } = await load("game/alpha/HeroSelection.tsx");
        const { QueueScreen } = await load("game/alpha/QueueScreen.tsx");
        const { useAlphaFlow } = await load("game/alpha/useAlphaFlow.ts");
        function Flow() {
          useAlphaFlow();
          const screen = ui((s) => s.screen);
          return h(
            screen === "mode_select"
              ? ModeSelection
              : screen === "queue"
                ? QueueScreen
                : HeroSelection,
          );
        }
        await act(async () => {
          alpha.getState().clearHero();
          alpha.getState().chooseMode("quickplay");
          social.getState().receive({
            ...view,
            current_world_id: null,
            alpha: { ...view.alpha, active: null },
          });
          ui.setState({ screen: "mode_select" });
        });
        await render(Flow);
        await act(async () => route("activate"));
        const command = sent.at(-1);
        assert.equal(command.action, "mode_join");
        assert.equal(command.hero, "");
        assert.equal(
          document.querySelectorAll("[data-hero],.match-composition-seat").length,
          0,
        );
        await act(async () => {
          social.getState().receive({
            ...view,
            current_world_id: null,
            alpha: {
              ...view.alpha,
              active: null,
              queue: {
                mode: "quickplay",
                position: 1,
                size: 1,
                joined: 0,
                reason: "Full",
              },
            },
          });
          client.receiveSocialResult({
            request_id: command.request_id,
            ok: true,
            data: { status: "queued" },
          });
        });
        assert.equal(ui.getState().screen, "queue");
        assert.equal(
          document.querySelectorAll("[data-hero],.match-composition-seat").length,
          0,
        );
        await act(async () =>
          social.getState().receive({
            ...view,
            alpha: {
              ...view.alpha,
              active: { ...view.alpha.active, hero: "" },
              roster: [{ ...view.alpha.roster[0], hero: "" }],
            },
          }),
        );
        assert.equal(ui.getState().screen, "hero_select");
        assert.equal(alpha.getState().hero, null);
        assert.equal(alpha.getState().previewHero, null);
        assert.equal(document.querySelectorAll("[data-hero]").length, 10);
        assert.equal(document.querySelectorAll(".match-composition-seat").length, 5);
        assert.match(
          document.querySelector(".alpha-deploy").textContent,
          /SELECT HERO/,
        );
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
        await click("SINGLE ROW");
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
        const { useTextKeyboardStore: keyboard } = await load(
          "store/text/keyboardStore.ts",
        );
        await act(async () => keyboard.getState().setMode("off"));
        await render(LobbyChat);
        assert.equal(
          document.querySelector(".chat-lines"),
          null,
          "idle chat has only its launcher",
        );
        await click("Open chat");
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
        await click("Minimize chat");
        const incoming = {
          ...message,
          id: 81,
          author_id: "friend",
          name: "Friend",
          text: "Incoming team message",
        };
        await act(async () => chat.getState().receive(incoming));
        assert.match(
          document.querySelector(".chat-lines").textContent,
          /Incoming team message/,
        );
        assert.notEqual(
          document.activeElement?.tagName,
          "INPUT",
          "incoming chat never steals focus",
        );
        await click("Minimize chat");
        await act(async () => chat.getState().receive(incoming));
        assert.equal(
          document.querySelector(".chat-lines"),
          null,
          "duplicate broadcasts do not reopen chat",
        );
        await act(async () =>
          chat.getState().mergeHistory("team:1:red", [{ ...incoming, id: 82 }]),
        );
        assert.equal(
          document.querySelector(".chat-lines"),
          null,
          "history snapshots do not reopen chat",
        );
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
      "presence notices follow validated current-world views, avoid baseline/repeat noise and stay bounded",
      async () => {
        const { usePresenceStore: presence } = await load(
          "store/chat/presenceStore.ts",
        );
        const { useChatStore: chat } = await load("store/chat/chatStore.ts");
        const { LobbyChat } = await load("game/alpha/LobbyChat.tsx");
        const me = {
          player_id: "p-me",
          profile_id: "me",
          name: "Driver",
          team: "red",
        };
        const alex = {
          player_id: "p-alex",
          profile_id: "alex",
          name: "Alex",
          team: "blue",
        };
        const person = { id: "alex", name: "Alex", online: true, team: "blue" };
        const world = {
          id: 1,
          name: "Match",
          map: "road_precision",
          owner_id: null,
          listed: true,
          max_players: 10,
          players: 2,
          active: true,
          locked: false,
          invite_code: null,
          members: [me, alex],
        };
        const state = (members, players = [person], roster = []) => ({
          ...view,
          players,
          worlds: [{ ...world, members, players: members.length }],
          alpha: { ...view.alpha, roster },
        });
        await act(async () => {
          client.setSocialConnection(socket);
          client.receiveSocialState(state([me, alex]));
        });
        assert.equal(
          presence.getState().events.length,
          0,
          "first server view establishes a baseline",
        );
        await render(LobbyChat);
        await act(async () => client.receiveSocialState(state([me])));
        assert.match(
          presence.getState().events.at(-1).text,
          /Alex left the world/,
        );
        assert.ok(
          document.querySelector(".chat-system"),
          "new world activity opens the timeline without focusing the message field",
        );
        assert.notEqual(document.activeElement?.tagName, "INPUT");
        await click("Minimize chat");
        const count = presence.getState().events.length;
        await act(async () => client.receiveSocialState(state([me])));
        assert.equal(presence.getState().events.length, count);
        assert.equal(document.querySelector(".chat-lines"), null);
        await act(async () => client.receiveSocialState(state([me, alex])));
        assert.match(
          presence.getState().events.at(-1).text,
          /Alex joined the world/,
        );
        await act(async () =>
          client.receiveSocialState(
            state(
              [me],
              [],
              [
                {
                  id: "alex",
                  name: "Alex",
                  mode: "quickplay",
                  team: "blue",
                  hero: "brz",
                  reconnecting: true,
                },
              ],
            ),
          ),
        );
        assert.match(
          presence.getState().events.at(-1).text,
          /Alex disconnected/,
        );
        await act(async () => client.receiveSocialState(state([me, alex])));
        assert.match(
          presence.getState().events.at(-1).text,
          /Alex reconnected/,
        );
        const before = presence.getState().events.length;
        await act(async () =>
          client.receiveSocialState({
            ...state([me, alex]),
            worlds: [
              world,
              {
                ...world,
                id: 2,
                name: "Other world",
                members: [
                  { ...alex, profile_id: "elsewhere", name: "Elsewhere" },
                ],
              },
            ],
          }),
        );
        assert.equal(
          presence.getState().events.length,
          before,
          "another world's changes cannot create local notices",
        );
        await act(async () => {
          for (let n = 0; n < 80; n++)
            client.receiveSocialState(
              state(
                [me, { ...alex, profile_id: `guest-${n}`, name: `Guest ${n}` }],
                [{ ...person, id: `guest-${n}`, name: `Guest ${n}` }],
              ),
            );
        });
        assert.equal(presence.getState().events.length, 50);
        assert.equal(
          Object.values(chat.getState().history).flat().length,
          0,
          "presence notices never impersonate network chat messages",
        );
        await act(async () => client.setSocialConnection(null));
        assert.equal(presence.getState().events.length, 0);
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
        assert.equal(ui.getState().screen, "mode_select");
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
