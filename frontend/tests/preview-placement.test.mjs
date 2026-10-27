import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { fitPreviewToPlatform, measurePreviewBounds, PREVIEW_LINEUP_REFERENCE, previewPlacement } from '../src/game/preview/previewPlacement.ts';

test('tires touch the showroom floor despite inflated cached bounds and hidden export helpers', () => {
  for (const name of ['Wheel_FL', 'WHEEL_FR', 'RL_TIRE', 'Tracks', 'Caliper Front R']) {
    const root = new Group();
    const wheel = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    wheel.name = name; wheel.position.set(2, 0.8, -3);
    wheel.geometry.boundingBox = new Box3(new Vector3(-20, -20, -20), new Vector3(20, 20, 20));
    const helper = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    helper.position.y = -50; helper.visible = false; root.add(wheel, helper);
    const position = previewPlacement(root);
    assert.equal(position[0], -2); assert.equal(position[2], 3);
    assert.ok(Math.abs(position[1] + 0.3) < 1e-9);
    assert.equal(wheel.position.y, 0.8, 'measurement does not edit the model');
  }
});

test('precise support bounds respect inherited rotation and scale and fall back for unnamed models', () => {
  const root = new Group(); root.rotation.z = 0.3; root.scale.set(2, 2, 2);
  const wheel = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  wheel.name = 'Wheel_RR'; wheel.position.y = 2; root.add(wheel);
  root.updateWorldMatrix(true, true);
  const min = new Box3().setFromObject(wheel, true).min.y;
  assert.ok(Math.abs(previewPlacement(root)[1] + min) < 1e-9);
  wheel.name = 'Unnamed'; assert.ok(Math.abs(previewPlacement(root)[1] + min) < 1e-9);
  assert.deepEqual(previewPlacement(new Group()), [0, 0, 0]);
});

test('cars share the Tank reference scale, stay grounded and preserve their relative dimensions', () => {
  const root = new Group(), material = new MeshBasicMaterial();
  const body = new Mesh(new BoxGeometry(1.8, 1.4, 3.5), material); body.position.y = 0.5; root.add(body);
  const wheels = [];
  for (const x of [-0.75, 0.75]) for (const z of [-1.2, 1.2]) {
    const wheel = new Mesh(new BoxGeometry(0.3, 0.6, 0.6), material);
    wheel.name = 'Wheel_FL'; wheel.position.set(x, 0.1, z); root.add(wheel); wheels.push(wheel);
  }
  const measurements = measurePreviewBounds(root), before = root.scale.toArray();
  const display = fitPreviewToPlatform(measurements, [8, 5]);
  const tank = new Group(), tankBody = new Mesh(new BoxGeometry(2.76154, 1.19505, 5.590224), material); tankBody.name = 'Hull'; tank.add(tankBody);
  const tankDisplay = fitPreviewToPlatform(measurePreviewBounds(tank, 'tank'), [8, 5]);
  assert.equal(display.scale, tankDisplay.scale, 'do not enlarge cars independently of the tank');
  assert.ok(display.scale > 1 && display.scale < 2, 'the chassis reference leaves room to enlarge the whole lineup');
  const frame = new Group(); frame.scale.setScalar(display.scale); frame.position.fromArray(display.position); frame.add(root);
  frame.updateWorldMatrix(true, true);
  assert.ok(Math.abs(new Box3().setFromObject(wheels[0], true).min.y) < 1e-8, 'scaling must not lift or sink the tires');
  const bounds = new Box3().setFromObject(frame, true);
  assert.ok(bounds.max.x <= 2.3 && bounds.min.x >= -2.3);
  assert.ok(bounds.max.z <= 3.8 && bounds.min.z >= -3.8);
  assert.ok(Math.abs(bounds.getSize(new Vector3()).z / (5.590224 * tankDisplay.scale) - 3.5 / 5.590224) < 1e-6);
  assert.deepEqual(root.scale.toArray(), before);
  assert.deepEqual(root.position.toArray(), [0, 0, 0]);
  for (const object of [body, ...wheels, tankBody]) object.geometry.dispose(); material.dispose();
});

test('Tank centers its chassis while a nested cannon overhangs, and cached placement survives a pad update', () => {
  const root = new Group(), material = new MeshBasicMaterial();
  const tracks = new Mesh(new BoxGeometry(2.67582, 0.8, 5.34237), material); tracks.name = 'Tracks'; tracks.position.set(0, 0.5, -0.1);
  const body = new Mesh(new BoxGeometry(2.76154, 1.19505, 5.590224), material); body.name = 'Hull'; body.position.set(0.2, 1.2, -0.3);
  const barrel = new Mesh(new BoxGeometry(0.3, 0.3, 3.6), material); barrel.name = 'Cannon'; barrel.position.set(0, 0.6, 3.6);
  const hidden = new Mesh(new BoxGeometry(100, 100, 100), material); hidden.visible = false;
  body.add(barrel, hidden); root.add(tracks, body);
  const measurements = measurePreviewBounds(root, 'tank'), originalBounds = measurements.bounds.clone();
  const display = fitPreviewToPlatform(measurements, [8, 5]);
  assert.ok(display.scale > 1, 'the cannon must no longer shrink the lineup');
  const longerBarrel = barrel.clone(); longerBarrel.scale.z = 4; body.remove(barrel); body.add(longerBarrel);
  const extended = fitPreviewToPlatform(measurePreviewBounds(root, 'tank'), [8, 5]);
  assert.equal(extended.scale, display.scale);
  assert.deepEqual(extended.position, display.position, 'extending the cannon cannot move the chassis pivot');
  body.remove(longerBarrel); body.add(barrel);
  const frame = new Group(); frame.position.fromArray(display.position); frame.scale.setScalar(display.scale); frame.add(root);
  frame.updateWorldMatrix(true, true);
  const bounds = measurements.bounds.clone().applyMatrix4(frame.matrixWorld), contact = new Box3().setFromObject(tracks, true);
  const chassis = measurements.centering.clone(); chassis.min.multiplyScalar(display.scale).add(frame.position); chassis.max.multiplyScalar(display.scale).add(frame.position);
  assert.ok(Math.abs(chassis.getCenter(new Vector3()).x) < 1e-6 && Math.abs(chassis.getCenter(new Vector3()).z) < 1e-6);
  assert.ok(chassis.min.z >= -3.800001 && chassis.max.z <= 3.800001, 'the chassis stays inside the safety border');
  assert.ok(bounds.max.z > 4, 'the visible cannon may extend beyond the platform');
  assert.ok(Math.abs(contact.min.y) < 1e-6);
  assert.ok(Math.abs(contact.getCenter(new Vector3()).x - display.shadowOffset[0]) < 1e-6);
  assert.ok(Math.abs(contact.getCenter(new Vector3()).z - display.shadowOffset[1]) < 1e-6);
  const resized = fitPreviewToPlatform(measurements, [10, 6]);
  assert.ok(resized.scale > display.scale && resized.scale < 2);
  assert.ok(measurements.bounds.equals(originalBounds), 'mounted parent transforms must not compound the measurements');
  for (const object of [tracks, body, barrel, hidden]) object.geometry.dispose(); material.dispose();
});

test('Tank falls back to the track center when an export has no named chassis', () => {
  const root = new Group(), material = new MeshBasicMaterial();
  const tracks = new Mesh(new BoxGeometry(2.7, 1, 5.3), material); tracks.name = 'Tracks'; tracks.position.set(0.2, 0.6, -0.3);
  const cannon = new Mesh(new BoxGeometry(0.3, 0.3, 8), material); cannon.name = 'Cannon'; cannon.position.z = 4;
  root.add(tracks, cannon);
  const measured = measurePreviewBounds(root, 'tank'), display = fitPreviewToPlatform(measured, [8, 5]);
  assert.ok(Math.abs(display.position[0] + 0.2 * display.scale) < 1e-6);
  assert.ok(Math.abs(display.position[2] - 0.3 * display.scale) < 1e-6);
  assert.ok(Math.abs(display.shadowOffset[0]) < 1e-6 && Math.abs(display.shadowOffset[1]) < 1e-6);
  tracks.geometry.dispose(); cannon.geometry.dispose(); material.dispose();
});

const tankPath = new URL('../public/models/vehicles/tank.glb', import.meta.url);
const tankBytes = fs.existsSync(tankPath) ? fs.readFileSync(tankPath) : Buffer.alloc(0);
test('the shared reference matches the shipped Tank chassis rather than its longer cannon', {
  skip: tankBytes.subarray(0, 4).toString() !== 'glTF' ? 'Materialize the real Tank GLB with Git LFS' : false,
}, () => {
  const gltf = JSON.parse(tankBytes.subarray(20, 20 + tankBytes.readUInt32LE(12)).toString());
  const hull = gltf.nodes.find(node => node.name === 'Hull'); assert.ok(hull);
  assert.ok(!hull.matrix && !hull.rotation && !hull.scale, 're-measure world dimensions if the Hull transform changes');
  const bounds = new Box3();
  for (const primitive of gltf.meshes[hull.mesh].primitives) {
    const positions = gltf.accessors[primitive.attributes.POSITION];
    bounds.union(new Box3(new Vector3().fromArray(positions.min), new Vector3().fromArray(positions.max)));
  }
  const size = bounds.getSize(new Vector3());
  assert.ok(Math.abs(size.x - PREVIEW_LINEUP_REFERENCE.width) < 0.0001);
  assert.ok(Math.abs(size.z - PREVIEW_LINEUP_REFERENCE.length) < 0.0001);
  assert.ok(size.z < 6, 'the full 7.93m cannon footprint must not determine the lineup fit');
});
