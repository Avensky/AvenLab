import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server, ui, route, preferences, canDrive, canNavigateMenu;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  ui = (await server.ssrLoadModule('/src/store/uiStore.ts')).useUIStore;
  ({ routeMenuAction: route, canDrive, canNavigateMenu } = await server.ssrLoadModule('/src/store/tools/inputRouting.ts'));
  preferences = await server.ssrLoadModule('/src/store/preferencesStore.ts');
  globalThis.window = new EventTarget();
});
after(async () => { delete globalThis.window; await server?.close(); });

test('every pause row routes correctly and navigation wraps across all seven items', () => {
  [null, 'debug_menu', 'settings', 'vehicle_select', 'missions', 'career', 'leave_game'].forEach((target, index) => {
    ui.setState({ screen: 'sandbox', overlay: 'pause', isModeLoading: false });
    ui.getState().setActiveMenuIndex(index); route('activate');
    assert.equal(ui.getState().overlay, target, `pause row ${index}`);
    assert.equal(ui.getState().screen, 'sandbox');
  });
  ui.setState({ overlay: 'pause' });
  ui.getState().setActiveMenuIndex(0); route('up');
  assert.equal(ui.getState().getActiveMenuIndex(), 6);
  route('down'); assert.equal(ui.getState().getActiveMenuIndex(), 0);
});

test('main menu controller routes match mouse destinations and Swarm stays planned', () => {
  ['sandbox_setup', 'missions', 'career', 'settings', 'signal_recon', 'main'].forEach((screen, index) => {
    ui.setState({ screen: 'main', overlay: null, isModeLoading: false });
    ui.getState().setActiveMenuIndex(index); route('activate');
    assert.equal(ui.getState().screen, screen);
    assert.equal(ui.getState().overlay, null);
  });
});

test('panel input never activates the underlying main menu and Back returns to the correct parent', () => {
  const received = [];
  const handler = event => received.push(event.detail);
  window.addEventListener('avenlab:panel-action', handler);
  try {
    ui.setState({ screen: 'main', overlay: 'settings', isModeLoading: false });
    for (const action of ['up', 'next_tab', 'left', 'activate', 'back']) route(action);
    assert.deepEqual(received, ['up', 'next_tab', 'left', 'activate', 'back']);
    assert.equal(ui.getState().screen, 'main');
    ui.setState({ screen: 'sandbox', overlay: 'career' });
    ui.getState().backToParentMenu(); assert.equal(ui.getState().overlay, 'pause');
    route('back'); assert.equal(ui.getState().overlay, null);
    ui.setState({ screen: 'settings', overlay: null });
    ui.getState().backToParentMenu(); assert.equal(ui.getState().screen, 'main');
  } finally { window.removeEventListener('avenlab:panel-action', handler); }
});

test('tab shoulders cannot accidentally leave the garage; loading blocks menu activation', () => {
  let exits = 0;
  const onExit = () => exits++;
  window.addEventListener('avenlab:sandbox-exit', onExit);
  try {
    ui.setState({ screen: 'sandbox_setup', overlay: null });
    route('previous_tab'); route('next_tab'); assert.equal(exits, 0);
    route('back'); assert.equal(exits, 1);
    ui.setState({ screen: 'main', overlay: null, isModeLoading: true });
    route('activate'); assert.equal(ui.getState().screen, 'main');
  } finally { window.removeEventListener('avenlab:sandbox-exit', onExit); ui.setState({ isModeLoading: false }); }
});

test('corrupt stored preferences cannot disable steering or steal reserved shortcuts', () => {
  const { sanitizePreferences, DEFAULT_BINDINGS } = preferences;
  const sanitized = sanitizePreferences({ fov: Infinity, controllerDeadzone: -5, steeringSensitivity: 50, menuTextScale: 100,
    bindings: { ...DEFAULT_BINDINGS, forward: 'KeyE' }, favoriteVehicles: ['brz', null, 2] });
  assert.equal(sanitized.fov, 75); assert.equal(sanitized.controllerDeadzone, 0.05);
  assert.equal(sanitized.steeringSensitivity, 1.5); assert.equal(sanitized.menuTextScale, 1.25);
  assert.deepEqual(sanitized.bindings, DEFAULT_BINDINGS); assert.deepEqual(sanitized.favoriteVehicles, ['brz']);
  assert.deepEqual(sanitizePreferences({ bindings: { ...DEFAULT_BINDINGS, reverse: 'KeyW' } }).bindings, DEFAULT_BINDINGS);
  assert.equal(sanitizePreferences({ bindings: { ...DEFAULT_BINDINGS, forward: 'KeyU' } }).bindings.forward, 'KeyU');
});


test('Signal Recon and planned modes cannot open the driving pause stack or receive driving input', () => {
  for (const screen of ['signal_recon', 'signal_recon_setup', 'signal_recon_mission', 'swarm']) {
    ui.setState({ screen, overlay: null, isModeLoading: false });
    ui.getState().openPause(); assert.equal(ui.getState().overlay, null);
    ui.getState().togglePauseMenu(); assert.equal(ui.getState().overlay, null);
    for (const overlay of ['pause', 'debug_menu', 'vehicle_select', 'leave_game']) {
      ui.getState().setOverlay(overlay); assert.equal(ui.getState().overlay, null);
    }
    assert.equal(canDrive(), false);
    assert.equal(canNavigateMenu(), false);
  }
  ui.setState({ screen: 'sandbox', overlay: null });
  assert.equal(canDrive(), true);
  ui.getState().openPause(); assert.equal(ui.getState().overlay, 'pause');
});
