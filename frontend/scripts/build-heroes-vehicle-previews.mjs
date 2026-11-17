import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import vehicleCatalog from '../public/models/vehicles/catalog.json' with { type: 'json' };

const publicRoot = new URL('../public/', import.meta.url);
const directory = new URL('models/heroes-generated/', publicRoot);
const manifest = new URL('previews.json', directory);

async function readOptional(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function isGlb(bytes) {
  return bytes?.length >= 20 && bytes.toString('ascii', 0, 4) === 'glTF'
    && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === bytes.length;
}

async function writeAtomic(file, bytes) {
  const temporary = new URL(file.href + '.' + process.pid + '.tmp');
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

const previous = JSON.parse((await readOptional(manifest))?.toString() ?? '{}');
const recipe = await readFile(new URL(import.meta.url));
const previews = {};
await mkdir(directory, { recursive: true });

// Only use this tier for vehicles whose materials have been checked in Heroes.
for (const model of ['brz']) {
  const source = await readOptional(new URL(vehicleCatalog.assets[model].model.slice(1), publicRoot));
  const output = new URL(model + '.glb', directory);
  if (!isGlb(source)) {
    await rm(output, { force: true });
    continue;
  }
  const revision = createHash('sha256').update(recipe).update(source).digest('hex').slice(0, 16);
  const url = '/models/heroes-generated/' + model + '.glb?v=' + revision;
  if (previous[model] !== url || !isGlb(await readOptional(output))) {
    const [{ NodeIO }, { ALL_EXTENSIONS }, { prune, draco }, { default: draco3d }] = await Promise.all([
      import('@gltf-transform/core'), import('@gltf-transform/extensions'),
      import('@gltf-transform/functions'), import('draco3dgltf'),
    ]);
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
    const document = await io.readBinary(source);
    // Keep named nodes and distinct materials for paint, glass, and part selection.
    await document.transform(prune({ keepLeaves: true, keepSolidTextures: true }), draco({
      quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14, quantizeGeneric: 14, encodeSpeed: 3,
    }));
    const bytes = await io.writeBinary(document);
    await writeAtomic(output, bytes);
    console.log('Built Heroes preview for %s (%d bytes)', model, bytes.length);
  }
  previews[model] = url;
}
await writeAtomic(manifest, JSON.stringify(previews) + '\n');
