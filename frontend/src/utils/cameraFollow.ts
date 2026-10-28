import { Euler, Quaternion, Vector3 } from "three";

type Vec3 = [number, number, number];
type Pose = { position: Vec3; rotation: [number, number, number, number] };

// Camera decoration only: no prediction or changes to a vehicle's pose.
export class VehicleCameraFollower {
  readonly position = new Vector3();
  readonly target = new Vector3();
  private initialized = false;
  private readonly localPosition = new Vector3();
  private readonly localTarget = new Vector3();
  private readonly desiredPosition = new Vector3();
  private readonly desiredTarget = new Vector3();
  private readonly chassisPosition = new Vector3();
  private readonly chassisRotation = new Quaternion();
  private readonly orbitRotation = new Quaternion();
  private readonly orbitEuler = new Euler();

  reset() { this.initialized = false; }

  update(pose: Pose, offset: Vec3, targetOffset: Vec3, yaw: number, pitch: number,
    positionSpeed: number, targetSpeed: number, delta: number, worldAligned=false) {
    this.orbitRotation.setFromEuler(this.orbitEuler.set(pitch, yaw, 0, "YXZ"));
    this.desiredPosition.fromArray(offset).applyQuaternion(this.orbitRotation);
    this.desiredTarget.fromArray(targetOffset).applyQuaternion(this.orbitRotation);
    if (!this.initialized) {
      this.localPosition.copy(this.desiredPosition);
      this.localTarget.copy(this.desiredTarget);
      this.initialized = true;
    } else {
      // Ease local view changes, not world vehicle motion. Camera and car
      // translation therefore share one acceleration and stopping timeline.
      const dt = Math.max(0, delta);
      this.localPosition.lerp(this.desiredPosition, 1 - Math.exp(-Math.max(0, positionSpeed) * dt));
      this.localTarget.lerp(this.desiredTarget, 1 - Math.exp(-Math.max(0, targetSpeed) * dt));
    }
    this.chassisPosition.fromArray(pose.position);
    if(worldAligned)this.chassisRotation.identity();else this.chassisRotation.fromArray(pose.rotation);
    this.position.copy(this.localPosition).applyQuaternion(this.chassisRotation).add(this.chassisPosition);
    this.target.copy(this.localTarget).applyQuaternion(this.chassisRotation).add(this.chassisPosition);
  }
}
