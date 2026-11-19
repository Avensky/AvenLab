// Reproducible CPU/buffer comparison using unchanged source assets and vehicle rigs.
// node scripts/benchmark-vehicle-batches.mjs --baseline <git-ref> --samples 8 --output /tmp/vehicle-batches.json
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import vehicleCatalog from '../public/models/vehicles/catalog.json' with { type: 'json' };
import { loadVehicleGeometry } from './load-vehicle-geometry.mjs';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(frontend, '..');
const option = name => { const at = process.argv.indexOf(name); return at === -1 ? undefined : process.argv[at + 1]; };
const baseline = option('--baseline');
const output = option('--output');
const samples = Number(option('--samples') ?? 8);
const models = (option('--models') ?? 'brz,ae86').split(',');
if (!baseline) throw Error('--baseline must identify the batcher implementation to compare');
if (!Number.isInteger(samples) || samples < 1 || samples > 100) throw Error('--samples must be between 1 and 100');
const baselineSha = execFileSync('git', ['rev-parse', '--verify', baseline + '^{commit}'], { cwd: repo, encoding: 'utf8' }).trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)],
    max: sorted.at(-1), mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
};

async function environment(ref) {
  const modulePath = 'frontend/src/vehicles/tools/staticVehicleBatches.ts';
  const original = ref ? execFileSync('git', ['show', ref + ':' + modulePath], { cwd: repo, encoding: 'utf8' }) : undefined;
  const vite = await createServer({ root: frontend, configFile: false, appType: 'custom', logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [{ name: 'vehicle-batcher-reference', enforce: 'pre', transform(code, id) {
      return original !== undefined && id === resolve(repo, modulePath) ? original : code;
    } }] });
  try {
    const modules = await Promise.all([
      'vehicles/tools/staticVehicleBatches.ts', 'vehicles/tools/vehicleMaterials.ts', 'game/preview/garageStations.ts',
      'game/preview/splitGarageSteering.ts', 'game/preview/timecarDriverDoor.ts',
      'game/preview/ae86DriverDoor.ts', 'game/preview/vehiclePartRig.ts',
    ].map(path => vite.ssrLoadModule('/src/' + path)));
    return { vite, api: Object.assign({}, ...modules) };
  } catch (error) { await vite.close(); throw error; }
}

function fixture(env, model, scene, animations) {
  const { api } = env;
  const visual = api.prepareVehicleVisual(scene, model);
  const door = model === 'ae86' ? api.splitAe86DriverDoor(visual.root) : undefined;
  const steering = api.splitGarageSteering(visual.root, model);
  const gullwing = model === 'timecar' ? api.splitTimecarDriverDoor(visual.root) : undefined;
  const rig = api.createVehiclePartRig(visual.root, model);
  if (gullwing) rig.push(gullwing.hinge);
  const station = api.GARAGE_STATIONS[model];
  return { root: visual.root,
    options: { protectedObjects: rig.map(part => part.pivot), animations,
      protectedNames: station?.kind === 'wheel' ? station.steeringParts : undefined },
    dispose() { gullwing?.dispose(); steering?.(); door?.(); visual.dispose(); } };
}

function geometrySignature(root) {
  const signature = createHash('sha256');
  const describe = value => signature.update(JSON.stringify(value));
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    describe([object.userData.staticVehicleParts ? 'batch' : object.name,
      object.matrixWorld.elements, object.visible, object.castShadow, object.receiveShadow,
      geometry.drawRange, geometry.groups]);
    const attributes = [['index', geometry.index], ...Object.keys(geometry.attributes).sort()
      .map(name => [name, geometry.attributes[name]])];
    for (const [name, attribute] of attributes) {
      if (!attribute) { describe([name, null]); continue; }
      describe([name, attribute.itemSize, attribute.count, attribute.normalized,
        attribute.array.constructor.name, attribute.gpuType,
        attribute.isInterleavedBufferAttribute ? [attribute.offset, attribute.data.stride] : null]);
      signature.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
  });
  return signature.digest('hex');
}

function uniqueDerivedBytes(geometries) {
  const buffers = new Set();
  for (const geometry of geometries) for (const attribute of [...Object.values(geometry.attributes), geometry.index])
    if (attribute) buffers.add(attribute.array.buffer);
  return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
}

function measure(env, first, second, verifyGeometry = false) {
  let one, two;
  try {
    const start = performance.now();
    one = env.api.batchStaticVehicleMeshes(first.root, first.options);
    const prepared = performance.now();
    two = env.api.batchStaticVehicleMeshes(second.root, second.options);
    const shared = performance.now();
    // Each instance draws with its own materials, but equivalent live instances
    // must retain the same derived geometry, including any UV aliases.
    const geometries = root => { const result = []; root.traverse(object => {
      if (object.userData.staticVehicleParts) result.push(object.geometry);
    }); return result; };
    const left = geometries(first.root), right = geometries(second.root);
    if (left.length !== right.length || left.some((geometry, i) => geometry !== right[i]))
      throw Error('Equivalent prepared instances did not share derived geometry');
    return { cold: prepared - start, shared: shared - prepared, stats: { ...one.stats },
      geometrySignature: verifyGeometry ? geometrySignature(first.root) : undefined,
      uniqueDerivedGeometryBytes: verifyGeometry ? uniqueDerivedBytes(left) : undefined };
  } finally { two?.dispose(); one?.dispose(); }
}

const report = { metadata: {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), baseline: baselineSha,
  currentBatcherSha256: hash(await readFile(resolve(frontend, 'src/vehicles/tools/staticVehicleBatches.ts'))),
  baselineBatcherSha256: hash(execFileSync('git', ['show', baselineSha + ':frontend/src/vehicles/tools/staticVehicleBatches.ts'], { cwd: repo })),
  current: 'Working tree, including uncommitted changes', node: process.version, cpu: os.cpus()[0]?.model, samples,
  statistic: 'median is the upper middle sample for even sample counts; min, max, and arithmetic mean are also reported',
  scope: 'Node CPU time for staticVehicleBatches only, after identical decoded source and production material/rig preparation. Four unmeasured warmup pairs per implementation; warmup and measured baseline/current pairs alternate. Cold releases every previous batch; shared measures a second equivalent instance while the first remains alive. Image uploads are mocked; no browser/GPU/FPS or measured VRAM claim.',
  comparison: 'Only staticVehicleBatches.ts is restored from the baseline; source assets, installed dependencies, and material/door/steering/hinge preparation are identical.',
}, cases: [] };
const environments = [];
try {
  const previous = await environment(baselineSha); environments.push(previous);
  const current = await environment(); environments.push(current);
  for (const model of models) {
    const source = vehicleCatalog.assets[model]?.model;
    if (!source) throw Error('Unknown vehicle model: ' + model);
    const path = resolve(frontend, 'public', source.replace(/^\//, ''));
    const bytes = await readFile(path);
    if (bytes.toString('ascii', 0, 4) !== 'glTF') throw Error('Materialize the source with Git LFS: ' + source);
    const { scene, animations } = await loadVehicleGeometry(bytes);
    const fixtures = environments.map(env => [fixture(env, model, scene, animations), fixture(env, model, scene, animations)]);
    const values = environments.map(() => []);
    const signatures = [], uniqueBytes = [];
    try {
      for (let warmup = 0; warmup < 4; warmup++) for (const i of warmup % 2 ? [1, 0] : [0, 1]) {
        const value = measure(environments[i], ...fixtures[i], warmup === 0);
        if (value.geometrySignature) {
          signatures[i] = value.geometrySignature;
          uniqueBytes[i] = value.uniqueDerivedGeometryBytes;
        }
      }
      if (signatures[0] !== signatures[1]) throw Error('Prepared geometry differs from baseline: ' + model);
      for (let sample = 0; sample < samples; sample++) {
        for (const i of sample % 2 ? [1, 0] : [0, 1]) values[i].push(measure(environments[i], ...fixtures[i]));
      }
    } finally { for (const pair of fixtures) for (const item of pair) item.dispose(); }
    const row = { model, source, sourceBytes: bytes.length, sha256: hash(bytes),
      preparedGeometrySignature: signatures[0], geometryIdentical: true };
    for (const [i, label] of ['baseline', 'current'].entries()) {
      if (!values[i].every(value => JSON.stringify(value.stats) === JSON.stringify(values[i][0].stats)))
        throw Error('Batch structure changed across samples: ' + model);
      row[label] = { coldMilliseconds: stats(values[i].map(value => value.cold)),
        sharedMilliseconds: stats(values[i].map(value => value.shared)), batch: values[i][0].stats,
        uniqueDerivedGeometryBytes: uniqueBytes[i] };
    }
    if (hash(await readFile(path)) !== row.sha256) throw Error('Source asset changed: ' + source);
    report.cases.push(row);
    console.error(`${model}: cold ${row.baseline.coldMilliseconds.median.toFixed(2)} → ${row.current.coldMilliseconds.median.toFixed(2)} ms; unique derived buffers ${row.baseline.uniqueDerivedGeometryBytes} → ${row.current.uniqueDerivedGeometryBytes} bytes`);
    if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
  if (!output) console.log(JSON.stringify(report, null, 2));
} finally { for (const env of environments) await env.vite.close(); }
