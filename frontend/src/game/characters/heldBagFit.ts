import { Euler, MathUtils, Quaternion, Vector3, type Object3D } from "three";

/** Keep the grip on the knuckle while allowing the bag to hang under world gravity. */
export function createHeldBagFit(driver: Object3D) {
  const grip = driver.getObjectByName("middle_01_l") ?? driver.getObjectByName("hand_l");
  if (!grip) return;
  const index = driver.getObjectByName("index_01_l"), pinky = driver.getObjectByName("pinky_01_l");
  const position = new Vector3(), handle = new Vector3(), knuckle = new Vector3();
  const parentRotation = new Quaternion(), worldRotation = new Quaternion();
  const orientation = new Euler(0, 0, 0, "YXZ");

  return (holder: Object3D) => {
    const parent = holder.parent;
    if (!parent) return;
    grip.getWorldPosition(position);
    holder.position.copy(parent.worldToLocal(position));

    if (index && pinky) pinky.getWorldPosition(handle).sub(index.getWorldPosition(knuckle)).normalize();
    else handle.set(0, 0, 0);
    const roll = Math.asin(MathUtils.clamp(handle.y, -1, 1)) * .15;
    if (Math.hypot(handle.x, handle.z) < .15) {
      driver.getWorldQuaternion(worldRotation);
      handle.set(.5, 0, -.866).applyQuaternion(worldRotation);
    }

    // Keep the wrist's heading and a little roll. A modest outward tilt gives
    // the wider base room beside the skirt while the handle stays anchored.
    orientation.set(-.23, Math.atan2(-handle.z, handle.x), roll);
    worldRotation.setFromEuler(orientation);
    holder.quaternion.copy(parent.getWorldQuaternion(parentRotation).invert().multiply(worldRotation));
  };
}
