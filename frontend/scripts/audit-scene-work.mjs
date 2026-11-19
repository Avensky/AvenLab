// Deterministic scene-work counts, not a CPU/GPU/FPS benchmark.
// node scripts/audit-scene-work.mjs --output ../performance/reports/scene-work.json
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { DirectionalLight, Frustum, Group, Matrix4, Object3D, PerspectiveCamera, PointLight, REVISION, Scene, SpotLight, Vector3 } from 'three';
import { harborCanal } from '../src/worldBuilder/generation/harborCanal.ts';
import { coastalMap } from '../src/worldBuilder/generation/coastalMap.ts';
import { harborExchange } from '../src/worldBuilder/generation/harborExchange.ts';
import { kitAsset } from '../src/worldBuilder/mapKit/catalog.ts';
import { collectCityShadowFrusta } from '../src/world/cityShadows.ts';
import { gatePlanarReflectionCapture } from '../src/game/preview/garageFloorEffects.ts';

const frontend = fileURLToPath(new URL('../', import.meta.url)), repo = resolve(frontend, '..');
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const output = option('--output'), evidence = {};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = new Map();
async function source(path) {
  if (!sources.has(path)) {
    const text = await readFile(resolve(frontend, path), 'utf8');
    sources.set(path, ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
    evidence[path] = { sha256: sha256(text) };
  }
  return sources.get(path);
}
function findAll(node, predicate) {
  const result = [];
  function visit(child) { if (predicate(child)) result.push(child); ts.forEachChild(child, visit); }
  visit(node); return result;
}
function compile(expression, names) {
  const code = ts.transpileModule(`const value = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return new Function(...names, code + '\nreturn value;');
}
async function frameFactory(path, owner) {
  const file = await source(path);
  const functions = findAll(file, node => ts.isFunctionDeclaration(node) && node.name?.text === owner);
  assert.equal(functions.length, 1, `Find exactly one ${owner}`);
  const calls = findAll(functions[0], node => ts.isCallExpression(node) && node.expression.getText(file) === 'useFrame');
  assert.equal(calls.length, 1, `${owner}: audit the intended single frame callback`);
  const callback = calls[0].arguments[0], text = callback.getText(file);
  evidence[path][owner] = { line: file.getLineAndCharacterOfPosition(callback.getStart(file)).line + 1, callbackSha256: sha256(text) };
  let factory, names;
  const result = context => {
    names ??= Object.keys(context);
    assert.deepEqual(Object.keys(context), names, 'Frame fixture context stays stable');
    factory ??= compile(text, names);
    return factory(...names.map(name => context[name]));
  };
  result.sourceText = text;
  return result;
}

const garageFile = await source('src/world/props/harborGarage.ts');
const garageVariable = findAll(garageFile, node => ts.isVariableDeclaration(node) && node.name.getText(garageFile) === 'usesGarage')[0];
assert(garageVariable?.initializer);
const usesGarage = compile(garageVariable.initializer.getText(garageFile), [])();
function inventory(map, origin, seed) {
  const objects = map.authored_layout?.objects ?? [];
  return {
    id: map.map_id, origin, ...(seed === undefined ? {} : { seed }), objects: objects.length,
    kitPlacements: objects.filter(item => kitAsset(item.piece)).length,
    roadPlacements: objects.filter(item => item.road).length,
    autoRoadPlacements: objects.filter(item => item.road?.lod === 'auto').length,
    modelPlacementsAfterGarageReplacement: objects.filter(item => item.model || usesGarage(item.piece)).length,
    parkedVehiclePlacements: objects.filter(item => item.vehicle).length,
    buildingPlacements: objects.filter(item => item.piece === 'coastal-building').length,
    authoredRepeat: map.authored_layout?.repeat !== false, base: map.authored_layout?.base,
    layout: map.layout, declaredVisuals: map.visuals?.map(visual => ({ id: visual.id, asset: visual.asset })) ?? [],
  };
}
const generated = ['red', 'blue', 'fleet'].map((plan, index) => {
  const seed = 417 + index * 613;
  return { map: harborCanal(plan, seed), seed };
});
generated.push({ map: coastalMap(), seed: 1 });
generated.push({ map: { map_id: 'harbor_exchange', authored_layout: harborExchange(),
  layout: { kind: 'fixed_grid', origin: [0, 0], size: [1, 1] }, visuals: [] } });
const generatedMaps = generated.map(({ map, seed }) => inventory(map, 'Current generator, using committed build-script seed/default; not an installed/live snapshot', seed));
const catalog = JSON.parse(await readFile(resolve(frontend, 'src/store/selection/generated/maps.json'), 'utf8'));
const installedMaps = [];
for (const entry of catalog) {
  const path = `avenlab-server/src/assets/blocks/${entry.id}_colliders.json`;
  try {
    const bytes = await readFile(resolve(repo, path));
    installedMaps.push({ path, sha256: sha256(bytes), ...inventory(JSON.parse(bytes), 'Installed server document') });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    installedMaps.push({ id: entry.id, path, available: false });
  }
}

const kitFrame = await frameFactory('src/worldBuilder/mapKit/KitMesh.tsx', 'KitMesh');
const roadFrame = await frameFactory('src/worldBuilder/roads/RoadMeshes.tsx', 'RoadModel');
const modelFrame = await frameFactory('src/worldBuilder/models/ModelMeshes.tsx', 'ModelInstances');
const buildingFrame = await frameFactory('src/world/props/HarborStructures.tsx', 'HarborBuildingLods');
const cityFrame = await frameFactory('src/world/CityStreaming.tsx', 'PreparedCityAsset');
await source('src/world/cityShadows.ts');
await source('src/game/preview/garageFloorEffects.ts');
const harbor = generated[2].map.authored_layout.objects;

function kitWork(frames, mode = {}) {
  const scene = new Scene();
  let parent = scene;
  for (const name of ['city-scene', 'city-chunk', 'chunk-position', 'authored-world']) {
    const group = new Group(); group.name = name; parent.add(group); parent = group;
  }
  const counts = { callbacks: 0, distanceQueries: 0, updateWorldMatrixCalls: 0, localMatrixComposes: 0, statePublications: 0 };
  const callbacks = harbor.filter(item => kitAsset(item.piece)).map(item => {
    const placement = new Group(), group = new Group(), asset = kitAsset(item.piece);
    placement.position.fromArray(item.position); placement.scale.fromArray(item.size);
    placement.rotation.y = item.yaw * Math.PI / 180;
    parent.add(placement); placement.add(group);
    const convert = group.localToWorld;
    group.localToWorld = function (point) { counts.distanceQueries++; return convert.call(this, point); };
    return kitFrame({ group: { current: group }, forceDetail: Boolean(mode.forceDetail), collisionOnly: Boolean(mode.collisionOnly),
      point: new Vector3(), center: asset.bounds.min.map((value, axis) => (value + asset.bounds.max[axis]) / (2 * asset.size[axis])),
      item, last: { current: null }, startTransition: callback => callback(), setLevel: () => counts.statePublications++ });
  });
  scene.traverse(object => {
    const update = object.updateWorldMatrix, compose = object.updateMatrix;
    object.updateWorldMatrix = function (...args) { counts.updateWorldMatrixCalls++; return update.apply(this, args); };
    object.updateMatrix = function (...args) { counts.localMatrixComposes++; return compose.apply(this, args); };
  });
  const camera = new PerspectiveCamera(); camera.position.set(0, 1, 0);
  for (let frame = 0; frame < frames; frame++) for (const callback of callbacks) { counts.callbacks++; callback({ camera }); }
  return { frames, placements: callbacks.length, mode, counts,
    hierarchy: 'Synthetic minimal CityScene subtree: Scene + city-scene + city-chunk + chunk-position + authored-world + placement + KitMesh. Extra application ancestors and renderer work excluded.' };
}
function roadWork(frames, demand) {
  const group = new Group(), camera = new PerspectiveCamera(); camera.position.set(0, 1, 0);
  let autoLod = null, distanceQueries = 0, statePublications = 0;
  const original = group.getWorldPosition;
  group.getWorldPosition = function (point) { distanceQueries++; return original.call(this, point); };
  const context = { item: { road: { lod: 'auto' } }, collisionOnly: false, group: { current: group }, demand,
    autoLod, counter: { current: 0 }, center: new Vector3(), quality: 'balanced', setAutoLod: level => { autoLod = level; statePublications++; } };
  roadFrame(context)({ camera }); // Resolve initial LOD before the steady-window census.
  distanceQueries = 0; statePublications = 0;
  for (let frame = 0; frame < frames; frame++) roadFrame({ ...context, autoLod })({ camera });
  return { frames, demand, callbacks: frames, distanceQueries, statePublications, fixture: 'One synthetic auto road; current harbors have zero RoadModel placements.' };
}
function modelWork(frames, demand) {
  let full = [], pointAllocations = 0, scans = 0;
  class CountedVector3 extends Vector3 { constructor(...args) { super(...args); pointAllocations++; } }
  const root = new Group(), camera = new PerspectiveCamera(); camera.position.set(0, 1, 0);
  const original = root.worldToLocal;
  root.worldToLocal = function (point) { scans++; return original.call(this, point); };
  const items = harbor.filter(item => item.model || usesGarage(item.piece));
  const context = { root: { current: root }, collisionOnly: false, demand, frame: { current: 0 }, point: new Vector3(),
    detail: 'auto', quality: 'balanced', items, full, Vector3: CountedVector3, setFull: next => { full = next; } };
  for (let frame = 0; frame < frames; frame++) modelFrame({ ...context, full })({ camera });
  return { frames, demand, callbacks: frames, placements: items.length, scans, distanceQueries: scans * items.length, candidateVectorAllocations: pointAllocations };
}
function buildingWake() {
  assert(!/\binvalidate\b/.test(buildingFrame.sourceText), 'Revisit the wake finding if this callback acquires a follow-up invalidation');
  const camera = new PerspectiveCamera(); camera.position.set(0, 1, 0);
  const previous = { current: new Set() }, nextSample = { current: 0 };
  const callback = buildingFrame({ nextSample, previous, items: [{ id: 'building', position: [0, 0, 0], size: [20, 2, 20] }], setNear: () => {} });
  callback({ camera, clock: { elapsedTime: 0 } });
  assert(previous.current.has('building'));
  camera.position.x = 500;
  callback({ camera, clock: { elapsedTime: .1 } });
  const staleOnLastDemandFrame = previous.current.has('building');
  assert(staleOnLastDemandFrame, 'Existing timer gate skips a final demanded camera move inside the .25 s interval');
  callback({ camera, clock: { elapsedTime: .3 } });
  assert(!previous.current.has('building'));
  return { firstFrameSeconds: 0, cameraJumpFrameSeconds: .1, cameraJumpMeters: 500, remainsNearAfterJump: staleOnLastDemandFrame,
    correctedOnAnotherFrameAtSeconds: .3, followupInvalidationInCallback: false,
    scope: 'Existing HarborBuildingLods behavior under a single final demanded render; not a measured visible pop or frame time.' };
}
function cityWork(visuals) {
  const scene = new Scene(), camera = new PerspectiveCamera(60, 1, .1, 1000);
  for (let i = 0; i < 1000; i++) scene.add(new Group());
  const lights = [new DirectionalLight(), new SpotLight(), new PointLight()];
  for (const [index, light] of lights.entries()) {
    light.position.set(index * 10, 20, 10); light.castShadow = true; scene.add(light);
    if (light.target) scene.add(light.target);
  }
  const assets = Array.from({ length: visuals }, () => ({ group: new Group(), update: null }));
  for (const asset of assets) scene.add(asset.group);
  scene.updateMatrixWorld(true);
  const counts = { callbacks: 0, cameraUpdates: 0, cameraFrustumBuilds: 0, shadowCollections: 0, visibleNodeVisits: 0, lightShadowMatrixUpdates: 0 };
  const updateCamera = camera.updateMatrixWorld;
  camera.updateMatrixWorld = function (...args) { counts.cameraUpdates++; return updateCamera.apply(this, args); };
  const traverse = scene.traverseVisible;
  scene.traverseVisible = function (visit) { return traverse.call(this, object => { counts.visibleNodeVisits++; visit(object); }); };
  for (const light of lights) {
    const update = light.shadow.updateMatrices;
    light.shadow.updateMatrices = function (...args) { counts.lightShadowMatrixUpdates++; return update.apply(this, args); };
  }
  const delivered = [];
  for (const asset of assets) {
    const frustum = new Frustum(), projection = new Matrix4();
    const set = frustum.setFromProjectionMatrix;
    frustum.setFromProjectionMatrix = function (...args) { counts.cameraFrustumBuilds++; return set.apply(this, args); };
    asset.update = (_, view, shadows, volumes) => {
      assert(shadows);
      const encode = item => item.planes.map(plane => [...plane.normal.toArray(), plane.constant]);
      delivered.push({ view: encode(view), shadows: volumes.map(encode) });
    };
    counts.callbacks++;
    cityFrame({ asset, camera, projection, frustum, placements: [], shadows: true, scene, shadowFrusta: [],
      collectCityShadowFrusta: (...args) => { counts.shadowCollections++; return collectCityShadowFrusta(...args); } })();
  }
  for (const value of delivered) assert.deepEqual(value, delivered[0], 'Stationary inputs give each asset identical camera/shadow frusta');
  return { preparedVisuals: visuals, syntheticNonLightNodes: 1000, shadowLights: 3, shadowFaces: delivered[0].shadows.length, counts,
    equalFrustaAcrossVisuals: true, scope: 'One frame with explicit synthetic scene size; no claim that a currently deployed map has this visual/node count. Shadows-off omits every shadow collection.' };
}
function reflectionWork({ name, fps, frames, floorRate, mirrorRate, timed = true }) {
  const scene = new Scene(), camera = new PerspectiveCamera(); camera.position.set(0, 3, 8); camera.updateMatrixWorld();
  let now = 0;
  const captures = { floor: 0, wall: 0 }, reflectors = [];
  for (const [label, rate] of [['floor', floorRate], ['wall', mirrorRate]]) {
    if (!rate) continue;
    const reflector = new Object3D();
    if (label === 'floor') reflector.rotation.x = -Math.PI / 2;
    scene.add(reflector);
    reflector.onBeforeRender = () => { captures[label]++; };
    gatePlanarReflectionCapture(reflector, () => timed ? now : undefined, 1 / rate);
    reflectors.push(reflector);
  }
  scene.updateMatrixWorld(true);
  let maxCapturesPerFrame = 0;
  for (let frame = 0; frame < frames; frame++) {
    now = frame / fps;
    const before = captures.floor + captures.wall;
    for (const reflector of reflectors) reflector.onBeforeRender({}, scene, camera);
    maxCapturesPerFrame = Math.max(maxCapturesPerFrame, captures.floor + captures.wall - before);
  }
  if (timed) assert(maxCapturesPerFrame <= 1, 'Production guard allows at most one timed planar capture per scene/frame');
  return { name, inputRenderFrames: frames, syntheticFps: fps, timed, configuredRates: { floor: floorRate, wall: mirrorRate }, captures, maxCapturesPerFrame,
    scope: 'Both planes front-facing, floor submitted first, stationary inputs, original capture replaced with a counter; actual render passes, pixels, GPU time and occlusion excluded.' };
}
const canvas = await source('src/FullCanvas.tsx');
const demandNode = findAll(canvas, node => ts.isVariableDeclaration(node) && node.name.getText(canvas) === 'demand')[0];
const loopNode = findAll(canvas, node => ts.isJsxAttribute(node) && node.name.getText(canvas) === 'frameloop')[0];
assert(demandNode?.initializer && loopNode?.initializer && ts.isJsxExpression(loopNode.initializer));
const demandFor = compile(demandNode.initializer.getText(canvas), ['authoring', 'paused', 'preview', 'compact', 'reducedMotion']);
const loopFor = compile(loopNode.initializer.expression.getText(canvas), ['covered', 'demand']);
const clockElement = findAll(canvas, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(canvas) === 'PreviewFrameClock');
assert.equal(clockElement.length, 1);
const clockBranch = clockElement[0].parent;
assert(ts.isBinaryExpression(clockBranch) && clockBranch.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken);
const clockFor = compile(clockBranch.left.getText(canvas), ['compact', 'covered', 'paused', 'authoring', 'reducedMotion']);
const previewPolicies = [
  ['desktop-active', false, false, true, false, false, false],
  ['queue-paused', false, true, true, false, false, false],
  ['compact-active', false, false, true, true, false, false],
  ['preference-reduced-motion', false, false, true, false, true, false],
  ['covered-main', false, false, true, false, false, true],
  ['authoring', true, false, false, false, false, false],
].map(([name, authoring, paused, preview, compact, reducedMotion, covered]) => ({ name,
  frameloop: loopFor(covered, demandFor(authoring, paused, preview, compact, reducedMotion)),
  compactClockEnabled: clockFor(compact, covered, paused, authoring, reducedMotion),
}));
assert.deepEqual(previewPolicies.map(item => item.frameloop), ['always', 'demand', 'demand', 'demand', 'never', 'demand']);
assert.equal(previewPolicies.filter(item => item.compactClockEnabled).length, 1);
const renderSettings = await source('src/store/presentation/renderSettingsStore.ts');
const presets = Object.fromEntries(['BASELINE_SETTINGS', 'LOW_DETAIL'].map(name => {
  const variable = findAll(renderSettings, node => ts.isVariableDeclaration(node) && node.name.getText(renderSettings) === name)[0];
  assert(variable?.initializer);
  const value = compile(variable.initializer.getText(renderSettings), [])();
  return [name, { environmentMode: value.environmentMode, cityQuality: value.cityQuality, shadows: value.shadows }];
}));

const report = {
  metadata: {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), node: process.version,
    threeRevision: REVISION, typescript: ts.version, auditScriptSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    method: 'Current TypeScript AST extracts production useFrame callbacks; dependencies are explicit Three-only fixtures. Actual shared shadow/reflection helpers are called directly. Counts/assertions only, with no React mount, GLB load, WebGL, CPU timing or FPS claim.',
    scope: 'Counts describe normal visual authored-layout mode. Collision-only/force-detail gates are exercised separately. Generated documents are distinct from unavailable installed documents/live server snapshots.',
  },
  maps: { generated: generatedMaps, installed: installedMaps, renderPresets: presets, livePersistedSettings: 'Unknown; no signed-in browser or running renderer inspected.' },
  lod: { kit: [kitWork(60), kitWork(60, { collisionOnly: true }), kitWork(60, { forceDetail: true })],
    roads: [roadWork(60, false), roadWork(60, true)], models: [modelWork(60, false), modelWork(60, true)], buildingDemandWake: buildingWake() },
  sharedCityFrameWork: [1, 2, 4].map(cityWork),
  preview: { policies: previewPolicies, reflections: [
    { name: 'desktop-floor', fps: 60, frames: 120, floorRate: 24 },
    { name: 'compact-floor', fps: 30, frames: 60, floorRate: 15 },
    { name: 'desktop-fitting-floor-and-wall', fps: 60, frames: 120, floorRate: 12, mirrorRate: 24 },
    { name: 'reduced-motion-one-demanded-frame', fps: 60, frames: 1, floorRate: 12, mirrorRate: 24, timed: false },
    { name: 'settled-demand-no-frame', fps: 60, frames: 0, floorRate: 12, mirrorRate: 24 },
  ].map(reflectionWork) },
  evidence,
};
assert.equal(report.lod.kit[0].counts.distanceQueries, report.lod.kit[0].placements * 60);
assert.equal(report.lod.kit[1].counts.distanceQueries, 0);
assert.equal(report.lod.kit[2].counts.distanceQueries, 0);
assert.equal(report.lod.roads[0].distanceQueries, 3);
assert.equal(report.lod.roads[1].distanceQueries, 60);
assert.equal(report.lod.models[0].scans, 4);
assert.equal(report.lod.models[1].scans, 60);
if (output) { await mkdir(dirname(resolve(output)), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(output ? { output: resolve(output), generatedMaps, kit: report.lod.kit[0].counts,
  models: report.lod.models[0], cityFourVisuals: report.sharedCityFrameWork[2].counts,
  reflections: report.preview.reflections.map(({ name, captures }) => ({ name, captures })), installedMapsAvailable: installedMaps.filter(item => item.available !== false).length } : report, null, 2));
