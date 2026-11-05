import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Color,InstancedMesh,Object3D} from 'three';
import {useFleetPoseReader} from '../hooks/usePhysicsInterpolator';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {writeInstanceMatrix} from './writeInstanceMatrix';
import type {RosterEntity} from './rosterSelector';
import positions from './tools/lampPositions.json';

export const SERVICE_BRAKE_LAMP=1<<12;
type Lamps=typeof positions[keyof typeof positions];
type Point=[number,number,number];
type Lamp={at:Point; size:Point; kind:'head'|'tail'|'stop'|'plate'};
function layout(p:Lamps):Lamp[] {
  const lamps:Lamp[]=[];
  for(const side of [-1,1]){
    lamps.push({kind:'head',at:[p.head[0]*side,p.head[1],p.head[2]],size:[.105,.045,.035]},
      {kind:'tail',at:[p.tail[0]*side,p.tail[1],p.tail[2]],size:[.12,.045,.035]},
      {kind:'stop',at:[(p.tail[0]-.14)*side,p.tail[1],p.tail[2]],size:[.08,.04,.035]},
      {kind:'plate',at:[side*.105,p.plate[1]+.06,p.plate[2]],size:[.045,.015,.025]});
  }
  lamps.push({kind:'stop',at:[0,p.center[1],p.center[2]],size:[.16,.026,.022]});
  return lamps;
}
const signals=Object.fromEntries(Object.entries(positions).map(([k,p])=>[k,layout(p)]));
const codes={head:1,tail:2,stop:3,plate:4};
const colors={head:new Color('#fff1d7'),tail:new Color('#88272a'),stop:new Color('#ff302b'),plate:new Color('#e8e2ce')};
export function lampSignal(kind:Lamp['kind'],night:boolean,brake:boolean) {
  if(kind==='stop')return brake?'stop':null;
  if(kind==='tail' && brake)return 'stop';
  return night?kind:null;
}
/** The entire road fleet shares one unlit draw. Plate bulbs, center stops and
 * rear running lights never add shadow maps or per-vehicle scene lights. */
export function ExteriorMarkers({cars}:{cars:RosterEntity[]}) {
  const mesh=useRef<InstancedMesh>(null!);
  const read=useFleetPoseReader();
  const scratch=useMemo(()=>({body:new Object3D(),lamp:new Object3D(),tones:new Uint8Array(Math.max(1,cars.length*9))}),[cars.length]);
  useFrame(()=>{
    if(!mesh.current)return;
    const batch=mesh.current;let count=0,dirty=false,tints=false;
    for(const car of cars){
      const lamps=signals[car.vehicle_id??''];if(!lamps)continue;
      const pose=read(car.id);if(!pose)continue;
      const night=!!((pose.vehicle_mask??0)&VehicleFlags.HEADLIGHTS)||!!((pose.cluster_mask??0)&8);
      const brake=!!((pose.cluster_mask??0)&SERVICE_BRAKE_LAMP);
      if(!night&&!brake)continue;
      const body=scratch.body,lamp=scratch.lamp;
      body.position.fromArray(pose.position);body.quaternion.fromArray(pose.rotation);body.updateMatrix();
      const base=(car.collider?.nominal_wheel_center_y??-.3)-(car.collider?.wheel_radius??.33);
      for(const source of lamps){
        const signal=lampSignal(source.kind,night,brake);if(!signal)continue;
        lamp.position.fromArray(source.at);lamp.position.y+=base;lamp.scale.fromArray(source.size);lamp.updateMatrix();
        lamp.matrix.premultiply(body.matrix);
        dirty=writeInstanceMatrix(batch,count,lamp.matrix)||dirty;
        if(scratch.tones[count]!==codes[signal]){
          scratch.tones[count]=codes[signal];
          batch.setColorAt(count,colors[signal]);tints=true;
        }
        count++;
      }
    }
    batch.count=count;
    if(dirty)batch.instanceMatrix.needsUpdate=true;
    if(tints && batch.instanceColor)batch.instanceColor.needsUpdate=true;
  });
  return <instancedMesh ref={mesh} args={[undefined,undefined,Math.max(1,cars.length*9)]} frustumCulled={false} count={0}>
    <sphereGeometry args={[1,8,6]}/><meshBasicMaterial toneMapped={false}/>
  </instancedMesh>;
}
