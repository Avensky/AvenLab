import type {Bounds} from './roadKitCore.ts';
export type V2=[number,number];
export type Pose={x:number;z:number;yaw:number};
export type SnapLock={kind:'corner'|'edge';moving:number;fixed:number};
export type SnapResult={pose:Pose;lock:SnapLock|null;distance:number};
const add=(a:V2,b:V2):V2=>[a[0]+b[0],a[1]+b[1]],sub=(a:V2,b:V2):V2=>[a[0]-b[0],a[1]-b[1]],dot=(a:V2,b:V2)=>a[0]*b[0]+a[1]*b[1];
const norm=(a:V2):V2=>{const n=Math.hypot(...a);return[a[0]/n,a[1]/n];};
export function frameCorners(bounds:Bounds,pose:Pose):V2[]{
 const c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
 return [[bounds.min[0],bounds.min[2]],[bounds.max[0],bounds.min[2]],[bounds.max[0],bounds.max[2]],[bounds.min[0],bounds.max[2]]].map(([x,z])=>[pose.x+c*x+s*z,pose.z-s*x+c*z]);
}
function edges(corners:V2[]){return corners.map((a,i)=>{const b=corners[(i+1)%4],t=norm(sub(b,a));return{a,b,t,n:[t[1],-t[0]] as V2};});}
function overlaps(a:V2[],b:V2[]){
 for(const edge of [...edges(a),...edges(b)]){const ap=a.map(p=>dot(p,edge.n)),bp=b.map(p=>dot(p,edge.n));if(Math.min(Math.max(...ap),Math.max(...bp))-Math.max(Math.min(...ap),Math.min(...bp))<1e-5)return false;}
 return true;
}
export function magneticSnap(moving:Bounds,fixed:Bounds,desired:Pose,fixedPose:Pose,radius=1,previous:SnapLock|null=null):SnapResult{
 if(![desired.x,desired.z,desired.yaw,fixedPose.x,fixedPose.z,fixedPose.yaw,radius].every(Number.isFinite)||radius<=0)throw Error('Invalid snap request');
 const a=frameCorners(moving,desired),b=frameCorners(fixed,fixedPose),ae=edges(a),be=edges(b);
 function candidate(lock:SnapLock,limit:number):SnapResult|null{
  let shift:V2;
  if(lock.kind==='corner')shift=sub(b[lock.fixed],a[lock.moving]);
  else{
   const m=ae[lock.moving],f=be[lock.fixed];if(dot(m.n,f.n)>-.99999)return null;
   const ma=[dot(m.a,f.t),dot(m.b,f.t)],fa=[dot(f.a,f.t),dot(f.b,f.t)];if(Math.min(Math.max(...ma),Math.max(...fa))-Math.max(Math.min(...ma),Math.min(...fa))<=1e-5)return null;
   const d=dot(sub(f.a,m.a),f.n);shift=[f.n[0]*d,f.n[1]*d];
  }
  const distance=Math.hypot(...shift);if(distance>limit||overlaps(a.map(p=>add(p,shift)),b))return null;
  return{pose:{...desired,x:desired.x+shift[0],z:desired.z+shift[1]},lock,distance};
 }
 // A held target releases farther away than it engages, avoiding flicker.
 if(previous){const held=candidate(previous,radius*1.5);if(held)return held;}
 for(const kind of ['corner','edge'] as const){
  const candidates=[];for(let i=0;i<4;i++)for(let j=0;j<4;j++){const result=candidate({kind,moving:i,fixed:j},radius);if(result)candidates.push(result);}
  candidates.sort((x,y)=>x.distance-y.distance);if(candidates.length)return candidates[0];
 }
 return{pose:{...desired},lock:null,distance:0};
}
