import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { act, createElement as h, Fragment, useState, Profiler } from "react";
import { createRoot } from "react-dom/client";

test("social requests, world transitions and assisted text have independent owners", async (t) => {
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
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
  });
  const load = (path) => server.ssrLoadModule("/src/" + path);
  const root = createRoot(document.getElementById("root"));
  try {
    const { useTextKeyboardStore: keyboard, keyboardNeeded } = await load(
      "store/text/keyboardStore.ts",
    );
    const { AssistedInput } = await load("components/text/AssistedInput.tsx");
    const { OnScreenKeyboard } = await load(
      "components/text/OnScreenKeyboard.tsx",
    );
    const { routeMenuAction, canDrive } = await load(
      "controls/inputRouting.ts",
    );
    const { useUIStore: ui } = await load("store/menus/uiStore.ts");
    const { useNetworkStore: network } = await load(
      "store/session/networkStore.ts",
    );
    const { useSocialStore: social } = await load(
      "store/social/socialStore.ts",
    );
    const client = await load("net/socialClient.ts");
    const by = (label) => {
      const node = document.querySelector(`[aria-label="${label}"]`);
      assert.ok(node, label);
      return node;
    };
    const click = (label) => act(async () => by(label).click());
    const render = async (node) => {
      await act(async () => root.render(null));
      await act(async () => root.render(node));
    };
    const view = {
      profile: { id: "a".repeat(32), name: "Driver" },
      players: [],
      teammates: [],
      requests: [],
      groups: [],
      worlds: [],
      world_invites: [],
      current_world_id: null,
      limits: {
        active_worlds: 0,
        max_active_worlds: 1,
        active_players: 0,
        max_players: 10,
      },
      maps: ["road_precision"],
    };
    t.beforeEach(async () =>
      act(async () => {
        root.render(null);
        keyboard.setState({
          session: null,
          mode: "auto",
          hardwareObserved: false,
        });
        ui.setState({ screen: "social", overlay: null, isModeLoading: false });
      }),
    );

    await t.test(
      "auto uses observed physical typing and a manual override; text edits never persist passwords",
      async () => {
        assert.equal(keyboardNeeded("auto", false), true);
        assert.equal(keyboardNeeded("auto", true), false);
        assert.equal(keyboardNeeded("on", true), true);
        assert.equal(keyboardNeeded("off", false), false);
        function Field() {
          const [value, setValue] = useState("AB");
          return h(
            Fragment,
            null,
            h(AssistedInput, {
              label: "PRIVATE PASSWORD",
              type: "password",
              value,
              onChange: setValue,
              maxLength: 12,
            }),
            h(OnScreenKeyboard),
          );
        }
        await render(h(Field));
        const beforeStorage = localStorage.length;
        await click("PRIVATE PASSWORD");
        assert.ok(by("Keyboard: PRIVATE PASSWORD"));
        assert.equal(canDrive(), false);
        await click("Type Q");
        await click("Type A");
        assert.equal(by("PRIVATE PASSWORD").value, "ABQA");
        assert.equal(by("Masked password").textContent, "••••");
        assert.equal(localStorage.length, beforeStorage);
        await act(async () => routeMenuAction("back"));
        assert.equal(by("PRIVATE PASSWORD").value, "AB");
        assert.equal(keyboard.getState().session, null);
        await act(async () => keyboard.setState({ hardwareObserved: true }));
        await click("PRIVATE PASSWORD");
        assert.equal(keyboard.getState().session, null);
        await click("Open keyboard for PRIVATE PASSWORD");
        assert.ok(keyboard.getState().session);
        await act(async () => routeMenuAction("next_tab"));
        await act(async () => routeMenuAction("activate"));
        assert.equal(by("PRIVATE PASSWORD").value, "AB1");
        await click("DONE");
        assert.equal(keyboard.getState().session, null);
        assert.equal(by("PRIVATE PASSWORD").value, "AB1");
      },
    );
    await t.test(
      "keyboard page switches reset selection before activating a shorter row",
      async () => {
        function Field() {
          const [value, setValue] = useState("");
          return h(
            Fragment,
            null,
            h(AssistedInput, {
              label: "PLAYER NAME",
              value,
              onChange: setValue,
            }),
            h(OnScreenKeyboard),
          );
        }
        await render(h(Field));
        await click("PLAYER NAME");
        await act(async () => routeMenuAction("next_tab"));
        await click("Type ;");
        await act(async () => routeMenuAction("previous_tab"));
        await act(async () => routeMenuAction("activate"));
        assert.equal(by("PLAYER NAME").value, ";Q");
      },
    );
    await t.test(
      "request IDs resolve their own response and disconnect rejects pending work",
      async () => {
        const sent = [];
        const connection = {
          readyState: WebSocket.OPEN,
          send: (text) => sent.push(JSON.parse(text)),
        };
        client.setSocialConnection(connection);
        const one = client.requestSocial("world_create", {
          name: "Private",
          password: "secret",
        });
        const two = client.requestSocial("group_create", { name: "Crew" });
        client.receiveSocialResult({
          request_id: sent[1].request_id,
          ok: true,
          data: { group_id: "group" },
        });
        client.receiveSocialResult({
          request_id: sent[0].request_id,
          ok: false,
          message: "Full",
        });
        assert.deepEqual(await two, { group_id: "group" });
        await assert.rejects(one, /Full/);
        const pending = client.requestSocial("refresh");
        const rejected = assert.rejects(pending, /connection closed/);
        client.setSocialConnection(null);
        await rejected;
        assert.equal(
          Object.values(localStorage).some((value) =>
            String(value).includes("secret"),
          ),
          false,
        );
      },
    );
    await t.test(
      "device credentials are keyed by server and the social view contains no credential",
      async () => {
        const sent = [];
        client.setSocialConnection({
          readyState: WebSocket.OPEN,
          send: (text) => sent.push(JSON.parse(text)),
        });
        client.beginSocialSession("server-one");
        client.receiveSocialResult({
          request_id: sent[0].request_id,
          ok: true,
          data: { profile_id: view.profile.id, token: "f".repeat(64) },
        });
        await act(async () => Promise.resolve());
        assert.equal(
          JSON.parse(
            localStorage.getItem("avenlab-social-profile-v1:server-one"),
          ).token,
          "f".repeat(64),
        );
        client.receiveSocialState(view);
        assert.equal(social.getState().view.profile.name, "Driver");
        assert.equal("token" in social.getState().view.profile, false);
        client.setSocialConnection(null);
      },
    );
    await t.test(
      "world reset accepts the destination's lower tick without disconnecting the player",
      () => {
        network.getState().setConnected(true);
        network.getState().setPlayerId("me");
        network.getState().setSnapshot({ tick: 900, entities: [] });
        network.getState().resetWorld();
        network.getState().setSnapshot({ tick: 2, entities: [] });
        assert.equal(network.getState().tick, 2);
        assert.equal(network.getState().connected, true);
        assert.equal(network.getState().playerId, "me");
      },
    );
    await t.test(
      "world transitions clear old ignition, selector and parking requests while preserving radio preferences",
      async () => {
        const { useInputStore: input, inputRef } = await load(
          "store/input/inputStore.ts",
        );
        const { PlayerFlags } = await load(
          "store/input/protocol/inputMasks.ts",
        );
        input
          .getState()
          .setInput({
            throttle: 1,
            steer: 1,
            brake: 1,
            handbrake: 1,
            cockpit_mask: 123,
            cabin_mask: 456,
            parking_brake: 1,
            vehicleMask: 255,
            playerMask: PlayerFlags.RADIO | PlayerFlags.DYNO | PlayerFlags.HONK,
          });
        input.getState().resetWorldControls();
        const value = inputRef.current;
        assert.equal(value.throttle, 0);
        assert.equal(value.steer, 0);
        assert.equal(value.brake, 0);
        assert.equal(value.handbrake, 0);
        assert.equal(value.cockpit_mask, undefined);
        assert.equal(value.cabin_mask, undefined);
        assert.equal(value.parking_brake, undefined);
        assert.equal(value.vehicleMask, 97);
        assert.equal(value.playerMask, PlayerFlags.RADIO | PlayerFlags.DYNO);
      },
    );
    await t.test(
      "live physics snapshots cause no social-panel React commits",
      async () => {
        const { SocialPanel } = await load("game/social/SocialPanel.tsx");
        social.getState().receive(view);
        let commits = 0;
        await render(
          h(
            Profiler,
            { id: "social", onRender: () => commits++ },
            h(SocialPanel),
          ),
        );
        const mounted = commits;
        for (let tick = 1; tick <= 20; tick++)
          await act(async () =>
            network.getState().setSnapshot({ tick, entities: [] }),
          );
        assert.equal(commits, mounted);
      },
    );
    await t.test(
      "invite URLs retain only a valid world code and discard unrelated secrets",
      async () => {
        const { worldInviteUrl, inviteCodeFromUrl } = await load(
          "game/social/invitationLinks.ts",
        );
        const url = worldInviteUrl(
          "https://game.example/?password=secret&token=private#debug",
          "b".repeat(32),
        );
        assert.equal(
          url,
          "https://game.example/?world_invite=" + "b".repeat(32),
        );
        assert.equal(inviteCodeFromUrl(url), "b".repeat(32));
        assert.equal(
          inviteCodeFromUrl("https://game.example/?world_invite=wrong"),
          null,
        );
      },
    );
    await t.test(
      "malformed social lists cannot replace the last valid server view",
      () => {
        social.getState().receive(view);
        const previous = social.getState().view;
        social.getState().receive({ ...view, players: [null] });
        assert.equal(social.getState().view, previous);
        social
          .getState()
          .receive({ ...view, groups: [{ id: "bad", members: null }] });
        assert.equal(social.getState().view, previous);
        social.getState().receive({
          ...view,
          worlds: [{ id: 1, name: "Bad", members: [null] }],
        });
        assert.equal(social.getState().view, previous);
      },
    );
    await t.test(
      "switching locked world targets clears the previous password before sending a join",
      async () => {
        const { WorldsPage } = await load("game/social/WorldsPage.tsx");
        const calls = [];
        const worlds = [1, 2].map((id) => ({
          id,
          name: `World ${id}`,
          map: "road_precision",
          owner_id: "other",
          listed: true,
          max_players: 10,
          players: 0,
          active: false,
          locked: true,
          invite_code: null,
          members: [],
        }));
        await render(
          h(
            Fragment,
            null,
            h(WorldsPage, {
              view: { ...view, worlds },
              command: async (...args) => {
                calls.push(args);
                return null;
              },
              onStatus: () => {},
            }),
            h(OnScreenKeyboard),
          ),
        );
        const joinButtons = () =>
          [...document.querySelectorAll("button")].filter(
            (node) => node.textContent === "JOIN",
          );
        await act(async () => joinButtons()[0].click());
        await click("WORLD PASSWORD");
        await click("Type A");
        await click("DONE");
        assert.equal(by("WORLD PASSWORD").value, "A");
        await act(async () => joinButtons()[1].click());
        assert.equal(by("WORLD PASSWORD").value, "");
        assert.equal(calls.length, 0);
        await act(async () =>
          document
            .querySelector("form")
            .dispatchEvent(
              new Event("submit", { bubbles: true, cancelable: true }),
            ),
        );
        assert.equal(calls[0][1].world_id, 2);
        assert.equal(calls[0][1].password, "");
      },
    );
  } finally {
    await act(async () => root.unmount());
    await server.close();
    dom.window.close();
    for (const [key, value] of old)
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
  }
});
