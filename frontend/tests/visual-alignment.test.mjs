import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { measureVisualReference, solveVisualAlignment } from '../src/vehicles/tools/visualAlignment.ts';

const shape = { chassis_half_extents: [0.9, 0.35, 2.1], chassis_offset: [0, 0, 0],
  wheel_radius: 0.31, wheel_count: 4, nominal_wheel_center_y: -0.545 };
function model(height = 0.31) {
  const frame = new Group();
  const visual = new Group(); frame.add(visual);
  const body = new Mesh(new BoxGeometry(1.8, 1.3, 4.2), new MeshBasicMaterial());
  body.position.y = 0.7; visual.add(body);
  const wheels = [-0.7, 0.7].flatMap((x) => [-1.2, 1.2].map((z) => {
    const wheel = new Mesh(new CylinderGeometry(0.31, 0.31, 0.2), new MeshBasicMaterial());
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, height, z); visual.add(wheel); return wheel;
  }));
  return { frame, visual, body, wheels };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);

test('ground-based GLB wheel centers yield a per-model body offset, independent of roof bounds', () => {
  const m = model();
  const reference = measureVisualReference(m.frame, m.visual, m.wheels);
  const result = solveVisualAlignment(reference, shape);
  assert.equal(reference.method, 'wheel-plane'); near(reference.source[1], 0.31);
  near(result.offset[1], -0.855);
  m.body.scale.y = 10;
  const tallerRoof = measureVisualReference(m.frame, m.visual, m.wheels);
  near(solveVisualAlignment(tallerRoof, shape).offset[1], result.offset[1]);
  const secondModel = model(0.36);
  near(solveVisualAlignment(measureVisualReference(secondModel.frame, secondModel.visual, secondModel.wheels), shape).offset[1], -0.905);
});
test('reference measurement removes the body world transform without changing its authoritative pose', () => {
  const m = model(); m.frame.position.set(13, 8, -4); m.frame.rotation.y = 0.7;
  const before = m.frame.position.clone();
  const result = solveVisualAlignment(measureVisualReference(m.frame, m.visual, m.wheels), shape);
  near(result.offset[1], -0.855);
  m.visual.position.fromArray(result.offset);
  assert.deepEqual(m.frame.position.toArray(), before.toArray()); near(m.frame.rotation.y, 0.7);
});
test('CHASSIS_ANCHOR takes precedence and maps to the backend collider offset', () => {
  const m = model(); const anchor = new Object3D(); anchor.name = 'CHASSIS_ANCHOR'; anchor.position.set(0.2, 0.6, 0.1); m.visual.add(anchor);
  const reference = measureVisualReference(m.frame, m.visual, m.wheels);
  const result = solveVisualAlignment(reference, { ...shape, chassis_offset: [0, -0.08, 0] });
  assert.equal(reference.method, 'chassis-anchor');
  result.offset.forEach((v, i) => near(v, [-0.2, -0.68, -0.1][i]));
});
test('track contact surface aligns to nominal ground even with a different physics support-wheel radius', () => {
  const frame = new Group(); const visual = new Group(); frame.add(visual);
  const tracks = new Mesh(new BoxGeometry(3, 0.8, 5), new MeshBasicMaterial()); tracks.name = 'Tracks'; tracks.position.y = 0.42; visual.add(tracks);
  const reference = measureVisualReference(frame, visual, []);
  const result = solveVisualAlignment(reference, { ...shape, nominal_wheel_center_y: -1.05, wheel_radius: 0.5 });
  assert.equal(reference.method, 'contact-plane'); near(reference.source[1], 0.02); near(result.offset[1], -1.57);
  near(1.55 + result.offset[1] + reference.source[1], 0);
});
test('missing metadata or asset anchors is reported instead of guessing an offset', () => {
  const m = model(); const reference = measureVisualReference(m.frame, m.visual, m.wheels);
  assert.equal(solveVisualAlignment(reference, undefined).status, 'missing-backend-reference');
  assert.equal(solveVisualAlignment(reference, { ...shape, nominal_wheel_center_y: undefined }).status, 'missing-backend-reference');
  assert.equal(solveVisualAlignment(measureVisualReference(m.frame, m.visual, []), shape).status, 'missing-asset-reference');
  assert.deepEqual(solveVisualAlignment(reference, shape, false).offset, [0, 0, 0]);
});
test('cached rest measurements stay fixed when live suspension changes, and need no extra pose compensation', () => {
  const m = model(); const reference = measureVisualReference(m.frame, m.visual, m.wheels);
  const expected = solveVisualAlignment(reference, shape).offset;
  m.wheels.forEach((wheel, i) => { wheel.position.y = 0.5 + i * 0.2; });
  assert.deepEqual(solveVisualAlignment(reference, shape).offset, expected);
});
