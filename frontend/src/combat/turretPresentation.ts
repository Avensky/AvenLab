import type { Group, Quaternion, Vector3 } from 'three';
import type { PhysicsEntitySnapshot } from '../store/session/networkStore';

type Combat = NonNullable<PhysicsEntitySnapshot['combat']>;
type MountPose = Pick<PhysicsEntitySnapshot,'position'|'rotation'>;

// Server yaw wraps at ±π. Interpolate across the seam along the shorter arc.
export function blendYaw(a: number, b: number, t: number) {
  return a + Math.atan2(Math.sin(b-a), Math.cos(b-a)) * t;
}

export function blendCombatAim(a: Combat | undefined, b: Combat | undefined, t: number) {
  if (!a || !b || a.enabled !== b.enabled || a.role !== b.role) return b;
  // A changing lock mode has no common local lock angle. Both endpoints
  // still carry valid world aim, so use that through the transition.
  const locked = !!(a.hull_locked && b.hull_locked);
  return {
    ...b,
    x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t, z: a.z + (b.z-a.z)*t,
    yaw: blendYaw(a.yaw,b.yaw,t), pitch: a.pitch + (b.pitch-a.pitch)*t,
    hull_locked: locked,
    lock_yaw: locked && a.lock_yaw !== undefined && b.lock_yaw !== undefined ? blendYaw(a.lock_yaw,b.lock_yaw,t) : undefined,
    lock_pitch: locked && a.lock_pitch !== undefined && b.lock_pitch !== undefined ? a.lock_pitch+(b.lock_pitch-a.lock_pitch)*t : undefined,
  };
}

export function worldAim(out: Vector3, yaw: number, pitch: number) {
  const horizontal=Math.cos(pitch);
  return out.set(-Math.sin(yaw)*horizontal, Math.sin(pitch), -Math.cos(yaw)*horizontal);
}

/** The pedestal is in chassis space. The gun points along its local -Z axis,
 * while the server supplies a world-space aim direction. */
export function placeRoofTurret(mount: Group, pivot: Group, gun: Group, pose: MountPose,
  combat: Combat, direction: Vector3, inverse: Quaternion) {
  mount.position.fromArray(pose.position);
  mount.quaternion.fromArray(pose.rotation);
  pivot.position.set(combat.x,combat.y,combat.z);
  worldAim(direction,combat.yaw,combat.pitch).applyQuaternion(inverse.copy(mount.quaternion).invert());
  pivot.rotation.y=Math.atan2(-direction.x,-direction.z);
  gun.rotation.x=Math.atan2(direction.y, Math.hypot(direction.x,direction.z));
}
