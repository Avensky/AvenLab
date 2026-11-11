import { Bone, Box3, Group, MathUtils, Mesh, Object3D, Quaternion, Vector3, type MeshPhysicalMaterial } from "three";
import { aimDriverJoint, aimLimb, alignJointNormal, driverArm, driverHand } from "../characters/garageEmotes";
import type { CockpitTake } from "../characters/cockpitEmotes";
import { driverFaceTargets } from "../characters/villagerFace";
import type { DriveOutPose } from "./garageDriveMotion";
import type { VehiclePartHinge } from "./vehiclePartRig";
import { GARAGE_STATIONS, garageControlTargets, garageStationCamera, type GarageStation } from "./garageStations";

import { cockpitWardrobe } from "../characters/cockpitWardrobe";
import { createGarageHorn } from "../../audio/garageHorn";

type TakeId = CockpitTake["id"];
export type CockpitPlayback = { hasDoor?: boolean; sample: (id: TakeId | null, phase: number, drive?: DriveOutPose) => void; stop: () => void };
export type GarageCockpit = (driver: Object3D) => CockpitPlayback | null;

const AXLE = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const ELBOW_HINGE = new Vector3(0, 0, -1);
const ROLL_START = .285;
const RACE_FACE = [-.21, -.28] as const;
// The short outer finger follows the outside edge of the rim with a shallower curl.
const RIM_FINGER_CURL = {
  index: [.28, .46, .65],
  middle: [.28, 1.1, .65],
  ring: [.2, .94, .86],
  pinky: [.2, .3, .42],
  thumb: [.3, .3, .3],
} as const;

export function sampleCockpitMotion(id: TakeId | null, phase: number) {
  const ease = (from: number, to: number) => MathUtils.smoothstep(phase, from, to);
  const mirrors = id === "086";
  const steeringTest = id === "199" ? 1 : id === "200" ? -1 : 0;
  const control = Boolean(id?.startsWith("drive-"));
  const reachControl = control ? ease(.12, .31) - ease(.67, .91) : 0;
  const actuate = control ? ease(.34, .47) - ease(.53, .65) : 0;
  const clutch = id === "drive-clutch" ? ease(.18, .32) - ease(.59, .79) : 0;
  const horn = id === "drive-honk" && phase >= .38 && phase < .57;
  const parked = id === null || id === "068" || mirrors || steeringTest !== 0 || control;
  const reversing = id === "070";
  const overtake = id === "076";
  const gesture = id === "101" || id === "102" ? ease(.33, .44) - ease(.58, .73) : 0;
  const distance = reversing ? -.77 : overtake ? 1.18 : .9;
  const travel = parked ? 0 : distance * (ease(ROLL_START, .49) - ease(.63, .95));
  const curve = reversing ? -.13 : overtake ? .23 : .12;
  const heading = travel * curve;
  const steering = steeringTest ? steeringTest * .32 * (ease(.14, .41) - ease(.62, .89))
    : id === "068" ? .23 * (ease(.16, .36) - 2 * ease(.41, .65) + ease(.7, .92))
    : parked ? 0 : Math.atan(2.4 * curve) * (ease(.06, .22) - ease(.78, .98));
  const brake = parked ? 0 : ease(.39, .49) - ease(.55, .63) + ease(.87, .95) - ease(.96, 1);
  const sideCheck = reversing ? -.82 * (ease(.045, .14) - ease(.49, .67)) : -.57 * (ease(.035, .115) - ease(.145, .205));
  const farMirror = mirrors ? .62 * (ease(.25, .48) - ease(.61, .83)) : 0;
  const nod = .18 * (ease(.165, .218) - ease(.225, ROLL_START));
  const focus = ease(.19, .29) - ease(.85, 1);
  return { reachControl, actuate, clutch, horn, travel, heading, across: (1 - Math.cos(heading)) / curve, along: Math.sin(heading) / curve, steering, brake,
    lookYaw: steeringTest ? steering * .66 : sideCheck + farMirror + steering * .24 - gesture * .12,
    lookPitch: steeringTest ? 0 : nod + reachControl * .10, focus: focus * (1 - gesture * .65),
    gesture, closeShot: parked || id === "077" || id === "101" || id === "102" || phase < ROLL_START };
}

function localRest(object: Object3D) {
  return { object, position: object.position.clone(), rotation: object.quaternion.clone() };
}

function restore({ object, position, rotation }: ReturnType<typeof localRest>) {
  object.position.copy(position);
  object.quaternion.copy(rotation);
}

function measureSteeringRim(car: Object3D, wheels: readonly Object3D[]) {
  car.updateWorldMatrix(true, true);
  const inverse = car.matrixWorld.clone().invert();
  const left = new Vector3(Infinity, 0, 0), right = new Vector3(-Infinity, 0, 0);
  const bottom = new Vector3(0, Infinity, 0), top = new Vector3(0, -Infinity, 0);
  const point = new Vector3();
  for (const wheel of wheels) wheel.traverse(part => {
    if (!(part instanceof Mesh)) return;
    const positions = part.geometry.getAttribute("position");
    if (!positions) return;
    const toCar = inverse.clone().multiply(part.matrixWorld);
    for (let i = 0; i < positions.count; i++) {
      part.getVertexPosition(i, point).applyMatrix4(toCar);
      if (point.x < left.x) left.copy(point);
      if (point.x > right.x) right.copy(point);
      if (point.y < bottom.y) bottom.copy(point);
      if (point.y > top.y) top.copy(point);
    }
  });
  if (!Number.isFinite(left.x)) return;
  // The hub protrudes forward. Use the rim extremes to locate its actual plane.
  const center = left.clone().lerp(right, .5);
  const up = new Vector3(0, top.y - bottom.y, top.z - bottom.z).normalize();
  return { center, up, axis: up.clone().cross(AXLE), radius: (right.x - left.x) * .5 - .014 };
}

function directionIn(source: Object3D, target: Object3D, direction: Vector3) {
  const origin = target.worldToLocal(source.getWorldPosition(new Vector3()));
  return target.worldToLocal(source.localToWorld(direction.clone())).sub(origin).normalize();
}

export function prepareGarageCockpit(
  car: Object3D, glassMaterials: Iterable<MeshPhysicalMaterial>, door?: VehiclePartHinge, station: GarageStation = GARAGE_STATIONS.ae86,
) {
  const road = station.kind === "wheel" ? station : undefined;
  const bridge = station.kind === "bridge" ? station : undefined;
  const levers = station.kind === "levers" ? station : undefined;
  const classic = station === GARAGE_STATIONS.ae86;
  const objects = new Map<string, Object3D>();
  car.traverse(object => objects.set(object.name.toUpperCase(), object));
  const steeringParts = road?.steeringParts?.flatMap(name => {
    const part = objects.get(name.toUpperCase());
    return part ? [part] : [];
  }) ?? [];
  // BRZ and Camaro export the wheel as separate meshes. Keep their bind
  // transforms and turn them around the same measured rim plane as the hands.
  const measured = steeringParts.length ? measureSteeringRim(car, steeringParts) : undefined;
  const center = measured?.center ?? new Vector3(...(road?.rim ?? (station.kind === "bridge" ? station.deck : station.seat)));
  const up = measured?.up ?? new Vector3(0, 1, road?.tilt ?? 0).normalize();
  const axis = measured?.axis ?? up.clone().cross(AXLE);
  const radius = measured?.radius ?? road?.radius ?? 0;
  const steering = steeringParts.flatMap(object => {
    if (!object.parent) return [];
    return [{
      ...localRest(object),
      pivot: object.parent.worldToLocal(car.localToWorld(center.clone())),
      axis: directionIn(car, object.parent, axis),
    }];
  });
  const preparedScale = car.getWorldScale(new Vector3()).y;
  const roadWheels = road ? ["FL", "FR", "RL", "RR"].flatMap(corner => {
    const object = objects.get(`WHEEL_${corner}`) ?? objects.get(`${corner}_WHEEL`);
    if (!object?.parent) return [];
    const spin = object.getObjectByName(`SPIN_${corner}`) ?? object.getObjectByName(`${corner}_WHEEL_SPIN`);
    const caliper = classic ? objects.get(`CALIPER_${corner}`) : undefined;
    return [{ ...localRest(object), front: corner.startsWith("F"), spin: spin && localRest(spin),
      axle: directionIn(car, spin ?? object, AXLE), steerAxis: directionIn(car, object.parent, UP),
      radius: classic ? .311 : Math.max(.1, new Box3().setFromObject(object).getSize(new Vector3()).y / (2 * preparedScale)),
      caliper: caliper && localRest(caliper) }];
  }) : [];
  const shot = garageStationCamera(station);
  const controls = road ? garageControlTargets(road) : undefined;

  return (driver: Object3D, motion: Group): CockpitPlayback | null => {
    const parent = driver.parent;
    const head = driver.getObjectByName("head");
    const torso = driver.getObjectByName("spine_02");
    const wardrobe = cockpitWardrobe(driver);
    const horn = createGarageHorn();
    const scale = car.getWorldScale(new Vector3()).y;
    const driverScale = driver.getWorldScale(new Vector3()).y;
    const localScale = bridge?.units ?? levers?.units ?? 1;
    const modelScale = localScale * scale / driverScale;
    const driverRest = localRest(driver);
    const forwardEntry = driver.name === "garage-villager-male" || driver.name === "garage-jules-stylized";
    const restScale = driver.scale.clone();
    const arms = (["l", "r"] as const).flatMap(side => {
      const arm = driverArm(driver, side), hand = driverHand(driver, side);
      if (!arm) return [];
      const palmReach = hand ? hand.middle.getWorldPosition(new Vector3()).distanceTo(arm.hand.getWorldPosition(new Vector3())) / scale * modelScale : .085 * localScale;
      return [{ ...arm, rig: hand, side: side === "l" ? 1 : -1, palmReach }];
    });
    const legs = (["l", "r"] as const).flatMap(side => {
      const hip = driver.getObjectByName(`thigh_${side}`);
      const knee = driver.getObjectByName(`calf_${side}`);
      const foot = driver.getObjectByName(`foot_${side}`);
      return hip && knee && foot ? [{ hip, knee, foot, side: side === "l" ? 1 : -1 }] : [];
    });
    if (!parent || !head || arms.length !== 2 || legs.length !== 2) return null;
    const motionRest = localRest(motion);
    const driverShadow = motion.getObjectByName("garage-driver-shadow");
    const standingHip = legs[0].hip.getWorldPosition(new Vector3()).lerp(legs[1].hip.getWorldPosition(new Vector3()), .5);
    const hip = driver.worldToLocal(standingHip.clone());
    car.worldToLocal(standingHip);
    const standingAnkles = legs.map(({ foot }) => car.worldToLocal(foot.getWorldPosition(new Vector3())));
    const openDoorAtStart = door?.angle ?? 0;
    const doorBounds = door ? new Box3().setFromObject(door.pivot, true).applyMatrix4(car.matrixWorld.clone().invert()) : null;
    const handleSide = Math.sign(center.x);
    const exteriorHandle = classic ? new Vector3(-.831, .765, -.433) : doorBounds
      ? new Vector3(handleSide > 0 ? doorBounds.max.x : doorBounds.min.x,
        MathUtils.lerp(doorBounds.min.y, doorBounds.max.y, .48), MathUtils.lerp(doorBounds.min.z, doorBounds.max.z, .20))
      : center.clone();
    const interiorHandle = classic ? new Vector3(-.652, .688, .102) : exteriorHandle.clone().add(new Vector3(-handleSide * .13, -.035, .10));
    exteriorHandle.sub(door?.pivot.position ?? new Vector3());
    interiorHandle.sub(door?.pivot.position ?? new Vector3());
    const headHeight = (driver.worldToLocal(head.getWorldPosition(new Vector3())).y - hip.y) * localScale;
    let crown = headHeight + .18 * localScale;
    const vertex = new Vector3();
    driver.updateWorldMatrix(true, true);
    const driverInverse = driver.matrixWorld.clone().invert();
    driver.traverse(part => {
      if (!(part instanceof Mesh) || !/hat|hair|head|face/i.test(part.name)) return;
      part.updateWorldMatrix(true, false);
      const positions = part.geometry.getAttribute("position");
      const toDriver = driverInverse.clone().multiply(part.matrixWorld);
      for (let i = 0; positions && i < positions.count; i++) {
        part.getVertexPosition(i, vertex).applyMatrix4(toDriver);
        crown = Math.max(crown, (vertex.y - hip.y) * localScale);
      }
    });
    const seat = station.kind === "bridge"
      ? new Vector3(...station.deck).setY(station.deck[1] + hip.y * localScale)
      : new Vector3(...station.seat).setY(Math.min(station.seat[1], station.roof - crown - .035 * localScale));
    if (classic) seat.set(center.x, Math.min(.42, Math.min(1.04 - headHeight, (road?.roof ?? 1.21) - crown - .035)), center.z - .435);
    const pedals = station.kind === "bridge" ? null : new Vector3(...station.pedals);
    const rest = [head, ...(torso ? [torso] : []), ...arms.flatMap(({ shoulder, elbow, hand, rig }) =>
      [shoulder, elbow, hand, ...(rig?.fingers.map(({ joint }) => joint) ?? [])]), ...legs.flatMap(({ hip, knee, foot }) => [hip, knee, foot])].map(localRest);
    const expression = (["smile", "brow"] as const).flatMap((shape, channel) => driverFaceTargets(driver, shape)
      .map(({ mesh, index }) => ({ weights: mesh.morphTargetInfluences!, index, rest: mesh.morphTargetInfluences![index],
        focus: RACE_FACE[channel], greeting: channel === 0 ? .55 : .21 })));
    const driverRotation = driver.getWorldQuaternion(new Quaternion()).invert();
    const feet = legs.map(({ foot }) => driverRotation.clone().multiply(foot.getWorldQuaternion(new Quaternion())));
    const camera = new Object3D();
    camera.name = "garage-cockpit-camera";
    const lens = new Object3D();
    camera.add(lens);
    const overview = new Object3D();
    overview.name = "garage-cockpit-overview";
    const bounds = road ? null : new Box3().setFromObject(car);
    const span = bounds?.getSize(new Vector3()).length() ?? 4.2;
    if (bounds) car.worldToLocal(bounds.getCenter(overview.position));
    else overview.position.set(0, .60, .08);
    const overviewLens = new Object3D();
    overviewLens.position.set(-4.8, 2.48, 4.15).multiplyScalar(road ? 1 : span / (4.2 * scale));
    overview.add(overviewLens);
    car.add(camera, overview);
    const shadowWasVisible = driverShadow?.visible;
    if (driverShadow) driverShadow.visible = false;
    const glass = [...glassMaterials].map(material => ({ material, opacity: material.opacity, reflection: material.envMapIntensity }));
    for (const { material } of glass) {
      material.opacity = .06;
      material.envMapIntensity = .06;
    }
    const carRotation = new Quaternion(), roll = new Quaternion(), steer = new Quaternion(), rimTurn = new Quaternion();
    const wheelTurn = new Quaternion(), seatRotation = new Quaternion(), entryRotation = new Quaternion(), parentRotation = new Quaternion();
    const entryHip = new Vector3(), reach = new Vector3();
    const headAxes = new Quaternion(), localAxis = new Vector3();
    const shotTarget = new Vector3(...shot.at), shotEye = new Vector3(...shot.eye);
    const steeringSide = Math.sign(center.x);
    let parked = false;

    return {
      hasDoor: Boolean(door),
      sample(id, phase, drive) {
        if (!drive && id === null && parked) return;
        parked = !drive && id === null;
        const pose = sampleCockpitMotion(id, phase);
        horn.setPressed(Boolean(road && pose.horn));
        if (!road) {
          camera.position.copy(shotTarget);
          lens.position.copy(shotEye);
        } else if (pose.closeShot) {
          camera.position.copy(center).add(new Vector3(0, .015, .03));
          const eye = new Vector3(seat.x, Math.min(road.roof - .12, seat.y + headHeight + .04), seat.z + .18);
          if (pose.reachControl && controls) {
            const focus = id === "drive-honk" ? center
              : id === "drive-handbrake" ? controls.handbrake
              : id === "drive-ignition" ? controls.ignition
              : id === "drive-signals" ? controls.signal : controls.shift;
            camera.position.lerp(focus, pose.reachControl * .30);
          }
          lens.position.copy(eye).sub(camera.position);
        } else {
          camera.position.copy(overview.position);
          lens.position.copy(overviewLens.position);
        }
        if (road) {
          motion.position.set(pose.across * scale, 0, (drive?.travel ?? pose.along) * scale).add(motionRest.position);
          motion.quaternion.copy(motionRest.rotation).multiply(steer.setFromAxisAngle(UP, pose.heading));
        }
        car.getWorldQuaternion(carRotation);

        // The rim axis points toward the seat. Positive angle turns left
        // counterclockwise from the driver's side of the wheel.
        const wheelAngle = pose.steering * 2.25;
        rimTurn.setFromAxisAngle(axis, steering.length ? wheelAngle : 0);
        for (const part of steering) {
          wheelTurn.setFromAxisAngle(part.axis, wheelAngle);
          part.object.position.copy(part.position).sub(part.pivot).applyQuaternion(wheelTurn).add(part.pivot);
          part.object.quaternion.copy(wheelTurn).multiply(part.rotation);
        }
        for (const part of roadWheels) {
          const { object, rotation, position, front, caliper, spin } = part;
          roll.setFromAxisAngle(part.axle, (drive?.travel ?? pose.travel) / part.radius);
          const rolling = spin ?? part;
          rolling.object.quaternion.copy(rolling.rotation).multiply(roll);
          if (!front) continue;
          steer.setFromAxisAngle(part.steerAxis, pose.steering);
          if (spin) object.quaternion.copy(rotation);
          object.quaternion.premultiply(steer);
          if (caliper) {
            caliper.object.quaternion.copy(steer).multiply(caliper.rotation);
            caliper.object.position.copy(caliper.position).sub(position).applyQuaternion(steer).add(position);
          }
        }

        rest.forEach(restore);
        parent.getWorldQuaternion(parentRotation).invert();
        seatRotation.copy(parentRotation).multiply(carRotation);
        if (bridge?.heading === -1) seatRotation.multiply(entryRotation.setFromAxisAngle(UP, Math.PI));
        driver.scale.copy(restScale).multiplyScalar(modelScale);
        const enter = drive?.enter ?? 1;
        const sit = MathUtils.smoothstep(enter, .12, .93);
        driver.quaternion.copy(seatRotation);
        entryHip.copy(seat);
        if (drive && enter < 1) {
          entryRotation.setFromAxisAngle(UP, -steeringSide * Math.PI / 2);
          entryRotation.premultiply(seatRotation);
          if (forwardEntry) {
            // These headings are almost a half-turn apart. The shortest slerp
            // sends Rook through a rear-facing turn, making entry look reversed.
            // Pass through the car's forward heading before facing the door.
            const turn = drive.turnToDoor * 2;
            if (turn <= 1) driver.quaternion.copy(driverRest.rotation).slerp(seatRotation, turn);
            else driver.quaternion.copy(seatRotation).slerp(entryRotation, turn - 1);
          } else driver.quaternion.copy(driverRest.rotation).slerp(entryRotation, drive.turnToDoor);
          driver.quaternion.slerp(seatRotation, MathUtils.smoothstep(enter, .13, .76));
          const acrossSill = MathUtils.smoothstep(enter, .27, .96);
          const lowerToSeat = MathUtils.smoothstep(enter, .12, .73);
          entryHip.copy(standingHip).lerp(seat, acrossSill);
          entryHip.y = MathUtils.lerp(standingHip.y, seat.y, lowerToSeat);
        }
        driver.position.copy(parent.worldToLocal(car.localToWorld(entryHip)))
          .sub(hip.clone().multiply(driver.scale).applyQuaternion(driver.quaternion));
        if (drive && door) {
          const doorAngle = door.open * drive.door;
          door.angle = MathUtils.lerp(openDoorAtStart, doorAngle, drive.turnToDoor);
          door.pivot.rotation[door.axis] = door.angle;
          if (driverShadow) driverShadow.visible = enter < .52;
        }
        if (torso && pose.reachControl) torso.rotation.x += pose.reachControl * .06;
        head.getWorldQuaternion(headAxes).invert().multiply(carRotation);
        head.rotateOnAxis(localAxis.copy(UP).applyQuaternion(headAxes), pose.lookYaw);
        head.rotateOnAxis(localAxis.copy(AXLE).applyQuaternion(headAxes), pose.lookPitch);
        for (const { weights, index, rest, focus, greeting } of expression) {
          weights[index] = MathUtils.lerp(MathUtils.lerp(rest, focus, pose.focus), greeting, pose.gesture);
        }
        if (pedals) for (const [index, { hip, knee, foot, side }] of legs.entries()) {
          const brake = road ? drive?.brake ?? pose.brake : 0;
          const ankle = pedals.clone().add(new Vector3(side * .102 * localScale, side < 0 ? brake * .042 : 0, 0));
          if (classic) ankle.set(seat.x + side * .102, .24 + (side < 0 ? brake * .042 : 0), center.z + .20);
          if (road && side > 0 && (pose.clutch || (id === "drive-handbrake" && road.parkingBrake === "pedal"))) {
            ankle.z += .045 * Math.max(pose.clutch, pose.actuate);
            ankle.y += .012 * Math.max(pose.clutch, pose.actuate);
          }
          if (enter < 1) {
            const step = index === 0 ? MathUtils.smoothstep(enter, .03, .65) : MathUtils.smoothstep(enter, .3, .98);
            ankle.lerp(standingAnkles[index], 1 - step);
            ankle.y += Math.sin(step * Math.PI) * .25;
          }
          car.localToWorld(ankle);
          aimLimb(hip, knee, foot, ankle, new Vector3(side * .11, 1, .12).applyQuaternion(carRotation));
          if (sit > 0) foot.quaternion.slerp(knee.getWorldQuaternion(new Quaternion()).invert().multiply(carRotation).multiply(feet[index]), sit);
        }
        for (const { shoulder, elbow, hand, rig, side, palmReach } of arms) {
          if (bridge) continue;
          const radial = new Vector3(side * .73, 0, 0).addScaledVector(up, .68).normalize().applyQuaternion(rimTurn);
          // Aim the knuckles beyond the outer rim. The palm faces inward and
          // the fingers wrap down over the far side of the rim.
          const grip = levers ? new Vector3(...levers.grips[side > 0 ? 0 : 1]) : radial.clone().multiplyScalar(radius + .036).add(center);
          const release = road && side === steeringSide ? pose.gesture : 0;
          const wave = id === "101" ? Math.sin((phase - .44) * Math.PI * 25) : 0;
          const gripDirection = levers ? new Vector3(0, -.15, 1).normalize()
            : new Vector3(-side * .11, -.04, .99).applyQuaternion(rimTurn).projectOnPlane(radial).normalize();
          const wrist = grip.clone().addScaledVector(gripDirection, -palmReach);
          const consoleHand = id === "drive-honk" || id === "drive-ignition" ? -1
            : id === "drive-signals" ? 1 : -steeringSide;
          const controlWeight = road && side === consoleHand && !(id === "drive-handbrake" && road.parkingBrake === "pedal") ? pose.reachControl : 0;
          let controlDirection: Vector3 | undefined;
          let controlNormal: Vector3 | undefined;
          if (controlWeight && controls) {
            const target = id === "drive-honk" ? center.clone().addScaledVector(axis, -.005)
              : id === "drive-handbrake" ? controls.handbrake.clone()
              : id === "drive-ignition" ? controls.ignition.clone()
              : id === "drive-signals" ? controls.signal.clone() : controls.shift.clone();
            if (id === "drive-shift-up" || id === "drive-clutch") target.z += pose.actuate * .045;
            if (id === "drive-shift-down") target.z -= pose.actuate * .045;
            if (id === "drive-handbrake" && !road?.parkingBrake) target.y += pose.actuate * .065;
            controlDirection = id === "drive-honk" ? up.clone() : new Vector3(0, -.28, .96);
            controlNormal = id === "drive-honk" ? axis.clone().negate() : new Vector3(-side, -.35, 0).normalize();
            if (id === "drive-ignition") {
              controlDirection.applyAxisAngle(AXLE, pose.actuate * .25);
              controlNormal.applyAxisAngle(AXLE, pose.actuate * .25);
            }
            if (id === "drive-signals") target.y -= pose.actuate * .018;
            wrist.lerp(target.addScaledVector(controlDirection, -palmReach), controlWeight);
          }
          if (release) wrist.lerp(new Vector3(side * (.198 - wave * .021), .235, -.195).add(center), release);
          car.localToWorld(wrist);
          if (drive && enter < 1) wrist.lerp(hand.getWorldPosition(reach), 1 - sit);
          const handleWeight = side === steeringSide && drive ? Math.max(drive.reachHandle, drive.closeHandle) : 0;
          if (door && drive && handleWeight) {
            reach.copy(drive.closeHandle > 0 ? interiorHandle : exteriorHandle);
            wrist.lerp(door.pivot.localToWorld(reach), handleWeight);
          }
          const pole = new Vector3(side * .47, -1, -.16).applyQuaternion(carRotation);
          aimLimb(shoulder, elbow, hand, wrist, pole, shoulder instanceof Bone ? ELBOW_HINGE : undefined);
          if (!rig || (sit < .28 && handleWeight < .25)) continue;
          const direction = car.localToWorld(grip).sub(hand.getWorldPosition(new Vector3())).normalize();
          const palmNormal = (levers ? new Vector3(-side * .24, -1, 0) : radial.negate()).applyQuaternion(carRotation);
          if (handleWeight > 0) {
            direction.lerp(reach.copy(UP).applyQuaternion(carRotation), handleWeight).normalize();
            palmNormal.lerp(reach.set(1, 0, 0).applyQuaternion(carRotation), handleWeight);
          }
          if (release) {
            const thumbsUp = id === "102";
            const raisedFingers = thumbsUp ? new Vector3(-side * .23, .15, .96) : new Vector3(side * (.06 - wave * .28), .95, .25);
            const raisedPalm = thumbsUp ? new Vector3(-side, -.08, -.04) : new Vector3(-side * .17, -.12, 1);
            direction.lerp(raisedFingers.applyQuaternion(carRotation).normalize(), release).normalize();
            palmNormal.lerp(raisedPalm.applyQuaternion(carRotation), release);
          }
          if (controlDirection && controlNormal) {
            direction.lerp(controlDirection.applyQuaternion(carRotation), controlWeight).normalize();
            palmNormal.lerp(controlNormal.applyQuaternion(carRotation), controlWeight).normalize();
          }
          aimDriverJoint(hand, rig.middle, direction.clone());
          alignJointNormal(hand, direction, rig.palm, palmNormal);
          for (const { joint, axis, name, segment } of rig.fingers) {
            const gripCurl = RIM_FINGER_CURL[name][segment];
            const gestureCurl = id === "101" ? .05 : name === "thumb" ? .04 : [1.04, 1.27, .64][segment];
            const controlCurl = id === "drive-honk" ? .10 : name === "thumb" ? .35 : [.48, .88, .65][segment];
            joint.rotateOnAxis(axis, MathUtils.lerp(MathUtils.lerp(gripCurl, gestureCurl, release), controlCurl, controlWeight));
          }
          if (release && id === "102" && rig.thumb) {
            const [base, middle, tip] = rig.thumb;
            const thumbDirection = new Vector3(-side * .05, 1, .08).applyQuaternion(carRotation);
            for (const [joint, child] of [[base, middle], [middle, tip]]) {
              const gripRotation = joint.quaternion.clone();
              aimDriverJoint(joint, child, thumbDirection.clone());
              joint.quaternion.slerp(gripRotation, 1 - release);
            }
          }
        }
        if (road) wardrobe.sample(car, center, radius, sit);
        if (drive && drive.enter < .98 && road) {
          camera.position.copy(standingHip).lerp(seat, drive.enter);
          camera.position.y += headHeight * .45;
          lens.position.set(steeringSide * 1.6, .35, .65);
        }
      },
      stop() {
        horn.stop();
        wardrobe.stop();
        rest.forEach(restore);
        restore(driverRest);
        driver.scale.copy(restScale);
        restore(motionRest);
        steering.forEach(restore);
        if (door) {
          door.angle = openDoorAtStart;
          door.pivot.rotation[door.axis] = openDoorAtStart;
        }
        for (const part of roadWheels) {
          restore(part);
          if (part.spin) restore(part.spin);
          if (part.caliper) restore(part.caliper);
        }
        for (const { material, opacity, reflection } of glass) {
          material.opacity = opacity;
          material.envMapIntensity = reflection;
        }
        for (const { weights, index, rest } of expression) weights[index] = rest;
        if (driverShadow && shadowWasVisible !== undefined) driverShadow.visible = shadowWasVisible;
        camera.removeFromParent();
        overview.removeFromParent();
      },
    };
  };
}
