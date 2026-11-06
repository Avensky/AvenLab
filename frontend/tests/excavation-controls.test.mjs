import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { createElement as h, act } from 'react';
import { createRoot } from 'react-dom/client';

test('collision preview applies once, undo restores the hill, and stale previews cannot overwrite later edits', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const old = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  let root;
  try {
    const { useLayoutStore: layout } = await vite.ssrLoadModule('/src/worldBuilder/state/layoutStore.ts');
    const { useExcavationPreview: previews } = await vite.ssrLoadModule('/src/worldBuilder/state/excavationPreview.ts');
    const { ExcavationTools } = await vite.ssrLoadModule('/src/worldBuilder/panels/ExcavationTools.tsx');
    const { emptyLayout, addPiece } = await vite.ssrLoadModule('/src/worldBuilder/document/layoutDocument.ts');
    const before = addPiece({ ...emptyLayout('test'), ground: false, repeat: false }, 'mountain-segment-standard', [0, 0, 10]);
    layout.setState({ doc: before, past: [], future: [], cursor: [0, 0, 0] });
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(h(ExcavationTools)));
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
    assert.equal(document.querySelector('[aria-label="Excavation segment preset"]').value, 'standard');
    assert.equal(document.querySelector('[aria-label="Path length (m)"]').value, '24');
    await act(async () => button('Preview collision cut').click());
    assert(previews.getState().preview);
    assert.equal(layout.getState().doc, before);
    await act(async () => button('Cancel preview').click());
    assert.equal(previews.getState().preview, null);
    await act(async () => button('Preview collision cut').click());
    const expected = previews.getState().preview.doc;
    await act(async () => button('Apply excavation').click());
    assert.deepEqual(layout.getState().doc, expected);
    assert.equal(layout.getState().past.length, 1);
    await act(async () => layout.getState().undo());
    assert.deepEqual(layout.getState().doc, before);
    await act(async () => button('Preview collision cut').click());
    await act(async () => layout.getState().commit({ ...layout.getState().doc, title: 'Later manual edit' }));
    assert.equal(previews.getState().preview, null);
    assert.equal(button('Apply excavation'), undefined);
    assert.equal(layout.getState().doc.title, 'Later manual edit');
    await act(async () => button('Preview collision cut').click());
    await act(async () => window.dispatchEvent(new Event('avenlab:cancel-authoring')));
    assert.equal(previews.getState().preview, null);
  } finally {
    if (root) await act(async () => root.unmount());
    await vite.close(); dom.window.close();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
