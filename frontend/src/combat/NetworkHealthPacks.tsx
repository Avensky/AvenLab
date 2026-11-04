import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {DataTexture,InstancedMesh,LineSegments,Object3D,SRGBColorSpace,Vector3} from 'three';
import {useNetworkStore,type HealthPackSnapshot,type PhysicsSnapshot} from '../store/session/networkStore';
import {visibleHealthPack} from './healthPackVisuals';

const LIMIT=16,HIT_LIFE=.4;
type Observed={pack:HealthPackSnapshot;hitAt:number;point:Vector3};

/** One camera-facing surface contains both the green case and the white cross. */
function packTexture(){
 const size=16,pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const cross=(x>=6&&x<=9&&y>=3&&y<=12)||(y>=6&&y<=9&&x>=3&&x<=12);
  pixels.set(cross?[237,255,247,255]:[44,186,121,255],4*(y*size+x));
 }
 const texture=new DataTexture(pixels,size,size);
 texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;return texture;
}

export function NetworkHealthPacks(){
 const packages=useRef<InstancedMesh>(null),hits=useRef<InstancedMesh>(null),trail=useRef<LineSegments>(null);
 const texture=useMemo(packTexture,[]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 const positions=useMemo(()=>new Float32Array(LIMIT*6),[]),scratch=useMemo(()=>new Object3D(),[]),nextPoint=useMemo(()=>new Vector3(),[]);
 const state=useMemo(()=>({room:-1,snapshot:null as PhysicsSnapshot|null,packets:new Map<string,Observed>(),live:new Set<string>()}),[]);
 useFrame(({clock,camera},delta)=>{
  const network=useNetworkStore.getState(),room=network.connected?network.getMe()?.room_id??-1:-1;
  const snapshot=room>=0?network.snapshot:null,now=clock.elapsedTime;
  if(snapshot!==state.snapshot||room!==state.room){
   if(room!==state.room)state.packets.clear();
   state.room=room;state.snapshot=snapshot;state.live.clear();
   for(const entity of snapshot?.entities??[]){
    const pack=visibleHealthPack(entity,room);
    if(!pack)continue;
    state.live.add(entity.id);
    const prior=state.packets.get(entity.id);
    if(!prior||prior.pack.seq!==pack.seq){
     state.packets.set(entity.id,{pack,hitAt:-Infinity,point:new Vector3(...pack.position)});
    }else{
     if(prior.pack.state==='flying'&&pack.state==='hit'&&pack.healed_hp>0){
      prior.hitAt=now;prior.point.fromArray(pack.position);
     }
     prior.pack=pack;
    }
   }
   for(const id of state.packets.keys())if(!state.live.has(id))state.packets.delete(id);
  }
  let count=0,hitCount=0;
  const lines=trail.current?.geometry.getAttribute('position');
  for(const observed of state.packets.values()){
   const pack=observed.pack;
   if(pack.state==='flying'&&count<LIMIT){
    nextPoint.fromArray(pack.position);observed.point.lerp(nextPoint,1-Math.exp(-20*Math.min(delta,.1)));
    scratch.position.copy(observed.point);scratch.quaternion.copy(camera.quaternion);
    scratch.scale.setScalar(.38);scratch.updateMatrix();packages.current?.setMatrixAt(count,scratch.matrix);
    lines?.setXYZ(count*2,...pack.origin);lines?.setXYZ(count*2+1,observed.point.x,observed.point.y,observed.point.z);count++;
   }
   if(pack.state==='hit'&&now-observed.hitAt<HIT_LIFE&&hitCount<LIMIT){
    const age=(now-observed.hitAt)/HIT_LIFE;scratch.position.copy(observed.point);scratch.quaternion.copy(camera.quaternion);
    scratch.scale.setScalar((.4+age*1.2)*(1-age));scratch.updateMatrix();hits.current?.setMatrixAt(hitCount++,scratch.matrix);
   }
  }
  if(packages.current){packages.current.count=count;packages.current.visible=count>0;if(count)packages.current.instanceMatrix.needsUpdate=true;}
  if(hits.current){hits.current.count=hitCount;hits.current.visible=hitCount>0;if(hitCount)hits.current.instanceMatrix.needsUpdate=true;}
  if(trail.current){trail.current.visible=count>0;trail.current.geometry.setDrawRange(0,count*2);if(count&&lines)lines.needsUpdate=true;}
 });
 return <group name="Confirmed health packs" userData={{hudSightTransparent:true}}>
  <lineSegments ref={trail} visible={false} frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions,3]}/></bufferGeometry><lineBasicMaterial color="#66eaa9" transparent opacity={.18} depthWrite={false}/></lineSegments>
  <instancedMesh ref={packages} visible={false} args={[undefined,undefined,LIMIT]} count={0} frustumCulled={false}><planeGeometry/><meshBasicMaterial map={texture} toneMapped={false}/></instancedMesh>
  <instancedMesh ref={hits} visible={false} args={[undefined,undefined,LIMIT]} count={0} frustumCulled={false}><torusGeometry args={[1,.1,4,20]}/><meshBasicMaterial color="#b0ffd4" toneMapped={false} transparent opacity={.8} depthWrite={false}/></instancedMesh>
 </group>;
}
