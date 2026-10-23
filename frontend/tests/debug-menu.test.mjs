import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

test('debug menu renders baseline, granular controls, capture and export without a live socket', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { DebugMenu } = await server.ssrLoadModule('/src/components/debugger/DebugMenu.tsx');
    const html = renderToString(createElement(DebugMenu));
    for (const label of ['Latency Lab', 'LOWEST-LAG COLLIDER BASELINE', 'Vehicles default: COLLIDER', 'Environment default: COLLIDER',
      'Vehicle interpolation: OFF', 'Vehicle spotlights: OFF', 'RECORD BASELINE', 'RECORD COMPARISON', 'EXPORT CAPTURES AS CSV', 'EXPORT CAPTURES AS JSON']) {
      assert.ok(html.includes(label), `Missing control: ${label}`);
    }
  } finally { await server.close(); }
});
