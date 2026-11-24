import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SnapshotDecoder } from '../src/net/snapshotDecoder.ts';
import { destroyedAssetKey } from '../src/world/destroyedAssets.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/compact-snapshot-v3.json', import.meta.url), 'utf8'));
const previousKey = health => Object.entries(health ?? {}).filter(([, hp]) => hp === 0).map(([id]) => id).sort().join('|');
function watchedHealth(values) {
  let scans = 0;
  const health = new Proxy(Object.freeze(values), {
    ownKeys(target) { scans++; return Reflect.ownKeys(target); },
  });
  return { health, scans: () => scans };
}
function keyframe(health, baseId = 101, world = 9) {
  const wire = structuredClone(fixture.keyframe);
  wire.base_id = baseId; wire.world_id = world; wire.data[5] = health;
  return wire;
}
function delta(key, patch) {
  return { type: 'snapshot_delta', version: key.version, world_id: key.world_id, base_id: key.base_id, patch };
}

test('destroyed keys preserve strict zero, own enumerable IDs and stable ordering without mutating health', () => {
  const values = Object.assign(Object.create({ inherited: 0 }), { z: 0, positive: 2, a: -0, negative: -1, text: '0' });
  Object.defineProperty(values, 'hidden', { value: 0 });
  const watched = watchedHealth(values);
  assert.equal(destroyedAssetKey(watched.health), previousKey(watched.health));
  assert.equal(destroyedAssetKey(watched.health), 'a|z');
  const scanned = watched.scans();
  for (let i = 0; i < 20; i++) assert.equal(destroyedAssetKey(watched.health), 'a|z');
  assert.equal(watched.scans(), scanned, 'repeated consumers do not enumerate the same immutable map again');
  assert(Object.isFrozen(values)); assert.equal(values.z, 0); assert.equal(values.positive, 2);
  assert.equal(destroyedAssetKey(undefined), ''); assert.equal(destroyedAssetKey(null), '');
  for (const primitive of [false, 0, 5, 'invalid']) assert.equal(destroyedAssetKey(primitive), previousKey(primitive));
});

test('compact motion packets share one damage scan across chunks, while a new keyframe recomputes', t => {
  const decoder = new SnapshotDecoder(), chunks = 6, packetsPerKeyframe = 30;
  let selectors = 0, previousScans = 0, cachedScans = 0;
  for (let generation = 0; generation < 2; generation++) {
    const watched = watchedHealth(Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`asset-${i}`, i % 10 ? 50 : 0])));
    const key = keyframe(watched.health, 101 + generation);
    key.data[0] += generation * 60;
    for (let packet = 0; packet < packetsPerKeyframe; packet++) {
      const next = packet === 0 ? decoder.decode(key) : decoder.decode(delta(key,
        [1, 9, 0, [0, key.data[0] + packet * 2], [1, 1, 0, [1, 32, 0, [0, [packet, .5, -packet]]]]],
      ));
      assert(next); assert.equal(next.data.asset_health, watched.health);
      for (let chunk = 0; chunk < chunks; chunk++) {
        let before = watched.scans();
        const expected = previousKey(next.data.asset_health);
        previousScans += watched.scans() - before;
        before = watched.scans();
        assert.equal(destroyedAssetKey(next.data.asset_health), expected);
        cachedScans += watched.scans() - before;
        selectors++;
      }
    }
  }
  assert.equal(selectors, 360); assert.equal(previousScans, 360); assert.equal(cachedScans, 2);
  t.diagnostic(JSON.stringify({ method: 'deterministic map-enumeration counts, not timing', keyframes: 2,
    packetsPerKeyframe, authoredChunks: chunks, healthEntries: 250, selectorCalls: selectors,
    previousMapScans: previousScans, cachedMapScans: cachedScans,
    previousEntryVisits: previousScans * 250, cachedEntryVisits: cachedScans * 250 }));
});

test('damage patches, replacements, repairs and return-to-baseline preserve previous snapshots', () => {
  const decoder = new SnapshotDecoder();
  const watched = watchedHealth({ intact: 20, broken: 0, scratched: 5 });
  const key = keyframe(watched.health), before = decoder.decode(key);
  assert.equal(destroyedAssetKey(before.data.asset_health), 'broken');
  const destroy = delta(key, [1, 32, 0, [2, { intact: [0, 0] }]]);
  const changed = decoder.decode(destroy);
  assert.equal(destroyedAssetKey(changed.data.asset_health), 'broken|intact');
  assert.notEqual(changed.data.asset_health, before.data.asset_health);
  assert.equal(before.data.asset_health.intact, 20);
  assert.deepEqual(changed.data.asset_health, { intact: 0, broken: 0, scratched: 5 });

  // Repeated changed-since-base deltas currently clone a map each time. The
  // selector must recompute for those fresh objects, even if values are equal.
  const repeated = decoder.decode(destroy);
  assert.notEqual(repeated.data.asset_health, changed.data.asset_health);
  assert.equal(destroyedAssetKey(repeated.data.asset_health), 'broken|intact');
  const repaired = decoder.decode(delta(key, [1, 32, 0, [2, { broken: [0, 10] }]]));
  assert.equal(destroyedAssetKey(repaired.data.asset_health), '');
  const replaced = decoder.decode(delta(key, [1, 32, 0, [0, { replacement: 0 }]]));
  assert.equal(destroyedAssetKey(replaced.data.asset_health), 'replacement');
  assert.equal(replaced.data.asset_health.broken, undefined, 'removed IDs cannot survive a map replacement');
  assert.equal(destroyedAssetKey(changed.data.asset_health), 'broken|intact', 'older displayed state is not mutated');

  const scans = watched.scans(), restored = decoder.decode(delta(key, null));
  assert.equal(restored.data.asset_health, watched.health);
  assert.equal(destroyedAssetKey(restored.data.asset_health), 'broken');
  assert.equal(watched.scans(), scans, 'returning to an immutable baseline reuses its earlier result');
  assert.equal(before.data.asset_health.intact, 20); assert.equal(before.data.asset_health.broken, 0);
});

test('legacy JSON and synthetic producers recompute fresh maps and clear omitted/reset damage', () => {
  const source = { tick: 1, entities: [], asset_health: { second: 0, first: 0, healthy: 40 } };
  const older = JSON.parse(JSON.stringify(source));
  const next = JSON.parse(JSON.stringify({ ...source, tick: 2 }));
  assert.notEqual(older.asset_health, next.asset_health);
  const first = watchedHealth(older.asset_health), second = watchedHealth(next.asset_health);
  assert.equal(destroyedAssetKey(first.health), 'first|second');
  assert.equal(destroyedAssetKey(second.health), 'first|second');
  assert.equal(first.scans(), 1); assert.equal(second.scans(), 1);
  assert.equal(destroyedAssetKey(Object.freeze({ ...next.asset_health, first: 10 })), 'second');
  assert.deepEqual(older.asset_health, { second: 0, first: 0, healthy: 40 });
  const empty = watchedHealth({});
  assert.equal(destroyedAssetKey(empty.health), ''); assert.equal(destroyedAssetKey(empty.health), '');
  assert.equal(empty.scans(), 1, 'an empty derived key is cached too');
  const resetSnapshot = null;
  assert.equal(destroyedAssetKey(resetSnapshot?.asset_health), '');
  assert.equal(destroyedAssetKey({ tick: 0, entities: [] }.asset_health), '');
});

test('malformed legacy and compact scalar health cannot become invalid weak-cache keys', () => {
  for (const health of ['invalid', true, false, 7, 0, null]) {
    const decoder = new SnapshotDecoder(), decoded = decoder.decode(keyframe(health));
    assert(decoded, 'this existing compact boundary does not validate damage-map shape');
    assert.equal(destroyedAssetKey(decoded.data.asset_health), previousKey(health));
    const legacy = JSON.parse(JSON.stringify({ tick: 1, entities: [], asset_health: health }));
    assert.equal(destroyedAssetKey(legacy.asset_health), previousKey(health));
  }
  // Arrays are object keys and keep the previous own-enumerable-entry behavior.
  const values = Object.freeze([0, 20, 0]);
  const decoder = new SnapshotDecoder(), decoded = decoder.decode(keyframe(values));
  assert.equal(destroyedAssetKey(decoded.data.asset_health), '0|2');
  assert.equal(destroyedAssetKey(decoded.data.asset_health), previousKey(values));
});

test('decoder reset rejects stale deltas and a new world derives only its own damage state', () => {
  const decoder = new SnapshotDecoder(), oldKey = keyframe(Object.freeze({ old: 0 }));
  assert.equal(destroyedAssetKey(decoder.decode(oldKey).data.asset_health), 'old');
  decoder.reset();
  assert.equal(decoder.decode(delta(oldKey, null)), null);
  assert.equal(destroyedAssetKey(undefined), '');
  const nextKey = keyframe(Object.freeze({ new: 0 }), 202, 10);
  assert.equal(destroyedAssetKey(decoder.decode(nextKey).data.asset_health), 'new');
  assert.equal(destroyedAssetKey(decoder.decode(keyframe(Object.freeze({}), 203, 10)).data.asset_health), '');
});
