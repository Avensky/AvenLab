import { Quaternion, Vector3, type Object3D } from "three";
import { driverHand } from "./garageEmotes";
import type { EmotePropModel } from "./emoteProps";

const POLE_UP = new Vector3(0, 1, 0);

export function bindFlagPoleGrip(driver: Object3D, flag: EmotePropModel) {
  const hand = driverHand(driver, "r");
  const wristJoint = hand?.hand ?? driver.getObjectByName("hand_r");
  const { root, flagGrip, flagHeld } = flag;
  if (!wristJoint || !flagGrip || !flagHeld) return;
  const wrist = new Vector3(), center = new Vector3(), forward = new Vector3(), normal = new Vector3(), axis = new Vector3();
  const rotation = new Quaternion(), inverse = new Quaternion(), bend = new Quaternion();
  return () => {
    const weight = flagGrip.position.x;
    flagHeld.position.set(0, 0, 0);
    flagHeld.quaternion.identity();
    if (!root.visible || weight <= 0 || root.scale.x < .15) return;
    if (!hand) {
      center.set(.01, -.022, .02);
      flagHeld.position.copy(root.worldToLocal(wristJoint.localToWorld(center))).multiplyScalar(weight);
      return;
    }
    wristJoint.getWorldPosition(wrist);
    hand.middle.getWorldPosition(center);
    hand.hand.getWorldQuaternion(rotation);
    const scale = hand.hand.getWorldScale(axis).x;
    forward.subVectors(center, wrist).normalize();
    normal.copy(hand.palm).applyQuaternion(rotation);
    // Seat the shaft behind the first knuckles, inside the curled fingers.
    center.addScaledVector(normal, .016 * scale).addScaledVector(forward, .006 * scale);
    flagHeld.position.copy(root.worldToLocal(center)).multiplyScalar(weight);
    root.getWorldQuaternion(inverse).invert();
    axis.crossVectors(forward, normal).normalize().applyQuaternion(inverse);
    bend.setFromUnitVectors(POLE_UP, axis);
    flagHeld.quaternion.slerp(bend, weight);
  };
}
