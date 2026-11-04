import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {InstancedMesh,Object3D,Quaternion,Vector3} from 'three';
import {useNetworkStore,type PhysicsSnapshot} from '../store/session/networkStore';
import {weaponVisuals} from './weaponVisuals';

type Burst={position:Vector3;size:number;born:number;life:number};
type Mark={position:Vector3;rotation:Quaternion;size:number;born:number};
const MARK_LIMIT=64,BURST_LIMIT=48,MARK_LIFE=12;
/** Confirmed snapshot counters drive local and remote effects. No input prediction,
 * initial-snapshot replay, permanent debris or unbounded per-bullet scene nodes. */
export function NetworkCombatEffects(){
 const flashes=useRef<InstancedMesh>(null),scorches=useRef<InstancedMesh>(null);
 const state=useMemo(()=>({snapshot:null as PhysicsSnapshot|null,shots:new Map<string,number>(),
  live:new Set<string>(),bursts:[] as Burst[],marks:[] as Mark[],room:-1}),[]);
 const scratch=useRef(new Object3D());
 useFrame(({clock})=>{
  const network=useNetworkStore.getState(),snapshot=network.connected?network.snapshot:null,now=clock.elapsedTime,s=state;
  // Only receipt of a new snapshot can create shots. An idle render frame
  // need not walk every vehicle or upload empty instance matrices.
  if(snapshot!==s.snapshot){
   s.snapshot=snapshot;
   const room=network.getMe()?.room_id??network.room_id??-1;
   if(!snapshot||room!==s.room){s.room=room;s.shots.clear();s.bursts.length=0;s.marks.length=0;}
   const live=s.live;live.clear();
   for(const entity of snapshot?.entities??[]){
    if(room!==-1&&entity.room_id!==room)continue;
    const c=entity.combat;if(entity.vehicle_id!=='tank'||!c)continue;
    live.add(entity.id);const previous=s.shots.get(entity.id);s.shots.set(entity.id,c.shot??0);
    if(previous===undefined||!c.shot||previous>=c.shot)continue;
    const weapon=c.shot_weapon||c.weapon,cannon=weapon!=='coax'&&weapon!=='basket',anchor=weaponVisuals.get(entity.id)?.[weapon==='basket'?'basket':cannon?'cannon':'coax'];
    const direction=new Vector3(-Math.sin(c.yaw)*Math.cos(c.pitch),Math.sin(c.pitch),-Math.cos(c.yaw)*Math.cos(c.pitch));
    const muzzle=anchor?anchor.getWorldPosition(new Vector3()):c.shot_origin?new Vector3(...c.shot_origin):new Vector3(c.x,c.y,c.z).applyQuaternion(new Quaternion(...entity.rotation)).add(new Vector3(...entity.position)).addScaledVector(direction,cannon?4.1:1.05);
    s.bursts.push({position:muzzle,size:cannon?.45:.12,born:now,life:cannon?.12:.065});
    if(c.impact&&c.impact.every(Number.isFinite)){
     const normal=c.impact_normal?new Vector3(...c.impact_normal).normalize():direction.clone().negate();
     const position=new Vector3(...c.impact).addScaledVector(normal,.025);
     s.bursts.push({position,size:cannon?1.15:.20,born:now,life:cannon?.28:.12});
     if(c.impact_static&&c.impact_normal)s.marks.push({position,rotation:new Quaternion().setFromUnitVectors(new Vector3(0,0,1),normal),size:cannon?.65:.12,born:now});
    }
   }
   for(const id of s.shots.keys())if(!live.has(id))s.shots.delete(id);
   if(s.bursts.length>BURST_LIMIT)s.bursts.splice(0,s.bursts.length-BURST_LIMIT);
   if(s.marks.length>MARK_LIMIT)s.marks.splice(0,s.marks.length-MARK_LIMIT);
  }
  for(let i=s.bursts.length-1;i>=0;i--)if(now-s.bursts[i].born>=s.bursts[i].life)s.bursts.splice(i,1);
  while(s.marks.length && now-s.marks[0].born>=MARK_LIFE)s.marks.shift();
  const object=scratch.current;
  if(flashes.current){s.bursts.forEach((b,i)=>{const fraction=(now-b.born)/b.life;object.position.copy(b.position);object.quaternion.identity();object.scale.setScalar(b.size*(1+fraction*2)*(1-fraction));object.updateMatrix();flashes.current!.setMatrixAt(i,object.matrix);});flashes.current.count=s.bursts.length;if(s.bursts.length)flashes.current.instanceMatrix.needsUpdate=true;}
  if(scorches.current){s.marks.forEach((m,i)=>{object.position.copy(m.position);object.quaternion.copy(m.rotation);object.scale.setScalar(m.size*Math.min(1,(MARK_LIFE-now+m.born)/2));object.updateMatrix();scorches.current!.setMatrixAt(i,object.matrix);});scorches.current.count=s.marks.length;if(s.marks.length)scorches.current.instanceMatrix.needsUpdate=true;}
 });
 return <group name="Confirmed weapon effects">
  <instancedMesh ref={flashes} args={[undefined,undefined,BURST_LIMIT]} count={0} frustumCulled={false}><sphereGeometry args={[1,8,6]}/><meshBasicMaterial color="#ffbc55" toneMapped={false} transparent opacity={.8} depthWrite={false}/></instancedMesh>
  <instancedMesh ref={scorches} args={[undefined,undefined,MARK_LIMIT]} count={0} frustumCulled={false}><circleGeometry args={[1,12]}/><meshBasicMaterial color="#201b17" transparent opacity={.7} depthWrite={false} polygonOffset polygonOffsetFactor={-2}/></instancedMesh>
 </group>;
}
