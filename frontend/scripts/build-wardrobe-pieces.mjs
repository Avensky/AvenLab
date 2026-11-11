import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hasCharacterModel } from './character-model-paths.mts';

const wardrobeRoot = new URL('../public/models/characters/wardrobe/', import.meta.url);
const pieceRoot = new URL('../public/models/characters/female/wardrobe/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../../avenlab-server/src/assets/character-wardrobe.json', import.meta.url), 'utf8'));
const corsetRoles = ['corset-tucked', 'corset-over'];
const script = await stat(new URL(import.meta.url));
const jobs = catalog.flatMap(({ id }) => ['garage', 'mobile'].map(tier => ({
  source: new URL(`${id}.${tier}.glb`, wardrobeRoot),
  output: new URL(`corsets/${id}.${tier}.glb`, pieceRoot),
  roles: corsetRoles,
})));
jobs.push({
  source: new URL('gothic-02.mobile.glb', wardrobeRoot),
  output: new URL('vesper-body.glb', pieceRoot),
  roles: ['body'],
});

const pending = [];
for (const job of jobs) {
  if (!hasCharacterModel(job.source)) {
    await rm(job.output, { force: true });
    continue;
  }
  const output = await stat(job.output).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  const source = await stat(job.source);
  if (!output || output.size < 256 || output.mtimeMs < Math.max(source.mtimeMs, script.mtimeMs)) pending.push(job);
}

if (pending.length) {
  const [{ NodeIO }, { ALL_EXTENSIONS }, { prune }, { MeshoptDecoder, MeshoptEncoder }] = await Promise.all([
    import('@gltf-transform/core'), import('@gltf-transform/extensions'), import('@gltf-transform/functions'), import('meshoptimizer'),
  ]);
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  for (const { source, output, roles } of pending) {
    const document = await io.read(fileURLToPath(source));
    const root = document.getRoot();
    const meshNodes = root.listNodes().filter(node => node.getMesh());
    const parts = meshNodes.filter(node => roles.includes(node.getExtras().wardrobeRole));
    if (parts.length !== roles.length || roles.some(role => !parts.some(node => node.getExtras().wardrobeRole === role))
      || parts.some(node => node.getSkin()?.listJoints().length !== 88)) {
      throw Error(`Missing skinned wardrobe pieces in ${fileURLToPath(source)}`);
    }
    for (const node of meshNodes) if (!parts.includes(node)) node.dispose();
    for (const animation of root.listAnimations()) animation.dispose();
    // The body donor supplies full skin geometry. The live actor owns its material.
    if (roles.includes('body')) {
      for (const primitive of parts[0].getMesh().listPrimitives()) primitive.setMaterial(null);
    }
    await document.transform(prune({ keepAttributes: true, keepLeaves: true, keepSolidTextures: true }));

    await mkdir(new URL('.', output), { recursive: true });
    const target = fileURLToPath(output);
    const temporary = `${target}.${process.pid}.tmp.glb`;
    try {
      await io.write(temporary, document);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    console.log(`Wardrobe piece ${output.pathname.split('/').at(-1)}: ${((await stat(output)).size / 1048576).toFixed(2)} MiB`);
  }
}
