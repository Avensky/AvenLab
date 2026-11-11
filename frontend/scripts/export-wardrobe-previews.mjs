import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw Error('Usage: export-wardrobe-previews.mjs model-directory output-directory');
await mkdir(destination, { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
for (let n = 1; n <= 5; n++) {
  const id = `gothic-${String(n).padStart(2, '0')}`, doc = await io.read(join(source, `${id}.mobile.glb`));
  const active = new Set(['body', 'bottom', 'shorts', 'corset-tucked', ...(n === 4 ? ['shirt-under'] : [])]);
  for (const node of doc.getRoot().listNodes()) {
    const { wardrobeRole, ...extras } = node.getExtras();
    if (wardrobeRole && !active.has(wardrobeRole)) node.dispose();
    else node.setExtras(extras);
  }
  const bit = n === 4 ? 4 : 1;
  for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const coverage = primitive.getAttribute('_AVEN_COVERAGE');
    if (!coverage) continue;
    const index = primitive.getIndices(), flags = coverage.getArray(), input = index.getArray(), output = [];
    for (let i = 0; i < input.length; i += 3) {
      const a = input[i], b = input[i + 1], c = input[i + 2];
      if ((flags[a] & flags[b] & flags[c] & bit) === 0) output.push(a, b, c);
    }
    if (!output.length) mesh.removePrimitive(primitive);
    else primitive.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(index.getBuffer()).setArray(new input.constructor(output)));
    primitive.setAttribute('_AVEN_COVERAGE', null);
  }
  await doc.transform(prune({ keepLeaves: true }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(join(destination, `${id}.preview.glb`), doc);
  console.log(`${id}: standalone covered outfit`);
}
