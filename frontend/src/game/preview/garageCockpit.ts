import { Bone, Box3, MathUtils, Object3D, Quaternion, Vector3, type Group, type MeshPhysicalMaterial } from "three";
import { aimDriverJoint, aimLimb, alignJointNormal, driverArm, driverHand } from "../characters/garageEmotes";
import type { CockpitTake } from "../characters/cockpitEmotes";
import { driverFaceTargets } from "../characters/villagerFace";

type TakeId = CockpitTake["id"];
export type CockpitPlayback = { sample: (id: TakeId | null, phase: number) => void; stop: () => void };
export type GarageCockpit = (driver: Object3D) => CockpitPlayback | null;

const AXLE = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const RIM_AXIS = new Vector3(0, .4, -.9165).normalize();
const ELBOW_HINGE = new Vector3(0, 0, -1);
const ROLL_START = .285;
const RACE_FACE = [-.21, -.28] as const;

export function sampleCockpitMotion(id: TakeId | null, phase: number) {
  const ease = (from: number, to: number) => MathUtils.smoothstep(phase, from, to);
  const mirrors = id === "086";
  const parked = id === null || id === "068" || mirrors;
  const reversing = id === "070";
  const overtake = id === "076";
  const gesture = id === "101" || id === "102" ? ease(.33, .44) - ease(.58, .73) : 0;
  const distance = reversing ? -.77 : overtake ? 1.18 : .9;
  const travel = parked ? 0 : distance * (ease(ROLL_START, .49) - ease(.63, .95));
  const curve = reversing ? -.13 : overtake ? .23 : .12;
  const heading = travel * curve;
  const steering = id === "068" ? .23 * (ease(.16, .36) - 2 * ease(.41, .65) + ease(.7, .92))
    : parked ? 0 : Math.atan(2.4 * curve) * (ease(.06, .22) - ease(.78, .98));
  const brake = parked ? 0 : ease(.39, .49) - ease(.55, .63) + ease(.87, .95) - ease(.96, 1);
  const sideCheck = reversing ? -.82 * (ease(.045, .14) - ease(.49, .67)) : -.57 * (ease(.035, .115) - ease(.145, .205));
  const farMirror = mirrors ? .62 * (ease(.25, .48) - ease(.61, .83)) : 0;
  const nod = .18 * (ease(.165, .218) - ease(.225, ROLL_START));
  const focus = ease(.19, .29) - ease(.85, 1);
  return { travel, heading, across: (1 - Math.cos(heading)) / curve, along: Math.sin(heading) / curve, steering, brake,
    lookYaw: sideCheck + farMirror + steering * .24 - gesture * .12, lookPitch: nod, focus: focus * (1 - gesture * .65),
    gesture, closeShot: parked || id === "077" || id === "101" || id === "102" || phase < ROLL_START };
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

  return driver => {
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
      .map(({ mesh, index }) => ({ weights: mesh.morphTargetInfluences!, index, rest: mesh.morphTargetInfluences![index],
        focus: RACE_FACE[channel], greeting: channel === 0 ? .55 : .21 })));
    const driverRotation = driver.getWorldQuaternion(new Quaternion()).invert();
    const feet = legs.map(({ foot }) => driverRotation.clone().multiply(foot.getWorldQuaternion(new Quaternion())));
    const camera = new Object3D();
    camera.name = "garage-cockpit-camera";
    const lens = new Object3D();
    camera.add(lens);
    car.add(camera);
    const shadowWasVisible = driverShadow?.visible;
    if (driverShadow) driverShadow.visible = false;
    const glass = [...glassMaterials].map(material => ({ material, opacity: material.opacity, reflection: material.envMapIntensity }));
    for (const { material } of glass) {
      material.opacity = .06;
      material.envMapIntensity = .06;
    }
    const scale = car.getWorldScale(new Vector3()).y;
    const carRotation = new Quaternion(), roll = new Quaternion(), steer = new Quaternion(), rimTurn = new Quaternion();
    const headAxes = new Quaternion(), localAxis = new Vector3();

    return {
      sample(id, phase) {
        const pose = sampleCockpitMotion(id, phase);
        if (pose.closeShot) {
          camera.position.set(center.x - .065, .96, center.z - .205);
          lens.position.set(.31, .22, 1.17);
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
        for (const { weights, index, rest, focus, greeting } of expression) {
          weights[index] = MathUtils.lerp(MathUtils.lerp(rest, focus, pose.focus), greeting, pose.gesture);
        }
        for (const [index, { hip, knee, foot, side }] of legs.entries()) {
          const ankle = car.localToWorld(new Vector3(seat.x + side * .102, .24 + (side < 0 ? pose.brake * .042 : 0), center.z + .20));
          aimLimb(hip, knee, foot, ankle, new Vector3(side * .11, 1, .12).applyQuaternion(carRotation));
          foot.quaternion.copy(knee.getWorldQuaternion(new Quaternion()).invert().multiply(carRotation).multiply(feet[index]));
        }
        for (const { shoulder, elbow, hand, rig, side } of arms) {
          const grip = new Vector3(side * .131, .081, .034).applyQuaternion(rimTurn).add(center);
          const release = side < 0 ? pose.gesture : 0;
          const wave = id === "101" ? Math.sin((phase - .44) * Math.PI * 25) : 0;
          const wrist = grip.clone().add(new Vector3(side * .027, -.024, -.085));
          if (release) wrist.lerp(new Vector3(-.205 + wave * .021, .235, -.225).add(center), release);
          car.localToWorld(wrist);
          const pole = new Vector3(side * .47, -1, -.16).applyQuaternion(carRotation);
          aimLimb(shoulder, elbow, hand, wrist, pole, shoulder instanceof Bone ? ELBOW_HINGE : undefined);
          if (!rig) continue;
          const direction = car.localToWorld(grip).sub(hand.getWorldPosition(new Vector3())).normalize();
          const palmNormal = new Vector3(-side, -.35, .15).applyQuaternion(carRotation);
          if (release) {
            direction.lerp(new Vector3(-.06 + wave * .28, .95, .25).applyQuaternion(carRotation).normalize(), release).normalize();
            palmNormal.lerp(new Vector3(.17, -.12, 1).applyQuaternion(carRotation), release);
          }
          aimDriverJoint(hand, rig.middle, direction.clone());
          alignJointNormal(hand, direction, rig.palm, palmNormal);
          for (const { joint, axis, name, segment } of rig.fingers) {
            const gripCurl = name === "thumb" ? .3 : [.52, .81, .54][segment];
            const gestureCurl = id === "101" ? .05 : name === "thumb" ? .04 : [1.04, 1.27, .64][segment];
            joint.rotateOnAxis(axis, MathUtils.lerp(gripCurl, gestureCurl, release));
          }
          if (release && id === "102" && rig.thumb) {
            const [base, middle, tip] = rig.thumb;
            const thumbDirection = new Vector3(.19, 1, .10).applyQuaternion(carRotation);
            for (const [joint, child] of [[base, middle], [middle, tip]]) {
              const gripRotation = joint.quaternion.clone();
              aimDriverJoint(joint, child, thumbDirection.clone());
              joint.quaternion.slerp(gripRotation, 1 - release);
            }
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
        for (const { material, opacity, reflection } of glass) {
          material.opacity = opacity;
          material.envMapIntensity = reflection;
        }
        for (const { weights, index, rest } of expression) weights[index] = rest;
        if (driverShadow && shadowWasVisible !== undefined) driverShadow.visible = shadowWasVisible;
        camera.removeFromParent();
      },
    };
  };
}
