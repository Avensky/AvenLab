import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
import { Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let decoder;

/** Headless diagnostics only. Decode the real vertex/index buffers and retain
 * texture references/material policies, replacing image uploads with textures
 * that have no image. This is not a visual/GPU or texture quality test. */
export async function loadVehicleGeometry(bytes) {
  decoder ??= draco.createDecoderModule();
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await decoder, 'meshopt.decoder': MeshoptDecoder,
  });
  const document = await io.readBinary(bytes);
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (['KHR_draco_mesh_compression', 'EXT_meshopt_compression'].includes(extension.extensionName)) extension.dispose();
  }
  const decoded = await io.writeBinary(document);
  const loader = new GLTFLoader();
  loader.register(parser => {
    parser.loadTextureImage = async () => new Texture();
    return { name: 'headless-vehicle-images' };
  });
  return loader.parseAsync(decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength), '');
}
