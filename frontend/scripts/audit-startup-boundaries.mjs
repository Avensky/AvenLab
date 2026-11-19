// Inspect the emitted production graph without changing entry points or writing a build.
// node scripts/audit-startup-boundaries.mjs --output ../performance/reports/startup-boundaries.json
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const frontend = fileURLToPath(new URL('../', import.meta.url)), repo = resolve(frontend, '..');
const at = process.argv.indexOf('--output'), outputPath = at < 0 ? undefined : process.argv[at + 1];
if (!outputPath) throw Error('Use --output <report.json>');
const display = id => id.startsWith(repo + '/') ? relative(repo, id) : id.replaceAll('\0', '<virtual>');
const hash = data => createHash('sha256').update(data).digest('hex');
const graph = new Map();
const result = await build({ root: frontend, logLevel: 'warn', plugins: [{
  name: 'audit-production-import-boundaries',
  generateBundle() {
    for (const id of this.getModuleIds()) {
      const info = this.getModuleInfo(id);
      if (info) graph.set(id, { imports: [...info.importedIds], dynamicImports: [...info.dynamicallyImportedIds] });
    }
  },
}], build: { write: false, copyPublicDir: false, manifest: true } });
const bundles = Array.isArray(result) ? result : [result];
const emitted = bundles.flatMap(bundle => bundle.output ?? []);
const chunks = new Map(emitted.filter(item => item.type === 'chunk').map(chunk => [chunk.fileName, chunk]));
const manifestAsset = emitted.find(item => item.type === 'asset' && item.fileName === '.vite/manifest.json');
if (!manifestAsset) throw Error('Production manifest was not emitted');
const manifest = JSON.parse(typeof manifestAsset.source === 'string' ? manifestAsset.source : Buffer.from(manifestAsset.source).toString());
const entry = chunks.get(manifest['index.html']?.file);
if (!entry) throw Error('Game entry chunk is missing');
const initial = new Set(), missingImports = new Set();
function visit(file) {
  if (initial.has(file)) return;
  const chunk = chunks.get(file);
  if (!chunk) { missingImports.add(file); return; }
  initial.add(file);
  for (const imported of chunk.imports) visit(imported);
}
visit(entry.fileName);
if (missingImports.size) throw Error('Unresolved static chunks: ' + [...missingImports].join(', '));

function category(path) {
  if (/^frontend\/src\/worldBuilder\/(panels|vehicleEditor)\//.test(path)) return 'worldBuilderPanelsAndVehicleEditor';
  if (/^frontend\/src\/worldBuilder\/state\/(builderActions|builderStore)\./.test(path)) return 'builderStateAndActions';
  if (path.startsWith('frontend/src/worldBuilder/')) return 'otherWorldBuilderSharedRuntime';
  if (path.startsWith('frontend/src/game/characters/')) return 'characterRuntimeAndUI';
  if (path.startsWith('frontend/src/performance/')) return 'performanceCaptureAndUI';
  if (path.startsWith('frontend/src/vehicles/')) return 'vehicleRuntime';
  if (path.startsWith('frontend/src/world/')) return 'worldRuntime';
  if (path.includes('/node_modules/')) return 'dependencies';
  return 'other';
}
const modules = [];
for (const chunk of chunks.values()) for (const [id, rendered] of Object.entries(chunk.modules)) {
  if (rendered.renderedLength <= 0) continue;
  modules.push({ id, path: display(id), chunk: chunk.fileName, initial: initial.has(chunk.fileName),
    category: category(display(id)), reportedRenderedLength: rendered.renderedLength });
}
const grouped = new Map();
for (const module of modules.filter(item => item.initial)) {
  const group = grouped.get(module.category) ?? { modules: 0, reportedRenderedLength: 0 };
  group.modules++; group.reportedRenderedLength += module.reportedRenderedLength;
  grouped.set(module.category, group);
}
function staticPath(target) {
  if (!entry.facadeModuleId) return null;
  const queue = [entry.facadeModuleId], previous = new Map([[entry.facadeModuleId, null]]);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === target) {
      const path = [];
      for (let part = id; part !== null; part = previous.get(part)) path.push(display(part));
      return path.reverse();
    }
    for (const dependency of graph.get(id)?.imports ?? []) if (!previous.has(dependency)) {
      previous.set(dependency, id); queue.push(dependency);
    }
  }
  return null;
}
const inspect = [
  'src/game/alpha/HeroSelection.tsx', 'src/game/heroes/HeroWorkshop.tsx',
  'src/worldBuilder/panels/WorldBuilderPanel.tsx', 'src/worldBuilder/state/builderStore.ts',
  'src/worldBuilder/state/builderActions.ts', 'src/performance/PerformanceOverlay.tsx',
  '../avenlab-server/src/assets/models/commercial-buildings.json',
  '../avenlab-server/src/assets/roads/road-colliders.json',
  '../avenlab-server/src/assets/models/placement-colliders.json',
];
const boundaries = inspect.map(path => {
  const id = resolve(frontend, path), rendered = modules.filter(module => module.id === id);
  const info = graph.get(id);
  const importerPaths = [];
  for (const [importer, links] of graph) if (links.imports.includes(id)) importerPaths.push(display(importer));
  return { path: display(id), emitted: rendered.length > 0, inInitialClosure: rendered.some(item => item.initial),
    chunks: rendered.map(item => item.chunk), reportedRenderedLength: rendered.reduce((sum, item) => sum + item.reportedRenderedLength, 0),
    staticImportPath: staticPath(id), staticImporters: importerPaths.sort(),
    dynamicDependencyCount: info?.dynamicImports.length ?? 0 };
});
const files = [...initial].sort().map(file => {
  const chunk = chunks.get(file);
  return { file, sha256: hash(chunk.code), bytes: Buffer.byteLength(chunk.code), gzipBytes: gzipSync(chunk.code).length,
    imports: chunk.imports, dynamicImports: chunk.dynamicImports };
});
const dataCatalogs = [];
for (const path of ['avenlab-server/src/assets/models/commercial-buildings.json',
  'avenlab-server/src/assets/roads/road-colliders.json', 'avenlab-server/src/assets/models/placement-colliders.json']) {
  const source = await readFile(resolve(repo, path)), data = JSON.parse(source);
  const compact = Buffer.from(JSON.stringify(data));
  const metadata = Buffer.from(JSON.stringify({ ...data, assets: data.assets.map(({ colliders, ...item }) => item) }));
  const colliders = data.assets.flatMap(asset => asset.colliders ?? []);
  dataCatalogs.push({ path, sourceSha256: hash(source), sourceBytes: source.length, records: data.assets.length,
    compactJsonBytes: compact.length, compactJsonGzipBytes: gzipSync(compact).length,
    colliderValueJsonBytes: data.assets.reduce((sum, item) => sum + Buffer.byteLength(JSON.stringify(item.colliders ?? [])), 0),
    colliderGroups: colliders.length,
    colliderVertices: colliders.reduce((sum, item) => sum + item.vertices.length, 0),
    colliderTriangles: colliders.reduce((sum, item) => sum + item.indices.length, 0),
    metadataWithoutCollidersJsonBytes: metadata.length, metadataWithoutCollidersGzipBytes: gzipSync(metadata).length,
    note: 'The metadata-only size is field attribution, not a working replacement: current proxy/collision renderers and editor consumers still need geometry. Model bounds are metadata; road bounds use collider vertices. It is not a measured bundle saving.' });
}
const report = {
  metadata: {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    runtimeSourceChanges: execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'frontend/src', 'packages'], { cwd: repo, encoding: 'utf8' })
      .trim().split('\n').filter(path => /\.(tsx?|jsx?|json)$/.test(path)),
    node: process.version,
    auditScriptSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    lockfileSha256: hash(await readFile(resolve(frontend, 'package-lock.json'))),
    viteConfigSha256: hash(await readFile(resolve(frontend, 'vite.config.ts'))),
    method: 'Production Vite build with current installed assets/config, write:false and public copying disabled. Walk only static output-chunk imports from index.html; SHA-256 and Node zlib default gzip for final chunk code. Sum separately compressed initial chunks. Dynamic chunks are excluded until statically reachable.',
    limits: 'Emitted code inclusion proves startup transfer/parse exposure, not runtime execution or measured network latency. Bundler reportedRenderedLength is attribution before final chunk compression, not additive gzip savings. Other world-builder modules include legitimate gameplay layout/rendering helpers; the whole directory is not classified as removable editor code. Static source paths explain imports, but chunk co-residence can also put modules into the initial closure.',
  },
  entry: entry.fileName,
  initialJavaScriptBytes: files.reduce((sum, item) => sum + item.bytes, 0),
  initialJavaScriptGzipBytes: files.reduce((sum, item) => sum + item.gzipBytes, 0),
  initialChunkCount: files.length,
  initialEmittedModuleCount: modules.filter(item => item.initial).length,
  files, categories: Object.fromEntries(grouped), boundaries, dataCatalogs,
  initialEditorModules: modules.filter(item => item.initial && ['worldBuilderPanelsAndVehicleEditor', 'builderStateAndActions'].includes(item.category))
    .sort((a, b) => b.reportedRenderedLength - a.reportedRenderedLength).map(({ id, ...item }) => item),
  largestInitialModules: modules.filter(item => item.initial).sort((a, b) => b.reportedRenderedLength - a.reportedRenderedLength)
    .slice(0, 30).map(({ id, ...item }) => item),
};
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, initialJavaScriptBytes: report.initialJavaScriptBytes,
  initialJavaScriptGzipBytes: report.initialJavaScriptGzipBytes, initialChunks: files.length,
  initialModules: report.initialEmittedModuleCount,
  inspected: boundaries.map(({ path, inInitialClosure }) => ({ path, inInitialClosure })) }));
