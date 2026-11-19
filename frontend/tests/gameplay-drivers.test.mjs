import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, Group, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { GARAGE_STATIONS } from '../src/game/preview/garageStations.ts';
import { createDriverGeometries, DRIVER_CROWN, DRIVER_HAT_CROWN, DRIVER_PARTS } from '../src/vehicles/drivers/driverGeometry.ts';
import { createDriverBatch, createDriverPalette, updateDriverPalette } from '../src/vehicles/drivers/driverBatch.ts';
import { driverCabin } from '../src/vehicles/drivers/driverCabin.ts';
import { createDriverFleet } from '../src/vehicles/drivers/driverFleet.ts';
import { driverVisible } from '../src/vehicles/drivers/driverVisibility.ts';

const appearance = { body: 'female', skin: '#d49673', hair: '#4a251b', hairStyle: 'long', headwear: 'hat', headwearColor: '#eed29a', top: '#6f203f', bottom: '#172b4a' };
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-6, `${actual} differs from ${expected}`);
function camera() {
  const value = new PerspectiveCamera(60, 1, .1, 3000);
  value.position.set(0, 1, 8); value.lookAt(0, .6, 0); value.updateMatrixWorld();
  return value;
}
const totalInstances = fleet => Object.values(fleet.batches).reduce((sum, mesh) => sum + mesh.count, 0);
function palette(value = appearance) {
  const result = createDriverPalette(); updateDriverPalette(result, value); return result;
}

test('the driver silhouette has a fixed geometry budget, three body shapes and no textures or skinning', () => {
  const geometries = createDriverGeometries();
  try {
    const triangles = part => geometries[part].index.count / 3;
    for (const body of ['female', 'male', 'neutral']) {
      const worstCase = ['skin', body, 'bottom', 'longHair', 'hat'].reduce((sum, part) => sum + triangles(part), 0);
      assert(worstCase <= 650, `${body}: ${worstCase} triangles`);
    }
    const shoulderWidth = body => {
      const positions = geometries[body].getAttribute('position');
      let width = 0;
      for (let i = 0; i < positions.count; i++) if (positions.getY(i) > .40) width = Math.max(width, Math.abs(positions.getX(i)));
      return width;
    };
    assert(shoulderWidth('female') < shoulderWidth('neutral'));
    assert(shoulderWidth('neutral') < shoulderWidth('male'));
    for (const geometry of Object.values(geometries)) {
      assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position']);
      for (const attribute of Object.values(geometry.attributes)) assert(attribute.array.every(Number.isFinite));
      assert(geometry.boundingBox.max.y <= DRIVER_HAT_CROWN + 1e-6);
    }
  } finally { Object.values(geometries).forEach(geometry => geometry.dispose()); }
});

test('64 occupants share eight possible draws and only changed instance buffers are uploaded', () => {
  const batch = createDriverBatch(64), colors = palette(), transform = new Matrix4();
  try {
    const frame = () => {
      batch.begin();
      for (let i = 0; i < 64; i++) batch.add(transform.makeTranslation(i, 0, 0), appearance, colors);
      batch.end();
    };
    frame();
    assert.equal(batch.root.children.length, 8);
    assert.equal(batch.root.children.filter(mesh => mesh.visible).length, 5);
    assert.equal(batch.batches.skin.count, 64);
    const versions = Object.values(batch.batches).map(mesh => [mesh.instanceMatrix.version, mesh.instanceColor.version]);
    frame();
    assert.deepEqual(Object.values(batch.batches).map(mesh => [mesh.instanceMatrix.version, mesh.instanceColor.version]), versions);
    const dye = { ...appearance, top: '#4477aa' }; updateDriverPalette(colors, dye);
    frame();
    assert.equal(batch.batches.female.instanceMatrix.version, versions[1][0]);
    assert.equal(batch.batches.female.instanceColor.version, versions[1][1] + 1);
    const top = new Color(); batch.batches.female.getColorAt(5, top);
    const expected = new Color(dye.top); near(top.r, expected.r); near(top.g, expected.g); near(top.b, expected.b);
    for (const mesh of Object.values(batch.batches)) {
      assert.equal(mesh.material, batch.batches.skin.material);
      assert.equal(mesh.material.map, null); assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
    }
    batch.begin(); batch.end(); assert.equal(totalInstances(batch), 0);
  } finally { batch.dispose(); }
});

test('every supported cabin reuses the calibrated seat side and keeps hair or headwear under the roof', () => {
  for (const [model, station] of Object.entries(GARAGE_STATIONS)) {
    const cabin = driverCabin(model);
    if (station.kind === 'bridge') { assert.equal(cabin, null); continue; }
    for (const [fit, crown] of [[cabin.bare, DRIVER_CROWN], [cabin.hat, DRIVER_HAT_CROWN]]) {
      const hip = new Vector3().setFromMatrixPosition(fit);
      near(hip.x, station.seat[0]); near(hip.z, station.seat[2]);
      assert(hip.y <= station.seat[1]);
      assert(hip.y + crown * cabin.units <= station.roof - .024 * cabin.units);
    }
  }
  assert.equal(driverCabin(' Toyota_AE86 ').model, 'ae86');
  assert.equal(driverCabin('scion-fr-s').model, 'brz');
  assert.equal(driverCabin('camaro-2017').model, 'camaro');
  assert.equal(driverCabin('toyota-a90').model, 'supra');
  assert.equal(driverCabin('unknown'), null);
});

test('pixel visibility has a stable enter/leave band and respects low-detail mode', () => {
  assert.equal(driverVisible(8, true, false), true);
  assert.equal(driverVisible(7, true, false), false);
  assert.equal(driverVisible(7, true, true), true);
  assert.equal(driverVisible(5, true, true), false);
  assert.equal(driverVisible(11, true, false, true), false);
  assert.equal(driverVisible(10, true, true, true), true);
  assert.equal(driverVisible(200, false, true), false);
  for (const value of [NaN, Infinity, -1]) assert.equal(driverVisible(value, true, true), false);
});

test('the live frame path draws occupied cars only and updates or removes appearances without roster changes', () => {
  const cars = [{ id: 'driver', vehicle_id: 'ae86' }, { id: 'empty', vehicle_id: 'brz' }];
  const appearances = new Map([['driver', appearance]]), reads = [];
  const fleet = createDriverFleet(cars, {
    appearance: id => appearances.get(id),
    pose: id => { reads.push(id); return { position: [0, 0, 0], rotation: [0, 0, 0, 1] }; },
    offset: (_car, out) => out.set(0, 0, 0),
  });
  try {
    const view = camera(); fleet.update(view, 800, 0, false);
    assert.deepEqual(reads, ['driver']); assert.equal(totalInstances(fleet), 5);
    const changed = { ...appearance, body: 'male', skin: '#553322', top: '#4477aa', hairStyle: 'none', headwear: 'none' };
    appearances.set('driver', changed);
    fleet.update(view, 800, .02, false);
    assert.equal(fleet.batches.male.count, 1); assert.equal(fleet.batches.female.count, 0);
    assert.equal(fleet.batches.hat.count, 0); assert.equal(fleet.batches.longHair.count, 0);
    const color = new Color(); fleet.batches.skin.getColorAt(0, color);
    const expected = new Color(changed.skin); near(color.r, expected.r); near(color.g, expected.g); near(color.b, expected.b);
    appearances.delete('driver');
    const before = reads.length; fleet.update(view, 800, .03, false);
    assert.equal(reads.length, before); assert.equal(totalInstances(fleet), 0);
    assert(Object.values(fleet.batches).every(mesh => !mesh.visible));
  } finally { fleet.dispose(); }
});

test('the driver follows the shared interpolated body pose and the same local visual offset', () => {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .7);
  const pose = { position: [0, .7, -2], rotation: rotation.toArray() };
  const fleet = createDriverFleet([{ id: 'driver', vehicle_id: 'ae86' }], {
    appearance: () => appearance, pose: () => pose, offset: (_car, out) => out.set(0, -.855, 0),
  });
  try {
    fleet.update(camera(), 800, 0, false);
    assert.equal(fleet.batches.skin.count, 1);
    const actual = new Matrix4(); fleet.batches.skin.getMatrixAt(0, actual);
    const expected = new Matrix4().compose(new Vector3(...pose.position).add(new Vector3(0, -.855, 0).applyQuaternion(rotation)), rotation, new Vector3(1, 1, 1)).multiply(driverCabin('ae86').hat);
    actual.elements.forEach((value, index) => near(value, expected.elements[index]));
    pose.position[0] += .4;
    fleet.update(camera(), 800, .02, false);
    fleet.batches.skin.getMatrixAt(0, actual); near(actual.elements[12], expected.elements[12] + .4);
  } finally { fleet.dispose(); }
});

test('tiny or off-screen occupants stop pose work between visibility polls', () => {
  let reads = 0;
  const pose = { position: [0, 0, -1000], rotation: [0, 0, 0, 1] };
  const fleet = createDriverFleet([{ id: 'driver', vehicle_id: 'ae86' }], {
    appearance: () => appearance, pose: () => { reads++; return pose; }, offset: (_car, out) => out.set(0, 0, 0),
  });
  try {
    const view = camera(); fleet.update(view, 800, 0, false); assert.equal(reads, 1); assert.equal(totalInstances(fleet), 0);
    fleet.update(view, 800, .02, false); fleet.update(view, 800, .08, false); assert.equal(reads, 1);
    pose.position = [1000, 0, 0]; fleet.update(view, 800, .11, false); assert.equal(reads, 2); assert.equal(totalInstances(fleet), 0);
    pose.position = [0, 0, 0]; fleet.update(view, 800, .22, false); assert.equal(fleet.batches.skin.count, 1);
  } finally { fleet.dispose(); }
});

test('each committed fleet owns and releases its geometry, instance buffers and one material once', () => {
  for (let mount = 0; mount < 2; mount++) {
    const batch = createDriverBatch(2), parent = new Group(), disposed = { mesh: 0, geometry: 0, material: 0 };
    parent.add(batch.root);
    for (const part of DRIVER_PARTS) {
      batch.batches[part].addEventListener('dispose', () => disposed.mesh++);
      batch.batches[part].geometry.addEventListener('dispose', () => disposed.geometry++);
    }
    batch.batches.skin.material.addEventListener('dispose', () => disposed.material++);
    batch.dispose(); batch.dispose();
    assert.deepEqual(disposed, { mesh: 8, geometry: 8, material: 1 });
    assert.equal(batch.root.parent, null); assert.equal(batch.root.children.length, 0); assert.equal(parent.children.length, 0);
  }
});
