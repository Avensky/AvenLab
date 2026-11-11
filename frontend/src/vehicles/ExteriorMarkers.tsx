import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {InstancedMesh,Object3D,Vector3} from 'three';
import {useFleetPoseReader} from '../hooks/usePhysicsInterpolator';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {writeInstanceMatrix} from './writeInstanceMatrix';
import type {RosterEntity} from './rosterSelector';
import {lampSignal,lensProfiles,placeModel,popupAngle,SERVICE_BRAKE_LAMP} from './tools/roadLamps';
import {prepareRoadLampSurface} from './tools/roadLampSurface';
export {lampSignal,SERVICE_BRAKE_LAMP} from './tools/roadLamps';

// One draw per visible model. Each vertex follows a measured GLB lamp surface.
// A turn filament can take over one brake chamber without masking the opposite side.
function ModelLenses({id,cars}:{id:string;cars:RosterEntity[]}) {
  const batch=useRef<InstancedMesh>(null);
  const read=useFleetPoseReader();
  const tilts=useMemo(()=>new Map<string,number>(),[cars]);
  const draw=useMemo(()=>({...prepareRoadLampSurface(lensProfiles[id],cars.length),body:new Object3D(),offset:new Vector3()}),[id,cars.length]);
  useEffect(()=>()=>draw.dispose(),[draw]);
  useFrame(({clock},dt)=>{
    const mesh=batch.current;if(!mesh)return;
    const blink=clock.elapsedTime%1<.5;
    let count=0,dirty=false,stateChanged=false;
    for(const car of cars) {
      const pose=read(car.id);if(!pose)continue;
      const mask=pose.vehicle_mask??0,cluster=pose.cluster_mask??0;
      const high=Boolean(cluster&8),on=high||Boolean(mask&VehicleFlags.HEADLIGHTS);
      const brake=Boolean(cluster&SERVICE_BRAKE_LAMP),hazard=Boolean(mask&VehicleFlags.HAZARDS);
      const left=hazard||Boolean(mask&VehicleFlags.BLINKER_LEFT);
      const right=hazard||Boolean(mask&VehicleFlags.BLINKER_RIGHT);
      const angle=id==='ae86' ? popupAngle(tilts.get(car.id)??0,on,high,dt) : 0;
      if(id==='ae86')tilts.set(car.id,angle);
      if(!on&&!brake&&!left&&!right)continue;
      draw.body.position.fromArray(pose.position);draw.body.quaternion.fromArray(pose.rotation);
      placeModel(draw.body,car,draw.offset);
      dirty=writeInstanceMatrix(mesh,count,draw.body.matrix)||dirty;
      const night=high?2:on?1:0;
      const l=left ? lampSignal('left',on,brake,mask,blink) ? 2 : 1 : 0;
      const r=right ? lampSignal('right',on,brake,mask,blink) ? 2 : 1 : 0;
      const stop=Number(brake);
      if(draw.state.getX(count)!==night||draw.state.getY(count)!==stop||
         draw.state.getZ(count)!==l||draw.state.getW(count)!==r||draw.lift.getX(count)!==Math.fround(angle)){
        draw.state.setXYZW(count,night,stop,l,r);draw.lift.setX(count,angle);stateChanged=true;
      }
      count++;
    }
    mesh.count=count;
    if(dirty)mesh.instanceMatrix.needsUpdate=true;
    if(stateChanged){draw.state.needsUpdate=true;draw.lift.needsUpdate=true;}
  });
  return <instancedMesh args={[draw.geometry,draw.material,cars.length]} ref={batch} count={0}
    frustumCulled={false} renderOrder={2} dispose={null}/>;
}

export function ExteriorMarkers({cars}:{cars:RosterEntity[]}) {
  const groups=useMemo(()=>{
    const models=new Map<string,RosterEntity[]>();
    for(const car of cars){
      const id=car.vehicle_id??'';
      if(!lensProfiles[id])continue;
      const group=models.get(id)??[];group.push(car);models.set(id,group);
    }
    return [...models];
  },[cars]);
  return <>{groups.map(([id,group])=><ModelLenses key={id} id={id} cars={group}/>)}</>;
}
