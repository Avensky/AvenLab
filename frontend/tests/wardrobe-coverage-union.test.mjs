import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute, BufferGeometry, DoubleSide, Float32BufferAttribute, InterleavedBuffer,
  InterleavedBufferAttribute, Ray, Vector3 } from 'three';
import { createServer } from 'vite';

const server = () => createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
  logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const dispose = surfaces => surfaces.forEach(surface => surface.geometry.dispose());
function plane(z) {
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
    -1, -1, z, 1, -1, z, 1, 1, z, -1, 1, z,
  ], 3)).setIndex([0, 1, 2, 0, 2, 3]);
}
function nearest(surfaces, ray, near, far) {
  let hit, distance = far;
  for (const surface of surfaces) {
    const next = surface.raycastFirst(ray, DoubleSide, near, distance);
    if (next) { hit = next; distance = next.distance; }
  }
  return hit?.distance;
}
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('hex');
const snapshot = geometry => ({
  position: bytes(geometry.attributes.position.isInterleavedBufferAttribute
    ? geometry.attributes.position.data.array : geometry.attributes.position.array),
  index: geometry.index && bytes(geometry.index.array), drawRange: { ...geometry.drawRange }, groups: [...geometry.groups],
});

test('one coverage BVH preserves nearest distances at seams, ties, near/far limits, and misses', async () => {
  const vite = await server();
  const sources = [plane(1), plane(.5), plane(.5)];
  sources[2].setIndex([2, 1, 0, 3, 2, 0]);
  const before = sources.map(snapshot);
  let union = [], individual = [], sourceDisposals = 0, unionDisposals = 0;
  sources.forEach(source => source.addEventListener('dispose', () => sourceDisposals++));
  try {
    const { wardrobeCoverageUnion } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverageUnion.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    individual = sources.map(source => wardrobeCoverageSurface(source));
    union = wardrobeCoverageUnion(sources);
    assert.equal(union.length, 1);
    union[0].geometry.addEventListener('dispose', () => unionDisposals++);
    const rays = [
      new Ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1)),
      new Ray(new Vector3(0, 0, -1), new Vector3(0, 0, 1)),
      new Ray(new Vector3(0, 0, .5), new Vector3(0, 0, 1)),
      new Ray(new Vector3(2, 0, 3), new Vector3(0, 0, -1)),
      new Ray(new Vector3(0, 0, 3), new Vector3(1, 0, 0)),
      new Ray(new Vector3(.25, -.25, 3), new Vector3(.1, .2, -1).normalize()),
    ];
    for (const x of [-1, -.5, 0, .5, 1]) for (const y of [-1, -.5, 0, .5, 1]) {
      rays.push(new Ray(new Vector3(x, y, 3), new Vector3(0, 0, -1)));
    }
    const limits = [[0, Infinity], [0, 0], [0, 1.5], [0, 2], [2, 2], [2, 2.5],
      [2 + Number.EPSILON * 2, 3], [0, 2 - Number.EPSILON], [.001, 3]];
    for (const ray of rays) for (const [near, far] of limits) {
      assert.equal(nearest(union, ray, near, far), nearest(individual, ray, near, far),
        `origin ${ray.origin.toArray()}, direction ${ray.direction.toArray()}, range ${near}/${far}`);
    }
    const joined = union[0].geometry;
    for (const source of sources) {
      assert.notEqual(joined.attributes.position.array.buffer, source.attributes.position.array.buffer);
      assert.notEqual(joined.index.array.buffer, source.index.array.buffer);
    }
    joined.attributes.position.setZ(0, 40);
    joined.index.setX(0, 1);
    assert.deepEqual(sources.map(snapshot), before, 'BVH construction/reordering and owned mutations leave source bytes unchanged');
  } finally {
    dispose(individual); dispose(union);
    assert.equal(unionDisposals, 1);
    assert.equal(sourceDisposals, 0, 'disposing temporary coverage never disposes an asset');
    sources.forEach(source => source.dispose()); await vite.close();
  }
});

test('coverage union preserves clipped draw ranges and ignores empty or unindexed geometry', async () => {
  const vite = await server();
  const clipped = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([
    -1, -1, 2, 1, -1, 2, 0, 1, 2, -1, -1, .75, 1, -1, .75, 0, 1, .75,
  ], 3)).setIndex([0, 1, 2, 3, 4, 5]);
  clipped.setDrawRange(3, 3);
  const lower = plane(.25), hidden = plane(2.5), unindexed = plane(2.75), empty = plane(2.9);
  hidden.setDrawRange(0, 0); unindexed.setIndex(null); empty.setIndex([]);
  const sources = [clipped, lower, hidden, unindexed, empty], before = sources.map(snapshot);
  let union = [], individual = [];
  try {
    const { wardrobeCoverageUnion } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverageUnion.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    individual = sources.flatMap(source => wardrobeCoverageSurface(source) ?? []);
    union = wardrobeCoverageUnion(sources);
    assert.equal(union.length, 1); assert.equal(union[0].geometry.index.count, 9);
    const ray = new Ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1));
    assert.equal(nearest(union, ray, 0, Infinity), 2.25, 'the clipped front triangle is not reintroduced');
    assert.equal(nearest(union, ray, 0, Infinity), nearest(individual, ray, 0, Infinity));
    assert.deepEqual(wardrobeCoverageUnion([hidden, unindexed, empty]), []);
    assert.deepEqual(sources.map(snapshot), before);
    // The original height-filtered API stays independent of the union path.
    assert.equal(wardrobeCoverageSurface(lower, [2, 3]), undefined);
  } finally { dispose(individual); dispose(union); sources.forEach(source => source.dispose()); await vite.close(); }
});

test('nonpacked and higher-precision coordinates fall back without rounding', async () => {
  const vite = await server();
  const precise = plane(1), interleaved = plane(.5), ordinary = plane(.25);
  precise.setAttribute('position', new BufferAttribute(new Float64Array([
    -1, -1, .10000000000000002, 1, -1, .10000000000000002,
    1, 1, .10000000000000002, -1, 1, .10000000000000002,
  ]), 3));
  const data = new InterleavedBuffer(new Float32Array([
    -1, -1, .5, 9, 1, -1, .5, 9, 1, 1, .5, 9, -1, 1, .5, 9,
  ]), 4);
  interleaved.setAttribute('position', new InterleavedBufferAttribute(data, 3, 0));
  try {
    const { wardrobeCoverageUnion } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverageUnion.ts');
    const { wardrobeCoverageSurface } = await vite.ssrLoadModule('/src/game/characters/wardrobeCoverage.ts');
    for (const special of [precise, interleaved]) {
      const sources = [special, ordinary], before = sources.map(snapshot);
      const union = wardrobeCoverageUnion(sources), individual = sources.map(source => wardrobeCoverageSurface(source));
      try {
        assert.equal(union.length, 2, 'unsupported coordinate layouts retain separate coverage');
        const ray = new Ray(new Vector3(0, 0, -1), new Vector3(0, 0, 1));
        assert.equal(nearest(union, ray, 0, 3), nearest(individual, ray, 0, 3));
        assert.deepEqual(sources.map(snapshot), before);
      } finally { dispose(union); dispose(individual); }
    }
  } finally { for (const source of [precise, interleaved, ordinary]) source.dispose(); await vite.close(); }
});

test('union buffer and part budgets retain the exact existing fallback', async () => {
  const vite = await server();
  const ordinary = plane(.5), large = plane(.25);
  try {
    const { wardrobeCoverageUnion, WARDROBE_COVERAGE_UNION_MAX_BYTES, WARDROBE_COVERAGE_UNION_MAX_PARTS } =
      await vite.ssrLoadModule('/src/game/characters/wardrobeCoverageUnion.ts');
    const positions = new Float32Array(Math.ceil(WARDROBE_COVERAGE_UNION_MAX_BYTES / 12) * 3);
    positions.set(large.attributes.position.array);
    large.setAttribute('position', new BufferAttribute(positions, 3));
    const fallback = wardrobeCoverageUnion([large, ordinary]);
    try {
      assert.equal(fallback.length, 2);
      assert.equal(fallback[0].geometry.attributes.position.array, positions,
        'the over-budget path does not allocate a merged copy of the source vertices');
      assert.equal(nearest(fallback, new Ray(new Vector3(0, 0, 1), new Vector3(0, 0, -1)), 0, 1), .5);
    } finally { dispose(fallback); }
    const many = wardrobeCoverageUnion(Array(WARDROBE_COVERAGE_UNION_MAX_PARTS + 1).fill(ordinary));
    try { assert.equal(many.length, WARDROBE_COVERAGE_UNION_MAX_PARTS + 1); }
    finally { dispose(many); }
  } finally { large.dispose(); ordinary.dispose(); await vite.close(); }
});
