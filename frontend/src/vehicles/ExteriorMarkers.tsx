import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Color,InstancedMesh,Object3D} from 'three';
import {useFleetPoseReader} from '../hooks/usePhysicsInterpolator';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {writeInstanceMatrix} from './writeInstanceMatrix';
import type {RosterEntity} from './rosterSelector';
import {signals, lampSignal, lampsPerCar, lampFloor, SERVICE_BRAKE_LAMP} from './tools/roadLamps';
export {lampSignal, SERVICE_BRAKE_LAMP} from './tools/roadLamps';

const codes={head:1,tail:2,stop:3,plate:4,amber:5,fog:6};
const colors={head:new Color('#fff6df'),tail:new Color('#98232a'),stop:new Color('#ff302b'),
  plate:new Color('#e8e2ce'),amber:new Color('#ffa31b'),fog:new Color('#ffeac6')};
/** The entire road fleet shares one unlit draw. Plate bulbs, center stops and
 * rear running lights never add shadow maps or per-vehicle scene lights. */
export function ExteriorMarkers({cars}:{cars:RosterEntity[]}) {
  const mesh=useRef<InstancedMesh>(null!);
  const read=useFleetPoseReader();
  const scratch=useMemo(()=>({body:new Object3D(),lamp:new Object3D(),tones:new Uint8Array(Math.max(1,cars.length*lampsPerCar))}),[cars.length]);
  useFrame(({clock})=>{
    if(!mesh.current)return;
    const batch=mesh.current;let count=0,dirty=false,tints=false;
    for(const car of cars){
      const lamps=signals[car.vehicle_id??''];if(!lamps)continue;
      const pose=read(car.id);if(!pose)continue;
      const night=!!((pose.vehicle_mask??0)&VehicleFlags.HEADLIGHTS)||!!((pose.cluster_mask??0)&8);
      const brake=!!((pose.cluster_mask??0)&SERVICE_BRAKE_LAMP);
      const mask = pose.vehicle_mask ?? 0;
      if (!night && !brake && !(mask & (VehicleFlags.HAZARDS | VehicleFlags.BLINKER_LEFT | VehicleFlags.BLINKER_RIGHT))) continue;
      const blink = clock.elapsedTime % 1 < .5;
      const high = Boolean((pose.cluster_mask ?? 0) & 8);
      const body=scratch.body,lamp=scratch.lamp;
      body.position.fromArray(pose.position);body.quaternion.fromArray(pose.rotation);body.updateMatrix();
      const base=lampFloor(car);
      for(const source of lamps){
        const signal=lampSignal(source.kind,night,brake,mask,blink,high);if(!signal)continue;
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
  return <instancedMesh ref={mesh} args={[undefined,undefined,Math.max(1,cars.length*lampsPerCar)]} frustumCulled={false} count={0}>
    <sphereGeometry args={[1,8,6]}/><meshBasicMaterial toneMapped={false}/>
  </instancedMesh>;
}
