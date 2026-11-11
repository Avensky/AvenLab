import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Vector3, Quaternion } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

// Use the shipped joint transforms without loading geometry or textures.
test('the door opens independently, entry keeps planted shoes stable, and seated controls preserve contact', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { prepareGarageCockpit, sampleCockpitMotion } = await vite.ssrLoadModule('/src/game/preview/garageCockpit.ts');
    const { sampleDriveOut } = await vite.ssrLoadModule('/src/game/preview/garageDriveMotion.ts');
    const { GARAGE_STATIONS } = await vite.ssrLoadModule('/src/game/preview/garageStations.ts');
    for (const gender of ['female', 'male']) for (const side of [-1, 1]) {
      const { scene: driver } = await new GLTFLoader().parseAsync(await readFile(`tests/fixtures/villager-${gender}-rig.json`, 'utf8'), '');
      driver.name = `garage-villager-${gender}`;
      const motion = new Group(), car = new Group(), stand = new Group(), tilt = new Group(), door = new Group();
      motion.add(car, stand); stand.position.set(side * 1.2, .023, -.4); stand.rotation.y = side * Math.PI / 2;
      stand.add(tilt); tilt.rotation.set(-.095, -.16, -.045); tilt.add(driver); car.add(door);
      const station = side < 0 ? GARAGE_STATIONS.ae86 : {
        ...GARAGE_STATIONS.ae86,
        rim: [Math.abs(GARAGE_STATIONS.ae86.rim[0]), ...GARAGE_STATIONS.ae86.rim.slice(1)],
        seat: [Math.abs(GARAGE_STATIONS.ae86.seat[0]), ...GARAGE_STATIONS.ae86.seat.slice(1)],
        pedals: [Math.abs(GARAGE_STATIONS.ae86.pedals[0]), ...GARAGE_STATIONS.ae86.pedals.slice(1)],
      };
      const position = name => driver.getObjectByName(name).getWorldPosition(new Vector3());
      const orientation = name => driver.getObjectByName(name).getWorldQuaternion(new Quaternion()).normalize();
      const feet = ['foot_l', 'foot_r'];
      const trailing = side < 0 ? 'foot_r' : 'foot_l';
      const leading = side < 0 ? 'foot_l' : 'foot_r';
      const starting = Object.fromEntries([...feet, 'hand_l', 'hand_r'].map(name => [name, position(name)]));
      const initialRotation = Object.fromEntries(feet.map(name => [name, orientation(name)]));
      const cabin = prepareGarageCockpit(car, [], { pivot: door, axis: 'y', open: side * 1.2, angle: 0 }, station)(driver, motion);
      assert(cabin);
      cabin.sample(null, 0, sampleDriveOut(1.2));
      assert.equal(door.rotation.y, side * 1.2);
      for (const [name, point] of Object.entries(starting)) assert(position(name).distanceTo(point) < .001, `${gender} ${name} stays put while the door opens`);
      cabin.sample(null, 0, sampleDriveOut(1.70));
      assert(position(trailing).distanceTo(starting[trailing]) < .025, 'supporting ankle stays planted');
      assert(orientation(trailing).angleTo(initialRotation[trailing]) < .001, 'supporting shoe does not swivel with the knee');
      assert(position(leading).y > starting[leading].y + .07, 'leading shoe rises over the sill');
      let previousFeet = initialRotation;
      let previousRoot = driver.getWorldQuaternion(new Quaternion());
      for (let frame = 0; frame <= 249; frame++) {
        cabin.sample(null, 0, sampleDriveOut(frame / 60));
        const rotation = driver.getWorldQuaternion(new Quaternion());
        if (frame) assert(rotation.angleTo(previousRoot) < .10, 'the torso turns smoothly into the forward seated pose');
        previousRoot = rotation;
        for (const foot of feet) {
          const rotation = orientation(foot);
          assert(rotation.angleTo(previousFeet[foot]) < .10, `${gender} ${foot} turns smoothly`);
          previousFeet[foot] = rotation;
        }
      }
      assert.equal(door.rotation.y, 0);
      const forward = new Vector3(0, 0, 1).applyQuaternion(driver.getWorldQuaternion(new Quaternion()));
      assert(forward.z > .99, 'the seated driver faces forward');
      const feetAtRest = feet.map(position);
      for (const ankle of feetAtRest) assert(ankle.z > station.pedals[2] + .026, 'ankles reach farther into the pedal box');
      for (const side of ['l', 'r']) {
        const wrist = position(`hand_${side}`);
        assert(position(`lowerarm_${side}`).y < wrist.y - .04, 'elbows rest lower than the wheel grip');
        assert(position(`middle_01_${side}`).distanceTo(new Vector3(...station.rim)) < station.radius + .07, 'knuckles stay at the wheel rim');
      }

      cabin.sample('drive-brake', .5);
      assert(position('foot_r').x > feetAtRest[1].x + .035, 'the right foot moves inward onto the brake');
      cabin.sample('drive-gas', .5);
      assert(position('foot_r').z > feetAtRest[1].z + .04, 'the right foot reaches forward onto the gas');
      cabin.sample('drive-clutch', .5);
      assert(position('foot_l').z > feetAtRest[0].z + .04, 'the left foot reaches forward onto the clutch');
      cabin.sample('drive-honk', .49);
      const padAxis = new Vector3(0, station.tilt, -1).normalize();
      assert(position('thumb_03_r').sub(new Vector3(...station.rim)).dot(padAxis) > .02, 'thumb remains on the driver side of the horn pad');
      cabin.stop();
      assert(driver.position.length() < 1e-9, 'exit restores the standing root');
    }
    const drift = phase => sampleCockpitMotion('drive-drift', phase);
    assert(drift(.25).handControl === 'shift' && drift(.25).clutch === 1);
    assert(drift(.60).handControl === 'handbrake' && drift(.60).actuate === 1);
    assert(drift(.80).steering < 0 && drift(.80).throttle === 1);
    assert.equal(drift(1).throttle, 0);
    assert.equal(sampleCockpitMotion('drive-wipers', .5).handControl, 'wipers');
    assert.equal(sampleCockpitMotion('drive-cruise', .5).handControl, 'cruise');
  } finally { await vite.close(); }
});
