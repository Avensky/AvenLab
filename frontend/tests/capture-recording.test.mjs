import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshPhysicalMaterial, Texture } from 'three';
import { PerformanceRecorder } from '../src/performance/measurements.ts';
import { playerLocation, spawnJson } from '../src/performance/location.ts';
import { CAPTURE_STORAGE_KEY, loadCaptureArchive, saveCaptureArchive, captureFilename } from '../src/performance/captureArchive.ts';
import { cityMaterialScene } from '../src/world/cityMaterials.ts';

const map = { cell: [200, 400], chunks: [{ x: 0, z: 0, origin: [0, 0, 0] }, { x: 1, z: 0, origin: [200, 0, 0] }] };
const pose = { position: [220, 1.25, -60], rotation: [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)] };
const location = playerLocation(pose, map);
const context = { key: 'same-scene', ready: true, reason: '', settings: { opaqueCityMaterials: false }, location };
function complete(recorder, start = 0, baseline = true, label = 'City original') {
  recorder.start(label, baseline, 5, context, start);
  recorder.tick(context, start);
  recorder.tick(context, start + 3000);
  for (let i = 0; i < 300; i++) {
    const now = start + 3000 + i * 5000 / 300;
    recorder.record('frameMs', i === 150 ? 80 : 16.667, now);
    recorder.packet('snapshot', 1024, 0.2, now);
    if (i % 6 === 0) recorder.tick(context, now);
  }
  recorder.tick(context, start + 8000);
}
const storage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
};

test('world coordinates select centered rectangular chunks and spawn yaw uses radians', () => {
  assert.deepEqual(location.position, [220, 1.25, -60]);
  assert.deepEqual(location.chunk, [1, 0]);
  assert.deepEqual(location.local, [20, 1.25, -60]);
  assert.ok(Math.abs(location.yaw - Math.PI / 2) < 1e-10);
  assert.deepEqual(JSON.parse(spawnJson(location)), { chunk: [1, 0], local: [20, -60], yaw: 1.571 });
  assert.deepEqual(playerLocation({ ...pose, position: [100, 1, 0] }, map).chunk, [1, 0], 'boundary belongs to exactly one chunk');
  assert.equal(playerLocation({ ...pose, position: [500, 1, 0] }, map).chunk, null);
  assert.equal(playerLocation(null, map), null);
  assert.equal(playerLocation({ ...pose, position: [NaN, 1, 0] }, map), null);
});

test('countdown exposes waiting, warm-up and recording phases without parsing display text', () => {
  const recorder = new PerformanceRecorder();
  assert.equal(recorder.progress(0).phase, 'idle');
  recorder.start('City original', true, 5, context, 0);
  assert.equal(recorder.progress(0).phase, 'waiting');
  recorder.tick(context, 0);
  assert.deepEqual(recorder.progress(1250), { phase: 'warmup', label: 'City original', remainingMs: 1750 });
  recorder.tick(context, 3000);
  assert.deepEqual(recorder.progress(4500), { phase: 'recording', label: 'City original', remainingMs: 3500 });
  recorder.cancel();
  assert.equal(recorder.progress(5000).phase, 'idle');
});

test('exports retain a frame hitch, the route, positions and settings, with bounded capture duration', () => {
  const recorder = new PerformanceRecorder();
  complete(recorder);
  const run = recorder.runs[0];
  assert.equal(run.durationMs, 5000);
  assert.equal(run.frameSamplesMs.length, 300);
  assert.equal(run.frameSamplesMs[150], 80);
  assert.deepEqual(run.startLocation, location);
  assert.deepEqual(run.endLocation, location);
  assert.ok(run.timeline.length >= 40 && run.timeline.length <= 51);
  assert.equal(run.timeline[0].timeMs, 0);
  assert.deepEqual(run.timeline.at(-1).location, location);
  assert.equal(run.settings.opaqueCityMaterials, false);
});

test('samples after the requested end cannot inflate frame or network statistics', () => {
  const recorder = new PerformanceRecorder();
  recorder.start('end', true, 5, context, 0);
  recorder.tick(context, 0); recorder.tick(context, 3000);
  for (let i = 0; i < 60; i++) recorder.record('frameMs', 16, 3100 + i * 16);
  recorder.packet('snapshot', 1024, 0, 4000);
  recorder.record('frameMs', 999, 8100); recorder.packet('snapshot', 1000000, 0, 8100);
  recorder.tick(context, 8200);
  assert.equal(recorder.runs[0].metrics.frameMs.count, 60);
  assert.equal(recorder.runs[0].snapshotKiBps, 0.2);
  assert.equal(recorder.runs[0].durationMs, 5000);
});

test('completed labeled comparisons survive reload and preserve unique ids and baseline', () => {
  const recorder = new PerformanceRecorder(), local = storage();
  recorder.subscribeArchive(() => saveCaptureArchive(local, recorder.runs, recorder.baselineId));
  complete(recorder);
  complete(recorder, 10000, false, 'City opaque');
  const saved = loadCaptureArchive(local);
  assert.deepEqual(saved.runs.map(r => r.label), ['City original', 'City opaque']);
  assert.equal(saved.baselineId, recorder.runs[0].id);
  const restored = new PerformanceRecorder();
  restored.restore(saved.runs, saved.baselineId);
  complete(restored, 20000, false, 'After reload');
  assert.deepEqual(restored.runs.map(r => r.id), [1, 2, 3]);
  recorder.clear();
  assert.equal(local.getItem(CAPTURE_STORAGE_KEY), null);
});

test('browser archive retains the current baseline and recent runs and reports unavailable storage', () => {
  const recorder = new PerformanceRecorder(), local = storage();
  complete(recorder);
  const run = recorder.runs[0];
  const runs = Array.from({ length: 30 }, (_, i) => ({ ...run, id: i + 1, baseline: i === 0 }));
  const status = saveCaptureArchive(local, runs, 1);
  const restored = loadCaptureArchive(local);
  assert.equal(restored.runs.length, 20);
  assert.equal(restored.runs[0].id, 1);
  assert.equal(restored.runs.at(-1).id, 30);
  assert.match(status, /Older runs remain/);
  local.setItem(CAPTURE_STORAGE_KEY, '{bad');
  assert.deepEqual(loadCaptureArchive(local).runs, []);
  assert.match(saveCaptureArchive({ ...local, setItem() { throw new Error('quota'); } }, [run], 1), /save failed/);
});

test('download filenames retain the user label without path or filesystem punctuation', () => {
  const filename = captureFilename('Cíty: original / full map', 'json', new Date('2026-10-26T12:00:00Z'));
  assert.equal(filename, 'avenlab-performance-city-original-full-map-2026-10-26T12-00-00-000Z.json');
});

test('city material A/B uses the same asset transforms and textures and shares one variant across tiles', () => {
  const scene = new Group(); scene.position.set(10, 0, -20);
  const texture = new Texture(), brick = new MeshPhysicalMaterial({ transmission: 1, map: texture }); brick.name = 'bricks';
  const glass = new MeshPhysicalMaterial({ transmission: 0.8 }); glass.name = 'Glass';
  const geometry = new BoxGeometry();
  const mesh = new Mesh(geometry, [brick, glass]); mesh.position.set(20, 30, 40); scene.add(mesh);
  const variant = cityMaterialScene(scene, true), changed = variant.children[0];
  assert.deepEqual(variant.position.toArray(), scene.position.toArray());
  assert.deepEqual(changed.position.toArray(), mesh.position.toArray());
  assert.equal(changed.geometry, geometry);
  assert.equal(changed.material[0].map, texture);
  assert.equal(changed.material[0].transmission, 0);
  assert.equal(changed.material[1], glass);
  assert.equal(brick.transmission, 1, 'original shared GLTF materials are untouched');
  for (let i = 0; i < 9; i++) assert.equal(cityMaterialScene(scene, true), variant);
  assert.equal(cityMaterialScene(scene, false), scene);
});
