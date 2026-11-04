import {useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {InstancedMesh,Object3D,Quaternion,Vector3} from 'three';
import {useNetworkStore} from '../store/session/networkStore';
import {weaponVisuals} from './weaponVisuals';

type Burst={position:Vector3;size:number;born:number;life:number};
type Mark={position:Vector3;rotation:Quaternion;size:number;born:number};
const MARK_LIMIT=64,BURST_LIMIT=48,MARK_LIFE=12;
/** Confirmed snapshot counters drive local and remote effects. No input prediction,
 * initial-snapshot replay, permanent debris or unbounded per-bullet scene nodes. */
export function NetworkCombatEffects(){
 const flashes=useRef<InstancedMesh>(null),scorches=useRef<InstancedMesh>(null);
 const state=useRef({shots:new Map<string,number>(),bursts:[] as Burst[],marks:[] as Mark[],room:-1});
 const scratch=useRef(new Object3D());
 useFrame(({clock})=>{
  const network=useNetworkStore.getState(),entities=network.snapshot?.entities??[],now=clock.elapsedTime,s=state.current;
  const room=network.getMe()?.room_id??-1;
  if(room!==s.room){s.room=room;s.shots.clear();s.bursts=[];s.marks=[];}
  const live=new Set<string>();
  for(const entity of entities){
   const c=entity.combat;if(entity.vehicle_id!=='tank'||!c)continue;
   live.add(entity.id);const previous=s.shots.get(entity.id);s.shots.set(entity.id,c.shot??0);
   if(previous===undefined||!c.shot||previous===c.shot)continue;
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
  s.bursts=s.bursts.filter(b=>now-b.born<b.life).slice(-BURST_LIMIT);
  s.marks=s.marks.filter(m=>now-m.born<MARK_LIFE).slice(-MARK_LIMIT);
  const object=scratch.current;
  if(flashes.current){s.bursts.forEach((b,i)=>{const fraction=(now-b.born)/b.life;object.position.copy(b.position);object.quaternion.identity();object.scale.setScalar(b.size*(1+fraction*2)*(1-fraction));object.updateMatrix();flashes.current!.setMatrixAt(i,object.matrix);});flashes.current.count=s.bursts.length;flashes.current.instanceMatrix.needsUpdate=true;}
  if(scorches.current){s.marks.forEach((m,i)=>{object.position.copy(m.position);object.quaternion.copy(m.rotation);object.scale.setScalar(m.size*Math.min(1,(MARK_LIFE-now+m.born)/2));object.updateMatrix();scorches.current!.setMatrixAt(i,object.matrix);});scorches.current.count=s.marks.length;scorches.current.instanceMatrix.needsUpdate=true;}
 });
 return <group name="Confirmed weapon effects">
  <instancedMesh ref={flashes} args={[undefined,undefined,BURST_LIMIT]} count={0} frustumCulled={false}><sphereGeometry args={[1,8,6]}/><meshBasicMaterial color="#ffbc55" toneMapped={false} transparent opacity={.8} depthWrite={false}/></instancedMesh>
  <instancedMesh ref={scorches} args={[undefined,undefined,MARK_LIMIT]} count={0} frustumCulled={false}><circleGeometry args={[1,12]}/><meshBasicMaterial color="#201b17" transparent opacity={.7} depthWrite={false} polygonOffset polygonOffsetFactor={-2}/></instancedMesh>
 </group>;
}
