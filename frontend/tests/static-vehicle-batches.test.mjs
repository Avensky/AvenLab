import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  AnimationClip, BufferAttribute, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute,
  Group, IntType, InterleavedBuffer, InterleavedBufferAttribute, Matrix3,
  Mesh, MeshPhysicalMaterial, MeshStandardMaterial, NumberKeyframeTrack, Raycaster,
  SkinnedMesh, Texture, Vector3,
} from 'three';
import { batchStaticVehicleMeshes } from '../src/vehicles/tools/staticVehicleBatches.ts';
import { prepareVehicleVisual } from '../src/vehicles/tools/vehicleMaterials.ts';
import { splitAe86DriverDoor } from '../src/game/preview/ae86DriverDoor.ts';
import { GARAGE_STATIONS } from '../src/game/preview/garageStations.ts';
import { applyShowroomPaint, applyShowroomHighlights, isVehicleBodyMaterial } from '../src/game/preview/garageVehiclePaint.ts';
import { loadVehicleGeometry } from '../scripts/load-vehicle-geometry.mjs';

const near = (a, b, tolerance = 2e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const meshes = root => { const found = []; root.traverse(o => { if (o.isMesh) found.push(o); }); return found; };
const batched = root => meshes(root).filter(mesh => mesh.userData.staticVehicleParts);

function triangle() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('tangent', new Float32BufferAttribute([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1], 4));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setAttribute('uv1', new Float32BufferAttribute([.2, .1, .8, .1, .2, .9], 2));
  geometry.setAttribute('color', new BufferAttribute(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]), 3, true));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

function sourceBufferDigest(root) {
  const buffers = new Set();
  for (const mesh of meshes(root)) for (const attribute of [...Object.values(mesh.geometry.attributes), mesh.geometry.index]) {
    if (attribute) buffers.add(attribute.array.buffer);
  }
  const hash = createHash('sha256');
  for (const buffer of buffers) hash.update(new Uint8Array(buffer));
  return hash.digest('hex');
}

test('identical UV channels share one owned derived attribute and unique storage is counted once', () => {
  const source = new Group(), material = new MeshStandardMaterial();
  for (let i = 0; i < 2; i++) {
    const geometry = triangle();
    for (const name of ['uv1', 'uv2', 'texcoord_4']) geometry.setAttribute(name, geometry.attributes.uv.clone());
    const mesh = new Mesh(geometry, material); mesh.position.x = i * 3; source.add(mesh);
  }
  const first = source.clone(true), peer = source.clone(true);
  const one = batchStaticVehicleMeshes(first), two = batchStaticVehicleMeshes(peer);
  const geometry = batched(first)[0].geometry, uv = geometry.attributes.uv;
  for (const name of ['uv1', 'uv2', 'texcoord_4']) assert.equal(geometry.attributes[name], uv, `${name} shares the BufferAttribute, not just its array`);
  assert.equal(one.stats.geometryBytes, 318, 'six vertices have one 2D UV buffer, plus position/normal/tangent/color/index storage');
  assert.equal(batched(peer)[0].geometry, geometry, 'equivalent live instances retain immutable shared derived geometry');
  for (const mesh of meshes(source)) for (const attribute of Object.values(mesh.geometry.attributes)) {
    assert.notEqual(uv, attribute); assert.notEqual(uv.array.buffer, attribute.array.buffer);
  }
  const original = source.children[0].geometry.attributes.uv;
  original.setX(0, .5); original.needsUpdate = true;
  assert.equal(uv.getX(0), 0, 'editing a source cannot write into an already-prepared instance');
  const revised = source.clone(true), three = batchStaticVehicleMeshes(revised);
  const revisedGeometry = batched(revised)[0].geometry;
  assert.notEqual(revisedGeometry, geometry, 'a source version change cannot reuse stale derived geometry');
  assert.equal(revisedGeometry.attributes.uv.getX(0), .5);
  assert.equal(revisedGeometry.attributes.uv1.getX(0), 0);
  assert.notEqual(revisedGeometry.attributes.uv, revisedGeometry.attributes.uv1, 'now-distinct source channels stay independent');
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
  one.dispose(); assert.equal(disposed, 0); two.dispose(); assert.equal(disposed, 1); three.dispose();
});

test('interleaved UV aliases honor offsets and strides without mutating source storage', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  const streams = [
    { stride: 6, offsets: [0, 3], values: [0, 0, 91, 0, 0, 92, 1, 0, 91, 1, 0, 92, 0, 1, 91, 0, 1, 92] },
    { stride: 7, offsets: [1, 3], values: [91, 0, 0, 0, 0, 92, 93, 91, 1, 0, 1, 0, 92, 93, 91, 0, 1, 0, 1, 92, 93] },
  ];
  for (const stream of streams) {
    const geometry = triangle(), data = new InterleavedBuffer(new Float32Array(stream.values), stream.stride);
    geometry.setAttribute('uv', new InterleavedBufferAttribute(data, 2, stream.offsets[0]));
    geometry.setAttribute('uv1', new InterleavedBufferAttribute(data, 2, stream.offsets[1]));
    root.add(new Mesh(geometry, material));
  }
  const before = sourceBufferDigest(root), result = batchStaticVehicleMeshes(root);
  const geometry = batched(root)[0].geometry;
  assert.equal(geometry.attributes.uv1, geometry.attributes.uv);
  assert.deepEqual([...geometry.attributes.uv.array], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  result.dispose(); assert.equal(sourceBufferDigest(root), before);
});

test('exact UV aliases retain component widths and isolate shared source buffers', () => {
  const values = [0, 0, 1, 0, 0, 1];
  for (const ArrayType of [Uint8Array, Uint16Array, Float32Array, Float64Array]) {
    const root = new Group(), material = new MeshStandardMaterial();
    for (let i = 0; i < 2; i++) {
      const geometry = triangle();
      for (const name of ['uv', 'uv1']) {
        const data = new ArrayType(new SharedArrayBuffer(values.length * ArrayType.BYTES_PER_ELEMENT)); data.set(values);
        geometry.setAttribute(name, new BufferAttribute(data, 2, true));
      }
      root.add(new Mesh(geometry, material));
    }
    const source = root.children[0].geometry.attributes.uv;
    const result = batchStaticVehicleMeshes(root), geometry = batched(root)[0].geometry;
    const uv = geometry.attributes.uv;
    assert.equal(uv, geometry.attributes.uv1); assert.equal(uv.array.constructor, ArrayType);
    assert.equal(uv.normalized, true); assert.notEqual(uv.array.buffer, source.array.buffer);
    source.array[0] = 1; assert.equal(uv.array[0], 0, `${ArrayType.name} source edits remain isolated`);
    result.dispose();
  }
});

test('unique storage accounting also deduplicates geometry reused by separate material batches', () => {
  const root = new Group(), a = triangle(), b = triangle();
  a.setAttribute('uv1', a.attributes.uv.clone()); b.setAttribute('uv1', b.attributes.uv.clone());
  for (const material of [new MeshStandardMaterial(), new MeshStandardMaterial()]) {
    const first = new Mesh(a, material), second = new Mesh(b, material); second.position.x = 3;
    root.add(first, second);
  }
  const result = batchStaticVehicleMeshes(root), batches = batched(root);
  assert.equal(result.stats.batches, 2); assert.equal(batches[0].geometry, batches[1].geometry);
  assert.notEqual(batches[0].material, batches[1].material);
  assert.equal(result.stats.geometryBytes, 318, 'two draws still reference only one allocation set');
  result.dispose();
});

test('a differing source segment or signed-zero bit keeps UV channels independent', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  for (let i = 0; i < 2; i++) {
    const geometry = triangle();
    geometry.setAttribute('uv1', geometry.attributes.uv.clone());
    geometry.setAttribute('uv2', geometry.attributes.uv.clone());
    if (i === 1) geometry.attributes.uv1.setY(2, .75);
    geometry.attributes.uv2.setX(0, -0);
    root.add(new Mesh(geometry, material));
  }
  const result = batchStaticVehicleMeshes(root), geometry = batched(root)[0].geometry;
  assert.notEqual(geometry.attributes.uv1, geometry.attributes.uv);
  assert.equal(geometry.attributes.uv1.getY(5), .75);
  assert.notEqual(geometry.attributes.uv2, geometry.attributes.uv);
  assert.ok(Object.is(geometry.attributes.uv2.getX(0), -0));
  assert.ok(Object.is(geometry.attributes.uv.getX(0), 0));
  result.dispose();
});

test('UV storage type, attribute class, normalization, item size and GPU type boundaries are preserved', () => {
  const values = [0, 0, 1, 0, 0, 1];
  const formats = [
    ['storage type', () => new BufferAttribute(new Uint16Array(values), 2), () => new BufferAttribute(new Uint32Array(values), 2)],
    ['attribute class', () => new Float32BufferAttribute(values, 2), () => new BufferAttribute(new Float32Array(values), 2)],
    ['normalization', () => new BufferAttribute(new Uint16Array(values), 2), () => new BufferAttribute(new Uint16Array(values), 2, true)],
    ['item size', () => new Float32BufferAttribute(values, 2), () => new Float32BufferAttribute([0, 0, 0], 1)],
    ['GPU type', () => new BufferAttribute(new Uint16Array(values), 2), () => Object.assign(new BufferAttribute(new Uint16Array(values), 2), { gpuType: IntType })],
  ];
  for (const [label, first, second] of formats) {
    const root = new Group(), material = new MeshStandardMaterial();
    for (let i = 0; i < 2; i++) {
      const geometry = triangle(); geometry.setAttribute('uv', first()); geometry.setAttribute('uv1', second());
      root.add(new Mesh(geometry, material));
    }
    const result = batchStaticVehicleMeshes(root), geometry = batched(root)[0].geometry;
    assert.notEqual(geometry.attributes.uv1, geometry.attributes.uv, label);
    assert.notEqual(geometry.attributes.uv1.array.buffer, geometry.attributes.uv.array.buffer, label);
    result.dispose();
  }
});

test('dynamic UV usage remains outside static batching', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  for (let i = 0; i < 2; i++) {
    const geometry = triangle(); geometry.setAttribute('uv1', geometry.attributes.uv.clone().setUsage(DynamicDrawUsage));
    root.add(new Mesh(geometry, material));
  }
  const original = [...root.children], result = batchStaticVehicleMeshes(root);
  assert.equal(result.stats.batches, 0); assert.deepEqual(root.children, original); result.dispose();
});

test('opaque sibling batches preserve transformed vertices, UVs, normals, mirrored winding and tangent handedness', () => {
  const root = new Group(), parent = new Group(); root.add(parent);
  root.position.set(8, -2, 5); parent.rotation.set(.2, -.4, .1);
  const material = new MeshStandardMaterial({ map: new Texture() }); material.name = 'body';
  const a = new Mesh(triangle(), material), b = new Mesh(triangle(), material);
  a.userData.avenlab = { schema: 1, id: 'panel-a', role: 'body.paint' };
  b.userData.avenlab = { schema: 1, id: 'panel-b', role: 'body.paint' };
  a.name = 'panel-a'; b.name = 'panel-b'; a.position.set(1, .5, -2); a.rotation.set(.2, .6, -.3); a.scale.set(2, 1, .8);
  b.position.set(-2, 3, 1); b.rotation.set(-.5, .3, .2); b.scale.set(-1, .7, 1.2);
  parent.add(a, b); root.updateMatrixWorld(true);
  const sourceBuffers = [a, b].map(mesh => Buffer.from(mesh.geometry.attributes.position.array.buffer).toString('hex'));
  const expected = [a, b].flatMap(mesh => Array.from({ length: 3 }, (_, index) => ({
    position: new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld),
    normal: new Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, index).applyNormalMatrix(new Matrix3().getNormalMatrix(mesh.matrixWorld)),
    tangent: new Vector3().fromBufferAttribute(mesh.geometry.attributes.tangent, index).transformDirection(mesh.matrixWorld),
  })));
  const result = batchStaticVehicleMeshes(root);
  assert.equal(result.stats.savedDrawRanges, 1);
  const [batch] = batched(root); assert.equal(batch.material, material);
  assert.deepEqual(batch.userData.avenlab, { schema: 1, role: 'body.paint' });
  assert.deepEqual(batch.userData.staticVehicleParts.map(part => part.avenlab.id), ['panel-a', 'panel-b']);
  assert.equal(batch.geometry.groups.length, 0, 'one material and one draw, not one group per source');
  root.updateMatrixWorld(true);
  for (let i = 0; i < 6; i++) {
    near(new Vector3().fromBufferAttribute(batch.geometry.attributes.position, i).applyMatrix4(batch.matrixWorld).distanceTo(expected[i].position), 0);
    near(new Vector3().fromBufferAttribute(batch.geometry.attributes.normal, i).applyNormalMatrix(new Matrix3().getNormalMatrix(batch.matrixWorld)).distanceTo(expected[i].normal), 0);
    near(new Vector3().fromBufferAttribute(batch.geometry.attributes.tangent, i).transformDirection(batch.matrixWorld).distanceTo(expected[i].tangent), 0);
    for (const name of ['uv', 'uv1', 'color']) for (let component = 0; component < batch.geometry.attributes[name].itemSize; component++)
      near(batch.geometry.attributes[name].getComponent(i, component), [a, b][Math.floor(i / 3)].geometry.attributes[name].getComponent(i % 3, component));
    assert.equal(batch.geometry.attributes.tangent.getW(i), i < 3 ? 1 : -1);
  }
  assert.deepEqual([...batch.geometry.index.array], [0, 1, 2, 3, 5, 4]);
  for (let index = 0; index < 2; index++) assert.equal(Buffer.from([a, b][index].geometry.attributes.position.array.buffer).toString('hex'), sourceBuffers[index]);
  result.dispose(); assert.deepEqual(parent.children, [a, b]);
  result.dispose(); assert.deepEqual(parent.children, [a, b], 'cleanup is idempotent');
});

test('batching preserves a front-facing ray hit on reflected opaque geometry', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  const a = new Mesh(triangle(), material), b = new Mesh(triangle(), material);
  b.scale.x = -1; b.position.x = 3; root.add(a, b); root.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(2.8, .2, 1), new Vector3(0, 0, -1));
  const before = ray.intersectObject(root)[0]; assert.ok(before);
  const result = batchStaticVehicleMeshes(root); root.updateMatrixWorld(true);
  const after = ray.intersectObject(root)[0]; assert.ok(after);
  near(before.point.distanceTo(after.point), 0);
  result.dispose();
});

test('material, behavior and render state boundaries stay separate; independent parts keep their identity', () => {
  const root = new Group(), paint = new MeshStandardMaterial(); paint.name = 'body';
  const add = (name, material = paint, parent = root) => { const mesh = new Mesh(triangle(), material); mesh.name = name; parent.add(mesh); return mesh; };
  const a = add('static-a'), b = add('static-b');
  const otherPaint = add('separate-paint', paint.clone());
  const shadow = add('different-shadow'); shadow.castShadow = true;
  const layer = add('different-layer'); layer.layers.set(2);
  const transparent = add('clear', new MeshStandardMaterial({ transparent: true, opacity: .3 }));
  const transmission = add('transmissive', new MeshPhysicalMaterial({ transmission: .5 }));
  const names = ['WHEEL_FL', 'DOOR_LEFT', 'STEERING_WHEEL', 'HEADLIGHT_L', 'WINDOW_LEFT', 'damage-panel', 'hinge-control'];
  const controls = names.map(name => add(name));
  const genericControl = add('Mesh128_black1_0');
  const wheel = new Group(); wheel.name = 'WHEEL_RL'; root.add(wheel); const wheelPrimitive = add('anonymous', paint, wheel);
  const damaged = add('anonymous-damaged'); damaged.userData.damageChannel = 'left';
  const role = add('anonymous-role'); role.userData.avenlab = { role: 'light.head.front_left' };
  const hooked = add('custom-hook'); hooked.onBeforeRender = () => {};
  const picked = add('custom-pick'); picked.raycast = () => {};
  const handled = add('click-handler'); handled.__r3f = { eventCount: 1 };
  const skin = new SkinnedMesh(triangle(), paint); root.add(skin);
  const morph = add('morph'); morph.geometry.morphAttributes.position = [morph.geometry.attributes.position.clone()];
  const partial = add('partial'); partial.geometry.setDrawRange(0, 0);
  const retained = [otherPaint, shadow, layer, transparent, transmission, ...controls, genericControl, wheelPrimitive, damaged, role, hooked, picked, handled, skin, morph, partial];
  const result = batchStaticVehicleMeshes(root, { protectedNames: ['Mesh128_black1_0'] });
  assert.equal(result.stats.sourceMeshes, 2); assert.equal(result.stats.batches, 1);
  for (const mesh of retained) assert.ok(mesh.parent, `${mesh.name} remains independently addressable`);
  assert.equal(root.getObjectByName('WHEEL_RL'), wheel);
  assert.equal(transparent.material.opacity, .3);
  result.dispose(); assert.equal(a.parent, root); assert.equal(b.parent, root);
});

test('animation bindings protect unnamed animated meshes, and unresolved bindings fail closed', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  const parts = ['still-a', 'still-b', 'animated'].map(name => { const mesh = new Mesh(triangle(), material); mesh.name = name; root.add(mesh); return mesh; });
  const animations = [new AnimationClip('door motion', 1, [new NumberKeyframeTrack('animated.position[x]', [0, 1], [0, 1])])];
  const first = batchStaticVehicleMeshes(root, { animations });
  assert.equal(first.stats.savedDrawRanges, 1); assert.equal(root.getObjectByName('animated'), parts[2]); first.dispose();
  const unknown = batchStaticVehicleMeshes(root, { animations: [new AnimationClip('unknown', 1, [new NumberKeyframeTrack('missing.position[x]', [0, 1], [0, 1])])] });
  assert.equal(unknown.stats.batches, 0); unknown.dispose();
});

test('derived buffers are shared only while in use and cleanup never disposes source geometry, materials or textures', () => {
  const source = new Group(), material = new MeshStandardMaterial({ map: new Texture() });
  const geometry = triangle(); const a = new Mesh(geometry, material), b = new Mesh(geometry, material); b.position.x = 3; source.add(a, b);
  let sourceDisposals = 0, materialDisposals = 0, textureDisposals = 0, derivedDisposals = 0;
  geometry.addEventListener('dispose', () => sourceDisposals++); material.addEventListener('dispose', () => materialDisposals++);
  material.map.addEventListener('dispose', () => textureDisposals++);
  const first = source.clone(true), second = source.clone(true);
  const one = batchStaticVehicleMeshes(first), two = batchStaticVehicleMeshes(second);
  const derived = batched(first)[0].geometry; assert.equal(derived, batched(second)[0].geometry);
  derived.addEventListener('dispose', () => derivedDisposals++);
  one.dispose(); assert.equal(derivedDisposals, 0); two.dispose(); assert.equal(derivedDisposals, 1);
  assert.deepEqual([sourceDisposals, materialDisposals, textureDisposals], [0, 0, 0]);
  const third = source.clone(true), three = batchStaticVehicleMeshes(third);
  assert.notEqual(batched(third)[0].geometry, derived, 'released entries cannot accumulate in the cache'); three.dispose();
});

for (const model of ['brz', 'ae86']) test(`installed ${model} preserves authored parts and triangle counts while reducing only compatible ranges`, async t => {
  const path = new URL(`../public/models/vehicles/land/sports-cars/${model}/model.glb`, import.meta.url);
  const bytes = await readFile(path).catch(() => null);
  if (bytes?.toString('ascii', 0, 4) !== 'glTF') return t.skip('Real asset is not installed; materialize with Git LFS');
  const { scene, animations } = await loadVehicleGeometry(bytes);
  const sourceBuffers = sourceBufferDigest(scene);
  const visual = prepareVehicleVisual(scene, model);
  const restoreDoor = model === 'ae86' ? splitAe86DriverDoor(visual.root) : undefined;
  const before = meshes(visual.root), originalOrder = [...before];
  const sourceColors = new Map(meshes(scene).flatMap(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .filter(material => material.isMeshStandardMaterial).map(material => [material, material.color.getHexString()])));
  const unchanged = new Map([...visual.materials].filter(material => material.isMeshStandardMaterial && !isVehicleBodyMaterial(material.name, model))
    .map(material => [material, { color: material.color.getHexString(), opacity: material.opacity, map: material.map }]));
  const triangles = nodes => nodes.reduce((total, node) => total + (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3, 0);
  const sourceTriangles = triangles(before);
  const controls = before.filter(mesh => /wheel|door|hood|steer|lamp|light|window|glass|mirror/i.test(mesh.name) || GARAGE_STATIONS[model].steeringParts.includes(mesh.name));
  const protectedStates = controls.map(mesh => ({ mesh, parent: mesh.parent, geometry: mesh.geometry, material: mesh.material, matrix: mesh.matrix.clone() }));
  const batch = batchStaticVehicleMeshes(visual.root, { protectedNames: GARAGE_STATIONS[model].steeringParts, animations });
  const after = meshes(visual.root);
  assert.equal(triangles(after), sourceTriangles);
  assert.equal(after.length, before.length - batch.stats.savedDrawRanges);
  for (const state of protectedStates) {
    assert.equal(state.mesh.parent, state.parent); assert.equal(state.mesh.geometry, state.geometry);
    assert.equal(state.mesh.material, state.material); assert.deepEqual(state.mesh.matrix, state.matrix);
  }
  if (model === 'brz') {
    assert.ok(batch.stats.savedDrawRanges > 50, 'real BRZ must have a meaningful draw-range reduction');
    assert.equal(batch.stats.geometryBytes, 16_125_666, 'exact UV aliases eliminate seven redundant streams');
    for (const mesh of batched(visual.root)) for (const name of ['uv1', 'uv2', 'uv3', 'texcoord_4', 'texcoord_5', 'texcoord_6', 'texcoord_7'])
      assert.equal(mesh.geometry.getAttribute(name), mesh.geometry.getAttribute('uv'), `${mesh.material.name} ${name}`);
  }
  for (const mesh of batched(visual.root)) assert.equal(mesh.geometry.groups.length, 0);
  for (const [color, finish, roughness] of [['#6a2be1', 'matte', .82], ['#15b4d0', 'high-gloss', .18]]) {
    applyShowroomPaint(visual.root, model, 'factory', color);
    applyShowroomHighlights(visual.root, .45, finish, .5, model);
    for (const mesh of after) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!isVehicleBodyMaterial(material.name, model)) continue;
      assert.equal(material.color.getHexString(), color.slice(1)); assert.equal(material.roughness, roughness);
    }
    for (const [material, state] of unchanged) {
      assert.equal(material.color.getHexString(), state.color); assert.equal(material.opacity, state.opacity); assert.equal(material.map, state.map);
    }
    for (const [material, original] of sourceColors) assert.equal(material.color.getHexString(), original, 'paint must not reach the cached original');
  }
  batch.dispose(); assert.deepEqual(meshes(visual.root), originalOrder);
  restoreDoor?.(); visual.dispose();
  assert.equal(sourceBufferDigest(scene), sourceBuffers, 'cached source attribute/index bytes remain immutable');
  assert.deepEqual(await readFile(path), bytes, 'original GLB bytes are immutable');
});
