import { MeshoptEncoder } from 'meshoptimizer';
import { readChunks, writeGlb } from '../../scripts/lib/glb-components.mjs';

const meshopt = 'EXT_meshopt_compression';
const padded = size => Math.ceil(size / 4) * 4;

function geometryLayout(view, accessors) {
  if (!accessors.length) return;
  if (view.target === 34962) {
    const stride = view.byteStride ?? (accessors.length === 1 ? view.byteLength / accessors[0].count : 0);
    if (Number.isInteger(stride) && stride >= 4 && stride <= 252 && stride % 4 === 0 && view.byteLength % stride === 0) {
      return { mode: 'ATTRIBUTES', byteStride: stride, count: view.byteLength / stride };
    }
  }
  if (view.target === 34963 && view.byteStride === undefined) {
    const type = accessors[0].componentType;
    const stride = type === 5123 ? 2 : type === 5125 ? 4 : 0;
    if (stride && view.byteLength % stride === 0 && accessors.every(a => a.type === 'SCALAR' && a.componentType === type)) {
      // INDICES preserves the exact index sequence, including padding between accessors.
      // The TRIANGLES codec can cyclically rotate a triangle's vertices.
      return { mode: 'INDICES', byteStride: stride, count: view.byteLength / stride };
    }
  }
}

/** Pack the embedded portrait GLB without rewriting any accessors, skinning, or textures. */
export async function packPortraitGeometry(input) {
  const chunks = readChunks(input);
  if (chunks.length !== 2 || chunks[1].type !== 0x004e4942) return null;
  const doc = JSON.parse(chunks[0].data.toString('utf8'));
  // Relocating buffer views is safe for the bundled portrait's texture extension.
  // Other extensions may reference byte offsets directly or already encode geometry.
  if (doc.asset?.version !== '2.0' || doc.buffers?.length !== 1 || doc.buffers[0].uri !== undefined
    || doc.extensionsUsed?.some(name => name !== 'EXT_texture_webp') || doc.images?.some(image => image.uri !== undefined)) return null;

  const sourceSize = doc.buffers[0].byteLength;
  const binary = chunks[1].data;
  if (!Number.isSafeInteger(sourceSize) || sourceSize <= 0 || padded(sourceSize) !== binary.length) throw Error('Invalid portrait GLB buffer length');
  if (!doc.bufferViews?.length) return null;
  await MeshoptEncoder.ready;

  const parts = [];
  let written = 0;
  let compressed = false;
  for (const [i, view] of doc.bufferViews.entries()) {
    const start = view.byteOffset ?? 0;
    if (view.buffer !== 0 || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(view.byteLength)
      || view.byteLength <= 0 || view.byteLength > sourceSize - start) throw Error(`Invalid portrait buffer view ${i}`);
    let bytes = binary.subarray(start, start + view.byteLength);
    const layout = geometryLayout(view, (doc.accessors ?? []).filter(a => a.bufferView === i));
    if (layout) {
      // A Buffer may itself be a slice at an unaligned address. The index codec reads native integers.
      const source = layout.mode === 'INDICES' && bytes.byteOffset % layout.byteStride ? Uint8Array.from(bytes) : bytes;
      // The sequence codec reserves two bits for delta coding. Even unused padding
      // between index accessors must survive if a future export contains large words.
      const safeIndices = layout.mode !== 'INDICES' || layout.byteStride === 2
        || new Uint32Array(source.buffer, source.byteOffset, layout.count).every(i => i < 0x20000000);
      const encoded = safeIndices ? MeshoptEncoder.encodeGltfBuffer(source, layout.count, layout.byteStride, layout.mode) : bytes;
      if (encoded.length < bytes.length) {
        view.extensions = { ...view.extensions, [meshopt]: { ...layout, buffer: 0, byteOffset: written, byteLength: encoded.length } };
        view.buffer = 1;
        bytes = encoded;
        compressed = true;
      }
    }
    if (view.buffer === 0) view.byteOffset = written;
    parts.push(bytes, Buffer.alloc(padded(bytes.length) - bytes.length));
    written += padded(bytes.length);
  }
  if (!compressed) return null;

  // Decoded views retain their original offsets in a logical buffer. Only buffer zero is stored.
  doc.buffers[0].byteLength = written;
  doc.buffers.push({ byteLength: sourceSize, extensions: { [meshopt]: { fallback: true } } });
  doc.extensionsUsed = [...(doc.extensionsUsed ?? []), meshopt];
  doc.extensionsRequired = [...(doc.extensionsRequired ?? []), meshopt];
  const result = writeGlb(doc, [{ type: chunks[1].type, data: Buffer.concat(parts, written) }]);
  return result.length < input.length ? result : null;
}
