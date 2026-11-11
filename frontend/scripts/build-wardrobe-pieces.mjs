import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hasCharacterModel } from './character-model-paths.mts';

const wardrobeRoot = new URL('../public/models/characters/wardrobe/', import.meta.url);
const pieceRoot = new URL('../public/models/characters/female/wardrobe/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../../avenlab-server/src/assets/character-wardrobe.json', import.meta.url), 'utf8'));
const corsetRoles = ['corset-tucked', 'corset-over'];
const script = await stat(new URL(import.meta.url));
const underbustFitModule = new URL('../src/game/characters/underbustFit.ts', import.meta.url);
const underbustFitSources = await Promise.all([
  stat(underbustFitModule),
  stat(new URL('../src/game/characters/wardrobeSurface.ts', import.meta.url)),
]);
const underbustFitMtime = Math.max(...underbustFitSources.map(source => source.mtimeMs));
const jobs = catalog.flatMap(({ id }) => ['garage', 'mobile'].map(tier => ({
  source: new URL(`${id}.${tier}.glb`, wardrobeRoot),
  output: new URL(`corsets/${id}.${tier}.glb`, pieceRoot),
  roles: corsetRoles,
  fitUnderbust: id === 'gothic-04',
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
  const latestInput = Math.max(source.mtimeMs, script.mtimeMs, job.fitUnderbust ? underbustFitMtime : 0);
  if (!output || output.size < 256 || output.mtimeMs < latestInput) pending.push(job);
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
  for (const { source, output, roles, fitUnderbust } of pending) {
    const document = await io.read(fileURLToPath(source));
    const root = document.getRoot();
    const meshNodes = root.listNodes().filter(node => node.getMesh());
    const parts = meshNodes.filter(node => roles.includes(node.getExtras().wardrobeRole));
    if (parts.length !== roles.length || roles.some(role => !parts.some(node => node.getExtras().wardrobeRole === role))
      || parts.some(node => node.getSkin()?.listJoints().length !== 88)) {
      throw Error(`Missing skinned wardrobe pieces in ${fileURLToPath(source)}`);
    }
    if (fitUnderbust) {
      const body = meshNodes.find(node => node.getExtras().wardrobeRole === 'body')?.getMesh().listPrimitives()[0];
      if (!body) throw Error(`Missing Underbust fit body in ${fileURLToPath(source)}`);
      await bakeUnderbustFit(body, parts);
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

async function bakeUnderbustFit(body, parts) {
  const [{ BufferAttribute, BufferGeometry }, { prepareUnderbustVestFit, UNDERBUST_FIT_VERSION }] =
    await Promise.all([import('three'), import(underbustFitModule.href)]);
  const semantics = {
    POSITION: 'position', NORMAL: 'normal', JOINTS_0: 'skinIndex', WEIGHTS_0: 'skinWeight',
    TEXCOORD_0: 'uv', _AVEN_COVERAGE: '_aven_coverage',
  };
  const geometryOf = primitive => {
    const geometry = new BufferGeometry();
    for (const [semantic, name] of Object.entries(semantics)) {
      const accessor = primitive.getAttribute(semantic);
      if (accessor) geometry.setAttribute(name, new BufferAttribute(accessor.getArray(), accessor.getElementSize(), accessor.getNormalized()));
    }
    geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(), 1));
    return geometry;
  };
  const fit = prepareUnderbustVestFit(geometryOf(body));
  for (const part of parts) {
    const extras = part.getExtras();
    for (const primitive of part.getMesh().listPrimitives()) {
      const geometry = fit(geometryOf(primitive), extras.wardrobeRole === 'corset-tucked', primitive.getMaterial()?.getName());
      for (const [semantic, name] of Object.entries(semantics)) {
        const fitted = geometry.getAttribute(name);
        const accessor = primitive.getAttribute(semantic);
        if (accessor && fitted) primitive.setAttribute(semantic, accessor.clone().setArray(fitted.array));
      }
      primitive.setIndices(primitive.getIndices().clone().setArray(geometry.getIndex().array));
      if (geometry.userData.underbustCrownStart !== undefined) {
        primitive.setExtras({ ...primitive.getExtras(), underbustCrownStart: geometry.userData.underbustCrownStart });
      }
    }
    part.setExtras({ ...extras, underbustFitVersion: UNDERBUST_FIT_VERSION });
  }
}
