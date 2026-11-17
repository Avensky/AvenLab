import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';

// Let the game loader exercise the authored skinning data without decoding images in Node.
export async function loadWardrobeGeometry(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  for (const material of gltf.materials ?? []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    delete material.extensions;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  delete gltf.images;
  delete gltf.textures;
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (gltf[key]) gltf[key] = gltf[key].filter(extension => extension !== 'EXT_texture_webp');
  }
  const json = Buffer.from(JSON.stringify(gltf));
  const padding = Buffer.alloc((4 - json.length % 4) % 4, 32);
  const bin = bytes.subarray(20 + jsonLength);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(20 + json.length + padding.length + bin.length, 8);
  header.writeUInt32LE(json.length + padding.length, 12);
  const glb = Buffer.concat([header, json, padding, bin]);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return (await loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '')).scene;
}
