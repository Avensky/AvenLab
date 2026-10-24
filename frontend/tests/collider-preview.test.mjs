import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { colliderPreviewParts, applyColliderWheelPose } from '../src/vehicles/tools/colliderPreview.ts';
import { DebugFlags } from '../src/store/tools/debugMasks.ts';

const local = 'local-driver';
const other = 'other-driver';
test('wheel diagnostics replace local preview wheels and restore them when disabled', () => {
  assert.deepEqual(colliderPreviewParts(local, local, 'local', 0), { chassis: true, wheels: true });
  assert.deepEqual(colliderPreviewParts(local, local, 'local', DebugFlags.WHEELS), { chassis: true, wheels: false });
  assert.deepEqual(colliderPreviewParts(local, local, 'local', 0), { chassis: true, wheels: true });
});
test('local diagnostics leave other players previews visible; all scope replaces theirs too', () => {
  assert.deepEqual(colliderPreviewParts(other, local, 'local', DebugFlags.WHEELS), { chassis: true, wheels: true });
  assert.deepEqual(colliderPreviewParts(other, local, 'all', DebugFlags.WHEELS), { chassis: true, wheels: false });
  assert.deepEqual(colliderPreviewParts(other, '', 'all', DebugFlags.WHEELS), { chassis: true, wheels: true });
});
test('chassis and wheel preview replacement are independent of force/ray diagnostics', () => {
  assert.deepEqual(colliderPreviewParts(local, local, 'local', DebugFlags.CHASSIS), { chassis: false, wheels: true });
  assert.deepEqual(colliderPreviewParts(local, local, 'local', DebugFlags.CHASSIS | DebugFlags.WHEELS), { chassis: false, wheels: false });
  assert.deepEqual(colliderPreviewParts(local, local, 'local', DebugFlags.RAYS | DebugFlags.SLIP), { chassis: true, wheels: true });
});
test('wheel previews use authoritative poses, add spin once and color ordinary contact state', () => {
  const carrier = new Group();
  const spin = new Group();
  const material = new MeshBasicMaterial();
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3).toArray();
  const wheel = { id: 'fl', position: [2, 3, 4], rotation, wheel_speed: 8, grounded: true };
  let angle = applyColliderWheelPose(carrier, spin, material, wheel, 0, 0.025);
  assert.deepEqual(carrier.position.toArray(), wheel.position);
  assert.deepEqual(carrier.quaternion.toArray(), rotation);
  assert.ok(Math.abs(angle - 0.2) < 1e-10);
  assert.ok(Math.abs(spin.rotation.x - 0.2) < 1e-10);
  assert.equal(material.color.getHexString(), '22c55e');
  angle = applyColliderWheelPose(carrier, spin, material, { ...wheel, grounded: false }, angle, 0.025);
  assert.ok(Math.abs(angle - 0.4) < 1e-10);
  assert.equal(material.color.getHexString(), 'ef4444');
  applyColliderWheelPose(carrier, spin, material, { ...wheel, grounded: undefined }, angle, 0);
  assert.equal(material.color.getHexString(), 'fbbf24');
  material.dispose();
});
test('long frames clamp spin integration; reverse rotation wraps without changing the carrier', () => {
  const carrier = new Group();
  const spin = new Group();
  const wheel = { id: 'fr', position: [0, 1, 0], rotation: [0, 0, 0, 1], wheel_speed: -10 };
  const angle = applyColliderWheelPose(carrier, spin, null, wheel, 0, 5);
  assert.ok(Math.abs(angle - (Math.PI * 2 - 0.5)) < 1e-10);
  assert.deepEqual(carrier.quaternion.toArray(), wheel.rotation);
});
