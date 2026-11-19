// Bounded CPU audit. Counts use in-memory instrumentation; timings use untouched
// runtime modules. Neither mode edits runtime sources or measures GPU/FPS.
// node scripts/audit-character-preparation.mjs --mode counts --include-default-desktop --output /tmp/character-counts.json
// node scripts/audit-character-preparation.mjs --mode timings --samples 8 --output /tmp/character-timings.json
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute } from 'three';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { loadWardrobeGeometry } from './load-wardrobe-geometry.mjs';

const require = createRequire(import.meta.url), { MeshBVH } = require('three-mesh-bvh');
const frontend = fileURLToPath(new URL('../', import.meta.url)), repo = resolve(frontend, '..');
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const mode = option('--mode') ?? 'counts', samples = Number(option('--samples') ?? 8);
const pressureCycles = Number(option('--pressure-cycles') ?? 2), output = option('--output');
const includeDefaultDesktop = process.argv.includes('--include-default-desktop');
if (!['counts', 'timings'].includes(mode)) throw Error('--mode must be counts or timings');
if (includeDefaultDesktop && mode !== 'counts') throw Error('--include-default-desktop is count-only');
if (!Number.isInteger(samples) || samples < 1 || samples > 16) throw Error('--samples must be 1..16');
if (!Number.isInteger(pressureCycles) || pressureCycles < 0 || pressureCycles > 3) throw Error('--pressure-cycles must be 0..3');
const approvedText = await readFile(new URL('../tests/fixtures/wardrobe-fit-signatures.json', import.meta.url), 'utf8');
const approved = JSON.parse(approvedText);
const requested = option('--cases')?.split(',');
if (requested?.some(id => !approved.cases.some(c => c.id === id))) throw Error('Unknown --cases entry');
const scenarios = approved.cases.filter(c => !requested || requested.includes(c.id));
if (!scenarios.length) throw Error('No cases selected');
const scenes = new Map(), sourceHashes = {}, assetInputs = {}, restores = [];
let activeAudit;
const raw = attribute => attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
const hashBytes = (hash, array) => hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));

function geometryBytes(geometry) {
  const arrays = new Set();
  for (const a of [geometry.index, ...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes).flat()]) {
    if (a) arrays.add(raw(a));
  }
  return [...arrays].reduce((bytes, array) => bytes + array.byteLength, 0);
}

function geometryDigest(root) {
  const hash = createHash('sha256');
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    hash.update(JSON.stringify([mesh.name, geometry.drawRange, geometry.groups]));
    for (const [name, a] of [['index', geometry.index], ...Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))]) {
      if (!a) continue;
      const array = raw(a);
      hash.update(JSON.stringify([name, a.constructor.name, array.constructor.name, a.itemSize, a.normalized,
        a.isInterleavedBufferAttribute ? [a.data.stride, a.offset] : null]));
      hashBytes(hash, array);
    }
  });
  return hash.digest('hex');
}

function coverageKey(geometry, height) {
  const hash = createHash('sha256'), position = geometry.getAttribute('position'), index = geometry.index;
  hash.update(JSON.stringify([geometry.drawRange, height, position?.constructor.name, position?.itemSize, position?.count,
    position?.normalized, position && raw(position).constructor.name, index?.count, index && raw(index).constructor.name,
    position?.isInterleavedBufferAttribute ? [position.data.stride, position.offset] : null]));
  if (position) hashBytes(hash, raw(position));
  if (index) hashBytes(hash, raw(index));
  return hash.digest('hex');
}

class Audit {
  phase = 'prepare'; stack = []; stages = {}; warps = []; activeWarp = null; coverageInputs = new Map();
  storedPositions = 0; maxPositions = 200000; maxPositionsPerWarp = 50000;
  increment(key, amount = 1, owner = this.stack.at(-1) ?? 'unattributed') {
    const stage = this.stages[`${this.phase}:${owner}`] ??= {};
    stage[key] = (stage[key] ?? 0) + amount;
  }
  maximum(key, value, owner = this.stack.at(-1) ?? 'unattributed') {
    const stage = this.stages[`${this.phase}:${owner}`] ??= {};
    stage[key] = Math.max(stage[key] ?? 0, value);
  }
  call(name, args, compute) {
    const owner = name === 'profile' ? `profile.${args[1] ? 'body' : 'cloth'}` : name;
    this.stack.push(owner); this.increment('calls');
    try {
      const result = compute();
      if (name === 'wardrobeCoverageSurface' && result) {
        this.increment('bvhBuilds');
        this.increment('bvhPackedBytes', result._roots.reduce((n, b) => n + b.byteLength, 0));
        const key = coverageKey(args[0], args[1]), previous = this.coverageInputs.get(key) ?? 0;
        if (previous) this.increment('repeatedExactBvhInputs');
        this.coverageInputs.set(key, previous + 1);
      }
      if (name === 'wardrobeCoverageUnion') {
        this.increment('unionInputParts', args[0].length); this.increment('unionOutputSurfaces', result.length);
        if (result.length === 1 && args[0].length > 1) {
          this.increment('unionBuilds'); this.increment('unionGeometryBytes', geometryBytes(result[0].geometry));
          this.increment('unionPackedBytes', result[0]._roots.reduce((n, b) => n + b.byteLength, 0));
        }
      }
      if (name === 'fingerprint') this.increment('fingerprintBytesRead', result.buffers.reduce((n, b) => n + b.byteLength, 0));
      if (name === 'equalBytes') this.increment(result ? 'confirmedEqualBytesRead' : 'unequalBufferComparisons', result ? args[0].byteLength : 1);
      if (name === 'captureShape') this.increment('deformationSnapshotBytes', result.fields.reduce((n, f) => n + f.values.byteLength, 0));
      if (name === 'createWardrobeWarpMemo' && result) {
        this.increment('memoBuilds');
        this.increment('memoBufferBytesAllocated', result.bufferBytes);
        this.maximum('largestMemoBufferBytes', result.bufferBytes);
        this.maximum('largestMemoCapacity', result.capacity);
        const audit = this;
        return { ...result,
          find(...args) { const entry = result.find(...args); audit.increment(entry >= 0 ? 'memoPointHits' : 'memoPointMisses'); return entry; },
          remember(...args) { const entry = result.remember(...args); audit.increment(entry >= 0 ? 'memoPointAdmissions' : 'memoPointFallbacks'); return entry; },
          readJacobian(...args) { const hit = result.readJacobian(...args); audit.increment(hit ? 'memoJacobianHits' : 'memoJacobianMisses'); return hit; },
        };
      }
      return result;
    } finally { this.stack.pop(); }
  }
  warp() {
    const audit = this, owner = this.stack.at(-1) ?? 'unattributed', seen = new Map();
    const row = { owner, sources: 0, sourceVertices: 0, selectedVertices: 0, movedVertices: 0,
      shapeCalls: 0, pointCalls: 0, jacobianCalls: 0, repeatedPointCalls: 0, repeatedJacobianCalls: 0,
      repeatedWithinSource: 0, repeatedAcrossSources: 0, rays: 0, repeatablePointRays: 0, repeatableJacobianRays: 0,
      uniquePositions: 0, uniqueJacobians: 0, unsupportedPositionSources: 0, excludedPositionCalls: 0,
      nonFinitePositionCalls: 0, trackingLimitReached: false };
    this.warps.push(row);
    let entry, pointRepeat = false, jacobianRepeat = false, kind = 'point', supported = false;
    const keyNumber = n => Object.is(n, -0) ? '-0' : String(n);
    return {
      source(source) {
        const position = source.getAttribute('position');
        const prototype = position.isInterleavedBufferAttribute ? InterleavedBufferAttribute.prototype : BufferAttribute.prototype;
        supported = position.itemSize === 3 && ['getX', 'getY', 'getZ'].every(key => position[key] === prototype[key]);
        row.sources++; row.sourceVertices += position.count;
        if (!supported) row.unsupportedPositionSources++;
      },
      point(x, y, z) {
        row.selectedVertices++; kind = 'point';
        if (!supported || ![x, y, z].every(Number.isFinite)) {
          if (!supported) row.excludedPositionCalls++; else row.nonFinitePositionCalls++;
          entry = undefined; pointRepeat = false;
          audit.activeWarp = { row, repeated: false, kind };
          return;
        }
        const key = `${keyNumber(x)},${keyNumber(y)},${keyNumber(z)}`;
        entry = seen.get(key); pointRepeat = Boolean(entry);
        if (entry) {
          row[entry.source === row.sources ? 'repeatedWithinSource' : 'repeatedAcrossSources']++;
          entry.source = row.sources;
        } else if (seen.size < audit.maxPositionsPerWarp && audit.storedPositions < audit.maxPositions) {
          entry = { source: row.sources, normal: false }; seen.set(key, entry); audit.storedPositions++; row.uniquePositions++;
        } else row.trackingLimitReached = true;
        audit.activeWarp = { row, repeated: pointRepeat, kind };
      },
      changed() { row.movedVertices++; },
      normal() {
        kind = 'jacobian'; jacobianRepeat = Boolean(entry?.normal);
        if (entry && !entry.normal) { entry.normal = true; row.uniqueJacobians++; }
        audit.activeWarp = { row, repeated: jacobianRepeat, kind };
      },
      shape() {
        row.shapeCalls++;
        row[kind === 'point' ? 'pointCalls' : 'jacobianCalls']++;
        if (kind === 'point' ? pointRepeat : jacobianRepeat) row[kind === 'point' ? 'repeatedPointCalls' : 'repeatedJacobianCalls']++;
        audit.increment('shapeCalls', 1, owner);
      },
      end() { audit.activeWarp = null; },
    };
  }
  ray() {
    this.increment('raycasts');
    const current = this.activeWarp;
    if (!current) return;
    current.row.rays++;
    if (current.repeated) current.row[current.kind === 'point' ? 'repeatablePointRays' : 'repeatableJacobianRays']++;
  }
  result() {
    return { stages: this.stages, warps: this.warps, exactPositionTracking: {
      stored: this.storedPositions, perWarpLimit: this.maxPositionsPerWarp, totalLimit: this.maxPositions,
      complete: !this.warps.some(w => w.trackingLimitReached || w.excludedPositionCalls || w.nonFinitePositionCalls),
    }, coverageInputReuse: { unique: this.coverageInputs.size,
      repeatedBuilds: [...this.coverageInputs.values()].reduce((n, count) => n + count - 1, 0) } };
  }
}

function patch(prototype, name, observe) {
  const original = prototype[name];
  prototype[name] = function (...args) { if (activeAudit) observe(activeAudit, this, args); return original.apply(this, args); };
  restores.push(() => { prototype[name] = original; });
}
function installCountHooks() {
  if (mode !== 'counts') return;
  patch(BufferGeometry.prototype, 'clone', (a, source) => { a.increment('geometryClones'); a.increment('geometryCloneInputBytes', geometryBytes(source)); });
  patch(BufferAttribute.prototype, 'copy', (a, _target, [source]) => { a.increment('attributeCopies'); a.increment('attributeCopyBytes', source.array.byteLength); });
  patch(InterleavedBuffer.prototype, 'clone', (a, source) => { a.increment('interleavedCopies'); a.increment('interleavedCopyBytes', source.array.byteLength); });
  for (const name of ['computeBoundingBox', 'computeBoundingSphere', 'computeVertexNormals', 'applyMatrix4']) {
    patch(BufferGeometry.prototype, name, (a, source) => { a.increment(name); a.increment(`${name}Vertices`, source.attributes.position?.count ?? 0); });
  }
  patch(MeshBVH.prototype, 'raycastFirst', a => a.ray());
}

const functions = {
  villagerModel: ['prepareVillager', 'applyVillagerLook'], wardrobeGarmentFit: ['prepareWardrobeGarments'],
  wardrobeCoverage: ['wardrobeCoverageSurface'], wardrobeCoverageUnion: ['wardrobeCoverageUnion'],
  gothicCorsetTuck: ['prepareSkirtCorsetFit', 'extendHem', 'seatHem'], skirtWaistProfile: ['profile'],
  wardrobeFitCache: ['fingerprint', 'equalBytes', 'captureShape', 'restoreShape'],
  wardrobeWarpMemo: ['createWardrobeWarpMemo'],
};
function replaceRequired(code, from, to) {
  if (!code.includes(from)) throw Error('Audit instrumentation no longer matches runtime: ' + from);
  return code.replace(from, to);
}
function instrument(code, id) {
  const name = /\/([^/]+)\.ts$/.exec(id)?.[1];
  if (!name || (!functions[name] && name !== 'warpWardrobeGeometry')) return;
  sourceHashes[id.replace(frontend, '')] = createHash('sha256').update(code).digest('hex');
  for (const fn of functions[name] ?? []) {
    const exported = code.includes(`export function ${fn}(`), prefix = exported ? 'export ' : '';
    code = replaceRequired(code, `${prefix}function ${fn}(`, `function __audit_${fn}(`);
    code += `\n${prefix}function ${fn}(...args) { const a=globalThis.__avenCharacterPreparationAudit; return a ? a.call(${JSON.stringify(fn)},args,()=>__audit_${fn}(...args)) : __audit_${fn}(...args); }\n`;
  }
  if (name === 'warpWardrobeGeometry') {
    code = replaceRequired(code, '  return (source: BufferGeometry) => {',
      '  const __probe = globalThis.__avenCharacterPreparationAudit?.warp();\n  const __shape = shape;\n  shape = (...args) => { __probe?.shape(); return __shape(...args); };\n  return (source: BufferGeometry) => {\n    __probe?.source(source);');
    // Observe every selected point before lookup; shape() counts only calculations
    // actually executed, including cache misses and normal finite-difference work.
    const pointRead = '      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);';
    code = replaceRequired(code, pointRead, pointRead + '\n      __probe?.point(x, y, z);');
    code = replaceRequired(code, '      fitted ??= source.clone();', '      __probe?.changed();\n      fitted ??= source.clone();');
    code = replaceRequired(code, '      if (!normals) continue;', '      if (!normals) continue;\n      __probe?.normal();');
    code = replaceRequired(code, '    return fitted;', '    __probe?.end();\n    return fitted;');
  }
  return code;
}

async function load(path) {
  path = '/' + path.replace(/^\/+/, '');
  if (!scenes.has(path)) {
    const bytes = await readFile(resolve(frontend, 'public', path.replace(/^\//, '')));
    if (bytes.toString('ascii', 0, 4) !== 'glTF') throw Error('Materialize the GLB before auditing: ' + path);
    assetInputs[path] = { path: 'frontend/public' + path, bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex') };
    scenes.set(path, await loadWardrobeGeometry(bytes));
  }
  return scenes.get(path);
}
async function fixture(api, sample) {
  const options = { fitted: true, animateFace: true, wetEyes: true }, choice = { ...api.DEFAULT_CHARACTER };
  const inputs = { kind: sample.tier, villageKind: sample.tier, garments: [] };
  let actor;
  if (sample.bundled) {
    inputs.actor = `/models/characters/wardrobe/${sample.bundled}.${sample.tier === 'portrait' ? 'mobile' : 'garage'}.glb`;
    actor = await load(inputs.actor);
    choice.wardrobe = { set: sample.bundled, shirt: 'none', waist: 'tucked' };
  } else {
    inputs.actor = `/models/characters/villagers/villager-female/villager-female.${sample.tier}.glb`;
    inputs.suppliedBodyDonor = '/models/characters/female/wardrobe/vesper-body.glb';
    actor = await load(inputs.actor);
    options.garmentBody = (await load(inputs.suppliedBodyDonor)).getObjectByName('BODY_WARDROBE');
    choice.garments = { skirt: sample.skirt };
    const item = api.getWardrobeGarment(sample.skirt), url = api.wardrobeGarmentModelUrl(item, sample.tier);
    inputs.garments.push(url);
    options.garments = [{ item, scene: await load(url), authoredFit: url === item.revisionUrl }];
    if (sample.corset) {
      choice.wardrobeTrial = { set: sample.corset, shirt: 'none', waist: 'tucked' };
      inputs.corset = api.corsetModelUrl(choice.wardrobeTrial, sample.tier);
      options.corsetSource = { set: sample.corset, scene: await load(inputs.corset) };
    }
  }
  return { sample, actor, options, look: api.characterLook(choice), inputs };
}

async function defaultDesktopFixture(api) {
  const choice = { ...api.DEFAULT_CHARACTER, garments: { skirt: 'gothic-skirt-05' },
    wardrobeTrial: { set: 'gothic-05', shirt: 'none', waist: 'tucked' } };
  const look = api.characterLook(choice), kind = 'garage', villageKind = 'portrait';
  const preferredUrl = api.villagerModelUrl(look, kind, villageKind), sources = {};
  for (let iteration = 0; iteration < 12; iteration++) {
    const resolved = api.resolveWardrobePreview({ preferredUrl, look, kind, villageKind, sources });
    if (resolved.pendingUrls.length) {
      for (const path of resolved.pendingUrls) sources[path] = await load(path);
      continue;
    }
    if (!resolved.preview || resolved.unavailable) throw Error('Default desktop wardrobe preview could not resolve');
    const preview = resolved.preview;
    const ownerUrl = object => object && Object.entries(sources).find(([, scene]) => scene === object || scene.getObjectById(object.id) === object)?.[0];
    return {
      sample: { id: 'default-desktop:gothic-skirt-05+gothic-05', oracle: 'current-runtime' },
      actor: preview.scene, look: preview.look,
      inputs: { kind, villageKind, preferredUrl, actor: ownerUrl(preview.scene),
        garments: preview.garments.map(g => ownerUrl(g.scene)), corset: ownerUrl(preview.corsetScene),
        suppliedBodyDonor: ownerUrl(preview.garmentBody), resolvedAssetUrls: Object.keys(sources) },
      options: { female: look.female, animateFace: true, bag: false, wetEyes: true,
        fitted: api.usesFittedAnimation(look), garments: preview.garments, garmentBody: preview.garmentBody,
        removedClothing: [...look.removedClothing].sort(),
        corsetSource: preview.corsetScene && preview.corsetSet ? { set: preview.corsetSet, scene: preview.corsetScene } : undefined },
    };
  }
  throw Error('Default desktop resolution exceeded the bounded request loop');
}

function run(api, f, { clear = false, count = false } = {}) {
  if (clear) api.wardrobeFitCache.clear();
  const before = api.wardrobeFitCache.stats;
  activeAudit = count ? new Audit() : null; globalThis.__avenCharacterPreparationAudit = activeAudit;
  const start = mode === 'timings' ? performance.now() : 0;
  let model;
  try {
    model = api.prepareVillager(f.actor, f.options);
    const prepared = mode === 'timings' ? performance.now() : 0;
    if (activeAudit) activeAudit.phase = 'apply';
    api.applyVillagerLook(model, f.look);
    const applied = mode === 'timings' ? performance.now() : 0;
    const signature = geometryDigest(model.root);
    if (signature !== f.sample.sha256) throw Error(`${f.sample.id}: geometry oracle mismatch`);
    const after = api.wardrobeFitCache.stats;
    return { ...(mode === 'timings' ? { prepareMs: prepared - start, firstApplyMs: applied - prepared, totalMs: applied - start } : {}),
      ...(f.sample.oracle === 'current-runtime' ? { currentRuntimeOracleMatch: true } : { acceptedGeometryMatch: true }), geometrySha256: signature,
      cache: { before, after, hits: after.hits - before.hits, misses: after.misses - before.misses },
      ...(activeAudit ? { work: activeAudit.result() } : {}) };
  } finally {
    if (activeAudit) activeAudit.phase = 'dispose';
    model?.dispose(); activeAudit = null; globalThis.__avenCharacterPreparationAudit = null;
  }
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length / 2;
  return { samples: sorted.length, min: sorted[0], median: Number.isInteger(middle) ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[Math.floor(middle)],
    max: sorted.at(-1), mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, values };
}

const runtimeSourceChanges = [...new Set([
  ...execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'frontend/src'], { cwd: repo, encoding: 'utf8' }).trim().split('\n'),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'frontend/src'], { cwd: repo, encoding: 'utf8' }).trim().split('\n'),
])].filter(path => /\.(tsx?|jsx?|json)$/.test(path)).sort();
const report = { metadata: {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  runtimeSourceChanges,
  mode, node: process.version, cpu: os.cpus()[0]?.model, acceptedGeometryCommit: approved.acceptedCommit,
  auditToolSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
  acceptedFixtureSha256: createHash('sha256').update(approvedText).digest('hex'),
  coldDefinition: mode === 'counts' ? 'First preparation of each case in the recorded order after clearing only wardrobeFitCache; existing module/source caches remain in-process and may perform first-use setup.'
    : 'After two preparation warmups, clear only wardrobeFitCache before each measured cold run.',
  warmDefinition: 'Immediate repeat of the preceding cold look; all existing caches remain available.',
  scope: mode === 'counts' ? 'Untimed, instrumented Node CPU work counts; copy bytes are cumulative traffic, not retained/peak memory. Exact duplicate keys distinguish signed zero, exclude nonfinite/unsupported input getters, and are scoped to each warp closure; bounded tracking flags truncation. Repeatable rays are potential avoided work, not measured time savings. No GPU/FPS claims.'
    : 'Uninstrumented synchronous Node CPU preparation and first application; identical preloaded GLB geometry; cache-cold versus immediate repeat. Warmup and signature checks excluded from intervals. No GPU/FPS claims.',
  sourceHashes, sourceHashScope: 'Individually hashes transformed counting modules; HEAD plus runtimeSourceChanges identifies the working source state. Asset hashes identify full loaded GLB files; the CPU loader excludes texture decoding. Memo buffers are cumulative allocations/largest single table, not measured peak heap.',
  fixtureScope: 'The accepted garage fixtures explicitly use garage base actors; normal desktop GarageDriver uses a portrait base actor with garage garment/corset tiers. These fixture timings/counts are not a browser-route benchmark. The optional default desktop case is separately resolved through the current production resolver.',
  assetInputs, selectedCases: scenarios.map(c => c.id), pressureCycles, includeDefaultDesktop,
}, cases: [], cachePressure: [], defaultDesktop: [] };
const viteOptions = { root: frontend, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
  logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } };
const vite = await createServer({ ...viteOptions,
  plugins: mode === 'counts' ? [{ name: 'character-preparation-counts', enforce: 'pre', transform: instrument }] : [] });
const modules = ['villagerModel', 'characterCatalog', 'wardrobe', 'wardrobeGarments', 'wardrobeFitCache', 'wardrobePreviewAssets', 'animationFit'];
const apiFor = async server => Object.assign({}, ...await Promise.all(modules.map(name => server.ssrLoadModule('/src/game/characters/' + name + '.ts'))));
const save = () => output ? writeFile(output, JSON.stringify(report, null, 2) + '\n') : Promise.resolve();
try {
  let desktopOracle;
  if (includeDefaultDesktop) {
    const cleanServer = await createServer(viteOptions);
    try {
      const cleanApi = await apiFor(cleanServer), cleanFixture = await defaultDesktopFixture(cleanApi);
      cleanApi.wardrobeFitCache.clear();
      const model = cleanApi.prepareVillager(cleanFixture.actor, cleanFixture.options);
      try {
        cleanApi.applyVillagerLook(model, cleanFixture.look);
        desktopOracle = { kind: 'Current working runtime, separate Vite module context with no diagnostic transforms or prototype hooks',
          head: report.metadata.head, runtimeSourceChanges, sha256: geometryDigest(model.root), inputs: cleanFixture.inputs,
          acceptance: 'Current working-code instrumentation oracle only; use source hashes/changes for provenance. Not added to the accepted 0e81afe fixture set or a visual approval.' };
      } finally { model.dispose(); }
    } finally { await cleanServer.close(); }
  }
  installCountHooks();
  const api = await apiFor(vite);
  const fixtures = [];
  for (const sample of scenarios) fixtures.push(await fixture(api, sample));
  for (const f of fixtures) {
    if (mode === 'counts') {
      report.cases.push({ id: f.sample.id, inputs: f.inputs, cold: run(api, f, { clear: true, count: true }), warm: run(api, f, { count: true }) });
    } else {
      run(api, f, { clear: true }); run(api, f);
      const cold = [], warm = [];
      for (let i = 0; i < samples; i++) { cold.push(run(api, f, { clear: true })); warm.push(run(api, f)); }
      const summary = runs => Object.fromEntries(['prepareMs', 'firstApplyMs', 'totalMs'].map(key => [key, distribution(runs.map(r => r[key]))]));
      report.cases.push({ id: f.sample.id, inputs: f.inputs, cold: summary(cold), warm: summary(warm), acceptedGeometryMatch: true, cache: warm.at(-1).cache });
    }
    console.error(`Verified ${f.sample.id} (${mode})`); await save();
  }
  api.wardrobeFitCache.clear();
  for (let cycle = 1; cycle <= pressureCycles; cycle++) for (const f of fixtures) {
    const row = run(api, f);
    report.cachePressure.push({ cycle, id: f.sample.id, ...row });
  }
  if (desktopOracle) {
    const desktop = await defaultDesktopFixture(api);
    if (JSON.stringify(desktop.inputs) !== JSON.stringify(desktopOracle.inputs)) throw Error('Production input resolution differs from the clean oracle');
    desktop.sample.sha256 = desktopOracle.sha256;
    report.defaultDesktop.push({ id: desktop.sample.id, inputs: desktop.inputs, oracle: desktopOracle,
      cold: run(api, desktop, { clear: true, count: true }), warm: run(api, desktop, { count: true }) });
    console.error(`Verified ${desktop.sample.id} against untouched current runtime`);
  }
  report.metadata.loadedSourceScenes = scenes.size;
  await save();
  if (!output) console.log(JSON.stringify(report, null, 2));
} finally {
  activeAudit = null; delete globalThis.__avenCharacterPreparationAudit;
  for (const restore of restores.reverse()) restore();
  await vite.close();
}
