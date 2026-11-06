import {useGLTF} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import {useMemo,useRef} from 'react';
import type {Group,Object3D} from 'three';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';

const HAWAII='/models/fleet/hawaii-rescue.glb';
// The source FBX was modeled at ~5 units bow-to-stern. It is kept small on
// disk; the same full-size 154 m hull is used for visible ship and collider.
const SCALE:[number,number,number]=[12,12,31];

export function NavalVessel({entityId}:{entityId:string}){
  const body=useRef<Group>(null);
  const {getInterpolated}=useVehiclePhysicsInterpolator(entityId);
  const {scene}=useGLTF(HAWAII);
  const {root,radars,launchers}=useMemo(()=>{
    const root=scene.clone(true),radars:Object3D[]=[],launchers:Object3D[]=[];
    root.traverse(object=>{
      if (/^RadarDish/i.test(object.name)) radars.push(object);
      if (/^NASM Launcher/i.test(object.name)) launchers.push(object);
    });
    return {root,radars,launchers};
  },[scene]);
  const elapsed=useRef(0);
  useFrame((_,delta)=>{
    const pose=getInterpolated(entityId);
    if(!body.current) return;
    body.current.visible=!!pose;
    if(!pose)return;
    body.current.position.fromArray(pose.position);
    body.current.quaternion.fromArray(pose.rotation);
    const dt=Math.min(delta,0.05);
    elapsed.current+=dt;
    // Visual idle motion uses authored pivots. Weapons do not fire or deal
    // damage until the server owns target acquisition and projectiles.
    for(const radar of radars)radar.rotation.y+=dt*0.16;
    for(let i=0;i<launchers.length;i++)
      launchers[i].rotation.y=Math.sin(elapsed.current*0.22+i*0.9)*0.12;
  });
  return <group ref={body} visible={false} dispose={null} name={`naval-rescue-${entityId}`}>
    <group scale={SCALE}><primitive object={root} dispose={null}/></group>
  </group>;
}
