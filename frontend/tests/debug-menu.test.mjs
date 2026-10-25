import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };

test('debug menu separates visualizers, vehicles, environment, rendering and captures', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { DebugMenu } = await server.ssrLoadModule('/src/components/debugger/DebugMenu.tsx');
    const html = renderToString(createElement(DebugMenu));
    for (const label of ['Visualizers', 'Vehicles &amp; GLBs', 'Environment', 'Rendering', 'Captures', 'Suspension Rays diagnostics', 'Slip Vectors diagnostics']) {
      assert.ok(html.includes(label), `Missing control: ${label}`);
    }
    assert.ok(!html.includes('Vehicles default'), 'models belong in their own tab');
    assert.ok(!html.includes('Export captures as CSV'), 'capture controls belong in their own tab');
  } finally { await server.close(); }
});

test('starting Sandbox clears object overrides while retaining display preferences', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
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
    assert.equal(state.environmentMode, 'glb');
    assert.equal(state.stars, true); assert.equal(state.reflections, true);
    assert.equal(state.autoVehicleAlignment, true);
    assert.deepEqual(state.vehicleOverrides, {});
    assert.equal(Object.keys(VEHICLE_MODEL_PATHS).length, 5);
  } finally { await server.close(); }
});
