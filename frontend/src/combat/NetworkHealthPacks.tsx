import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {InstancedMesh,LineSegments,Object3D,Vector3} from 'three';
import {useNetworkStore} from '../store/session/networkStore';
import {visibleHealthPack} from './healthPackVisuals';

const LIMIT=16,HIT_LIFE=.4;
type Observed={seq:number;seenFlight:boolean;state:string;hitAt:number;point:Vector3};
/** Small pooled cosmetics for both players and observers. Flight/hit positions
 * come from Rust. Initial hit snapshots establish a baseline, never a replay. */
export function NetworkHealthPacks(){
 const packages=useRef<InstancedMesh>(null),crosses=useRef<InstancedMesh>(null),crossBars=useRef<InstancedMesh>(null),hits=useRef<InstancedMesh>(null),trail=useRef<LineSegments>(null);
 const positions=useMemo(()=>new Float32Array(LIMIT*6),[]),scratch=useMemo(()=>new Object3D(),[]),nextPoint=useMemo(()=>new Vector3(),[]);
 const state=useRef({room:-1,packets:new Map<string,Observed>()});
 useFrame(({clock,camera},delta)=>{
  const network=useNetworkStore.getState(),room=network.connected?network.getMe()?.room_id??-1:-1,s=state.current;
  if(room!==s.room){s.room=room;s.packets.clear();}
  let count=0,hitCount=0;const live=new Set<string>(),now=clock.elapsedTime,trailPositions=trail.current?.geometry.getAttribute('position');
  if(room>=0)for(const entity of network.snapshot?.entities??[]){
   const pack=visibleHealthPack(entity,room);if(!pack)continue;live.add(entity.id);
   let observed=s.packets.get(entity.id);
   if(!observed||observed.seq!==pack.seq){observed={seq:pack.seq,seenFlight:pack.state==='flying',state:pack.state,hitAt:-Infinity,point:new Vector3(...pack.position)};s.packets.set(entity.id,observed);}
   if(pack.state==='flying'&&count<LIMIT){
    observed.seenFlight=true;nextPoint.fromArray(pack.position);observed.point.lerp(nextPoint,1-Math.exp(-20*Math.min(delta,.1)));
    scratch.position.copy(observed.point);scratch.quaternion.copy(camera.quaternion);scratch.scale.set(.38,.38,.14);scratch.updateMatrix();packages.current?.setMatrixAt(count,scratch.matrix);
    scratch.scale.set(.08,.25,.16);scratch.updateMatrix();crosses.current?.setMatrixAt(count,scratch.matrix);scratch.scale.set(.25,.08,.16);scratch.updateMatrix();crossBars.current?.setMatrixAt(count,scratch.matrix);
    trailPositions?.setXYZ(count*2,...pack.origin);trailPositions?.setXYZ(count*2+1,observed.point.x,observed.point.y,observed.point.z);count++;
   }
   if(pack.state==='hit'&&observed.state!=='hit'&&observed.seenFlight&&pack.healed_hp>0){observed.hitAt=now;observed.point.fromArray(pack.position);}
   if(pack.state==='hit'&&now-observed.hitAt<HIT_LIFE&&hitCount<LIMIT){
    const age=(now-observed.hitAt)/HIT_LIFE;scratch.position.copy(observed.point);scratch.quaternion.copy(camera.quaternion);scratch.scale.setScalar((.4+age*1.2)*(1-age));scratch.updateMatrix();hits.current?.setMatrixAt(hitCount++,scratch.matrix);
   }
   observed.state=pack.state;
  }
  for(const id of s.packets.keys())if(!live.has(id))s.packets.delete(id);
  for(const mesh of [packages.current,crosses.current,crossBars.current])if(mesh){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}
  if(hits.current){hits.current.count=hitCount;hits.current.instanceMatrix.needsUpdate=true;}
  if(trail.current){trail.current.geometry.setDrawRange(0,count*2);trail.current.geometry.getAttribute('position').needsUpdate=true;}
 });
 return <group name="Confirmed health packs">
  <lineSegments ref={trail} frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions,3]}/></bufferGeometry><lineBasicMaterial color="#66eaa9" transparent opacity={.18} depthWrite={false}/></lineSegments>
  <instancedMesh ref={packages} args={[undefined,undefined,LIMIT]} count={0} frustumCulled={false}><boxGeometry args={[1,1,1]}/><meshBasicMaterial color="#2cba79" toneMapped={false}/></instancedMesh>
  <instancedMesh ref={crosses} args={[undefined,undefined,LIMIT]} count={0} frustumCulled={false}><boxGeometry args={[1,1,1]}/><meshBasicMaterial color="#edfff7" toneMapped={false}/></instancedMesh>
  <instancedMesh ref={crossBars} args={[undefined,undefined,LIMIT]} count={0} frustumCulled={false}><boxGeometry args={[1,1,1]}/><meshBasicMaterial color="#edfff7" toneMapped={false}/></instancedMesh>
  <instancedMesh ref={hits} args={[undefined,undefined,LIMIT]} count={0} frustumCulled={false}><torusGeometry args={[1,.1,4,20]}/><meshBasicMaterial color="#b0ffd4" toneMapped={false} transparent opacity={.8} depthWrite={false}/></instancedMesh>
 </group>;
}
