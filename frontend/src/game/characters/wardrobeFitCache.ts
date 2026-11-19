import { BufferAttribute, type Box3, type BufferGeometry, type InterleavedBufferAttribute, type Sphere, type TypedArray } from "three";

type Attribute = BufferAttribute | InterleavedBufferAttribute;
type Input = { layout: string; hash: number; buffers: Uint8Array[] };
type Field = { name: string; itemSize: number; normalized: boolean; values: TypedArray };
type Shape = { fields: Field[]; box: Box3 | null; sphere: Sphere | null };
type Entry = Input & { scope: object; variant: string; shapes: (Shape | undefined)[]; bytes: number };
const deformedFields = ["position", "normal", "tangent"] as const;
const interleaved = (attribute: Attribute): attribute is InterleavedBufferAttribute =>
  "isInterleavedBufferAttribute" in attribute && attribute.isInterleavedBufferAttribute;
const arrayOf = (attribute: Attribute) => interleaved(attribute) ? attribute.data.array : attribute.array;

function fingerprint(targets: readonly BufferGeometry[], supports: readonly BufferGeometry[]): Input {
  const buffers: Uint8Array[] = [], arrays = new Map<TypedArray, number>(), layout: string[] = [];
  const append = (name: string, attribute: Attribute | undefined) => {
    if (!attribute) { layout.push(name + ":none"); return; }
    const array = arrayOf(attribute);
    let buffer = arrays.get(array);
    if (buffer === undefined) {
      buffer = buffers.length; arrays.set(array, buffer);
      buffers.push(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    }
    layout.push([name, attribute.constructor.name, array.constructor.name, attribute.itemSize, attribute.count, attribute.normalized,
      interleaved(attribute) ? `${attribute.data.stride}/${attribute.offset}` : "packed", buffer].join(":"));
  };
  for (const [group, geometries] of [targets, supports].entries()) {
    layout.push(`${group}:${geometries.length}`);
    for (const geometry of geometries) {
      layout.push(`${geometry.drawRange.start}:${geometry.drawRange.count}`);
      append("index", geometry.index ?? undefined);
      for (const name of group === 0 ? deformedFields : ["position"]) append(name, geometry.getAttribute(name));
      if (group === 0) {
        layout.push(`morph:${geometry.morphTargetsRelative}`);
        for (const [i, attribute] of (geometry.morphAttributes.position ?? []).entries()) append(`morph-position-${i}`, attribute);
      }
    }
  }
  const description = layout.join(";");
  let hash = 2166136261;
  for (let i = 0; i < description.length; i++) hash = Math.imul(hash ^ description.charCodeAt(i), 16777619);
  for (const bytes of buffers) {
    hash = Math.imul(hash ^ bytes.length, 16777619);
    let offset = 0;
    if (bytes.byteOffset % 4 === 0) {
      const words = new Uint32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4));
      for (const word of words) hash = Math.imul(hash ^ word, 16777619);
      offset = words.length * 4;
    }
    for (; offset < bytes.length; offset++) hash = Math.imul(hash ^ bytes[offset], 16777619);
  }
  return { layout: description, hash, buffers };
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let offset = 0;
  if (a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0) {
    const left = new Uint32Array(a.buffer, a.byteOffset, Math.floor(a.length / 4));
    const right = new Uint32Array(b.buffer, b.byteOffset, left.length);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
    offset = left.length * 4;
  }
  for (; offset < a.length; offset++) if (a[offset] !== b[offset]) return false;
  return true;
}

function captureShape(geometry: BufferGeometry): Shape {
  const fields = deformedFields.flatMap(name => {
    const attribute = geometry.getAttribute(name);
    if (!attribute) return [];
    const array = arrayOf(attribute), values = array.slice(0, attribute.count * attribute.itemSize);
    if (interleaved(attribute)) {
      for (let vertex = 0; vertex < attribute.count; vertex++) for (let channel = 0; channel < attribute.itemSize; channel++) {
        values[vertex * attribute.itemSize + channel] = array[vertex * attribute.data.stride + attribute.offset + channel];
      }
    }
    return [{ name, itemSize: attribute.itemSize, normalized: attribute.normalized, values }];
  });
  return { fields, box: geometry.boundingBox?.clone() ?? null, sphere: geometry.boundingSphere?.clone() ?? null };
}

function restoreShape(source: BufferGeometry, shape: Shape) {
  const result = source.clone();
  for (const field of shape.fields) {
    const attribute = result.getAttribute(field.name);
    if (!attribute) {
      result.setAttribute(field.name, new BufferAttribute(field.values.slice(), field.itemSize, field.normalized));
    } else if (interleaved(attribute)) {
      for (let vertex = 0; vertex < attribute.count; vertex++) for (let channel = 0; channel < attribute.itemSize; channel++) {
        attribute.data.array[vertex * attribute.data.stride + attribute.offset + channel] = field.values[vertex * attribute.itemSize + channel];
      }
    } else attribute.array.set(field.values);
  }
  result.boundingBox = shape.box?.clone() ?? null;
  result.boundingSphere = shape.sphere?.clone() ?? null;
  return result;
}

/** Bounded CPU snapshots for topology-preserving fits. No cached geometry reaches a renderer. */
export class WardrobeFitCache {
  private entries: Entry[] = [];
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  readonly maxBytes: number;
  readonly maxEntries: number;
  constructor(maxBytes = 16 * 1024 * 1024, maxEntries = 12) {
    this.maxBytes = maxBytes; this.maxEntries = maxEntries;
  }

  get stats() { return { entries: this.entries.length, bytes: this.bytes, hits: this.hits, misses: this.misses }; }
  clear() { this.entries = []; this.bytes = 0; this.hits = 0; this.misses = 0; }

  fit(scope: object, variant: string, targets: readonly BufferGeometry[], supports: readonly BufferGeometry[],
    compute: () => (BufferGeometry | undefined)[]) {
    const input = fingerprint(targets, supports);
    const at = this.entries.findIndex(entry => entry.scope === scope && entry.variant === variant && entry.hash === input.hash
      && entry.layout === input.layout && entry.buffers.length === input.buffers.length
      && entry.buffers.every((bytes, i) => equalBytes(bytes, input.buffers[i])));
    if (at !== -1) {
      const [entry] = this.entries.splice(at, 1); this.entries.push(entry); this.hits++;
      return entry.shapes.map((shape, i) => shape && restoreShape(targets[i], shape));
    }
    this.misses++;
    const fitted = compute();
    const shapes = fitted.map(geometry => geometry && captureShape(geometry));
    const bytes = input.buffers.reduce((sum, buffer) => sum + buffer.byteLength, input.layout.length * 2)
      + shapes.reduce((sum, shape) => sum + (shape?.fields.reduce((size, field) => size + field.values.byteLength, 0) ?? 0), 0);
    if (bytes <= this.maxBytes && this.maxEntries > 0) {
      while (this.entries.length >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
        this.bytes -= this.entries.shift()!.bytes;
      }
      this.entries.push({ ...input, scope, variant, shapes, bytes, buffers: input.buffers.map(buffer => buffer.slice()) });
      this.bytes += bytes;
    }
    return fitted;
  }
}

export const wardrobeFitCache = new WardrobeFitCache();
