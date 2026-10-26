import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from 'three';
import { garagePlacement } from '../src/game/preview/garagePlacement.ts';

test('garage floor placement ignores the roof and preserves source transforms', () => {
  const root = new Group();
  const floor = new Mesh(new BoxGeometry(20, 0.5, 30), new MeshBasicMaterial());
  floor.name = 'Concrete_Floor'; floor.position.set(10, 2.75, -8);
  const roof = new Mesh(new BoxGeometry(20, 0.2, 30), new MeshBasicMaterial()); roof.position.set(10, 8, -8);
  root.add(floor, roof);
  assert.deepEqual(garagePlacement(root), [-10, -3, 8]);
  assert.deepEqual(root.position.toArray(), [0, 0, 0]);
  assert.deepEqual(floor.position.toArray(), [10, 2.75, -8]);
  floor.name = 'Unnamed'; assert.deepEqual(garagePlacement(root), [-10, -3, 8]);
});

test('an authored vehicle anchor wins over inferred floor and empty models are safe', () => {
  const root = new Group(), anchor = new Object3D(); anchor.name = 'VEHICLE_ANCHOR'; anchor.position.set(4, 1.2, 7); root.add(anchor);
  assert.deepEqual(garagePlacement(root), [-4, -1.2, -7]);
  assert.deepEqual(garagePlacement(new Group()), [0, 0, 0]);
});

test('the selected display pad uses its upper surface while excluding the roof', () => {
  const root = new Group(), pad = new Group(); pad.name = 'Plane_PISTE'; root.add(pad);
  for (const y of [2, 3]) {
    const layer = new Mesh(new BoxGeometry(20, 0.5, 30), new MeshBasicMaterial()); layer.position.y = y; pad.add(layer);
  }
  const roof = new Mesh(new BoxGeometry(20, 0.5, 30), new MeshBasicMaterial()); roof.position.y = 8; root.add(roof);
  assert.deepEqual(garagePlacement(root, 'Plane_PISTE'), [-0, -3.25, -0]);
});

test('a double-sided display pad with reversed winding is still the floor', () => {
  const root = new Group();
  const floor = new Mesh(new PlaneGeometry(20, 30), new MeshBasicMaterial({ side: DoubleSide }));
  floor.name = 'Plane_PISTE'; floor.rotation.x = Math.PI / 2; floor.position.y = 3; root.add(floor);
  const roof = new Mesh(new BoxGeometry(20, 0.5, 30), new MeshBasicMaterial()); roof.position.y = 8; root.add(roof);
  const position = garagePlacement(root, 'Plane_PISTE');
  assert.ok(Math.abs(position[1] + 3) < 1e-9);
});
