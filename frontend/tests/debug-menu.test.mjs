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
    for (const label of ['Latency Lab', 'LOWEST-LAG COLLIDER BASELINE', 'Vehicles default: GLB', 'Environment default: COLLIDER',
      'Vehicle interpolation: OFF', 'Vehicle spotlights: OFF', 'RECORD BASELINE', 'RECORD COMPARISON', 'EXPORT CAPTURES AS CSV', 'EXPORT CAPTURES AS JSON']) {
      assert.ok(html.includes(label), `Missing control: ${label}`);
    }
  } finally { await server.close(); }
});

test('starting Sandbox restores vehicle GLBs while keeping the city and effects minimal', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { useRenderSettingsStore } = await server.ssrLoadModule('/src/store/renderSettingsStore.ts');
    const { useWorldStore } = await server.ssrLoadModule('/src/store/worldStore.ts');
    const { VEHICLE_MODEL_PATHS } = await server.ssrLoadModule('/src/vehicles/tools/vehicleModelPaths.ts');
    useRenderSettingsStore.getState().baseline();
    assert.equal(useWorldStore.getState().mode, 'collider');
    useRenderSettingsStore.getState().update({ environmentMode: 'glb', stars: true, reflections: true, vehicleOverrides: { me: 'collider' } });
    useRenderSettingsStore.getState().startSandbox();
    const state = useRenderSettingsStore.getState();
    assert.equal(useWorldStore.getState().mode, 'glb');
    assert.equal(state.environmentMode, 'collider');
    assert.equal(state.stars, false); assert.equal(state.reflections, false);
    assert.equal(state.autoVehicleAlignment, true);
    assert.deepEqual(state.vehicleOverrides, {});
    assert.equal(Object.keys(VEHICLE_MODEL_PATHS).length, 5);
  } finally { await server.close(); }
});
