import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {DynamicDrawUsage,InstancedBufferAttribute,InstancedMesh,Matrix4,MeshBasicMaterial,PlaneGeometry,Quaternion,Vector3} from 'three';
import {useFleetPoseReader} from '../../hooks/usePhysicsInterpolator';
import {useNetworkStore} from '../../store/session/networkStore';
import {useGameStore} from '../../store/presentation/gameStore';
import {useUIStore} from '../../store/menus/uiStore';
import {useTireEffectsSettings} from './tireEffectsSettings';
import {SkidTrail,type Contact,type TrailSegment} from './skidTrail.ts';
import {VehicleFlags} from '../../store/input/protocol/inputMasks.ts';
import {createTireSqueal} from './tireSqueal';

const CAPACITY=2048,LIFETIME=60;
const TCS_SAMPLING={minIntensity:.14,minDistance:.18};
/** Shared, bounded decal pool for local and nearby remote wheels. */
export function TireEffects(){
 const getPose=useFleetPoseReader(),trails=useRef(new Map<string,SkidTrail>()),world=useRef<number|null>(null);
 const audio=useMemo(()=>createTireSqueal(),[]);
 const data=useMemo(()=>{
  const geometry=new PlaneGeometry(1,1),born=new InstancedBufferAttribute(new Float32Array(CAPACITY),1),strength=new InstancedBufferAttribute(new Float32Array(CAPACITY),1);
  born.setUsage(DynamicDrawUsage);strength.setUsage(DynamicDrawUsage);geometry.setAttribute('skidBorn',born);geometry.setAttribute('skidStrength',strength);
  const time={value:0};
  const material=new MeshBasicMaterial({color:'#111111',transparent:true,opacity:.68,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false});
  material.onBeforeCompile=shader=>{
   shader.uniforms.skidTime=time;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float skidBorn; attribute float skidStrength; varying float skidAge; varying float skidAlpha; uniform float skidTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\nskidAge=skidTime-skidBorn; skidAlpha=skidStrength;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float skidAge; varying float skidAlpha;').replace('#include <color_fragment>',`#include <color_fragment>\ndiffuseColor.a *= skidAlpha * (1.0-smoothstep(${LIFETIME-10}.0,${LIFETIME}.0,skidAge));`);
  };
  const mesh=new InstancedMesh(geometry,material,CAPACITY);mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;mesh.renderOrder=2;
  return {mesh,geometry,material,born,strength,time,cursor:0,count:0,matrix:new Matrix4(),position:new Vector3(),tangent:new Vector3(),normal:new Vector3(),right:new Vector3(),rotation:new Quaternion(),scale:new Vector3()};
 },[]);
 const frameData=useRef<typeof data|null>(null);
 useEffect(()=>{
  frameData.current=data;
  const unlock=(e:Event)=>{if(e.isTrusted)audio.unlock();};
  const silence=()=>audio.update(0,0);
  window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);document.addEventListener('visibilitychange',silence);
  return()=>{
   frameData.current=null;
   window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);document.removeEventListener('visibilitychange',silence);
   audio.dispose();data.mesh.dispose();data.geometry.dispose();data.material.dispose();
  };
 },[audio,data]);
 useFrame(({clock,camera})=>{
  const data=frameData.current;
  if(!data)return;
  const network=useNetworkStore.getState(),settings=useTireEffectsSettings.getState(),snapshot=network.snapshot,now=clock.elapsedTime;
  if(world.current!==network.room_id||!network.connected){world.current=network.room_id;trails.current.clear();data.cursor=0;data.count=0;data.mesh.count=0;}
  data.time.value=now;
  data.mesh.visible=settings.marks&&data.count>0;
  const audible=settings.volume>0&&useGameStore.getState().sound&&useUIStore.getState().overlay===null;
  const fresh=network.connected&&snapshot&&typeof snapshot.received_at_ms==='number'&&performance.now()-snapshot.received_at_ms<250;
  if(!fresh||document.hidden||(!settings.marks&&!audible)){trails.current.clear();audio.update(0,0);return;}
  let loudest=0,writes=false;
  const active=new Set<string>();
  const emit=(segment:TrailSegment)=>{
   const {from,to,normal}=segment;
   data.normal.fromArray(normal).normalize();data.tangent.fromArray(to).sub(data.position.fromArray(from));
   const length=data.tangent.length();data.tangent.addScaledVector(data.normal,-data.tangent.dot(data.normal));
   if(length<.01||data.tangent.lengthSq()<.0001)return;
   data.tangent.normalize();data.right.crossVectors(data.tangent,data.normal).normalize();data.tangent.crossVectors(data.normal,data.right).normalize();
   data.matrix.makeBasis(data.right,data.tangent,data.normal);data.rotation.setFromRotationMatrix(data.matrix);
   data.position.fromArray(from).add(data.scale.fromArray(to)).multiplyScalar(.5).addScaledVector(data.normal,.009);
   data.scale.set(.23,length+.025,1);data.matrix.compose(data.position,data.rotation,data.scale);
   const slot=data.cursor++%CAPACITY;data.mesh.setMatrixAt(slot,data.matrix);data.born.setX(slot,now);data.strength.setX(slot,segment.intensity);
   data.count=Math.min(CAPACITY,data.count+1);data.mesh.count=data.count;writes=true;
  };
  // Bounded work: effects for the closest 24 vehicles within 60 m.
  const nearby=[];
  for(const entity of snapshot.entities){
   const distanceSq=camera.position.distanceToSquared(data.position.fromArray(entity.position));
   if(distanceSq<60*60)nearby.push({entity,distanceSq});
  }
  nearby.sort((a,b)=>a.distanceSq-b.distanceSq);
  for(const {entity,distanceSq} of nearby.slice(0,24)){
   if(entity.health?.defeated)continue;
   const tcsEnabled=(entity.vehicle_mask&VehicleFlags.TCS)!==0;
   const pose=getPose(entity.id);if(!pose)continue;
   const falloff=audible&&distanceSq<45*45 ? 1-Math.sqrt(distanceSq)/45 : 0;
   for(const wheel of pose.wheels??[]){
    const contact=wheel.tire_contact;
    if(!wheel.grounded||!contact)continue;
    if(falloff>0&&contact.length===7&&contact.every(Number.isFinite))loudest=Math.max(loudest,Math.min(1,contact[6])*falloff);
    if(!settings.marks)continue;
    const key=entity.id+':'+entity.vehicle_id+':'+(entity.health?.stats?.respawns??0)+':'+wheel.id;active.add(key);
    const trail=trails.current.get(key)??new SkidTrail();trails.current.set(key,trail);
    // TCS reduces the visible trace density/strength only while enabled. The
    // off setting keeps the prior full-strength, full-density behavior.
    const markContact=tcsEnabled&&contact.length===7
      ? [contact[0],contact[1],contact[2],contact[3],contact[4],contact[5],contact[6]*.7] as Contact
      : contact;
    const segment=trail.sample(markContact,true,now,tcsEnabled?TCS_SAMPLING:undefined);
    if(segment)emit({...segment,intensity:Math.min(1,segment.intensity*(tcsEnabled?1:.5)+.5)});
   }
  }
  for(const key of trails.current.keys())if(!active.has(key))trails.current.delete(key);
  if(writes){data.mesh.visible=true;data.mesh.instanceMatrix.needsUpdate=true;data.born.needsUpdate=true;data.strength.needsUpdate=true;}
  audio.update(loudest,settings.volume);
 });
 return <primitive object={data.mesh}/>;
}
