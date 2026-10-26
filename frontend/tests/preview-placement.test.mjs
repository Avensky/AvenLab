import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { previewPlacement } from '../src/game/preview/previewPlacement.ts';

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
