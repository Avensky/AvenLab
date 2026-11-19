import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { Box3 } from 'three';
import vehicleCatalog from '../public/models/vehicles/catalog.json' with { type: 'json' };
import { loadVehicleGeometry } from './load-vehicle-geometry.mjs';

const frontend = new URL('../', import.meta.url), publicRoot = new URL('public/', frontend);
const models = process.argv.slice(2);
if (!models.length) models.push('brz', 'ae86');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function summarize(root) {
  let meshes = 0, drawRanges = 0, triangles = 0, vertices = 0;
  root.traverseVisible(object => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    vertices += geometry.attributes.position?.count ?? 0;
    const length = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    const start = geometry.drawRange.start, end = Math.min(length, start + geometry.drawRange.count);
    if (Array.isArray(object.material)) {
      for (const group of geometry.groups) {
        const count = Math.max(0, Math.min(end, group.start + group.count) - Math.max(start, group.start));
        if (object.material[group.materialIndex]?.visible && count) { drawRanges++; triangles += count / 3; }
      }
    } else if (object.material.visible && end > start) { drawRanges++; triangles += (end - start) / 3; }
  });
  return { meshes, drawRanges, triangles, vertices };
}

// Middleware-only SSR resolves the same TypeScript helpers as the app, without
// opening a listening port or a browser. No build assets or sources are written.
const vite = await createServer({ root: fileURLToPath(frontend), configFile: false, appType: 'custom', logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const load = name => vite.ssrLoadModule('/src/' + name);
  const { prepareVehicleVisual } = await load('vehicles/tools/vehicleMaterials.ts');
  const { batchStaticVehicleMeshes } = await load('vehicles/tools/staticVehicleBatches.ts');
  const { GARAGE_STATIONS } = await load('game/preview/garageStations.ts');
  const { splitAe86DriverDoor } = await load('game/preview/ae86DriverDoor.ts');
  const { splitGarageSteering } = await load('game/preview/splitGarageSteering.ts');
  const { splitTimecarDriverDoor } = await load('game/preview/timecarDriverDoor.ts');
  const { createVehiclePartRig } = await load('game/preview/vehiclePartRig.ts');
  const results = [];
  for (const model of models) {
    const source = vehicleCatalog.assets[model]?.model;
    if (!source) { results.push({ model, skipped: 'Unknown catalog model' }); continue; }
    const path = new URL(source.slice(1), publicRoot);
    const bytes = await readFile(path).catch(() => null);
    if (bytes?.toString('ascii', 0, 4) !== 'glTF') {
      results.push({ model, source, skipped: 'Real asset unavailable; materialize the source with Git LFS' }); continue;
    }
    const { scene, animations } = await loadVehicleGeometry(bytes);
    const prepared = prepareVehicleVisual(scene, model);
    const door = model === 'ae86' ? splitAe86DriverDoor(prepared.root) : undefined;
    const steering = splitGarageSteering(prepared.root, model);
    const gullwing = model === 'timecar' ? splitTimecarDriverDoor(prepared.root) : undefined;
    const rig = createVehiclePartRig(prepared.root, model);
    if (gullwing) rig.push(gullwing.hinge);
    const station = GARAGE_STATIONS[model];
    const options = { protectedObjects: rig.map(part => part.pivot), animations,
      protectedNames: station?.kind === 'wheel' ? station.steeringParts : undefined };
    const before = summarize(prepared.root);
    const originalBounds = new Box3().setFromObject(prepared.root, true);
    const start = performance.now(), batch = batchStaticVehicleMeshes(prepared.root, options);
    const coldMilliseconds = performance.now() - start;
    const after = summarize(prepared.root), bounds = new Box3().setFromObject(prepared.root, true);
    const boundsError = Math.max(originalBounds.min.distanceTo(bounds.min), originalBounds.max.distanceTo(bounds.max));
    if (after.triangles !== before.triangles || boundsError > 1e-4) throw Error(`${model}: geometry/bounds changed`);
    const details = [];
    prepared.root.traverse(object => {
      if (object.userData.staticVehicleParts) details.push({ material: object.material.name,
        sourceMeshes: object.userData.staticVehicleParts.length, outputDrawRanges: 1 });
    });
    const stats = { ...batch.stats };
    batch.dispose();
    if (JSON.stringify(summarize(prepared.root)) !== JSON.stringify(before)) throw Error(`${model}: cleanup failed to restore source meshes`);
    gullwing?.dispose(); steering?.(); door?.(); prepared.dispose();
    if (hash(await readFile(path)) !== hash(bytes)) throw Error(`${model}: source bytes changed`);
    results.push({ model, source, sourceBytes: bytes.length, sha256: hash(bytes), before, after,
      savedDrawRanges: stats.savedDrawRanges, reductionPercent: 100 * stats.savedDrawRanges / before.drawRanges,
      coldMilliseconds, derivedGeometryBytes: stats.geometryBytes, boundsError, details });
  }
  console.log(JSON.stringify({ note: 'Headless source geometry and production rig preparation. Image uploads are mocked; draw ranges are base-pass estimates, not measured GPU calls/FPS. Cold timings are local diagnostics, not a browser benchmark.', results }, null, 2));
} finally { await vite.close(); }
