import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BoxGeometry, Group, Mesh, Vector3, Quaternion } from 'three';
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
    const { createVehiclePartRig } = await vite.ssrLoadModule('/src/game/preview/vehiclePartRig.ts');
    const shell = new Group();
    const panel = new Mesh(new BoxGeometry(.10, .5, 1.3));
    panel.name = 'Door_Front_Left';
    panel.position.set(.86, .77, 0);
    shell.add(panel);
    const trim = new Mesh(new BoxGeometry(.03, .035, .13));
    trim.name = 'Exterior_Handle';
    trim.position.set(.93, .87, -.38);
    shell.add(trim);
    const body = new Mesh(new BoxGeometry(1.5, 1, 4));
    shell.add(body);
    const [bound] = createVehiclePartRig(shell, 'brz');
    assert(bound?.handle, 'a separately named front panel gets a grip anchor');
    assert.equal(trim.parent, bound.pivot, 'the named handle mesh follows the door panel');
    assert(bound.handle.getWorldPosition(new Vector3()).distanceTo(trim.getWorldPosition(new Vector3())) < .0001);
    bound.pivot.rotation.y = bound.open;
    assert(trim.getWorldPosition(new Vector3()).x > 1, 'the selected hinge swings the handle outward');

    for (const side of [-1, 1]) {
      const { scene: driver } = await new GLTFLoader().parseAsync(await readFile('tests/fixtures/villager-female-rig.json', 'utf8'), '');
      const motion = new Group(), car = new Group(), stand = new Group(), pivot = new Group(), handle = new Group();
      motion.add(car, stand);
      stand.position.set(side * 1.18, 0, -.30);
      stand.rotation.y = side * Math.PI / 2;
      stand.add(driver);
      car.add(pivot);
      pivot.position.set(side * .88, .75, .48);
      pivot.add(handle);
      handle.position.set(0, .15, -.72);
      const station = { ...GARAGE_STATIONS.ae86, seat: [side * .397, .42, -.07], rim: [side * .397, .745, .365] };
      const cabin = prepareGarageCockpit(car, [], { pivot, handle, axis: 'y', open: -side * 1.1, angle: 0 }, station)(driver, motion);
      const knuckle = driver.getObjectByName(side > 0 ? 'middle_01_l' : 'middle_01_r');
      const contactError = () => knuckle.getWorldPosition(new Vector3()).distanceTo(handle.getWorldPosition(new Vector3()));
      cabin.sample(null, 0, sampleDriveOut(0));
      assert(contactError() > .25);
      cabin.sample(null, 0, sampleDriveOut(.47));
      assert.equal(pivot.rotation.y, 0);
      assert(contactError() < .085, `side ${side} reaches the closed exterior handle (${contactError()})`);
      cabin.sample(null, 0, sampleDriveOut(.74));
      assert(Math.abs(pivot.rotation.y) > .15);
      assert(contactError() < .085, `side ${side} tracks the handle as it swings (${contactError()})`);
      cabin.stop();
      assert.equal(pivot.rotation.y, 0);
    }
    const { cockpitTakesForWheel } = await vite.ssrLoadModule('/src/game/characters/cockpitEmotes.ts');
    assert(!cockpitTakesForWheel(true, false).some(take => take.id === 'drive-race-start'));
    assert(cockpitTakesForWheel(true, true).some(take => take.id === 'drive-race-start'));
    const race = phase => sampleCockpitMotion('drive-race-start', phase);
    assert(race(.20).lookYaw > .4 && race(.20).focus > .85, 'looks toward the rival');
    assert.equal(race(.25).clutch, 1, 'the clutch is down before the lever moves');
    assert(race(.29).firstGearGate > 0 && race(.29).firstGearForward === 0, 'selects the left gate before pushing forward');
    assert(race(.36).firstGearForward === 1 && race(.36).clutch === 1, 'first gear engages with the clutch down');
    assert(race(.44).clutch < 1 && race(.44).clutch > 0 && race(.44).throttle > 0, 'throttle and clutch release overlap');
    assert.equal(race(.49).throttle, 1);
    assert.equal(race(.49).lookYaw, 0, 'eyes return to the road for the throttle beat');
    assert.equal(race(.69).throttle + race(.69).brake, 0, 'foot transfers before the brake depresses');
    assert(race(.81).brake === 1 && race(.81).lookPitch > .25, 'braking pitches the head forward');
    assert.equal(race(1).brake + race(1).throttle + race(1).lookPitch, 0);

    for (const gender of ['female', 'male']) {
      const { scene: driver } = await new GLTFLoader().parseAsync(await readFile(`tests/fixtures/villager-${gender}-rig.json`, 'utf8'), '');
      const motion = new Group(), car = new Group(), stand = new Group();
      motion.add(car, stand);
      stand.add(driver);
      stand.position.set(1.2, .023, -.17);
      const cabin = prepareGarageCockpit(car, [], undefined, GARAGE_STATIONS.brz)(driver, motion);
      const stage = car.getObjectByName('garage-drive-pedals');
      const shifter = car.getObjectByName('garage-preview-shifter');
      const knob = shifter.children[0].children[1];
      const neutral = knob.getWorldPosition(new Vector3());
      const gas = stage.getObjectByName('garage-pedal-throttle');
      const brake = stage.getObjectByName('garage-pedal-brake');
      const clutchPedal = stage.getObjectByName('garage-pedal-clutch');
      const shoe = driver.getObjectByName('ball_r');
      const error = pedal => shoe.getWorldPosition(new Vector3()).distanceTo(pedal.children[1].localToWorld(new Vector3(0, 0, -.010)));
      cabin.sample('drive-race-start', .356);
      const selected = knob.getWorldPosition(new Vector3());
      assert(selected.x > neutral.x + .03 && selected.z > neutral.z + .03);
      assert(clutchPedal.rotation.x < -.35 && gas.rotation.x < .02);
      const grip = driver.getObjectByName('middle_01_r').getWorldPosition(new Vector3());
      assert(grip.distanceTo(selected) < .09, `${gender} shift hand contact (${grip.distanceTo(selected)})`);
      cabin.sample('drive-race-start', .49);
      assert(gas.rotation.x > .25 && brake.rotation.x === 0);
      assert(error(gas) < .048, `${gender} throttle contact (${error(gas)})`);
      cabin.sample('drive-race-start', .81);
      assert(gas.rotation.x === 0 && brake.rotation.x < -.30);
      assert(error(brake) < .048, `${gender} brake contact (${error(brake)})`);
      cabin.sample('drive-clutch', .48);
      assert(clutchPedal.rotation.x < -.35);
      cabin.sample(null, 0);
      assert.equal(brake.rotation.x + gas.rotation.x + clutchPedal.rotation.x, 0);
      cabin.stop();
      assert(!car.getObjectByName('garage-drive-pedals'));
      assert(!car.getObjectByName('garage-preview-shifter'));
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
