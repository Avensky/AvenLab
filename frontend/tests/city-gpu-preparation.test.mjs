import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Scene, WebGLRenderTarget } from 'three';
import { createCityInstances } from '../src/world/cityInstances.ts';
import { prepareCityGpu } from '../src/world/prepareCityGpu.ts';

function fixture(t, { multiDraw = false, onRender, onPoll, fence = {} } = {}) {
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => setImmediate(callback);
  t.after(() => {
    if (previousFrame) globalThis.requestAnimationFrame = previousFrame;
    else delete globalThis.requestAnimationFrame;
  });

  const source = new Group(), scene = new Scene(), camera = new PerspectiveCamera();
  const opaque = new MeshPhysicalMaterial(), glass = new MeshPhysicalMaterial({ transmission: .8 });
  glass.name = 'Glass';
  // Four small meshes hit the count limit. The two medium meshes separately
  // fit under 256 KiB, but their combined index and position buffers exceed it.
  for (const [name, vertices, indices = 0] of [
    ['a', 3], ['b', 3], ['c', 3], ['d', 3], ['medium1', 9000, 14000], ['medium2', 9000, 14000],
    ['oversize', 24000], ['e', 3], ['window', 3], ['f', 3],
  ]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(vertices * 3), 3));
    if (indices) geometry.setIndex(Array(indices).fill(0));
    const mesh = new Mesh(geometry, name === 'window' ? [opaque, glass] : opaque);
    mesh.name = name;
    source.add(mesh);
  }
  const asset = createCityInstances(source, 1, false, undefined, { multiDraw });
  const originalTarget = new WebGLRenderTarget(), controller = new AbortController();
  const renders = [], compiles = [];
  const sync = { flushes: 0, polls: 0, deletes: 0 };
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 37143, TIMEOUT_EXPIRED: 37147, CONDITION_SATISFIED: 37148, WAIT_FAILED: 37149,
    fenceSync(condition, flags) {
      assert.deepEqual([condition, flags], [this.SYNC_GPU_COMMANDS_COMPLETE, 0]);
      return fence;
    },
    flush() { sync.flushes++; },
    clientWaitSync(handle, flags, timeout) {
      assert.deepEqual([handle, flags, timeout], [fence, 0, 0]);
      sync.polls++;
      return onPoll?.(controller, this, sync.polls) ?? this.CONDITION_SATISFIED;
    },
    deleteSync(handle) { assert.equal(handle, fence); sync.deletes++; },
  };
  let target = originalTarget, face = 2, mip = 1, disposed = 0;
  const renderer = {
    getContext: () => context,
    sortObjects: true, xr: { enabled: true }, shadowMap: { autoUpdate: true },
    getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget(next, nextFace = 0, nextMip = 0) { target = next; face = nextFace; mip = nextMip; },
    async compileAsync(root, _camera, liveScene) {
      compiles.push(liveScene ? 'live' : 'warm');
      if (liveScene) {
        assert.equal(liveScene, scene);
        assert.equal(root, asset.group);
        assert.equal(target, originalTarget);
      } else {
        assert.equal(target.width, 1);
        target.addEventListener('dispose', () => disposed++);
      }
    },
    render(root) {
      assert.notEqual(target, originalTarget);
      assert.equal(this.xr.enabled, false);
      assert.equal(this.shadowMap.autoUpdate, false);
      const active = [];
      root.traverseVisible(mesh => {
        if (!mesh.isMesh) return;
        if (mesh.isBatchedMesh) assert.equal(mesh.getVisibleAt(0), false);
        else assert.equal(mesh.count, 0);
        assert(mesh.boundingSphere && !mesh.boundingSphere.isEmpty());
        active.push(mesh.name);
      });
      renders.push(active);
      onRender?.(controller, renders.length);
    },
  };
  t.after(() => {
    asset.dispose();
    for (const mesh of source.children) mesh.geometry.dispose();
    opaque.dispose(); glass.dispose(); originalTarget.dispose();
  });
  function checkRestored() {
    assert.equal(asset.group.parent, null);
    assert(asset.meshes.every(mesh => !mesh.visible && (mesh.isBatchedMesh ? !mesh.getVisibleAt(0) : mesh.count === 0)));
    assert.equal(target, originalTarget);
    assert.deepEqual([face, mip, renderer.xr.enabled, renderer.shadowMap.autoUpdate, disposed], [2, 1, true, true, 1]);
  }
  return { asset, renders, compiles, sync, checkRestored,
    run: () => prepareCityGpu(asset, renderer, camera, scene, controller.signal, () => {}, true) };
}

test('GPU preparation bounds small groups and isolates oversized and transmissive uploads', async t => {
  const f = fixture(t);
  await f.run();
  assert.deepEqual(f.renders, [['a', 'b', 'c', 'd'], ['medium1'], ['medium2'], ['oversize'], ['e'], ['window'], ['f']]);
  assert.deepEqual(f.compiles, ['warm', 'live']);
  assert.deepEqual(f.sync, { flushes: 1, polls: 1, deletes: 1 });
  f.checkRestored();
});

test('native material batches and leftover instanced meshes are each warmed once', async t => {
  const f = fixture(t, { multiDraw: true });
  await f.run();
  assert(f.asset.meshes.some(mesh => mesh.isBatchedMesh));
  assert.deepEqual(f.renders.flat().sort(), f.asset.meshes.map(mesh => mesh.name).sort());
  f.checkRestored();
});

test('aborting during a grouped upload hides representatives and skips the remaining renders', async t => {
  const f = fixture(t, { onRender: controller => controller.abort() });
  await f.run();
  assert.equal(f.renders.length, 1);
  assert.deepEqual(f.compiles, ['warm']);
  f.checkRestored();
});

test('an upload failure restores renderer state and later queued groups cannot render', async t => {
  const f = fixture(t, { onRender: () => { throw new Error('driver upload failed'); } });
  await assert.rejects(f.run(), /driver upload failed/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.renders.length, 1);
  assert.deepEqual(f.compiles, ['warm']);
  f.checkRestored();
});

test('readiness waits across queue turns until the GPU fence signals', async t => {
  const f = fixture(t, { onPoll: (_controller, gl, count) => count < 3 ? gl.TIMEOUT_EXPIRED : gl.CONDITION_SATISFIED });
  await f.run();
  assert.deepEqual(f.sync, { flushes: 1, polls: 3, deletes: 1 });
  f.checkRestored();
});

test('aborting a pending GPU wait releases its fence and warmup target', async t => {
  const f = fixture(t, { onPoll: (controller, gl) => { controller.abort(); return gl.TIMEOUT_EXPIRED; } });
  await f.run();
  assert.deepEqual(f.sync, { flushes: 1, polls: 1, deletes: 1 });
  f.checkRestored();
});

test('a context without an available fence can still finish preparation', async t => {
  const unavailable = fixture(t, { fence: null });
  await unavailable.run();
  assert.deepEqual(unavailable.sync, { flushes: 0, polls: 0, deletes: 0 });
  unavailable.checkRestored();
});

test('a failed fence poll terminates the wait and releases the handle', async t => {
  const failed = fixture(t, { onPoll: (_controller, gl) => gl.WAIT_FAILED });
  await failed.run();
  assert.deepEqual(failed.sync, { flushes: 1, polls: 1, deletes: 1 });
  failed.checkRestored();
});
