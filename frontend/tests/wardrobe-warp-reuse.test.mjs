import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  BufferAttribute, BufferGeometry, DataUtils, Float16BufferAttribute, Float32BufferAttribute,
  InterleavedBuffer, InterleavedBufferAttribute, Vector3,
} from 'three';
import { createServer } from 'vite';

let vite, warpWardrobeGeometry, createWardrobeWarpMemo;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ warpWardrobeGeometry } = await vite.ssrLoadModule('/src/game/characters/warpWardrobeGeometry.ts'));
  ({ createWardrobeWarpMemo } = await vite.ssrLoadModule('/src/game/characters/wardrobeWarpMemo.ts'));
});
after(async () => { await vite?.close(); });

const positions = [.125, 1.125, -.09375, .125, 1.125, -.09375,
  -.25, 1.0625, .1875, .125, 1.125, -.09375];
const normals = [1, 0, 0, 0, 1, 0, 0, 0, 1, -.3, .4, .5];
const tangents = [0, 1, 0, -1, 1, 0, 0, 1, 1, 1, 0, -1, -1, 0, 1, 1];
const reuse = { reuseExactPositions: true };
const raw = a => a.isInterleavedBufferAttribute ? a.data.array : a.array;

function attributeState(attribute) {
  if (!attribute) return null;
  const array = raw(attribute);
  return { type: attribute.constructor.name, arrayType: array.constructor.name, itemSize: attribute.itemSize,
    count: attribute.count, normalized: attribute.normalized, usage: attribute.usage,
    interleaved: attribute.isInterleavedBufferAttribute ? [attribute.data.stride, attribute.offset] : null,
    bytes: Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('hex') };
}

function geometryState(geometry) {
  if (!geometry) return undefined;
  return {
    attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, a]) => [name, attributeState(a)])),
    index: attributeState(geometry.index), groups: structuredClone(geometry.groups), drawRange: { ...geometry.drawRange },
    morphAttributes: Object.fromEntries(Object.entries(geometry.morphAttributes)
      .map(([name, attributes]) => [name, attributes.map(attributeState)])),
    morphTargetsRelative: geometry.morphTargetsRelative,
    bounds: geometry.boundingBox && [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()],
    sphere: geometry.boundingSphere && [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius],
  };
}

function garment({ normal = true, tangent = true, doubles = false } = {}) {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
  const shading = (values, size) => doubles ? new BufferAttribute(new Float64Array(values), size)
    : new Float32BufferAttribute(values, size);
  if (normal) geometry.setAttribute('normal', shading(normals, 3));
  if (tangent) geometry.setAttribute('tangent', shading(tangents, 4));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, .2, .3, .4, .5, .7, .9], 2));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([1, 2, 0, 0, 2, 3, 0, 0, 3, 4, 0, 0, 4, 5, 0, 0]), 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute([.7, .3, 0, 0, .6, .4, 0, 0, .5, .5, 0, 0, .4, .6, 0, 0], 4));
  geometry.setIndex([0, 1, 2, 2, 3, 0]);
  geometry.addGroup(0, 3, 0); geometry.addGroup(3, 3, 1); geometry.setDrawRange(0, 6);
  geometry.morphAttributes.position = [new Float32BufferAttribute(positions.map(n => n * 1.01), 3)];
  return geometry;
}

// Nonlinear terms make a rounded point or Jacobian distinguishable from the
// original double-precision calculations, particularly with Float64 shading.
function bend(x, y, z, target) {
  return target.set(x + Math.sin(y) * .123456789123, y * .941234567891 + x * z * .312345678912,
    z + Math.cos(x) * y * .593123456789);
}

function compare(source, shape, { selected, calls, inspect } = {}) {
  const before = geometryState(source), invoked = [0, 0];
  const wrapped = index => (x, y, z, target) => { invoked[index]++; return shape(x, y, z, target); };
  let original, cached;
  try {
    original = warpWardrobeGeometry(wrapped(0), selected)(source);
    cached = warpWardrobeGeometry(wrapped(1), selected, reuse)(source);
    assert.deepEqual(geometryState(cached), geometryState(original), 'all output bytes, layouts and bounds match the ordinary path');
    assert.deepEqual(geometryState(source), before, 'source attributes, topology and bounds remain unchanged');
    if (calls) assert.deepEqual(invoked, calls);
    if (cached) for (const name of Object.keys(source.attributes)) {
      assert.notEqual(raw(cached.attributes[name]).buffer, raw(source.attributes[name]).buffer, `${name} is model-owned`);
      assert.notEqual(raw(cached.attributes[name]).buffer, raw(original.attributes[name]).buffer, `${name} is not shared between results`);
    }
    inspect?.(cached, original);
    return invoked;
  } finally { original?.dispose(); cached?.dispose(); source.dispose(); }
}

test('exact reuse retains split normals, tangent handedness and all unrelated attributes', () => {
  for (const doubles of [false, true]) compare(garment({ doubles }), bend, { calls: [28, 14], inspect(fitted) {
    const n = fitted.getAttribute('normal'), t = fitted.getAttribute('tangent');
    assert.notDeepEqual([n.getX(0), n.getY(0), n.getZ(0)], [n.getX(1), n.getY(1), n.getZ(1)],
      'duplicate positions retain their distinct authored shading');
    assert.deepEqual(Array.from({ length: t.count }, (_, i) => t.getW(i)), [-1, 1, -1, 1]);
  } });
});

test('selection and unchanged points retain lazy cloning and skip derivative samples', () => {
  compare(garment(), bend, { selected: new Uint8Array([0, 1, 1, 1]), calls: [21, 14], inspect(fitted) {
    assert.deepEqual(Array.from(raw(fitted.attributes.position).subarray(0, 3)), positions.slice(0, 3));
    assert.deepEqual(Array.from(raw(fitted.attributes.normal).subarray(0, 3)), normals.slice(0, 3));
  } });
  compare(garment(), bend, { selected: new Uint8Array(4), calls: [0, 0], inspect: fitted => assert.equal(fitted, undefined) });
  compare(garment(), (x, y, z, target) => target.set(x, y, z), { calls: [4, 2], inspect: fitted => assert.equal(fitted, undefined) });
  for (const tangent of [false, true]) compare(garment({ normal: false, tangent }), bend, { calls: [4, 2], inspect(fitted) {
    if (tangent) assert.deepEqual(Array.from(raw(fitted.attributes.tangent)), tangents);
  } });
});

test('exact keys distinguish signed zero and adjacent Float64 positions', () => {
  const zeros = garment();
  zeros.setAttribute('position', new Float32BufferAttribute([-0, .75, .125, 0, .75, .125, -0, .75, .125, 0, .75, .125], 3));
  compare(zeros, (x, y, z, target) => target.set(x, y + (Object.is(x, -0) ? .75 : .5), z + .125 * y),
    { calls: [28, 14], inspect(fitted) {
      assert(Object.is(fitted.attributes.position.getX(0), -0));
      assert(Object.is(fitted.attributes.position.getX(1), 0));
      assert.notEqual(fitted.attributes.position.getY(0), fitted.attributes.position.getY(1));
    } });
  const signOnly = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-0, 1, 2, 0, 1, 2, -0, 1, 2, 0, 1, 2], 3));
  compare(signOnly, (x, y, z, target) => target.set(-x, y, z),
    { calls: [4, 2], inspect: fitted => assert.equal(fitted, undefined, 'original === unchanged comparison is retained') });
  const close = garment({ doubles: true });
  close.setAttribute('position', new BufferAttribute(new Float64Array([1, 2, 3, 1 + Number.EPSILON, 2, 3,
    1, 2, 3, 1 + Number.EPSILON, 2, 3]), 3));
  compare(close, bend, { calls: [28, 14] });
});

test('ordinary calls remain uncached for callbacks with per-call state', () => {
  const source = garment({ normal: false, tangent: false });
  let calls = 0;
  const fitted = warpWardrobeGeometry((x, y, z, target) => target.set(x + ++calls / 8, y, z))(source);
  try {
    assert.equal(calls, 4);
    assert.notEqual(fitted.attributes.position.getX(0), fitted.attributes.position.getX(1));
  } finally { fitted.dispose(); source.dispose(); }
});

test('memo lifetime excludes later geometries, support changes and raw source edits', () => {
  const source = garment();
  const initial = geometryState(source);
  let support = .125, calls = 0;
  const shape = (x, y, z, target) => target.set(x + support, y * (1 + support), z - support);
  const run = warpWardrobeGeometry((...args) => { calls++; return shape(...args); }, undefined, reuse);
  const first = run(source);
  assert.equal(calls, 14); assert.deepEqual(geometryState(source), initial);
  first.attributes.position.setX(0, 999);
  support = .25;
  source.attributes.position.setX(2, .375); // No version increment or needsUpdate.
  source.attributes.normal.setX(1, .125);
  const nextSource = source.clone();
  const second = run(source), ordinary = warpWardrobeGeometry(shape)(source), third = run(nextSource);
  try {
    assert.equal(calls, 42, 'each invocation evaluates its own two exact positions');
    assert.deepEqual(geometryState(second), geometryState(ordinary));
    assert.deepEqual(geometryState(third), geometryState(ordinary));
    assert.notEqual(raw(second.attributes.position).buffer, raw(third.attributes.position).buffer);
    second.attributes.position.setX(0, 777);
    assert.deepEqual(geometryState(third), geometryState(ordinary), 'editing one model never changes another');
  } finally { for (const g of [first, second, third, ordinary, source, nextSource]) g.dispose(); }
});

test('interleaved storage, padding and overlapping cloned fields keep their original semantics', () => {
  const data = new Float32Array(4 * 14);
  for (let i = 0; i < 4; i++) {
    data.set([99 + i, ...positions.slice(i * 3, i * 3 + 3), ...normals.slice(i * 3, i * 3 + 3),
      ...tangents.slice(i * 4, i * 4 + 4), i / 4, i / 8, -99 - i], i * 14);
  }
  const buffer = new InterleavedBuffer(data, 14);
  const source = new BufferGeometry().setAttribute('position', new InterleavedBufferAttribute(buffer, 3, 1))
    .setAttribute('normal', new InterleavedBufferAttribute(buffer, 3, 4))
    .setAttribute('tangent', new InterleavedBufferAttribute(buffer, 4, 7))
    .setAttribute('uv', new InterleavedBufferAttribute(buffer, 2, 11));
  compare(source, bend, { calls: [28, 14], inspect(fitted) {
    assert.equal(fitted.attributes.position.data, fitted.attributes.normal.data);
    assert.equal(fitted.attributes.position.data, fitted.attributes.tangent.data);
  } });
  // Unusual but valid overlapping fields make read/write order observable.
  // Normals must still be read from the fitted clone after its position write.
  const overlap = new InterleavedBuffer(new Float32Array(positions.flatMap((v, i) => i % 3 === 2 ? [v, 1] : [v])), 4);
  compare(new BufferGeometry().setAttribute('position', new InterleavedBufferAttribute(overlap, 3, 0))
    .setAttribute('normal', new InterleavedBufferAttribute(overlap, 3, 0))
    .setAttribute('tangent', new InterleavedBufferAttribute(overlap, 4, 0)), bend, { calls: [28, 14] });
});

test('native normalized getters retain decoded coordinates and original stored layout', () => {
  const source = garment();
  source.setAttribute('position', new BufferAttribute(new Int16Array([100, 200, 300, 100, 200, 300,
    400, 500, 600, 100, 200, 300]), 3, true));
  compare(source, (x, y, z, target) => target.set(x + .01, y + .02, z + .03), { calls: [28, 14] });
});

test('custom position getters, Float16 decoding and unsupported item sizes use the ordinary path', () => {
  const custom = garment();
  custom.attributes.position.getX = function (i) { return BufferAttribute.prototype.getX.call(this, i); };
  const half = garment();
  half.setAttribute('position', new Float16BufferAttribute(positions.map(DataUtils.toHalfFloat), 3));
  const wide = garment();
  wide.setAttribute('position', new Float32BufferAttribute(positions.flatMap((v, i) => i % 3 === 2 ? [v, 7] : [v]), 4));
  for (const source of [custom, half, wide]) {
    assert.equal(createWardrobeWarpMemo(source.attributes.position), undefined);
    compare(source, bend, { calls: [28, 28] });
  }
});

test('nonfinite keys and derivative results fall back without extra shape evaluations', () => {
  const source = garment();
  source.setAttribute('position', new Float32BufferAttribute([NaN, 1, 2, NaN, 1, 2, Infinity, 1, 2, Infinity, 1, 2], 3));
  compare(source, (x, y, z, target) => target.set(Number.isFinite(x) ? x + .1 : 0, y + .15, z + .25), { calls: [28, 28] });
  const invalidDerivative = garment();
  invalidDerivative.setAttribute('position', new Float32BufferAttribute(Array(4).fill([.125, 1.125, -.09375]).flat(), 3));
  compare(invalidDerivative, (x, y, z, target) => target.set(
    x === .125 && y === 1.125 && z === -.09375 ? x + .25 : NaN, y, z), { calls: [28, 25] });
});

test('memo excludes nonfinite records and bounds typed storage independently of input size', () => {
  const memo = createWardrobeWarpMemo(new Float32BufferAttribute(new Float32Array(31_000 * 3), 3));
  assert.equal(memo.capacity, 30_000);
  assert.equal(memo.bufferBytes, 3_892_168);
  const point = new Vector3(1, 2, 3), dx = new Vector3(.1, .2, .3), dy = new Vector3(.4, .5, .6), dz = new Vector3(.7, .8, .9);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(memo.find(invalid, 0, 0), -1);
    assert.equal(memo.remember(invalid, 0, 0, point), -1);
    assert.equal(memo.find(1, 2, 3), -1);
    assert.equal(memo.remember(1, 2, 3, new Vector3(invalid, 0, 0)), -1);
  }
  assert.equal(memo.find(1, 2, 3), -1);
  const entry = memo.remember(1, 2, 3, point);
  assert(entry >= 0);
  memo.rememberJacobian(entry, new Vector3(NaN, 0, 0), dy, dz);
  assert.equal(memo.readJacobian(entry, dx, dy, dz), false);
  memo.rememberJacobian(entry, dx, dy, dz);
  const result = [new Vector3(), new Vector3(), new Vector3()];
  assert.equal(memo.readJacobian(entry, ...result), true);
  assert.deepEqual(result.map(v => v.toArray()), [dx, dy, dz].map(v => v.toArray()));
  assert.deepEqual(memo.readPoint(memo.find(1, 2, 3), new Vector3()).toArray(), point.toArray());
});

test('entry-budget fallback retains exact geometry for many distinct coordinates', () => {
  const unique = 31_000, coordinates = new Float32Array(unique * 2 * 3);
  for (let i = 0; i < unique * 2; i++) coordinates.set([i % unique, (i % 7) / 8, (i % 11) / 16], i * 3);
  // Repeat exactly the first half, including its secondary coordinates.
  coordinates.copyWithin(unique * 3, 0, unique * 3);
  const source = new BufferGeometry().setAttribute('position', new BufferAttribute(coordinates, 3));
  const calls = compare(source, (x, y, z, target) => target.set(x + .125, y + .25, z + .5));
  assert.equal(calls[0], unique * 2);
  assert(calls[1] > unique, 'entries beyond the finite budget are evaluated again');
  assert(calls[1] < calls[0], 'stored exact repeats still avoid shape calls');
});
