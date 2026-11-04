import type {Object3D} from 'three';

export const CARRIED_FLAG_SCALE=1.25;
// The original cloth spans local X. Turning it onto local Z puts the fabric
// parallel to the vehicle's longitudinal axis, then the chassis supplies yaw.
export const CARRIED_FLAG_ROTATION=Math.PI/2;
export const FLAG_BOB_AMPLITUDE=.12;
export const FLAG_BOB_PERIOD_S=2.8;

type ChassisPose={position:[number,number,number];rotation:[number,number,number,number]};

/** All carrier movement comes from the same sampled pose used by the GLB.
 * Only the child offset bobs, so it cannot introduce lag or an extra yaw filter. */
export function updateCarriedFlagPose(root:Object3D,bob:Object3D,pose:ChassisPose,elapsedSeconds:number){
 root.position.fromArray(pose.position);
 root.quaternion.fromArray(pose.rotation);
 const time=Number.isFinite(elapsedSeconds)?elapsedSeconds:0;
 bob.position.y=1.1+FLAG_BOB_AMPLITUDE*Math.sin(2*Math.PI*time/FLAG_BOB_PERIOD_S);
}
