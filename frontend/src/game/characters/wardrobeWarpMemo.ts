import { BufferAttribute, InterleavedBufferAttribute, type Vector3 } from "three";

const maxEntries = 30_000;
const maxProbes = 16;
const recordSize = 15; // Exact input XYZ, output XYZ, then the three derivative vectors.

function finite(point: Vector3) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

/** Temporary exact values for one stable warp of one source geometry. */
export function createWardrobeWarpMemo(position: BufferAttribute | InterleavedBufferAttribute) {
  const prototype = "isInterleavedBufferAttribute" in position
    ? InterleavedBufferAttribute.prototype : BufferAttribute.prototype;
  if (position.itemSize !== 3 || !Number.isSafeInteger(position.count) || position.count < 2 ||
    position.getX !== prototype.getX || position.getY !== prototype.getY || position.getZ !== prototype.getZ) return;

  const capacity = Math.min(position.count, maxEntries);
  let tableSize = 4;
  while (tableSize < capacity * 2) tableSize *= 2;
  const slots = new Uint32Array(tableSize);
  const values = new Float64Array(capacity * recordSize);
  const derivatives = new Uint8Array(capacity);
  const key = new Float64Array(3), words = new Uint32Array(key.buffer);
  const mask = tableSize - 1;
  let count = 0, vacant = -1;

  return {
    // At the cap: 3,892,168 typed-array bytes, including the shared key scratch.
    // The table has fixed small metadata and is never retained by a fitted model.
    bufferBytes: slots.byteLength + values.byteLength + derivatives.byteLength + key.byteLength,
    capacity,
    find(x: number, y: number, z: number) {
      vacant = -1;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1;
      key[0] = x; key[1] = y; key[2] = z;
      let hash = 0x811c9dc5;
      for (let i = 0; i < words.length; i++) hash = Math.imul(hash ^ words[i], 0x01000193);
      hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
      hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
      hash ^= hash >>> 16;
      let slot = hash & mask;
      for (let probe = 0; probe < Math.min(maxProbes, tableSize); probe++, slot = (slot + 1) & mask) {
        const stored = slots[slot];
        if (!stored) {
          vacant = slot;
          return -1;
        }
        const entry = stored - 1, offset = entry * recordSize;
        // Hash collisions never establish equality. Object.is also keeps -0 distinct.
        if (Object.is(values[offset], x) && Object.is(values[offset + 1], y) && Object.is(values[offset + 2], z)) return entry;
      }
      return -1;
    },
    readPoint(entry: number, target: Vector3) {
      return target.fromArray(values, entry * recordSize + 3);
    },
    // Called immediately after a miss and the original point calculation.
    remember(x: number, y: number, z: number, point: Vector3) {
      if (vacant < 0 || count === capacity || !finite(point)) return -1;
      const entry = count++, offset = entry * recordSize;
      slots[vacant] = entry + 1;
      values[offset] = x; values[offset + 1] = y; values[offset + 2] = z;
      point.toArray(values, offset + 3);
      vacant = -1;
      return entry;
    },
    readJacobian(entry: number, dx: Vector3, dy: Vector3, dz: Vector3) {
      if (entry < 0 || !derivatives[entry]) return false;
      const offset = entry * recordSize + 6;
      dx.fromArray(values, offset); dy.fromArray(values, offset + 3); dz.fromArray(values, offset + 6);
      return true;
    },
    rememberJacobian(entry: number, dx: Vector3, dy: Vector3, dz: Vector3) {
      if (entry < 0 || !finite(dx) || !finite(dy) || !finite(dz)) return;
      const offset = entry * recordSize + 6;
      dx.toArray(values, offset); dy.toArray(values, offset + 3); dz.toArray(values, offset + 6);
      derivatives[entry] = 1;
    },
  };
}
