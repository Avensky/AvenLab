import { Bone, Box3, MathUtils, Object3D, Quaternion, Vector3, type Group, type MeshPhysicalMaterial } from "three";
import { aimDriverJoint, aimLimb, alignJointNormal, driverArm, driverHand } from "../characters/garageEmotes";
import type { CockpitTake } from "../characters/roadsideEmotes";
import { RACE_FACE } from "../characters/rivalryEmotes";
import { driverFaceTargets } from "../characters/villagerFace";

export type CockpitPlayback = { sample: (phase: number) => void; stop: () => void };
export type GarageCockpit = (driver: Object3D, take: CockpitTake) => CockpitPlayback | null;

const AXLE = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const RIM_AXIS = new Vector3(0, .4, -.9165).normalize();
const ELBOW_HINGE = new Vector3(0, 0, -1);
const ROLL_START = .285;

export function sampleCockpitMotion(id: CockpitTake["id"], phase: number) {
  const ease = (from: number, to: number) => MathUtils.smoothstep(phase, from, to);
  const parked = id === "068";
  const reversing = id === "070";
  const distance = reversing ? -.77 : .9;
  const travel = parked ? 0 : distance * (ease(ROLL_START, .49) - ease(.63, .95));
  const curve = reversing ? -.13 : .12;
  const heading = travel * curve;
  const steering = parked ? .23 * (ease(.16, .36) - 2 * ease(.41, .65) + ease(.7, .92))
    : Math.atan(2.4 * curve) * (ease(.06, .22) - ease(.78, .98));
  const brake = parked ? 0 : ease(.39, .49) - ease(.55, .63) + ease(.87, .95) - ease(.96, 1);
  const sideCheck = reversing ? -.82 * (ease(.045, .14) - ease(.49, .67)) : -.57 * (ease(.035, .115) - ease(.145, .205));
  const nod = .18 * (ease(.165, .218) - ease(.225, ROLL_START));
  const focus = ease(.19, .29) - ease(.85, 1);
  return { travel, heading, across: (1 - Math.cos(heading)) / curve, along: Math.sin(heading) / curve, steering, brake,
    lookYaw: sideCheck + steering * .24, lookPitch: nod, focus, closeShot: parked || phase < ROLL_START };
}

function localRest(object: Object3D) {
  return { object, position: object.position.clone(), rotation: object.quaternion.clone() };
}

function restore({ object, position, rotation }: ReturnType<typeof localRest>) {
  object.position.copy(position);
  object.quaternion.copy(rotation);
}

/** The AE86 export has a separate steering wheel and four road-wheel pivots. */
export function prepareGarageCockpit(car: Object3D, motionGroup: () => Group | null,
  glassMaterials: Iterable<MeshPhysicalMaterial>): GarageCockpit | undefined {
  const wheel = car.getObjectByName("SteeringWheel");
  if (!wheel?.parent) return;
  const bounds = new Box3().setFromObject(wheel, true);
  if (bounds.isEmpty()) return;
  const wheelParent = wheel.parent;
  const center = car.worldToLocal(bounds.getCenter(new Vector3()));
  const pivot = wheelParent.worldToLocal(car.localToWorld(center.clone()));
  const steeringWheel = localRest(wheel);
  const roadWheels = ["FL", "FR", "RL", "RR"].flatMap(corner => {
    const object = car.getObjectByName(`Wheel_${corner}`);
    if (!object) return [];
    const caliper = car.getObjectByName(`Caliper_${corner}`);
    return [{ ...localRest(object), front: corner.startsWith("F"), caliper: caliper && localRest(caliper) }];
  });
  if (roadWheels.length !== 4) return;

  return (driver, take) => {
    const motion = motionGroup();
    const parent = driver.parent;
    const head = driver.getObjectByName("head");
    const arms = (["l", "r"] as const).flatMap(side => {
      const arm = driverArm(driver, side), hand = driverHand(driver, side);
      return arm ? [{ ...arm, rig: hand, side: side === "l" ? 1 : -1 }] : [];
    });
    const legs = (["l", "r"] as const).flatMap(side => {
      const hip = driver.getObjectByName(`thigh_${side}`);
      const knee = driver.getObjectByName(`calf_${side}`);
      const foot = driver.getObjectByName(`foot_${side}`);
      return hip && knee && foot ? [{ hip, knee, foot, side: side === "l" ? 1 : -1 }] : [];
    });
    if (!motion || !parent || !head || arms.length !== 2 || legs.length !== 2) return null;
    const driverRest = localRest(driver);
    const motionRest = localRest(motion);
    const driverShadow = motion.getObjectByName("garage-driver-shadow");
    const hip = driver.worldToLocal(legs[0].hip.getWorldPosition(new Vector3()).lerp(legs[1].hip.getWorldPosition(new Vector3()), .5));
    const headHeight = driver.worldToLocal(head.getWorldPosition(new Vector3())).y - hip.y;
    const seat = new Vector3(center.x, Math.min(.42, 1.04 - headHeight), center.z - .49);
    const rest = [head, ...arms.flatMap(({ shoulder, elbow, hand, rig }) =>
      [shoulder, elbow, hand, ...(rig?.fingers.map(({ joint }) => joint) ?? [])]), ...legs.flatMap(({ hip, knee, foot }) => [hip, knee, foot])].map(localRest);
    const expression = (["smile", "brow"] as const).flatMap((shape, channel) => driverFaceTargets(driver, shape)
      .map(({ mesh, index }) => ({ weights: mesh.morphTargetInfluences!, index, rest: mesh.morphTargetInfluences![index], weight: RACE_FACE[channel] })));
    const driverRotation = driver.getWorldQuaternion(new Quaternion()).invert();
    const feet = legs.map(({ foot }) => driverRotation.clone().multiply(foot.getWorldQuaternion(new Quaternion())));
    const camera = new Object3D();
    camera.name = "garage-cockpit-camera";
    const lens = new Object3D();
    camera.add(lens);
    car.add(camera);
    if (driverShadow) driverShadow.visible = false;
    const glass = [...glassMaterials].map(material => ({ material, opacity: material.opacity }));
    for (const { material } of glass) material.opacity = .09;
    const scale = car.getWorldScale(new Vector3()).y;
    const carRotation = new Quaternion(), roll = new Quaternion(), steer = new Quaternion(), rimTurn = new Quaternion();
    const headAxes = new Quaternion(), localAxis = new Vector3();

    return {
      sample(phase) {
        const pose = sampleCockpitMotion(take.id, phase);
        if (pose.closeShot) {
          camera.position.set(center.x, .92, center.z - .19);
          lens.position.set(-.38, .25, 1.30);
        } else {
          camera.position.set(0, .60, .08);
          lens.position.set(-4.25, 2.15, 3.75);
        }
        motion.position.set(pose.across * scale, 0, pose.along * scale).add(motionRest.position);
        motion.quaternion.copy(motionRest.rotation).multiply(steer.setFromAxisAngle(UP, pose.heading));
        car.getWorldQuaternion(carRotation);

        const wheelAngle = -pose.steering * 2.25;
        rimTurn.setFromAxisAngle(RIM_AXIS, wheelAngle);
        wheel.position.copy(steeringWheel.position).sub(pivot).applyQuaternion(rimTurn).add(pivot);
        wheel.quaternion.copy(rimTurn).multiply(steeringWheel.rotation);
        roll.setFromAxisAngle(AXLE, pose.travel / .311);
        steer.setFromAxisAngle(UP, pose.steering);
        for (const { object, rotation, position, front, caliper } of roadWheels) {
          object.quaternion.copy(rotation).multiply(roll);
          if (!front) continue;
          object.quaternion.premultiply(steer);
          if (caliper) {
            caliper.object.quaternion.copy(steer).multiply(caliper.rotation);
            caliper.object.position.copy(caliper.position).sub(position).applyQuaternion(steer).add(position);
          }
        }

        rest.forEach(restore);
        driver.quaternion.copy(parent.getWorldQuaternion(new Quaternion()).invert().multiply(carRotation));
        driver.position.copy(parent.worldToLocal(car.localToWorld(seat.clone())))
          .sub(hip.clone().multiply(driver.scale).applyQuaternion(driver.quaternion));
        head.getWorldQuaternion(headAxes).invert().multiply(carRotation);
        head.rotateOnAxis(localAxis.copy(UP).applyQuaternion(headAxes), pose.lookYaw);
        head.rotateOnAxis(localAxis.copy(AXLE).applyQuaternion(headAxes), pose.lookPitch);
        for (const { weights, index, rest, weight } of expression) weights[index] = MathUtils.lerp(rest, weight, pose.focus);
        for (const [index, { hip, knee, foot, side }] of legs.entries()) {
          const ankle = car.localToWorld(new Vector3(seat.x + side * .102, .24 + (side < 0 ? pose.brake * .042 : 0), center.z + .20));
          aimLimb(hip, knee, foot, ankle, new Vector3(side * .11, 1, .12).applyQuaternion(carRotation));
          foot.quaternion.copy(knee.getWorldQuaternion(new Quaternion()).invert().multiply(carRotation).multiply(feet[index]));
        }
        for (const { shoulder, elbow, hand, rig, side } of arms) {
          const grip = new Vector3(side * .131, .081, .034).applyQuaternion(rimTurn).add(center);
          const wrist = car.localToWorld(grip.clone().add(new Vector3(side * .027, -.024, -.085)));
          const pole = new Vector3(side * .47, -1, -.16).applyQuaternion(carRotation);
          aimLimb(shoulder, elbow, hand, wrist, pole, shoulder instanceof Bone ? ELBOW_HINGE : undefined);
          if (!rig) continue;
          const direction = car.localToWorld(grip).sub(hand.getWorldPosition(new Vector3())).normalize();
          aimDriverJoint(hand, rig.middle, direction.clone());
          alignJointNormal(hand, direction, rig.palm, new Vector3(-side, -.35, .15).applyQuaternion(carRotation));
          for (const { joint, axis, name, segment } of rig.fingers) {
            joint.rotateOnAxis(axis, (name === "thumb" ? .3 : [.52, .81, .54][segment]));
          }
        }
      },
      stop() {
        rest.forEach(restore);
        restore(driverRest);
        restore(motionRest);
        restore(steeringWheel);
        for (const part of roadWheels) {
          restore(part);
          if (part.caliper) restore(part.caliper);
        }
        for (const { material, opacity } of glass) material.opacity = opacity;
        for (const { weights, index, rest } of expression) weights[index] = rest;
        if (driverShadow) driverShadow.visible = true;
        camera.removeFromParent();
      },
    };
  };
}
