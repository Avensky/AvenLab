import {magneticSnap, frameCorners, type SnapLock} from '../roadKit/roadKitSnap.ts';
import {roadAsset, roadBounds} from './roadCatalog.ts';
import type {Bounds} from '../roadKit/roadKitCore.ts';
import type {LayoutObject, V3} from '../layoutDocument.ts';
export type LayoutSnapLock = {id: string; lock: SnapLock};
export function localBounds(item: LayoutObject, basis: 'asphalt' | 'outer' = 'outer'): Bounds {
  if (!item.road) return {min: [-item.size[0]/2,0,-item.size[2]/2], max: [item.size[0]/2,item.size[1],item.size[2]/2]};
  const asset = roadAsset(item.road.asset)!, b = roadBounds(item.road, basis);
  return {min: b.min.map((v,i) => v*item.size[i]/asset.size[i]) as V3, max: b.max.map((v,i) => v*item.size[i]/asset.size[i]) as V3};
}
export function objectCorners(item: LayoutObject) {
  return frameCorners(localBounds(item), {x:item.position[0], z:item.position[2], yaw:item.yaw*Math.PI/180});
}
export function snapLayoutPosition(item: LayoutObject, desired: V3, objects: LayoutObject[], basis: 'asphalt' | 'outer', radius: number, previous: LayoutSnapLock | null = null): {position: V3; lock: LayoutSnapLock | null} {
  const moving=localBounds(item,basis), pose={x:desired[0],z:desired[2],yaw:item.yaw*Math.PI/180};
  const reach=Math.hypot(Math.max(Math.abs(moving.min[0]),Math.abs(moving.max[0])),Math.max(Math.abs(moving.min[2]),Math.abs(moving.max[2])))+radius*1.5;
  const targets=objects.filter(o=>o.id!==item.id && Math.abs(o.position[1]-desired[1])<.02 && Math.hypot(o.position[0]-desired[0],o.position[2]-desired[2])<=reach+Math.hypot(o.size[0],o.size[2]));
  const results=targets.map(fixed=>({id:fixed.id,result:magneticSnap(moving,localBounds(fixed,basis),pose,{x:fixed.position[0],z:fixed.position[2],yaw:fixed.yaw*Math.PI/180},radius,previous?.id===fixed.id?previous.lock:null)})).filter(r=>r.result.lock);
  results.sort((a,b)=>Number(b.id===previous?.id)-Number(a.id===previous?.id) || Number(a.result.lock!.kind==='edge')-Number(b.result.lock!.kind==='edge') || a.result.distance-b.result.distance || a.id.localeCompare(b.id));
  const best=results[0];
  return best?{position:[best.result.pose.x,desired[1],best.result.pose.z],lock:{id:best.id,lock:best.result.lock!}}:{position:desired,lock:null};
}
