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
  // JSDOM has no decoder; browser QA checks the actual background video.
  dom.window.HTMLMediaElement.prototype.play = async () => {};
  dom.window.HTMLMediaElement.prototype.pause = () => {};
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
    const { useCanBusStore: bus } = await load('store/canBusStore.ts');
    const { useSelectionStore: selection } = await load('store/selectionStore.ts');
    const { useSignalReconStore: recon } = await load('store/signalReconStore.ts');
    const { useNetworkStore: network } = await load('store/networkStore.ts');
    const { SignalReconSetup } = await load('game/modes/SignalReconSetup.tsx');
    const { SandboxSetup } = await load('game/modes/SandboxSetup.tsx');
    let statusRefreshes = 0;
    bus.setState({ refreshStatus: async () => { statusRefreshes++; } });
    const { MainMenu } = await load('game/MainMenu.tsx');
    const { PauseMenu } = await load('game/PauseMenu.tsx');
    const { SettingsMenu } = await load('game/SettingsMenu.tsx');
    const { CareerMenu } = await load('game/CareerMenu.tsx');
    const { MissionsMenu } = await load('game/MissionsMenu.tsx');
    const { SessionMenu } = await load('game/SessionMenu.tsx');
    const { VehicleMenu } = await load('game/VehicleMenu.tsx');
    const { DebugMenu } = await load('components/debugger/DebugMenu.tsx');
    const { PerformanceOverlay } = await load('performance/PerformanceOverlay.tsx');
    const { Keyboard } = await load('controls/Keyboard.ts');
    const { GameController } = await load('controls/GameController.ts');
    function Harness() {
      const screen = ui(s => s.screen), overlay = ui(s => s.overlay);
      const panel = overlay ?? screen;
      const Component = ({ main: MainMenu, sandbox_setup: SandboxSetup, signal_recon_setup: SignalReconSetup, pause: PauseMenu, settings: SettingsMenu, career: CareerMenu, missions: MissionsMenu, debug_menu: DebugMenu, vehicle_select: VehicleMenu, leave_game: SessionMenu })[panel];
      return h(Fragment, null, Component ? h(Component, { collapsed: false, setCollapsed: () => {} }) : null,
        screen === 'sandbox' ? h(PerformanceOverlay) : null, h(Keyboard), h(GameController));
    }
    root = createRoot(document.getElementById('root'));
    const reset = async (screen = 'main', overlay = null) => act(async () => {
      ui.setState({ screen, overlay, vehicleSelectionParent: null, debugMenuParent: 'pause', isModeLoading: false, selectedMenuIndexById: { main: 0, pause: 0, settings: 0, sandbox_setup: 0, signal_recon_setup: 0 } });
    });
    const click = async element => { assert.ok(element, 'element exists'); await act(async () => element.click()); };
    const tab = label => [...document.querySelectorAll('[role="tab"]')].find(el => el.textContent === label);
    const row = id => document.querySelector(`[data-menu-row="${id}"]`);
    const key = async (code, key = code, options = {}) => act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...options })));
    const button = async index => {
      await act(async () => { pad.buttons[index] = { pressed: true, value: 1 }; await new Promise(resolve => setTimeout(resolve, 45)); });
      await act(async () => { pad.buttons[index] = { pressed: false, value: 0 }; await new Promise(resolve => setTimeout(resolve, 35)); });
    };
    await reset(); await act(async () => { root.render(h(Harness)); await new Promise(resolve => setTimeout(resolve, 40)); });
    await act(async () => new Promise(resolve => setTimeout(resolve, 40)));

    await t.test('vehicle model changes discard old interpolation poses immediately', async () => {
      const { PhysicsInterpolationBuffer } = await load('hooks/usePhysicsInterpolator.ts');
      const buffer = new PhysicsInterpolationBuffer(() => 20);
      const old = { id: 'driver', vehicle_id: 'ae86', position: [12, 1, 34], rotation: [0, 0, 0, 1] };
      const next = { ...old, vehicle_id: 'tank', position: [12, 2, 34] };
      buffer.setSnapshot('driver', old, { tick: 1, received_at_ms: 0 });
      buffer.setSnapshot('driver', next, { tick: 2, received_at_ms: 20 });
      assert.equal(buffer.getInterpolated('driver', 50, 20), next);
    });
    await t.test('missing video and reduced motion keep the main menu usable', async () => {
      await reset();
      const video = document.querySelector('.main-menu video');
      assert.ok(video);
      await act(async () => video.dispatchEvent(new dom.window.Event('error')));
      assert.equal(document.querySelector('.main-menu video'), null);
      await key('Enter', 'Enter'); assert.equal(ui.getState().screen, 'sandbox_setup');
      await reset();
      await act(async () => preferences.getState().update({ reducedMotion: true }));
      assert.equal(document.querySelector('.main-menu video'), null);
      await button(13); assert.equal(ui.getState().getActiveMenuIndex(), 1);
      await act(async () => preferences.getState().update({ reducedMotion: false }));
      assert.ok(document.querySelector('.main-menu video'));
    });
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
      for (const screen of ['signal_recon', 'signal_recon_mission']) {
        await reset(screen);
        await key('KeyW', 'w'); await key('Space', ' '); await key('Escape', 'Escape'); await key('KeyH', 'h');
        await button(9); await button(0);
        assert.equal(ui.getState().screen, screen);
        assert.equal(ui.getState().overlay, null);
        assert.equal(inputs.getState().input.throttle, 0);
        assert.equal(inputs.getState().input.brake, 0);
      }
    });
    const pointerPress = async element => {
      assert.ok(element);
      await act(async () => {
        element.dispatchEvent(new dom.window.MouseEvent('pointerover', { bubbles: true }));
        element.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, button: 0 }));
      });
    };
    const readyBus = { active: 'can2', mode: 'listen-only', can2: { exists: true, up: true, state: 'UP' } };
    const resetRecon = async (status = readyBus, mode = 'simulation') => act(async () => {
      selection.setState({ vehicleIndex: 0 });
      bus.setState({ selectedInterface: 'vcan0', selectedMode: mode, status });
    });
    await t.test('Sandbox arrow keys focus vehicle, environment, Start and Exit and wrap without starting', async () => {
      await resetRecon(); await reset('sandbox_setup');
      assert.equal(document.querySelector('header select'), null, 'Sandbox has no CAN controls');
      assert.doesNotMatch(document.querySelector('header').textContent, /NO ACTIVE SESSION|LIVE \/|SIMULATION|IDLE/);
      assert.equal(document.activeElement.getAttribute('aria-label'), 'Vehicle selection');
      await key('ArrowRight'); assert.equal(selection.getState().vehicleIndex, 1);
      await key('Enter', 'Enter'); assert.equal(selection.getState().vehicleIndex, 2);
      assert.equal(ui.getState().screen, 'sandbox_setup', 'Enter adjusts a selector rather than launching');
      await key('ArrowDown');
      assert.equal(document.activeElement.getAttribute('aria-label'), 'Environment selection');
      await key('ArrowRight'); assert.equal(ui.getState().screen, 'sandbox_setup');
      await key('ArrowDown'); assert.match(document.activeElement.textContent, /START/);
      await key('ArrowLeft'); await key('ArrowRight'); assert.equal(ui.getState().screen, 'sandbox_setup');
      await key('ArrowDown'); assert.match(document.activeElement.textContent, /EXIT/);
      await key('ArrowDown'); assert.equal(document.activeElement.getAttribute('aria-label'), 'Vehicle selection');
      await key('ArrowUp'); assert.match(document.activeElement.textContent, /EXIT/);
      await key('Enter', 'Enter'); assert.equal(ui.getState().screen, 'main');
    });
    await t.test('Sandbox mouse, keyboard and controller Start require the game server but ignore CAN configuration', async () => {
      const original = globalThis.WebSocket;
      class FakeSocket {
        static OPEN = 1; static CONNECTING = 0;
        readyState = 0; bufferedAmount = 0; sent = [];
        close() { this.readyState = 3; this.onclose?.(); }
        send(message) { this.sent.push(JSON.parse(message)); }
      }
      globalThis.WebSocket = FakeSocket;
      const transport = await load('net/rustSocket.ts');
      try {
        const refreshes = statusRefreshes;
        const reconIdentity = recon.getState().vehicleIdentity;
        await resetRecon(); await reset('sandbox_setup');
        await button(13); await button(13);
        assert.match(document.activeElement.textContent, /START/);
        await button(0); assert.equal(ui.getState().screen, 'sandbox_setup');
        assert.match(document.querySelector('[role="status"]').textContent, /Connecting/);
        const connection = transport.connectRustServer();
        connection.readyState = FakeSocket.OPEN;
        await act(async () => {
          network.setState({ connected: true });
          bus.setState({ selectedInterface: 'can2', selectedMode: 'live', status: { can2: { exists: true, up: false } } });
        });
        for (const [device, canMode] of [['controller', 'live'], ['keyboard', 'listen-only'], ['mouse', 'offline']]) {
          await act(async () => bus.setState({ selectedMode: canMode, status: null }));
          await reset('sandbox_setup');
          assert.equal(document.querySelector('[data-sandbox-choice="2"]').getAttribute('aria-disabled'), 'false');
          await pointerPress(document.querySelector('[aria-label="Next vehicle"]'));
          const vehicle = selection.getState().getSelectedVehicle();
          const map = selection.getState().getSelectedMap();
          const before = connection.sent.length;
          if (device === 'mouse') await pointerPress(document.querySelector('[data-sandbox-choice="2"]'));
          else {
            await key('ArrowDown'); await key('ArrowDown');
            if (device === 'keyboard') await key('Enter', 'Enter'); else await button(0);
          }
          assert.equal(ui.getState().screen, 'sandbox', device);
          assert.equal(connection.sent.length, before + 1, `${device} starts once`);
          assert.deepEqual(connection.sent.at(-1), {
            type: 'spawn_request', vehicle: vehicle.id, map: map.id,
            mode: 'sandbox',
          });
          assert.equal(bus.getState().selectedInterface, 'can2');
          assert.equal(bus.getState().selectedMode, canMode, 'Sandbox does not overwrite Recon configuration');
          assert.equal(recon.getState().vehicleIdentity, reconIdentity, 'Sandbox does not overwrite the Recon vehicle profile');
          assert.equal(statusRefreshes, refreshes, 'Sandbox does not query CAN status');
        }
      } finally {
        await act(async () => transport.disconnectRustServer());
        globalThis.WebSocket = original;
      }
    });
    await t.test('Sandbox Exit works as a controller choice, B shortcut, Escape and mouse action', async () => {
      await reset('sandbox_setup');
      await button(13); await button(13); await button(13);
      assert.match(document.activeElement.textContent, /EXIT/);
      await button(0); assert.equal(ui.getState().screen, 'main');
      await reset('sandbox_setup'); await button(1); assert.equal(ui.getState().screen, 'main');
      await reset('sandbox_setup'); await key('Escape', 'Escape'); assert.equal(ui.getState().screen, 'main');
      await reset('sandbox_setup'); await pointerPress(document.querySelector('[data-sandbox-choice="3"]'));
      assert.equal(ui.getState().screen, 'main');
    });
    await t.test('mouse enters Recon through vehicle/CAN setup and carries the selected identity, interface and mode', async () => {
      await resetRecon(); await reset();
      await pointerPress(document.querySelectorAll('[role="button"]')[4]);
      assert.equal(ui.getState().screen, 'signal_recon_setup');
      assert.ok(document.querySelector('[aria-label="Vehicle CAN profile"]'));
      await pointerPress(document.querySelector('[aria-label="Next vehicle"]'));
      const selectedVehicle = selection.getState().getSelectedVehicle();
      for (let i = 0; i < 3; i++) await pointerPress(document.querySelector('[data-recon-choice="0"]'));
      assert.equal(bus.getState().selectedInterface, 'can2');
      await pointerPress(document.querySelector('[data-recon-choice="1"]'));
      await pointerPress(document.querySelector('[data-recon-choice="1"]'));
      assert.equal(bus.getState().selectedMode, 'listen-only');
      await pointerPress(document.querySelector('[data-recon-choice="3"]'));
      assert.equal(ui.getState().screen, 'signal_recon');
      assert.equal(recon.getState().vehicleSlug, selectedVehicle.canIdentity.slug);
      assert.equal(recon.getState().vehicleIdentity.make, selectedVehicle.canIdentity.make);
      assert.equal(bus.getState().selectedInterface, 'can2');
      assert.equal(bus.getState().selectedMode, 'listen-only');
      assert.equal(network.getState().connected, false, 'analysis entry does not require a driving server');
    });
    await t.test('controller follows interface, mode, vehicle and Start in their displayed order without driving input', async () => {
      await resetRecon(); await reset();
      await act(async () => ui.getState().setActiveMenuIndex(4));
      await button(0); assert.equal(ui.getState().screen, 'signal_recon_setup');
      assert.equal(document.activeElement.getAttribute('aria-label'), 'CAN interface: vcan0');
      await button(14); assert.equal(bus.getState().selectedInterface, 'can2');
      await button(13); await button(15); assert.equal(bus.getState().selectedMode, 'live');
      assert.equal(document.activeElement.getAttribute('aria-label'), 'Capture mode: live');
      await button(13); await button(15); assert.equal(selection.getState().vehicleIndex, 1);
      assert.equal(document.activeElement.getAttribute('aria-label'), 'Vehicle CAN profile');
      await button(13); assert.equal(ui.getState().getActiveMenuIndex(), 3);
      await button(0); assert.equal(ui.getState().screen, 'signal_recon');
      assert.equal(recon.getState().vehicleSlug, selection.getState().getSelectedVehicle().canIdentity.slug);
      assert.equal(inputs.getState().input.throttle, 0); assert.equal(inputs.getState().input.brake, 0);
      await button(9); assert.equal(ui.getState().overlay, null);
    });
    await t.test('live CAN readiness is checked for mouse and controller; simulation works without hardware', async () => {
      await resetRecon({ active: null, mode: 'offline', can2: { exists: true, up: false, state: 'DOWN' } }, 'live');
      await act(async () => bus.getState().setSelectedInterface('can2'));
      await reset('signal_recon_setup');
      assert.equal(document.querySelector('[data-recon-choice="3"]').getAttribute('aria-disabled'), 'true');
      assert.equal(document.querySelector('[role="alert"]'), null, 'no warning occupies the screen before an invalid start');
      const refreshes = statusRefreshes;
      await pointerPress(document.querySelector('[data-recon-choice="3"]'));
      assert.equal(ui.getState().screen, 'signal_recon_setup');
      const warning = document.querySelector('[role="alert"]');
      assert.match(warning.textContent, /can2 is down/);
      assert.ok(document.querySelector('header').nextElementSibling.contains(warning), 'warning appears under the header');
      await button(0); assert.equal(ui.getState().screen, 'signal_recon_setup');
      assert.ok(statusRefreshes >= refreshes + 2);
      await act(async () => bus.setState({ status: readyBus }));
      assert.equal(document.querySelector('[role="alert"]'), null, 'connection recovery removes the warning');
      await act(async () => bus.setState({ status: null }));
      assert.match(document.querySelector('[role="alert"]').textContent, /can2 is unavailable/);
      await act(async () => {
        const mode = document.querySelectorAll('header select')[1];
        mode.value = 'simulation';
        mode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      assert.equal(document.querySelector('[role="alert"]'), null, 'correcting the source in the header removes the warning');
      assert.match(document.querySelector('[data-recon-choice="1"]').textContent, /simulation/);
      assert.equal(document.querySelector('[data-recon-choice="3"]').getAttribute('aria-disabled'), 'false');
      await pointerPress(document.querySelector('[data-recon-choice="3"]'));
      assert.equal(ui.getState().screen, 'signal_recon');
    });
    await t.test('Recon setup Back returns to the main menu before opening analysis', async () => {
      await resetRecon(); await reset('signal_recon_setup');
      await key('Escape', 'Escape'); assert.equal(ui.getState().screen, 'main');
      await reset('signal_recon_setup'); await button(1); assert.equal(ui.getState().screen, 'main');
      await reset('signal_recon_setup'); await pointerPress(document.querySelector('[data-recon-choice="4"]'));
      assert.equal(ui.getState().screen, 'main');
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
        assert.equal(element.dataset.selected, 'true');
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
    await t.test('F2 and F3 toggle the debugger and readout, and the readout has a working close button', async () => {
      await reset('sandbox'); await act(async () => rendering.getState().update({ overlay: false }));
      await key('F3'); assert.equal(rendering.getState().overlay, true);
      await key('F3', 'F3', { repeat: true }); assert.equal(rendering.getState().overlay, true);
      await key('F3'); assert.equal(rendering.getState().overlay, false);
      await key('F3'); await click(document.querySelector('[aria-label="Close performance overlay"]'));
      assert.equal(rendering.getState().overlay, false);
      await key('F2'); assert.equal(ui.getState().overlay, 'debug_menu');
      await key('F2'); assert.equal(ui.getState().overlay, null);
      await key('F2'); await key('Escape'); assert.equal(ui.getState().overlay, null);
      await reset('sandbox', 'pause'); await key('F2'); assert.equal(ui.getState().overlay, 'debug_menu');
      await key('F2'); assert.equal(ui.getState().overlay, 'pause');
      await reset('signal_recon'); await key('F2'); await key('F3');
      assert.equal(ui.getState().overlay, null); assert.equal(rendering.getState().overlay, false);
      await reset('sandbox');
      const field = document.createElement('input'); document.body.append(field); field.focus();
      await key('F2'); await key('F3'); assert.equal(ui.getState().overlay, null); assert.equal(rendering.getState().overlay, false);
      field.remove();
      await act(async () => ui.setState({ isModeLoading: true })); await key('F2'); await key('F3');
      assert.equal(ui.getState().overlay, null); assert.equal(rendering.getState().overlay, false);
    });
    await t.test('directional input cannot confirm leave or launch an available mission', async () => {
      await reset('sandbox', 'leave_game'); await button(13);
      assert.equal(document.activeElement.dataset.menuRow, 'confirm');
      await button(14); assert.equal(ui.getState().overlay, 'leave_game');
      await button(1); assert.equal(ui.getState().overlay, 'pause');
      await reset('missions'); await button(15); assert.equal(ui.getState().screen, 'missions');
      await button(1); assert.equal(ui.getState().screen, 'main');
    });
    await t.test('H and the pause action open an in-game picker; confirmed swaps keep the same connection and reject errors', async () => {
      const original = globalThis.WebSocket;
      class FakeSocket extends dom.window.EventTarget {
        static OPEN = 1; static CONNECTING = 0;
        readyState = 0; bufferedAmount = 0; closed = false; sent = [];
        close() { this.closed = true; this.readyState = 3; this.onclose?.(); this.dispatchEvent(new dom.window.Event('close')); }
        send(data) { this.sent.push(JSON.parse(data)); }
        receive(message) {
          const event = new dom.window.MessageEvent('message', { data: JSON.stringify(message) });
          this.onmessage?.(event); this.dispatchEvent(event);
        }
      }
      globalThis.WebSocket = FakeSocket;
      const transport = await load('net/rustSocket.ts');
      try {
        const connection = transport.connectRustServer(); connection.readyState = FakeSocket.OPEN;
        const snapshot = { tick: 40, entities: [{ id: 'live-player', vehicle_id: 'ae86', position: [12, 1, 34], rotation: [0, 0, 0, 1] }] };
        await act(async () => network.setState({ connected: true, playerId: 'live-player', snapshot }));
        await reset('sandbox');
        const masks = await load('store/tools/inputMasks.ts');
        const before = inputs.getState().input.vehicleMask;
        await key('KeyH', 'H', { shiftKey: true });
        assert.equal(ui.getState().overlay, null);
        assert.equal(inputs.getState().input.vehicleMask, before ^ masks.VehicleFlags.HAZARDS);
        await key(preferences.getState().bindings.forward);
        assert.equal(inputs.getState().input.throttle, 1);
        await key('KeyH', 'h');
        assert.equal(ui.getState().overlay, 'vehicle_select');
        assert.equal(inputs.getState().input.throttle, 0);
        assert.equal(document.querySelector('[role="tablist"]'), null);
        assert.ok(row('vehicle-brz'));
        await key('Escape', 'Escape'); assert.equal(ui.getState().overlay, null, 'H picker returns directly to driving');
        await reset('sandbox', 'pause');
        await pointerPress(document.querySelectorAll('[role="button"]')[3]);
        assert.equal(ui.getState().overlay, 'vehicle_select');
        assert.equal(connection.closed, false);
        await button(1); assert.equal(ui.getState().overlay, 'pause');
        await key('KeyH', 'h');
        await click(row('vehicle-brz'));
        const request = connection.sent.at(-1);
        assert.equal(request.type, 'change_vehicle_request'); assert.equal(request.vehicle, 'brz');
        assert.equal(ui.getState().overlay, 'vehicle_select', 'wait for authoritative confirmation');
        await act(async () => connection.receive({ type: 'vehicle_changed', request_id: 'stale', vehicle: 'brz' }));
        assert.equal(ui.getState().overlay, 'vehicle_select');
        await act(async () => connection.receive({ type: 'vehicle_changed', request_id: request.request_id, vehicle: 'brz' }));
        assert.equal(ui.getState().overlay, null);
        assert.equal(ui.getState().screen, 'sandbox');
        assert.equal(transport.socket, connection); assert.equal(connection.closed, false);
        assert.equal(network.getState().playerId, 'live-player');
        assert.equal(network.getState().snapshot, snapshot, 'the client does not rewrite authoritative poses/models');
        assert.equal(selection.getState().getSelectedVehicle().id, 'brz');
        await key('KeyH', 'h');
        await click(row('vehicle-tank'));
        const rejected = connection.sent.at(-1);
        await act(async () => connection.receive({ type: 'vehicle_change_error', request_id: rejected.request_id, message: 'Not enough room for this vehicle.' }));
        assert.match(document.querySelector('[role="alert"]').textContent, /Not enough room/);
        assert.equal(ui.getState().overlay, 'vehicle_select');
        assert.equal(network.getState().snapshot, snapshot);
        await button(1); assert.equal(ui.getState().overlay, null);
        const input = document.createElement('input'); document.body.append(input); input.focus();
        await key('KeyH', 'h'); assert.equal(ui.getState().overlay, null, 'typing H does not open the picker');
        input.remove();
      } finally { await act(async () => transport.disconnectRustServer()); globalThis.WebSocket = original; }
    });
    await t.test('Leave is a two-button dialog: Cancel/Enter, B and Escape keep the connection and Confirm is explicit', async () => {
      await reset('sandbox', 'leave_game');
      assert.ok(document.querySelector('[role="alertdialog"]'));
      assert.equal(document.querySelector('[role="tablist"]'), null);
      assert.equal(document.querySelector('h1').textContent, 'LEAVE GAME?');
      assert.match(document.querySelector('.menu-confirm-body').textContent, /Are you sure you want to leave game\?/);
      assert.equal(document.activeElement.dataset.menuRow, 'cancel');
      await key('Enter', 'Enter'); assert.equal(ui.getState().overlay, 'pause');
      await reset('sandbox', 'leave_game'); await button(1); assert.equal(ui.getState().overlay, 'pause');
      await reset('sandbox', 'leave_game'); await key('Escape', 'Escape'); assert.equal(ui.getState().overlay, 'pause');
      await reset('sandbox', 'leave_game'); await click(row('cancel')); assert.equal(ui.getState().overlay, 'pause');
    });
    await t.test('confirmed Leave closes the old session before reconnecting to the main menu', async () => {
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
        for (const [overlay, screen] of [['leave_game', 'main']]) {
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
