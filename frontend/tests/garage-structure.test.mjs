import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { prepareGarageDisplay } from '../src/game/preview/prepareGarageDisplay.ts';
import { completeGarageStructure } from '../src/game/preview/completeGarageStructure.ts';

test('ceiling repeats preserve source geometry and placement while the incorrect wall racks stay hidden', () => {
  const source = new Group(), material = new MeshStandardMaterial({ name: 'BARR LTTRl' });
  const add = (name, size, position) => { const mesh = new Mesh(new BoxGeometry(...size), material); mesh.name = name; mesh.position.fromArray(position); source.add(mesh); return mesh; };
  const rack = add('FOND_01', [1, 0.8, 0.04], [-5.5, 5.3, -6]);
  add('FOND_01001', [0.04, 0.8, 1], [-6, 5.3, 5.5]);
  const roof = add('Toit_GRILLE', [2, 0.1, 1.5], [-8, 6.8, -8.25]);
  add('PLANE_Plane', [18, 0.1, 18], [0, 7, 0]);
  const display = prepareGarageDisplay(source); display.root.scale.setScalar(0.5);
  const completed = completeGarageStructure(display.root);
  const instances = completed.structure.getObjectByName('completed-Toit_GRILLE');
  assert.equal(instances.count, 108);
  assert.equal(instances.geometry, roof.geometry);
  const first = new Matrix4(); instances.getMatrixAt(0, first);
  const expected = display.root.getObjectByName('Toit_GRILLE').matrixWorld;
  first.elements.forEach((value, i) => assert.ok(Math.abs(value - expected.elements[i]) < 1e-6));
  const last = new Matrix4(); instances.getMatrixAt(107, last);
  const offset = new Vector3().setFromMatrixPosition(last).sub(new Vector3().setFromMatrixPosition(first));
  assert.ok(Math.abs(offset.x - 8) < 1e-5);
  assert.ok(Math.abs(offset.y) < 1e-5);
  assert.ok(Math.abs(offset.z - 8.25) < 1e-5);
  assert.equal(completed.structure.getObjectByName('completed-FOND_01'), undefined);
  assert.equal(completed.structure.getObjectByName('completed-FOND_01001'), undefined);
  assert.equal(completed.structure.getObjectByName('rack-horizontal-green-bars'), undefined);
  assert.equal(rack.visible, true);
  assert.equal(display.root.getObjectByName('FOND_01').visible, false);
  assert.equal(display.root.getObjectByName('FOND_01001').visible, false);
  assert.equal(roof.visible, true);
  let disposed = 0; roof.geometry.addEventListener('dispose', () => disposed++);
  completed.dispose(); display.dispose(); assert.equal(disposed, 0);
  source.children.forEach(object => object.geometry.dispose()); material.dispose();
});

test('the side-wall light rack gets grounded white pipes and six green bars per bay, without altering the cached source', () => {
  const source = new Group(), geometry = new BoxGeometry(0.6, 1.85, 5);
  const material = new MeshStandardMaterial({ name: 'INOX' });
  const fragment = new Mesh(geometry, material); fragment.name = 'Base_Light';
  fragment.position.set(-6, 3.4, -2.5); source.add(fragment);
  const lights = new Mesh(geometry, material); lights.name = 'Base_Light001'; source.add(lights);
  const display = prepareGarageDisplay(source), completed = completeGarageStructure(display.root);
  const rack = completed.structure.getObjectByName('garage-white-tube-rack');
  assert.ok(rack);
  assert.equal(fragment.visible, true);
  assert.equal(display.root.getObjectByName('Base_Light').visible, false);
  assert.equal(display.root.getObjectByName('Base_Light001').visible, false);
  assert.equal(lights.visible, true);
  assert.equal(rack.getObjectByName('rack-green-light-bars').count, 18);
  assert.equal(rack.getObjectByName('rack-standing-feet').count, 3);
  const pipes = rack.getObjectByName('rack-white-pipes');
  assert.ok(pipes.material.color.toArray().every(value => value > 0.6), 'white painted tubes, separate from the ceiling geometry');
  const matrix = new Matrix4(), position = new Vector3();
  const feet = rack.getObjectByName('rack-standing-feet'); feet.getMatrixAt(0, matrix);
  position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.y - new Vector3().setFromMatrixScale(matrix).y / 2) < 1e-6, 'the feet touch floor Y=0');
  assert.ok(Math.abs(rack.position.z) < 1e-6, 'complete both halves across the original centerline');
  const rackBounds = new Box3().setFromObject(rack, true);
  assert.ok(rackBounds.min.z < -4.9 && rackBounds.max.z > 4.9, 'the frame must not stop halfway across the wall');
  assert.equal(fragment.position.z, -2.5, 'the cached source pose stays intact');
  assert.equal(rack.rotation.y, Math.PI / 2, 'the rack follows the side wall, separate from the ceiling trusses');
  let cachedDisposed = 0, ownedDisposed = 0;
  geometry.addEventListener('dispose', () => cachedDisposed++);
  pipes.geometry.addEventListener('dispose', () => ownedDisposed++);
  completed.dispose(); display.dispose();
  assert.equal(cachedDisposed, 0);
  assert.equal(ownedDisposed, 1, 'the shared pipe geometry is released once');
  geometry.dispose(); material.dispose();
});

test('a complete evaluated garage keeps its authored ceiling, rack and stand without procedural replacement', () => {
  const source = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  source.userData.avenlabGarageComplete = true;
  for (const name of ['FOND_01', 'FOND_01001', 'Toit_GRILLE', 'Base_Light', 'PDS']) {
    const part = new Mesh(geometry, material); part.name = name; source.add(part);
  }
  const display = prepareGarageDisplay(source), completed = completeGarageStructure(display.root);
  assert.equal(completed.structure.children.length, 0);
  for (const child of display.root.children) assert.equal(child.visible, true, `${child.name} must stay authored`);
  completed.dispose(); display.dispose(); geometry.dispose(); material.dispose();
});
