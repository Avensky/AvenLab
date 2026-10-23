import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Drei's Node entry uses Three's CommonJS manager; use the same instance.
const { DefaultLoadingManager } = createRequire(import.meta.url)('three');
import { useProgress } from '@react-three/drei';
import { isAssetLoadingComplete } from '../src/game/tools/assetLoading.ts';

test('collider setup completes from Drei’s untouched, zero-file loading state', () => {
  const initial = useProgress.getState();
  assert.equal(initial.active, false);
  assert.equal(initial.progress, 0);
  assert.equal(initial.total, 0);
  assert.equal(isAssetLoadingComplete(initial), true);
});

test('real asset loading keeps the gate closed until the last pending file finishes', () => {
  DefaultLoadingManager.itemStart('test-vehicle.glb');
  DefaultLoadingManager.itemStart('test-road.glb');
  assert.equal(isAssetLoadingComplete(useProgress.getState()), false);
  DefaultLoadingManager.itemEnd('test-vehicle.glb');
  assert.equal(isAssetLoadingComplete(useProgress.getState()), false);
  DefaultLoadingManager.itemEnd('test-road.glb');
  assert.equal(isAssetLoadingComplete(useProgress.getState()), true);
});

test('active requests block completion even when cached progress still reads 100%', () => {
  assert.equal(isAssetLoadingComplete({ active: true, progress: 100, total: 1 }), false);
  assert.equal(isAssetLoadingComplete({ active: true, progress: 0, total: 0 }), false);
});
