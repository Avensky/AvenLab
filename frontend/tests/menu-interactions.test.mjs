import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h, Fragment } from 'react';
import { createRoot } from 'react-dom/client';

test('mouse, keyboard and polled gamepad navigate the real menus and preferences', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const previous = new Map();
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
    Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, localStorage: dom.window.localStorage,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.document.hasFocus = () => true;
  const pad = { connected: true, index: 0, id: 'test-standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  dom.window.navigator.getGamepads = () => [null, pad];
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  let root;
  try {
    const load = path => server.ssrLoadModule(`/src/${path}`);
    const { useUIStore: ui } = await load('store/uiStore.ts');
    const { usePreferencesStore: preferences } = await load('store/preferencesStore.ts');
    const { useRenderSettingsStore: rendering } = await load('store/renderSettingsStore.ts');
    const { useInputStore: inputs } = await load('store/inputStore.ts');
    const { MainMenu } = await load('game/MainMenu.tsx');
    const { PauseMenu } = await load('game/PauseMenu.tsx');
    const { SettingsMenu } = await load('game/SettingsMenu.tsx');
    const { CareerMenu } = await load('game/CareerMenu.tsx');
    const { MissionsMenu } = await load('game/MissionsMenu.tsx');
    const { SessionMenu } = await load('game/SessionMenu.tsx');
    const { DebugMenu } = await load('components/debugger/DebugMenu.tsx');
    const { Keyboard } = await load('controls/Keyboard.ts');
    const { GameController } = await load('controls/GameController.ts');
    function Harness() {
      const screen = ui(s => s.screen), overlay = ui(s => s.overlay);
      const panel = overlay ?? screen;
      const Component = ({ main: MainMenu, pause: PauseMenu, settings: SettingsMenu, career: CareerMenu, missions: MissionsMenu, debug_menu: DebugMenu, vehicle_select: SessionMenu, leave_game: SessionMenu })[panel];
      return h(Fragment, null, Component ? h(Component, { changeVehicle: panel === 'vehicle_select' }) : null, h(Keyboard), h(GameController));
    }
    root = createRoot(document.getElementById('root'));
    const reset = async (screen = 'main', overlay = null) => act(async () => {
      ui.setState({ screen, overlay, isModeLoading: false, selectedMenuIndexById: { main: 0, pause: 0, settings: 0, sandbox_setup: 0, signal_recon_setup: 0 } });
    });
    const click = async element => { assert.ok(element, 'element exists'); await act(async () => element.click()); };
    const tab = label => [...document.querySelectorAll('[role="tab"]')].find(el => el.textContent === label);
    const row = id => document.querySelector(`[data-menu-row="${id}"]`);
    const key = async (code, key = code) => act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true })));
    const button = async index => {
      await act(async () => { pad.buttons[index] = { pressed: true, value: 1 }; await new Promise(resolve => setTimeout(resolve, 45)); });
      await act(async () => { pad.buttons[index] = { pressed: false, value: 0 }; await new Promise(resolve => setTimeout(resolve, 35)); });
    };
    await reset(); await act(async () => { root.render(h(Harness)); await new Promise(resolve => setTimeout(resolve, 40)); });
    await act(async () => new Promise(resolve => setTimeout(resolve, 40)));

    await t.test('every main-menu entry has the same selected theme for mouse and controller', async () => {
      await reset();
      let theme;
      for (let index = 0; index < 6; index++) {
        const element = document.querySelectorAll('[role="button"]')[index];
        await act(async () => element.dispatchEvent(new dom.window.MouseEvent('pointerover', { bubbles: true })));
        assert.equal(ui.getState().getActiveMenuIndex(), index);
        assert.equal(element.dataset.selected, 'true');
        if (index === 0) theme = element.className;
        else assert.equal(element.className, theme, `row ${index} should use the Sandbox theme`);
      }
      const swarm = document.querySelectorAll('[role="button"]')[5];
      assert.equal(swarm.getAttribute('aria-disabled'), 'true');
      await act(async () => swarm.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, button: 0 })));
      assert.equal(ui.getState().screen, 'main');
      await button(0); assert.equal(ui.getState().screen, 'main');
      await button(12);
      assert.equal(document.querySelector('[data-selected="true"]').className, theme);
    });
    await t.test('analysis workspace ignores driving shortcuts, pause and gamepad Start', async () => {
      for (const screen of ['signal_recon', 'signal_recon_setup', 'signal_recon_mission']) {
        await reset(screen);
        await key('KeyW', 'w'); await key('Space', ' '); await key('Escape', 'Escape');
        await button(9); await button(0);
        assert.equal(ui.getState().screen, screen);
        assert.equal(ui.getState().overlay, null);
        assert.equal(inputs.getState().input.throttle, 0);
        assert.equal(inputs.getState().input.brake, 0);
      }
    });
    await t.test('tab changes keep one viewport shell, pin navigation and reset only the content scroll', async () => {
      for (const [screen, names] of [
        ['missions', ['Overview', 'Objectives', 'Logistics', 'Squad roles']],
        ['career', ['Statistics', 'History', 'Leaderboard', 'Favorites', 'Customize', 'Achievements']],
        ['settings', ['Display', 'Audio', 'Keyboard', 'Controller', 'Social', 'Other', 'Accessibility']],
      ]) {
        await reset(screen);
        const shell = document.querySelector('[role="dialog"]');
        const header = shell.querySelector('header');
        const footer = shell.querySelector('footer');
        const content = shell.querySelector('[role="tabpanel"]');
        assert.ok(shell.classList.contains('h-full'));
        assert.ok(shell.classList.contains('w-full'));
        assert.ok(document.querySelector('.tabbed-menu'));
        await click(tab(names.at(-1)));
        for (const name of names) {
          content.scrollTop = 200;
          await click(tab(name));
          assert.equal(document.querySelector('[role="dialog"]'), shell);
          assert.equal(shell.querySelector('header'), header);
          assert.equal(shell.querySelector('footer'), footer);
          assert.equal(shell.querySelector('[role="tabpanel"]'), content);
          assert.equal(content.scrollTop, 0, `${screen} / ${name}`);
          assert.equal(tab(name).getAttribute('aria-selected'), 'true');
        }
      }
    });
    await t.test('Settings and Leave hover/click select their actual pause rows', async () => {
      for (const [index, target] of [[2, 'settings'], [6, 'leave_game']]) {
        await reset('sandbox', 'pause');
        const element = document.querySelectorAll('[role="button"]')[index];
        await act(async () => element.dispatchEvent(new dom.window.MouseEvent('pointerover', { bubbles: true })));
        assert.equal(ui.getState().getActiveMenuIndex(), index);
        assert.ok(element.className.includes('ring-yellow'));
        await act(async () => element.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, button: 0 })));
        assert.equal(ui.getState().overlay, target);
        await key('Escape', 'Escape'); assert.equal(ui.getState().overlay, 'pause');
      }
    });
    await t.test('keyboard focus tracks row navigation and Enter opens Settings once', async () => {
      await reset('sandbox', 'pause');
      await key('ArrowDown', 'ArrowDown'); await key('ArrowDown', 'ArrowDown');
      assert.ok(document.activeElement.textContent.includes('Settings'));
      await key('Enter', 'Enter'); assert.equal(ui.getState().overlay, 'settings');
      assert.equal(rendering.getState().dpr, 1, 'entering Settings must not also adjust its first row');
    });
    await t.test('controller in a nonzero slot navigates rows, tabs, values and Back', async () => {
      await reset();
      await button(13); await button(13); await button(13);
      assert.equal(ui.getState().getActiveMenuIndex(), 3);
      await button(0); assert.equal(ui.getState().screen, 'settings');
      assert.equal(tab('Display').getAttribute('aria-selected'), 'true');
      await button(15); assert.equal(rendering.getState().dpr, 1.5);
      await button(5); assert.equal(tab('Audio').getAttribute('aria-selected'), 'true');
      await button(5); assert.equal(tab('Keyboard').getAttribute('aria-selected'), 'true');
      await button(4); assert.equal(tab('Audio').getAttribute('aria-selected'), 'true');
      await button(1); assert.equal(ui.getState().screen, 'main');
    });
    await t.test('all settings categories open, key remapping is saved and driving remains blocked in menus', async () => {
      await reset('settings');
      for (const name of ['Display', 'Audio', 'Keyboard', 'Controller', 'Social', 'Other', 'Accessibility']) { await click(tab(name)); assert.equal(tab(name).getAttribute('aria-selected'), 'true'); }
      await click(tab('Keyboard')); await click(row('forward')); await key('KeyU', 'u');
      assert.equal(preferences.getState().bindings.forward, 'KeyU');
      assert.equal(JSON.parse(localStorage.getItem('avenlab-preferences-v1')).state.bindings.forward, 'KeyU');
      await key('KeyU', 'u'); assert.equal(inputs.getState().input.throttle, 0);
      await click(tab('Controller')); await click(row('deadzone'));
      assert.equal(preferences.getState().controllerDeadzone, 0.2);
      await click(tab('Accessibility')); await click(row('contrast'));
      assert.equal(preferences.getState().highContrast, true);
      const savedDpr = rendering.getState().dpr;
      await act(async () => rendering.getState().startSandbox()); assert.equal(rendering.getState().dpr, savedDpr);
    });
    await t.test('remapped throttle and tuned steering reach driving input and menus release both', async () => {
      await reset('sandbox');
      await act(async () => new Promise(resolve => setTimeout(resolve, 40)));
      await key('KeyW', 'w'); assert.equal(inputs.getState().input.throttle, 0);
      await key('KeyU', 'u'); assert.equal(inputs.getState().input.throttle, 1);
      await act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keyup', { code: 'KeyU', key: 'u', bubbles: true })));
      assert.equal(inputs.getState().input.throttle, 0);
      await act(async () => { preferences.getState().update({ steeringSensitivity: 1.25, invertSteering: true }); pad.axes[0] = 0.1; await new Promise(resolve => setTimeout(resolve, 40)); });
      assert.equal(Math.abs(inputs.getState().input.steer), 0);
      await act(async () => { pad.axes[0] = 0.6; await new Promise(resolve => setTimeout(resolve, 40)); });
      assert.equal(inputs.getState().input.steer, -0.75);
      await key('Escape', 'Escape'); assert.equal(ui.getState().overlay, 'pause');
      assert.equal(inputs.getState().input.steer, 0);
      pad.axes[0] = 0;
    });
    await t.test('career favorites persist while unconnected career pages stay empty', async () => {
      await reset('career'); await click(tab('Favorites')); await click(row('brz'));
      assert.deepEqual(preferences.getState().favoriteVehicles, ['brz']);
      assert.deepEqual(JSON.parse(localStorage.getItem('avenlab-preferences-v1')).state.favoriteVehicles, ['brz']);
      for (const name of ['Statistics', 'History', 'Leaderboard', 'Customize', 'Achievements']) { await click(tab(name)); assert.equal(tab(name).getAttribute('aria-selected'), 'true'); }
    });
    await t.test('debug controls remain functional in their new tabs and do not leak into the background menu', async () => {
      await reset('sandbox', 'debug_menu');
      await click(row('debug-1'));
      const { useWorldStore } = await load('store/worldStore.ts');
      assert.equal(useWorldStore.getState().debugMask & 1, 1);
      await click(tab('Vehicles & GLBs')); assert.ok(row('vehicle-default')); assert.equal(row('debug-1'), null);
      await click(tab('Environment')); assert.ok(row('environment-default'));
      await click(tab('Rendering')); await click(row('overlay')); assert.equal(rendering.getState().overlay, true);
      await click(tab('Captures')); assert.ok(row('csv')); assert.ok(row('json'));
      await button(1); assert.equal(ui.getState().overlay, 'pause');
    });
    await t.test('directional input cannot confirm leave or launch an available mission', async () => {
      await reset('sandbox', 'leave_game'); await button(13);
      assert.ok(document.activeElement.textContent.includes('Leave game'));
      await button(14); assert.equal(ui.getState().overlay, 'leave_game');
      await button(1); assert.equal(ui.getState().overlay, 'pause');
      await reset('missions'); await button(15); assert.equal(ui.getState().screen, 'missions');
      await button(1); assert.equal(ui.getState().screen, 'main');
    });
    await t.test('change vehicle and leave close the old session before reconnecting to the destination', async () => {
      const original = globalThis.WebSocket;
      class FakeSocket {
        static OPEN = 1; static CONNECTING = 0;
        readyState = 0; bufferedAmount = 0; closed = false;
        close() { this.closed = true; this.readyState = 3; this.onclose?.(); }
        send() {}
      }
      globalThis.WebSocket = FakeSocket;
      const transport = await load('net/rustSocket.ts');
      try {
        for (const [overlay, screen] of [['vehicle_select', 'sandbox_setup'], ['leave_game', 'main']]) {
          const old = transport.connectRustServer();
          await reset('sandbox', overlay);
          await click(row('confirm'));
          assert.equal(old.closed, true);
          assert.equal(ui.getState().screen, screen);
          assert.equal(ui.getState().overlay, null);
          assert.notEqual(transport.socket, old);
        }
      } finally { transport.disconnectRustServer(); globalThis.WebSocket = original; }
    });
  } finally {
    if (root) await act(async () => root.unmount());
    await server.close(); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});
