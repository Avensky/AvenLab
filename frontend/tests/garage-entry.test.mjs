import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Vector3, Quaternion } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

// Rest transforms from the shipped 88-joint rigs; no GPU or textures required.
test('male entrance turns through the front, retains the seated pose, and leaves female entry unchanged', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  const reference = JSON.parse(await readFile('tests/fixtures/cockpit-entry-reference.json', 'utf8'));
  try {
    const { prepareGarageCockpit } = await vite.ssrLoadModule('/src/game/preview/garageCockpit.ts');
    const { sampleDriveOut } = await vite.ssrLoadModule('/src/game/preview/garageDriveMotion.ts');
    const { GARAGE_STATIONS } = await vite.ssrLoadModule('/src/game/preview/garageStations.ts');
    for (const gender of ['female', 'male']) for (const side of [-1, 1]) {
      const { scene: driver } = await new GLTFLoader().parseAsync(await readFile(`tests/fixtures/villager-${gender}-rig.json`, 'utf8'), '');
      driver.name = `garage-villager-${gender}`;
      const motion = new Group(), car = new Group(), stand = new Group(), tilt = new Group(), door = new Group();
      motion.add(car, stand); stand.position.set(side * 1.2, .023, -.4); stand.rotation.y = side * Math.PI / 2;
      stand.add(tilt); tilt.rotation.set(-.095, -.16, -.045); tilt.add(driver); car.add(door);
      const station = side < 0 ? GARAGE_STATIONS.ae86 : {
        ...GARAGE_STATIONS.ae86, rim: [Math.abs(GARAGE_STATIONS.ae86.rim[0]), ...GARAGE_STATIONS.ae86.rim.slice(1)],
        seat: [Math.abs(GARAGE_STATIONS.ae86.seat[0]), ...GARAGE_STATIONS.ae86.seat.slice(1)],
      };
      const cabin = prepareGarageCockpit(car, [], { pivot: door, axis: 'y', open: side * 1.2, angle: 0 }, station)(driver, motion);
      assert(cabin);
      let previous;
      for (let frame = 0; frame <= 30; frame++) {
        cabin.sample(null, 0, sampleDriveOut(frame / 60));
        const rotation = driver.getWorldQuaternion(new Quaternion());
        if (previous) assert(rotation.angleTo(previous) < .25, 'opening turn stays continuous');
        previous = rotation;
      }
      cabin.sample(null, 0, sampleDriveOut(.24));
      const forward = new Vector3(0, 0, 1).applyQuaternion(driver.getWorldQuaternion(new Quaternion()));
      if (gender === 'male') assert(forward.z > .99, `male ${side < 0 ? 'left' : 'right'} door turn faces the front`);
      if (side < 0) {
        for (const row of gender === 'female' ? reference.female : [reference.maleSeated]) {
          cabin.sample(null, 0, sampleDriveOut(row.seconds));
          for (const name of ['thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r']) {
            const position = driver.getObjectByName(name).getWorldPosition(new Vector3());
            assert(position.distanceTo(new Vector3(...row[name])) < 1e-7, `${gender} ${name} at ${row.seconds}s preserves approved position`);
          }
          if (gender === 'female') {
            const facing = new Vector3(0, 0, 1).applyQuaternion(driver.getWorldQuaternion(new Quaternion()));
            assert(facing.distanceTo(new Vector3(...row.forward)) < .0001, 'female turn direction is unchanged');
          }
        }
      }
      cabin.stop();
      assert(driver.position.length() < 1e-9, 'exit restores the standing root');
    }
  } finally { await vite.close(); }
});
