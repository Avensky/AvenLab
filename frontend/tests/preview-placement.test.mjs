import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { fitPreviewToPlatform, measurePreviewBounds, previewPlacement } from '../src/game/preview/previewPlacement.ts';

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
  const tank = new Group(), tankBody = new Mesh(new BoxGeometry(2.76154, 3.66536, 7.93190), material); tank.add(tankBody);
  const tankDisplay = fitPreviewToPlatform(measurePreviewBounds(tank), [8, 5]);
  assert.equal(display.scale, tankDisplay.scale, 'do not enlarge cars independently of the tank');
  assert.ok(display.scale > 0 && display.scale < 2);
  const frame = new Group(); frame.scale.setScalar(display.scale); frame.position.fromArray(display.position); frame.add(root);
  frame.updateWorldMatrix(true, true);
  assert.ok(Math.abs(new Box3().setFromObject(wheels[0], true).min.y) < 1e-8, 'scaling must not lift or sink the tires');
  const bounds = new Box3().setFromObject(frame, true);
  assert.ok(bounds.max.x <= 2.3 && bounds.min.x >= -2.3);
  assert.ok(bounds.max.z <= 3.8 && bounds.min.z >= -3.8);
  assert.ok(Math.abs(bounds.getSize(new Vector3()).z / (7.93190 * tankDisplay.scale) - 3.5 / 7.93190) < 1e-6);
  assert.deepEqual(root.scale.toArray(), before);
  assert.deepEqual(root.position.toArray(), [0, 0, 0]);
  for (const object of [body, ...wheels, tankBody]) object.geometry.dispose(); material.dispose();
});

test('an asymmetric tank barrel fits with its body shadow under the tracks and cached measurements survive a pad update', () => {
  const root = new Group(), material = new MeshBasicMaterial();
  const tracks = new Mesh(new BoxGeometry(2.9, 0.8, 4.8), material); tracks.name = 'Tracks'; tracks.position.y = 0.5;
  const body = new Mesh(new BoxGeometry(3, 2, 4.8), material); body.position.y = 1.2;
  const barrel = new Mesh(new BoxGeometry(0.3, 0.3, 3.6), material); barrel.position.set(0, 1.8, 3.6);
  root.add(tracks, body, barrel);
  const measurements = measurePreviewBounds(root), originalBounds = measurements.bounds.clone();
  const display = fitPreviewToPlatform(measurements, [8, 5]);
  assert.ok(display.scale < 1, 'the full-sized Tank reference limits the lineup scale');
  const frame = new Group(); frame.position.fromArray(display.position); frame.scale.setScalar(display.scale); frame.add(root);
  frame.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(frame, true), contact = new Box3().setFromObject(tracks, true);
  assert.ok(Math.abs(bounds.getCenter(new Vector3()).z) < 1e-6);
  assert.ok(bounds.min.z >= -3.800001 && bounds.max.z <= 3.800001);
  assert.ok(Math.abs(contact.min.y) < 1e-6);
  assert.ok(Math.abs(contact.getCenter(new Vector3()).z - display.shadowOffset[1]) < 1e-6);
  const resized = fitPreviewToPlatform(measurements, [10, 6]);
  assert.ok(resized.scale > display.scale && resized.scale < 2);
  assert.ok(measurements.bounds.equals(originalBounds), 'mounted parent transforms must not compound the measurements');
  for (const object of [tracks, body, barrel]) object.geometry.dispose(); material.dispose();
});
