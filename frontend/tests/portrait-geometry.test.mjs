import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Document, NodeIO } from '@gltf-transform/core';
import { MeshoptDecoder } from 'meshoptimizer';
import { loadWardrobeGeometry } from '../scripts/load-wardrobe-geometry.mjs';
import { packPortraitGeometry } from '../scripts/pack-portrait-geometry.mjs';

const extension = 'EXT_meshopt_compression';

function unpack(glb) {
  assert.equal(glb.readUInt32LE(8), glb.length);
  const end = 20 + glb.readUInt32LE(12);
  assert.equal(glb.readUInt32LE(end + 4), 0x004e4942);
  return { json: JSON.parse(glb.toString('utf8', 20, end)), bin: glb.subarray(end + 8) };
}

function sliceView(bin, view) {
  const start = view.byteOffset ?? 0;
  assert(start + view.byteLength <= bin.length);
  return bin.subarray(start, start + view.byteLength);
}

async function checkLossless(source) {
  const packed = await packPortraitGeometry(source);
  assert(packed && packed.length < source.length);
  const before = unpack(source), after = unpack(packed);
  const { buffers, bufferViews, extensionsUsed, extensionsRequired } = after.json;
  const original = before.json;
  assert(extensionsRequired.includes(extension));
  assert(extensionsUsed.includes(extension));
  assert.deepEqual(extensionsUsed.filter(name => name !== extension), original.extensionsUsed ?? []);
  assert.deepEqual(extensionsRequired.filter(name => name !== extension), original.extensionsRequired ?? []);
  const layout = new Set(['buffers', 'bufferViews', 'extensionsUsed', 'extensionsRequired']);
  const scene = doc => Object.fromEntries(Object.entries(doc).filter(([key]) => !layout.has(key)));
  assert.deepEqual(scene(after.json), scene(original));
  assert.equal(bufferViews.length, original.bufferViews.length);
  const modes = new Set();
  await MeshoptDecoder.ready;
  for (const [i, view] of bufferViews.entries()) {
    const inputView = original.bufferViews[i];
    const expected = sliceView(before.bin, inputView);
    const descriptor = view.extensions?.[extension];
    assert.equal(view.target, inputView.target);
    assert.equal(view.byteStride, inputView.byteStride);
    assert.equal(view.byteLength, inputView.byteLength);
    assert((view.byteOffset ?? 0) + view.byteLength <= buffers[view.buffer].byteLength);
    let actual;
    if (descriptor) {
      assert.notEqual(view.buffer, 0, 'compressed views reference the logical fallback buffer');
      assert.equal(buffers[view.buffer].extensions?.[extension]?.fallback, true);
      assert.equal(descriptor.buffer, 0);
      assert.equal(descriptor.byteOffset % 4, 0);
      assert.equal(descriptor.count * descriptor.byteStride, expected.length);
      actual = Buffer.alloc(expected.length);
      MeshoptDecoder.decodeGltfBuffer(actual, descriptor.count, descriptor.byteStride,
        sliceView(after.bin, descriptor), descriptor.mode, descriptor.filter);
      modes.add(descriptor.mode);
    } else {
      assert.equal(view.buffer, 0);
      actual = sliceView(after.bin, view);
    }
    assert(expected.equals(actual), `decoded bufferView ${i} differs`);
  }
  assert.deepEqual(modes, new Set(['ATTRIBUTES', 'INDICES']));
  return packed;
}

test('portrait packing preserves interleaved vertices, triangle corner order and embedded images', async () => {
  const doc = new Document(), buffer = doc.createBuffer();
  const positions = [], colors = [], uv = [], indices = [];
  for (let i = 0; i < 1024; i++) {
    positions.push(i, 0, 0, i, 1, 0, i + 1, 0, 0);
    colors.push(12, 34, 56, 255, 12, 34, 56, 255, 12, 34, 56, 255);
    uv.push(0, 0, 0, 1, 1, 0);
    indices.push(i * 3 + 2, i * 3, i * 3 + 1);
  }
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2X8AAAAASUVORK5CYII=', 'base64');
  const texture = doc.createTexture().setMimeType('image/png').setImage(image);
  const primitive = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(positions)).setBuffer(buffer))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(Uint8Array.from(colors)).setNormalized(true).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(Float32Array.from(uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(indices)).setBuffer(buffer))
    .setMaterial(doc.createMaterial().setBaseColorTexture(texture));
  const node = doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive));
  doc.createScene().addChild(node);
  const sampler = doc.createAnimationSampler()
    .setInput(doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer))
    .setOutput(doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 2, 3])).setBuffer(buffer));
  doc.createAnimation().addSampler(sampler)
    .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('translation').setSampler(sampler));
  const packed = await checkLossless(Buffer.from(await new NodeIO().writeBinary(doc)));
  assert.equal(await packPortraitGeometry(packed), null, 'a packed portrait is not packed twice');
});

test('Three.js loads the installed Vesper portrait with identical skin, primitives and attributes', async t => {
  const url = new URL('../public/models/characters/villagers/villager-female/villager-female.portrait.glb', import.meta.url);
  const source = await readFile(url).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!source || source.toString('ascii', 0, 41).startsWith('version https://git-lfs.github.com/')) {
    return t.skip('Install the Vesper portrait with Git LFS for the real-model comparison');
  }
  const packed = await checkLossless(source);
  const [a, b] = await Promise.all([source, packed].map(loadWardrobeGeometry));
  const meshes = scene => {
    const result = [];
    scene.traverse(node => { if (node.isMesh) result.push(node); });
    return result;
  };
  const before = meshes(a), after = meshes(b);
  assert(before.some(mesh => mesh.isSkinnedMesh));
  assert.deepEqual(after.map(mesh => mesh.name), before.map(mesh => mesh.name));
  for (const [i, mesh] of before.entries()) {
    const other = after[i];
    if (mesh.isSkinnedMesh) {
      assert(other.isSkinnedMesh);
      assert.deepEqual(other.skeleton.bones.map(bone => bone.name), mesh.skeleton.bones.map(bone => bone.name));
      assert.deepEqual(other.skeleton.boneInverses, mesh.skeleton.boneInverses);
    }
    assert.deepEqual(Object.keys(other.geometry.attributes), Object.keys(mesh.geometry.attributes));
    for (const key of ['index', ...Object.keys(mesh.geometry.attributes)]) {
      const left = key === 'index' ? mesh.geometry.index : mesh.geometry.getAttribute(key);
      const right = key === 'index' ? other.geometry.index : other.geometry.getAttribute(key);
      assert.equal(right.count, left.count);
      assert.equal(right.itemSize, left.itemSize);
      assert.equal(right.normalized, left.normalized);
      assert.equal(right.offset, left.offset);
      assert.deepEqual(right.array, left.array, `${mesh.name} ${key}`);
    }
  }
});
