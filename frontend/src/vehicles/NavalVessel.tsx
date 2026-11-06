import {useGLTF} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import {useEffect,useMemo,useRef} from 'react';
import {Color,Mesh,MeshStandardMaterial,type Group,type Object3D} from 'three';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';
import {snapshotEntity,useNetworkStore} from '../store/session/networkStore';

const HAWAII='/models/fleet/hawaii-rescue.glb';
const LOUISIANA='/models/fleet/louisiana-lod0.glb';
// The source FBX was modeled at ~5 units bow-to-stern. It is kept small on
// disk; the same full-size 154 m hull is used for visible ship and collider.
const SCALE:[number,number,number]=[12,12,31];

export function NavalVessel({entityId,model='hawaii-rescue'}:{entityId:string;model?:'hawaii-rescue'|'louisiana'}){
  const body=useRef<Group>(null);
  const {getInterpolated}=useVehiclePhysicsInterpolator(entityId);
  const {scene}=useGLTF(model==='louisiana'?LOUISIANA:HAWAII);
  const {root,radars,launchers,paint}=useMemo(()=>{
    const root=scene.clone(true),radars:Object3D[]=[],launchers:Object3D[]=[],paint:MeshStandardMaterial[]=[];
    root.traverse(object=>{
      if (/^RadarDish/i.test(object.name)) radars.push(object);
      if (/^NASM Launcher/i.test(object.name)) launchers.push(object);
      // Hawaii has separate authored hull materials. Preserve glass, lights,
      // weapons and deck equipment, and never mutate useGLTF's shared materials.
      if(model==='hawaii-rescue'&&object instanceof Mesh && object.material instanceof MeshStandardMaterial &&
         /^Hull(?:\.|$)/i.test(object.material.name)){
        const painted=object.material.clone();object.material=painted;paint.push(painted);
      }
    });
    return {root,radars,launchers,paint};
  },[scene,model]);
  const elapsed=useRef(0);
  const previousPaint=useRef('');
  useEffect(()=>{previousPaint.current='';return()=>paint.forEach(material=>material.dispose());},[paint]);
  useFrame((_,delta)=>{
    const pose=getInterpolated(entityId);
    if(!body.current) return;
    body.current.visible=!!pose;
    if(!pose)return;
    body.current.position.fromArray(pose.position);
    body.current.quaternion.fromArray(pose.rotation);
    const dt=Math.min(delta,0.05);
    elapsed.current+=dt;
    const requested=snapshotEntity(useNetworkStore.getState().snapshot,entityId)?.appearance?.body??'factory';
    if(previousPaint.current!==requested){
      previousPaint.current=requested;
      for(const material of paint){
        const base=material.userData.factoryHullColor??material.color.getHexString();
        material.userData.factoryHullColor=base;
        material.color.copy(/^#[0-9a-f]{6}$/i.test(requested)?new Color(requested):new Color('#'+base));
      }
    }
    // Visual idle motion uses authored pivots. Weapons do not fire or deal
    // damage until the server owns target acquisition and projectiles.
    for(const radar of radars)radar.rotation.y+=dt*0.16;
    for(let i=0;i<launchers.length;i++)
      launchers[i].rotation.y=Math.sin(elapsed.current*0.22+i*0.9)*0.12;
  });
  return <group ref={body} visible={false} dispose={null} name={`naval-${model}-${entityId}`}>
    <group scale={model==='louisiana'?[1,1,1]:SCALE} rotation={model==='louisiana'?[0,Math.PI,0]:undefined}>
      <primitive object={root} dispose={null}/>
    </group>
  </group>;
}
