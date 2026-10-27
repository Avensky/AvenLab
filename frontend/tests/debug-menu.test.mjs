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

test('mobile city preset enables visual chunks and preserves HUD and interpolation preferences', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { useRenderSettingsStore: rendering } = await server.ssrLoadModule('/src/store/renderSettingsStore.ts');
    const { useWorldStore: world } = await server.ssrLoadModule('/src/store/worldStore.ts');
    const { useDebugViewStore: debug } = await server.ssrLoadModule('/src/store/debugViewStore.ts');
    rendering.getState().update({ hud:false, cityQuality:'original', dpr:2, shadows:true, reflections:true, chunkOverrides:{'0,0':'collider'}, assetGlbs:{'0,0/blocks':false} });
    debug.getState().setInterpolationEnabled(true);
    rendering.getState().cityPerformancePreset();
    const s=rendering.getState();
    assert.equal(s.cityQuality,'fast'); assert.equal(s.environmentMode,'glb'); assert.equal(world.getState().mode,'glb');
    assert.equal(s.dpr,1); assert.equal(s.shadows,false); assert.equal(s.reflections,false); assert.equal(s.fog,true);
    assert.deepEqual(s.chunkOverrides,{}); assert.deepEqual(s.assetGlbs,{});
    assert.equal(s.hud,false); assert.equal(debug.getState().interpolationEnabled,true);
  } finally { await server.close(); }
});
