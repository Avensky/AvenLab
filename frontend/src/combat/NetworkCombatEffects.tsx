import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Color,InstancedMesh,Object3D,Quaternion,Vector3} from 'three';
import {useNetworkStore,type PhysicsEntitySnapshot,type PhysicsSnapshot} from '../store/session/networkStore';
import {weaponVisuals} from './weaponVisuals';
import {worldAim} from './turretPresentation';
import {emitAbilitySparks} from './abilitySparks';

const weaponSpark=new Color('#ffbc55'),healingSpark=new Color('#76efb1');
type Burst={position:Vector3;color:Color;size:number;born:number;life:number};
type Mark={position:Vector3;rotation:Quaternion;size:number;born:number};
const MARK_LIMIT=64,BURST_LIMIT=48,MARK_LIFE=12;
/** Confirmed snapshot counters drive local and remote effects. No input prediction,
 * initial-snapshot replay, permanent debris or unbounded per-bullet scene nodes. */
export function NetworkCombatEffects(){
 const flashes=useRef<InstancedMesh>(null),scorches=useRef<InstancedMesh>(null);
 const state=useMemo(()=>({snapshot:null as PhysicsSnapshot|null,observed:new Map<string,PhysicsEntitySnapshot>(),
  live:new Set<string>(),bursts:[] as Burst[],marks:[] as Mark[],room:-1}),[]);
 const scratch=useRef(new Object3D());
 useFrame(({clock})=>{
  const network=useNetworkStore.getState(),snapshot=network.connected?network.snapshot:null,now=clock.elapsedTime,s=state;
  // Only receipt of a new snapshot can create shots. An idle render frame
  // need not walk every vehicle or upload empty instance matrices.
  if(snapshot!==s.snapshot){
   s.snapshot=snapshot;
   const room=network.getMe()?.room_id??network.room_id??-1;
   if(!snapshot||room!==s.room){s.room=room;s.observed.clear();s.bursts.length=0;s.marks.length=0;}
   const live=s.live;live.clear();
   for(const entity of snapshot?.entities??[]){
    if(room!==-1&&entity.room_id!==room)continue;
    if(!entity.combat&&!entity.support&&!entity.guard)continue;
    live.add(entity.id);
    const previous=s.observed.get(entity.id);
    s.observed.set(entity.id,entity);
    if(!previous||previous.vehicle_id!==entity.vehicle_id)continue;
    emitAbilitySparks(previous,entity,(point,healing)=>{
      s.bursts.push({position:new Vector3(...point),color:healing?healingSpark:weaponSpark,size:.32,born:now,life:.22});
    });
    const c=entity.combat,lastShot=previous.combat?.shot;
    if(!c||lastShot===undefined||!c.shot||c.shot<=lastShot)continue;
    const weapon=c.shot_weapon||c.weapon,cannon=entity.vehicle_id==='tank' && (weapon==='cannon'||!weapon);
    const anchor=weaponVisuals.get(entity.id)?.[weapon==='basket'?'basket':cannon?'cannon':'coax'];
    const direction=worldAim(new Vector3(),c.yaw,c.pitch);
    const muzzle=anchor?anchor.getWorldPosition(new Vector3()):c.shot_origin?new Vector3(...c.shot_origin):new Vector3(c.x,c.y,c.z).applyQuaternion(new Quaternion(...entity.rotation)).add(new Vector3(...entity.position)).addScaledVector(direction,cannon?4.1:1.05);
    s.bursts.push({position:muzzle,color:weaponSpark,size:cannon?.45:.12,born:now,life:cannon?.12:.065});
    if(c.impact&&c.impact.every(Number.isFinite)){
     const normal=c.impact_normal?new Vector3(...c.impact_normal).normalize():direction.clone().negate();
     const position=new Vector3(...c.impact).addScaledVector(normal,.025);
     s.bursts.push({position,color:weaponSpark,size:cannon?1.15:.20,born:now,life:cannon?.28:.12});
     if(weapon!=='spray'&&c.impact_static&&c.impact_normal)s.marks.push({position,rotation:new Quaternion().setFromUnitVectors(new Vector3(0,0,1),normal),size:cannon?.65:.12,born:now});
    }
   }
   for(const id of s.observed.keys())if(!live.has(id))s.observed.delete(id);
   if(s.bursts.length>BURST_LIMIT)s.bursts.splice(0,s.bursts.length-BURST_LIMIT);
   if(s.marks.length>MARK_LIMIT)s.marks.splice(0,s.marks.length-MARK_LIMIT);
  }
  for(let i=s.bursts.length-1;i>=0;i--)if(now-s.bursts[i].born>=s.bursts[i].life)s.bursts.splice(i,1);
  while(s.marks.length && now-s.marks[0].born>=MARK_LIFE)s.marks.shift();
  const object=scratch.current;
  const flashMesh=flashes.current;
  if(flashMesh){
   flashMesh.count=s.bursts.length;
   s.bursts.forEach((burst,i)=>{
    const age=(now-burst.born)/burst.life;
    object.position.copy(burst.position);
    object.quaternion.identity();
    object.scale.setScalar(burst.size*(1+age*2)*(1-age));
    object.updateMatrix();
    flashMesh.setMatrixAt(i,object.matrix);
    flashMesh.setColorAt(i,burst.color);
   });
   if(flashMesh.count){
    flashMesh.instanceMatrix.needsUpdate=true;
    if(flashMesh.instanceColor)flashMesh.instanceColor.needsUpdate=true;
   }
  }
  if(scorches.current){s.marks.forEach((m,i)=>{object.position.copy(m.position);object.quaternion.copy(m.rotation);object.scale.setScalar(m.size*Math.min(1,(MARK_LIFE-now+m.born)/2));object.updateMatrix();scorches.current!.setMatrixAt(i,object.matrix);});scorches.current.count=s.marks.length;if(s.marks.length)scorches.current.instanceMatrix.needsUpdate=true;}
 });
 return <group name="Confirmed weapon effects" userData={{hudSightTransparent:true}}>
  <instancedMesh ref={flashes} args={[undefined,undefined,BURST_LIMIT]} count={0} frustumCulled={false}><sphereGeometry args={[1,8,6]}/><meshBasicMaterial color="white" toneMapped={false} transparent opacity={.8} depthWrite={false}/></instancedMesh>
  <instancedMesh ref={scorches} args={[undefined,undefined,MARK_LIMIT]} count={0} frustumCulled={false}><circleGeometry args={[1,12]}/><meshBasicMaterial color="#201b17" transparent opacity={.7} depthWrite={false} polygonOffset polygonOffsetFactor={-2}/></instancedMesh>
 </group>;
}
