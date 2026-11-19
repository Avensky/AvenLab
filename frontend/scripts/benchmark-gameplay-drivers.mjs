// Synthetic CPU update benchmark; this is not a renderer/FPS benchmark.
import { performance } from 'node:perf_hooks';
import { PerspectiveCamera } from 'three';
import { createDriverFleet } from '../src/vehicles/drivers/driverFleet.ts';

const camera = new PerspectiveCamera(60, 16 / 9, .1, 5000);
camera.position.set(0, 1, 8); camera.lookAt(0, .6, 0); camera.updateMatrixWorld();
const base = { body: 'female', skin: '#d49673', hair: '#4a251b', hairStyle: 'long', headwear: 'hat', headwearColor: '#eed29a', top: '#6f203f', bottom: '#172b4a' };
const scenarios = [];
for (const [count, culled] of [[16, false], [64, false], [128, false], [128, true]]) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: String(i), vehicle_id: i % 2 ? 'brz' : 'ae86' }));
  const poses = rows.map((_, i) => ({ position: [(i % 16 - 7.5) * .08, 0, culled ? -3000 : -Math.floor(i / 16) * .10], rotation: [0, 0, 0, 1] }));
  const looks = rows.map((_, i) => ({ ...base, body: ['female', 'male', 'neutral'][i % 3], hairStyle: ['long', 'short', 'none'][i % 3], headwear: i % 2 ? 'hat' : 'none' }));
  const fleet = createDriverFleet(rows, { pose: id => poses[Number(id)], appearance: id => looks[Number(id)], offset: (_car, out) => out.set(0, 0, 0) });
  const samples = [];
  for (let frame = 0; frame < 2400; frame++) {
    for (const pose of poses) pose.position[0] += .00001;
    const start = performance.now();
    fleet.update(camera, 900, frame / 60, false);
    const elapsed = performance.now() - start;
    if (frame >= 400) samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  scenarios.push({ occupants: count, culled, measuredFrames: samples.length, medianMs: samples[Math.floor(samples.length * .5)], p95Ms: samples[Math.floor(samples.length * .95)], maxMs: samples.at(-1), draws: Object.values(fleet.batches).filter(mesh => mesh.count).length, visibleDrivers: fleet.batches.skin.count });
  fleet.dispose();
}
console.log(JSON.stringify({ method: 'Node CPU only; warmed pure driver update, prebuilt pose fixtures; moving transforms; no renderer, network interpolation, React, GPU, or GLB work', scenarios }, null, 2));
