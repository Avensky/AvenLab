// Same-process CPU comparison for the exact point/Jacobian reuse change.
// node scripts/benchmark-exact-warp-reuse.mjs --baseline 25de3c1 --samples 8 --output /tmp/exact-warp-reuse.json
// --verify-only skips timing; --cases all verifies the complete accepted fixture set.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from './load-wardrobe-geometry.mjs';

const frontend = fileURLToPath(new URL('../', import.meta.url)), repo = resolve(frontend, '..');
const sourceRoots = ['frontend/src', 'packages/wardrobe-catalog'];
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const baselineRef = option('--baseline') ?? '25de3c1', output = option('--output');
const verifyOnly = process.argv.includes('--verify-only');
const samples = Number(option('--samples') ?? 8), warmupPairs = Number(option('--warmup-pairs') ?? 2);
if (!Number.isInteger(samples) || samples < 1 || samples > 16) throw Error('--samples must be 1..16');
if (!Number.isInteger(warmupPairs) || warmupPairs < 1 || warmupPairs > 4) throw Error('--warmup-pairs must be 1..4');
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const baselineCommit = git(['rev-parse', '--verify', baselineRef + '^{commit}']);
const head = git(['rev-parse', 'HEAD']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const cleanId = id => id.split('?')[0];
const underSourceRoot = path => sourceRoots.some(root => path.startsWith(resolve(repo, root) + '/'));
const raw = attribute => attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
const updateArray = (hash, array) => hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
const fixtureText = await readFile(new URL('../tests/fixtures/wardrobe-fit-signatures.json', import.meta.url), 'utf8');
const approved = JSON.parse(fixtureText);
const defaults = ['garage:gothic-skirt-02+gothic-02', 'garage:gothic-skirt-05+gothic-05',
  'portrait:gothic-skirt-02+gothic-02', 'portrait:gothic-skirt-05+gothic-05', 'garage:skirt-03+gothic-05'];
const requested = option('--cases') === 'all' ? approved.cases.map(c => c.id) : option('--cases')?.split(',') ?? defaults;
if (!requested.length || requested.some(id => !approved.cases.some(c => c.id === id))) throw Error('Unknown --cases entry');
const scenarios = requested.map(id => approved.cases.find(c => c.id === id));
const sharedSetupPaths = ['frontend/vite.config.ts', 'frontend/package.json', 'frontend/package-lock.json',
  'frontend/scripts/character-model-paths.mts', 'frontend/scripts/discover-wardrobe-garments.mts',
  'frontend/scripts/load-wardrobe-geometry.mjs', 'packages/wardrobe-catalog'];
const changedSetup = git(['diff', '--name-only', baselineCommit, '--', ...sharedSetupPaths]);
if (changedSetup) throw Error('Baseline comparison requires unchanged shared setup files:\n' + changedSetup);

async function snapshot(ref) {
  const files = ref
    ? git(['ls-tree', '-rz', '--name-only', ref, '--', ...sourceRoots]).split('\0').filter(Boolean)
    : git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...sourceRoots]).split('\0').filter(Boolean);
  const sources = new Map();
  if (ref) {
    const batch = execFileSync('git', ['cat-file', '--batch'], { cwd: repo,
      input: files.map(path => `${ref}:${path}\n`).join(''), maxBuffer: 64 * 1024 * 1024 });
    let offset = 0;
    for (const path of files) {
      const end = batch.indexOf(10, offset), header = batch.toString('utf8', offset, end).split(' ');
      if (end < 0 || header[1] !== 'blob') throw Error('Cannot read baseline source: ' + path);
      const length = Number(header[2]), bytes = batch.subarray(end + 1, end + 1 + length);
      if (bytes.length !== length) throw Error('Truncated baseline source: ' + path);
      sources.set(resolve(repo, path), { bytes, sha256: sha256(bytes) });
      offset = end + 1 + length + 1;
    }
  } else {
    for (const path of files) {
      try { const bytes = await readFile(resolve(repo, path)); sources.set(resolve(repo, path), { bytes, sha256: sha256(bytes) }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const hashes = Object.fromEntries([...sources].map(([path, source]) => [path.slice(repo.length + 1), source.sha256]).sort(([a], [b]) => a.localeCompare(b)));
  return { sources, hashes, sha256: sha256(JSON.stringify(hashes)) };
}

async function environment(name, source) {
  const loaded = {};
  const vite = await createServer({ root: frontend, server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: 'exact-warp-source-snapshot-' + name, enforce: 'pre',
      resolveId(specifier, importer) {
        const id = cleanId(specifier), parent = importer && cleanId(importer);
        const candidate = id.startsWith('/src/') ? resolve(frontend, id.slice(1))
          : id.startsWith('/@fs/') ? resolve(id.slice(4))
            : isAbsolute(id) ? resolve(id) : id.startsWith('.') && parent ? resolve(dirname(parent), id) : undefined;
        if (!candidate || !underSourceRoot(candidate)) return;
        const alternatives = [candidate, ...['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.json'].map(ext => candidate + ext),
          ...['.ts', '.tsx', '.js', '.json'].map(ext => candidate + '/index' + ext)];
        if (candidate.endsWith('.js')) alternatives.push(candidate.slice(0, -3) + '.ts');
        const match = alternatives.find(path => source.sources.has(path));
        if (!match) throw Error(`${name} source snapshot cannot resolve ${specifier} from ${importer ?? '<entry>'}`);
        return match;
      },
      load(id) {
        const path = cleanId(id), entry = source.sources.get(path);
        if (!entry) {
          if (underSourceRoot(path) || path.startsWith(repo + '/') && !path.includes('/node_modules/')) {
            throw Error(name + ' attempted to load repository code outside its source snapshot: ' + path);
          }
          return;
        }
        if (!/\.(?:[cm]?[jt]sx?|json)$/.test(path)) throw Error('Unsupported benchmark module: ' + path);
        loaded[path.slice(repo.length + 1)] = entry.sha256;
        return entry.bytes.toString('utf8');
      },
    }] });
  try {
    const names = ['villagerModel', 'characterCatalog', 'wardrobe', 'wardrobeGarments', 'wardrobeFitCache', 'wardrobePreviewAssets', 'animationFit'];
    const api = Object.assign({}, ...await Promise.all(names.map(module => vite.ssrLoadModule('/src/game/characters/' + module + '.ts'))));
    return { name, vite, api, source, loaded, defines: vite.config.define };
  } catch (error) { await vite.close(); throw error; }
}

// The accepted digest algorithm is unchanged. The additional baseline digest
// includes morph buffers, mesh transforms/binding and skirt-specific arm room.
// UUIDs, materials/textures, bounding caches and GPU upload counters are excluded.
function geometryDigests(root) {
  const accepted = createHash('sha256'), buffers = createHash('sha256'), complete = createHash('sha256');
  const attribute = (hash, name, a) => {
    const array = raw(a);
    hash.update(JSON.stringify([name, a.constructor.name, array.constructor.name, a.itemSize, a.normalized,
      a.isInterleavedBufferAttribute ? [a.data.stride, a.offset] : null]));
    updateArray(hash, array);
  };
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry, metadata = JSON.stringify([mesh.name, geometry.drawRange, geometry.groups]);
    accepted.update(metadata); buffers.update(metadata); complete.update(metadata);
    for (const [name, a] of [['index', geometry.index], ...Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))]) {
      if (a) { attribute(accepted, name, a); attribute(buffers, name, a); attribute(complete, name, a); }
    }
    buffers.update(JSON.stringify(geometry.morphTargetsRelative));
    complete.update(JSON.stringify([mesh.visible, geometry.morphTargetsRelative, mesh.bindMode ?? null]));
    for (const [name, attributes] of Object.entries(geometry.morphAttributes).sort(([a], [b]) => a.localeCompare(b))) {
      attributes.forEach((a, i) => { attribute(buffers, `morph:${name}:${i}`, a); attribute(complete, `morph:${name}:${i}`, a); });
    }
    for (const array of [mesh.position.toArray(), mesh.quaternion.toArray(), mesh.scale.toArray(), mesh.matrix.elements,
      mesh.matrixWorld.elements, mesh.bindMatrix?.elements ?? [], mesh.bindMatrixInverse?.elements ?? [], mesh.morphTargetInfluences ?? []]) {
      updateArray(complete, new Float64Array(array));
    }
    if (mesh.skeleton) {
      complete.update(JSON.stringify(mesh.skeleton.bones.map(bone => bone.name)));
      for (const matrix of mesh.skeleton.boneInverses) updateArray(complete, new Float64Array(matrix.elements));
    }
  });
  complete.update(JSON.stringify(root.userData.skirtHandRoom === undefined ? 'undefined' : 'number'));
  if (root.userData.skirtHandRoom !== undefined) updateArray(complete, new Float64Array([root.userData.skirtHandRoom]));
  return { accepted: accepted.digest('hex'), buffers: buffers.digest('hex'), complete: complete.digest('hex') };
}

const scenes = new Map(), assetInputs = {};
async function load(url) {
  url = '/' + url.replace(/^\/+/, '');
  if (!scenes.has(url)) {
    const path = 'frontend/public' + url, bytes = await readFile(resolve(repo, path));
    if (bytes.toString('ascii', 0, 4) !== 'glTF') throw Error('Materialize the GLB before benchmarking: ' + url);
    assetInputs[url] = { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
    scenes.set(url, await loadWardrobeGeometry(bytes));
  }
  return scenes.get(url);
}
async function fixture(env, sample) {
  const { api } = env, options = { fitted: true, animateFace: true, wetEyes: true }, choice = { ...api.DEFAULT_CHARACTER };
  const inputs = { kind: sample.tier, villageKind: sample.tier, garments: [] };
  let actor;
  if (sample.bundled) {
    inputs.actor = `/models/characters/wardrobe/${sample.bundled}.${sample.tier === 'portrait' ? 'mobile' : 'garage'}.glb`;
    actor = await load(inputs.actor); choice.wardrobe = { set: sample.bundled, shirt: 'none', waist: 'tucked' };
  } else {
    inputs.actor = `/models/characters/villagers/villager-female/villager-female.${sample.tier}.glb`;
    inputs.suppliedBodyDonor = '/models/characters/female/wardrobe/vesper-body.glb';
    actor = await load(inputs.actor);
    options.garmentBody = (await load(inputs.suppliedBodyDonor)).getObjectByName('BODY_WARDROBE');
    choice.garments = { skirt: sample.skirt };
    const item = api.getWardrobeGarment(sample.skirt), url = api.wardrobeGarmentModelUrl(item, sample.tier);
    inputs.garments.push(url); options.garments = [{ item, scene: await load(url), authoredFit: url === item.revisionUrl }];
    if (sample.corset) {
      choice.wardrobeTrial = { set: sample.corset, shirt: 'none', waist: 'tucked' };
      inputs.corset = api.corsetModelUrl(choice.wardrobeTrial, sample.tier);
      options.corsetSource = { set: sample.corset, scene: await load(inputs.corset) };
    }
  }
  return { env, sample, actor, options, look: api.characterLook(choice), inputs };
}
async function defaultDesktopFixture(env) {
  const { api } = env, choice = { ...api.DEFAULT_CHARACTER, garments: { skirt: 'gothic-skirt-05' },
    wardrobeTrial: { set: 'gothic-05', shirt: 'none', waist: 'tucked' } };
  const look = api.characterLook(choice), kind = 'garage', villageKind = 'portrait';
  const preferredUrl = api.villagerModelUrl(look, kind, villageKind), sources = {};
  for (let iteration = 0; iteration < 12; iteration++) {
    const resolved = api.resolveWardrobePreview({ preferredUrl, look, kind, villageKind, sources });
    if (resolved.pendingUrls.length) { for (const url of resolved.pendingUrls) sources[url] = await load(url); continue; }
    if (!resolved.preview || resolved.unavailable) throw Error('Default desktop preview could not resolve');
    const preview = resolved.preview;
    const ownerUrl = object => object && Object.entries(sources).find(([, scene]) => scene === object || scene.getObjectById(object.id) === object)?.[0];
    return { env, sample: { id: 'default-desktop:gothic-skirt-05+gothic-05' }, actor: preview.scene, look: preview.look,
      inputs: { kind, villageKind, preferredUrl, actor: ownerUrl(preview.scene), garments: preview.garments.map(g => ownerUrl(g.scene)),
        corset: ownerUrl(preview.corsetScene), suppliedBodyDonor: ownerUrl(preview.garmentBody), resolvedAssetUrls: Object.keys(sources) },
      options: { female: look.female, animateFace: true, bag: false, wetEyes: true, fitted: api.usesFittedAnimation(look),
        garments: preview.garments, garmentBody: preview.garmentBody, removedClothing: [...look.removedClothing].sort(),
        corsetSource: preview.corsetScene && preview.corsetSet ? { set: preview.corsetSet, scene: preview.corsetScene } : undefined } };
  }
  throw Error('Default desktop resolution exceeded its bounded request loop');
}

function run(f, clear, expected, timed) {
  const { api } = f.env;
  if (clear) api.wardrobeFitCache.clear();
  const before = api.wardrobeFitCache.stats, start = timed ? performance.now() : 0;
  let model;
  try {
    model = api.prepareVillager(f.actor, f.options); const prepared = timed ? performance.now() : 0;
    api.applyVillagerLook(model, f.look); const applied = timed ? performance.now() : 0;
    const geometry = geometryDigests(model.root), after = api.wardrobeFitCache.stats;
    if (f.sample.sha256 && geometry.accepted !== f.sample.sha256) throw Error(`${f.env.name} ${f.sample.id}: accepted geometry mismatch`);
    if (expected && (geometry.accepted !== expected.accepted || geometry.buffers !== expected.buffers || geometry.complete !== expected.complete)) {
      throw Error(`${f.env.name} ${f.sample.id}: baseline output mismatch\n${JSON.stringify({ expected, actual: geometry })}`);
    }
    return { ...(timed ? { prepareMs: prepared - start, firstApplyMs: applied - prepared, totalMs: applied - start } : {}), geometry,
      cache: { before, after, hits: after.hits - before.hits, misses: after.misses - before.misses } };
  } finally { model?.dispose(); }
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length / 2;
  return { samples: sorted.length, min: sorted[0], median: Number.isInteger(middle) ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[Math.floor(middle)],
    max: sorted.at(-1), mean: sorted.reduce((a, b) => a + b, 0) / sorted.length };
}
const summarize = rows => Object.fromEntries(['prepareMs', 'firstApplyMs', 'totalMs'].map(key => [key, distribution(rows.map(row => row[key]))]));
const sources = { baseline: await snapshot(baselineCommit), current: await snapshot() };
const sourceChanges = [...new Set([...Object.keys(sources.baseline.hashes), ...Object.keys(sources.current.hashes)])]
  .filter(path => sources.baseline.hashes[path] !== sources.current.hashes[path]);
if (sourceChanges.some(path => path.startsWith('packages/wardrobe-catalog/'))) throw Error('Baseline/current catalog snapshots must match, including untracked files');
const report = { status: 'running', metadata: { head, baselineRef, baselineCommit, current: 'Working source snapshot at process start',
  mode: verifyOnly ? 'verification-only' : 'timings', node: process.version, cpu: os.cpus()[0]?.model, samples: verifyOnly ? 0 : samples, warmupPairs,
  benchmarkToolSha256: sha256(await readFile(fileURLToPath(import.meta.url))), acceptedFixtureSha256: sha256(fixtureText), acceptedGeometryCommit: approved.acceptedCommit,
  statistic: 'Conventional median: arithmetic mean of the two central values for even sample counts; raw ordered runs are retained.',
  scope: 'Uninstrumented synchronous Node CPU fitting using shared preloaded geometry. No GLB/texture decoding, animation setup, GPU/FPS or browser route timing.',
  coldDefinition: 'After baseline/current warmup pairs, clear only that environment\'s bounded wardrobeFitCache before each cache-cold preparation; other module/source/JIT caches remain warm.',
  warmDefinition: 'Same environment and look immediately after its preceding cache-cold run; geometry validation and disposal occur between runs, outside measured intervals.',
  ordering: 'Even rounds: baseline cold/warm then current cold/warm. Odd rounds reverse the two environment pairs.',
  baselineScope: 'Separate Vite SSR contexts over immutable baseline/current frontend/src and wardrobe-catalog snapshots. Tracked dependency manifests, Vite setup and catalog inputs must match baseline. Installed dependencies and currently materialized assets are shared, not reconstructed historical installs; asset hashes identify these exact inputs.',
  equivalenceScope: 'Original accepted fixture digest plus a baseline digest of morph buffers, mesh transforms/bind matrices, skeleton names/inverses and skirtHandRoom. UUIDs, material/texture behavior, bounding caches and GPU upload counters are excluded.',
  fixtureScope: 'Accepted tier fixtures keep their historical actor tier. The separate default-desktop oracle uses baseline production resolution: portrait actor plus garage skirt/corset, ReadyVillager-equivalent options; it does not extend visual acceptance.',
  sourceSnapshotSha256: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.sha256])),
  sourceChanges,
  loadedSourceHashes: {}, sharedSetupHashes: {}, installedDependencies: {}, assetInputs, selectedCases: [...scenarios.map(c => c.id), 'default-desktop:gothic-skirt-05+gothic-05'] }, cases: [] };
const environments = [];
async function save() {
  if (!output) return;
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output + '.tmp', JSON.stringify(report, null, 2) + '\n'); await rename(output + '.tmp', output);
}
try {
  for (const path of sharedSetupPaths.filter(path => !sourceRoots.includes(path))) {
    try { report.metadata.sharedSetupHashes[path] = sha256(await readFile(resolve(repo, path))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const name of ['three', 'three-mesh-bvh', 'vite']) {
    const bytes = await readFile(resolve(frontend, 'node_modules', name, 'package.json'));
    report.metadata.installedDependencies[name] = { version: JSON.parse(bytes).version, packageJsonSha256: sha256(bytes) };
  }
  const baseline = await environment('baseline', sources.baseline); environments.push(baseline);
  const current = await environment('current', sources.current); environments.push(current);
  if (baseline.api.prepareVillager === current.api.prepareVillager || baseline.api.wardrobeFitCache === current.api.wardrobeFitCache) {
    throw Error('Baseline/current runtime module contexts are not independent');
  }
  report.metadata.independentModuleContexts = true;
  if (JSON.stringify(baseline.defines) !== JSON.stringify(current.defines)) throw Error('Vite environment defines differ');
  report.metadata.viteDefines = baseline.defines;
  const cases = [];
  for (const sample of scenarios) cases.push({ baseline: await fixture(baseline, sample), current: await fixture(current, sample) });
  cases.push({ baseline: await defaultDesktopFixture(baseline), current: await defaultDesktopFixture(current) });
  const sourceGeometry = new Map([...scenes].map(([url, scene]) => [url, geometryDigests(scene).buffers]));
  for (const pair of cases) {
    const id = pair.baseline.sample.id;
    if (JSON.stringify(pair.baseline.inputs) !== JSON.stringify(pair.current.inputs)
      || JSON.stringify(pair.baseline.look) !== JSON.stringify(pair.current.look)) throw Error(id + ': baseline/current input resolution differs');
    const oracle = run(pair.baseline, true, undefined, false).geometry;
    const row = { id, inputs: pair.baseline.inputs, oracle: { commit: baselineCommit,
      acceptance: pair.baseline.sample.sha256 ? 'Matches unchanged accepted fixture at ' + approved.acceptedCommit : 'Separate production-resolver baseline oracle; not visual acceptance',
      geometry: oracle }, verification: { baseline: 1, current: 0 }, rounds: [] };
    for (let i = 0; i < (verifyOnly ? 1 : warmupPairs); i++) for (const name of i % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
      run(pair[name], true, oracle, false); run(pair[name], false, oracle, false); row.verification[name] += 2;
    }
    if (!verifyOnly) {
      const runs = { baseline: { cold: [], warm: [] }, current: { cold: [], warm: [] } };
      for (let i = 0; i < samples; i++) {
        const round = { round: i + 1, order: i % 2 ? ['current', 'baseline'] : ['baseline', 'current'], runs: {} };
        for (const name of round.order) {
          const cold = run(pair[name], true, oracle, true), warm = run(pair[name], false, oracle, true);
          round.runs[name] = { cold, warm }; runs[name].cold.push(cold); runs[name].warm.push(warm); row.verification[name] += 2;
        }
        row.rounds.push(round);
      }
      row.summary = Object.fromEntries(Object.entries(runs).map(([name, temperatures]) => [name,
        Object.fromEntries(Object.entries(temperatures).map(([temperature, values]) => [temperature, summarize(values)]))]));
    }
    for (const [url, scene] of scenes) if (geometryDigests(scene).buffers !== sourceGeometry.get(url)) throw Error('Shared source geometry was mutated: ' + url);
    row.sourceBuffersUnchanged = true; report.cases.push(row); await save();
    console.error(verifyOnly ? `Verified ${id}` : `${id}: cold ${row.summary.baseline.cold.prepareMs.median.toFixed(2)} → ${row.summary.current.cold.prepareMs.median.toFixed(2)} ms; warm ${row.summary.baseline.warm.prepareMs.median.toFixed(2)} → ${row.summary.current.warm.prepareMs.median.toFixed(2)} ms`);
  }
  for (const env of environments) {
    report.metadata.loadedSourceHashes[env.name] = env.loaded;
    if (env.name === 'current') for (const [path, hash] of Object.entries(env.loaded)) {
      if (sha256(await readFile(resolve(repo, path))) !== hash) throw Error('Loaded current source changed during benchmark: ' + path);
    }
  }
  for (const [path, hash] of Object.entries(report.metadata.sharedSetupHashes)) {
    if (sha256(await readFile(resolve(repo, path))) !== hash) throw Error('Shared setup changed during benchmark: ' + path);
  }
  if (git(['diff', '--name-only', baselineCommit, '--', ...sharedSetupPaths])) throw Error('Shared setup no longer matches baseline');
  report.status = 'complete'; report.metadata.completedAt = new Date().toISOString();
  report.metadata.sourceBuffersUnchanged = true; await save();
  if (!output) console.log(JSON.stringify(report, null, 2));
} finally { for (const env of environments) { env.api.wardrobeFitCache.clear(); await env.vite.close(); } }
