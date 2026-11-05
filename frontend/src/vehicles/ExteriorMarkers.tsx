import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {DataTexture,DoubleSide,LinearFilter,RedFormat,InstancedBufferAttribute,InstancedMesh,Object3D,ShaderMaterial,Vector3} from 'three';
import {useFleetPoseReader} from '../hooks/usePhysicsInterpolator';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {writeInstanceMatrix} from './writeInstanceMatrix';
import type {RosterEntity} from './rosterSelector';
import {AE_HINGE,bytes,lampSignal,lensGeometry,lensProfiles,placeModel,popupAngle,SERVICE_BRAKE_LAMP} from './tools/roadLamps';
export {lampSignal,SERVICE_BRAKE_LAMP} from './tools/roadLamps';

// One draw per visible model. Each vertex follows a measured GLB lamp surface.
// A turn filament can take over one brake chamber without masking the opposite side.
function surfaceMaterial(mask?:DataTexture) {
  return new ShaderMaterial({
    uniforms:{hinge:{value:new Vector3(...AE_HINGE)},redMask:{value:mask}},
    defines:mask ? {PROFILE_RED_MASK:1} : {},
    transparent:true,depthWrite:false,side:DoubleSide,forceSinglePass:true,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3,toneMapped:false,
    vertexShader:`
      uniform vec3 hinge;
      attribute float lensRole;
      attribute vec4 lampState;
      attribute float lift;
      varying vec4 lightColor;
      #ifdef PROFILE_RED_MASK
        varying vec2 lensUV;
        varying float masked;
      #endif
      void main() {
        #ifdef PROFILE_RED_MASK
          lensUV=uv;
          masked=(lensRole==4. || lensRole==8. || lensRole==9.) ? 1. : 0.;
        #endif
        vec3 p=position;
        float night=lampState.x, brake=lampState.y, l=lampState.z, r=lampState.w;
        float code=lensRole;
        vec3 warm=vec3(1.0,.90,.70), amber=vec3(1.0,.31,.018);
        vec4 tail=brake>.5 ? vec4(1.,.018,.009,.93) : vec4(.71,.012,.006,night>.5 ? .42 : 0.);
        lightColor=vec4(0.);
        if(code==1. || code==2.) lightColor=vec4(warm,night>.5 ? .88 : 0.);
        if(code==2.) {
          vec3 d=p-hinge;
          p=hinge+vec3(d.x,cos(lift)*d.y-sin(lift)*d.z,sin(lift)*d.y+cos(lift)*d.z);
        }
        if(code==3.) lightColor=vec4(1.,.60,.19,night==1. ? .78 : 0.);
        if(code==4.) lightColor=tail;
        if(code==5.) lightColor=vec4(1.,.018,.009,brake*.91);
        if(code==6. || code==7.) lightColor=vec4(amber,(code==6. ? l : r)>1.5 ? .92 : 0.);
        if(code==8. || code==9.) {
          float turn=code==8. ? l : r;
          lightColor=turn<.5 ? tail : vec4(1.,.025,.009,turn>1.5 ? .94 : 0.);
        }
        if(code==10.) lightColor=vec4(.89,.81,.63,night>.5 ? .49 : 0.);
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);
      }`,
    fragmentShader:`
      varying vec4 lightColor;
      #ifdef PROFILE_RED_MASK
        uniform sampler2D redMask;
        varying vec2 lensUV;
        varying float masked;
      #endif
      void main(){
        vec4 lit=lightColor;
        #ifdef PROFILE_RED_MASK
          if(masked>.5) lit.a*=texture2D(redMask,lensUV).r;
        #endif
        if(lit.a<.01) discard;
        gl_FragColor=lit;
        #include <colorspace_fragment>
      }`,
  });
}

function ModelLenses({id,cars}:{id:string;cars:RosterEntity[]}) {
  const batch=useRef<InstancedMesh>(null);
  const read=useFleetPoseReader();
  const tilts=useMemo(()=>new Map<string,number>(),[cars]);
  const draw=useMemo(()=>{
    const geometry=lensGeometry(lensProfiles[id]);
    const state=new InstancedBufferAttribute(new Float32Array(cars.length*4),4);
    const lift=new InstancedBufferAttribute(new Float32Array(cars.length),1);
    geometry.setAttribute('lampState',state);geometry.setAttribute('lift',lift);
    const encoded=lensProfiles[id].mask;
    const mask=encoded ? new DataTexture(bytes(encoded),128,128,RedFormat) : undefined;
    if(mask){mask.minFilter=mask.magFilter=LinearFilter;mask.needsUpdate=true;}
    return {geometry,state,lift,mask,material:surfaceMaterial(mask),body:new Object3D(),offset:new Vector3()};
  },[id,cars.length]);
  useEffect(()=>()=>{draw.geometry.dispose();draw.material.dispose();draw.mask?.dispose();},[draw]);
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
