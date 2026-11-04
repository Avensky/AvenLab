import {Box3,Quaternion,Ray,Vector3,type Camera} from 'three';
import {worldAim} from './turretPresentation';
import type {PhysicsEntitySnapshot,PhysicsSnapshot} from '../store/session/networkStore';

const point=new Vector3(),rotation=new Quaternion();
const defaultHalf=[1,.6,2],defaultOffset=[0,0,0];

/** Pixel bounds relative to the already projected nameplate. Only the single
 * assisted vehicle needs its eight chassis corners projected. */
export function projectAssistFrame(pose:Pick<PhysicsEntitySnapshot,'position'|'rotation'|'collider'>,
  camera:Camera,anchor:Vector3,width:number,height:number){
 const half=pose.collider?.chassis_half_extents??defaultHalf,offset=pose.collider?.chassis_offset??defaultOffset;
 rotation.fromArray(pose.rotation);
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for(let i=0;i<8;i++){
  point.set(offset[0]+(i&1?half[0]:-half[0]),offset[1]+(i&2?half[1]+.35:-half[1]),offset[2]+(i&4?half[2]:-half[2]));
  point.applyQuaternion(rotation);point.x+=pose.position[0];point.y+=pose.position[1];point.z+=pose.position[2];point.project(camera);
  if(!Number.isFinite(point.x+point.y+point.z)||point.z< -1||point.z>1)return null;
  const x=(point.x-anchor.x)*width/2,y=(anchor.y-point.y)*height/2;
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 const w=Math.max(24,Math.ceil(right-left)+8),h=Math.max(16,Math.ceil(bottom-top)+8);
 return {left:Math.round((left+right-w)/2),top:Math.round((top+bottom-h)/2),width:w,height:h};
}

const muzzle=new Vector3(),direction=new Vector3(),localRay=new Ray(),box=new Box3(),intersection=new Vector3();
export const MARKER_RANGE=120;

/** A visual bore sight for manual weapons. It never changes a shot or turret
 * angle. Compare the nearest chassis intersection; the marker's shared LOS
 * budget still decides whether it may actually be shown. */
export function sightedTarget(snapshot:PhysicsSnapshot|null,me:PhysicsEntitySnapshot|null){
 const combat=me?.combat;
 if(!snapshot||!me||!combat?.enabled||me.health?.defeated)return null;
 if(combat.assisted_target)return combat.assisted_target;
 rotation.fromArray(me.rotation);
 muzzle.set(combat.x,combat.y,combat.z).applyQuaternion(rotation);
 muzzle.x+=me.position[0];muzzle.y+=me.position[1];muzzle.z+=me.position[2];
 worldAim(direction,combat.yaw,combat.pitch);
 let best=MARKER_RANGE,id:string|null=null;
 for(const other of snapshot.entities){
  if(other.room_id!==me.room_id||other.id===me.id||!other.team||other.team===me.team||!other.health||other.health.defeated)continue;
  const half=other.collider?.chassis_half_extents??defaultHalf,offset=other.collider?.chassis_offset??defaultOffset;
  localRay.origin.copy(muzzle).sub(point.fromArray(other.position));
  if(localRay.origin.lengthSq()>(best+Math.max(...half)+2)**2)continue;
  rotation.fromArray(other.rotation).invert();
  localRay.origin.applyQuaternion(rotation);localRay.direction.copy(direction).applyQuaternion(rotation);
  box.min.set(offset[0]-half[0]-.15,offset[1]-half[1],offset[2]-half[2]-.15);
  box.max.set(offset[0]+half[0]+.15,offset[1]+half[1]+.35,offset[2]+half[2]+.15);
  if(!localRay.intersectBox(box,intersection))continue;
  const range=intersection.distanceTo(localRay.origin);
  if(range<best){best=range;id=other.id;}
 }
 return id;
}
