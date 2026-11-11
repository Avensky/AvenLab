import {BufferAttribute, BufferGeometry, type Object3D, type Vector3} from 'three';
import { VehicleFlags } from '../../store/input/protocol/inputMasks';
import { useVisualAlignmentStore } from '../../store/presentation/visualAlignmentStore';
import type { RosterEntity } from '../rosterSelector';
import profiles from './roadLensGeometry.json';
import outlets from './exhaustOutlets.json';

export type RoadLensProfile = {floor:number; mounts:number[][]; xyz:string; role:string; indices:string; uv?:string; mask?:string};
export const lensProfiles:Record<string,RoadLensProfile> = profiles;
export const exhaustOutlets:Record<string,number[][]> = outlets;
export const SERVICE_BRAKE_LAMP = 1 << 12;
export const AE_HINGE = [-.027568057, .729372382, 1.805554390] as const;
export function popupAngle(angle:number, on:boolean, high:boolean, dt:number) {
  return angle+((on ? -Math.PI/3 : 0)-angle)*(1-Math.exp(-(high ? 22 : 5)*Math.max(0,dt)));
}
type Tone='head'|'tail'|'stop'|'plate'|'fog'|'amber';
export function lampSignal(kind: Tone|'left'|'right', night:boolean, brake:boolean, mask=0, blink=false, high=false): Tone|null {
  if (kind==='left'||kind==='right') {
    const flag=kind==='left' ? VehicleFlags.BLINKER_LEFT : VehicleFlags.BLINKER_RIGHT;
    return blink && (mask & (flag|VehicleFlags.HAZARDS)) ? 'amber' : null;
  }
  if (kind==='stop') return brake ? 'stop' : null;
  if (kind==='tail' && brake) return 'stop';
  if (kind==='fog' && high) return null;
  return night ? kind : null;
}

// Full rigs draw in their imported frame. Batched LODs start at the tire floor.
// The same offset positions lens faces, projected beams and exhaust effects.
export function modelOffset(car:RosterEntity, out:Vector3) {
  const id=car.vehicle_id??'';
  const report=useVisualAlignmentStore.getState().reports[car.id];
  if (report?.model===id) return out.fromArray(report.offset);
  const floor=(car.collider?.nominal_wheel_center_y??0)-(car.collider?.wheel_radius??.33);
  return out.set(0,floor-(lensProfiles[id]?.floor??0),0);
}
export function placeModel(body:Object3D,car:RosterEntity,offset:Vector3) {
  modelOffset(car,offset);
  body.position.add(offset.applyQuaternion(body.quaternion));
  body.updateMatrix();
}

export const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function lensGeometry(profile:RoadLensProfile) {
  const geometry=new BufferGeometry();
  const mm=new Int16Array(bytes(profile.xyz).buffer);
  geometry.setAttribute('position',new BufferAttribute(Float32Array.from(mm,n=>n/1000),3));
  if(profile.uv) geometry.setAttribute('uv',new BufferAttribute(new Uint16Array(bytes(profile.uv).buffer),2,true));
  geometry.setAttribute('lensRole',new BufferAttribute(bytes(profile.role),1));
  geometry.setIndex(new BufferAttribute(new Uint16Array(bytes(profile.indices).buffer),1));
  return geometry;
}
