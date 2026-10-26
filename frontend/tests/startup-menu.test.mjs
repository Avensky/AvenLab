import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { act, createElement as h, StrictMode } from 'react';

test('real App removes the startup cover and opens the latest main menu without video, WebGL or a backend', async () => {
  const dom = new JSDOM('<div id="startup-screen">LOGO</div><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  class OfflineSocket extends dom.window.EventTarget {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 0; bufferedAmount = 0;
    send() {}
    close() { this.readyState = 3; this.onclose?.(); this.dispatchEvent(new dom.window.Event('close')); }
  }
  const previous = new Map();
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage, WebSocket: OfflineSocket,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLMediaElement.prototype.play = () => Promise.reject(new Error('Autoplay blocked'));
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  document.hasFocus = () => true;
  navigator.getGamepads = () => [];
  const { createRoot } = await import('react-dom/client');
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  let root, transport;
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.tsx');
    const { useUIStore: ui } = await server.ssrLoadModule('/src/store/uiStore.ts');
    transport = await server.ssrLoadModule('/src/net/rustSocket.ts');
    ui.setState({ screen: 'main', overlay: null, isModeLoading: false });
    root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(h(StrictMode, null, h(App))); });
    await act(async () => new Promise(resolve => setTimeout(resolve, 80)));
    assert.equal(document.getElementById('startup-screen'), null, 'startup cover must be removed after React commits');
    assert.ok(document.querySelector('.main-menu'));
    assert.ok(document.querySelector('.main-menu').textContent.includes('REDLINE VECTOR'));
    assert.equal(document.querySelector('canvas'), null, 'main menu must not need WebGL');
    const settings = [...document.querySelectorAll('.main-menu [role="button"]')].find(e => /settings/i.test(e.textContent));
    assert.ok(settings);
    await act(async () => settings.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, button: 0 })));
    assert.equal(ui.getState().screen, 'settings', 'main menu remains interactive with unavailable media/backend');
    await act(async () => ui.setState({ screen: 'main', overlay: null }));
    assert.ok(document.querySelector('.main-menu'));
    const { ModeLoadingScreen } = await server.ssrLoadModule('/src/game/ModeLoadingScreen.tsx');
    await act(async () => root.render(h(ModeLoadingScreen)));
    for (const screen of ['sandbox_setup', 'signal_recon_setup']) {
      await act(async () => ui.setState({ screen, isModeLoading: true, loadingLabel: 'PREPARING SELECTION' }));
      assert.equal(document.getElementById('root').childElementCount, 0,
        'selection must leave the native grid stage visible instead of a loading card/video');
      assert.equal(ui.getState().isModeLoading, true, 'hiding the card must not bypass the readiness gate');
    }
    await act(async () => ui.setState({ screen: 'sandbox', loadingLabel: 'LOADING SANDBOX' }));
    assert.equal(document.querySelector('h1')?.textContent, 'LOADING SANDBOX', 'gameplay keeps its loading screen');
  } finally {
    if (root) await act(async () => root.unmount());
    transport?.disconnectRustServer();
    await server.close(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
