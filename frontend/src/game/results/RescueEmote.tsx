import {vehicleLodUrl,vehicleModelUrl} from '../../vehicles/assetCatalog.ts';
import {Component, Suspense, useEffect, useMemo, useRef, type ReactNode} from 'react';
import {Canvas, useFrame} from '@react-three/fiber';
import {useGLTF} from '@react-three/drei';
import {Box3, Group, Mesh, Vector3} from 'three';
import {RESCUE_DURATION, rescueFlight} from './rescueFlight';

class SceneBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p role="status">Extraction preview unavailable.</p>:this.props.children;}
}
function Pickup({model,still,finish}:{model:string;still:boolean;finish:()=>void}) {
  const car=useGLTF(vehicleLodUrl(model,'near'),'/draco/').scene;
  const source=useGLTF(vehicleModelUrl('rescue-helicopter'),'/draco/').scene;
  const vehicle=useMemo(()=>car.clone(true),[car]);
  const roof=useMemo(()=>new Box3().setFromObject(vehicle).max.y,[vehicle]);
  const aircraft=useMemo(()=>{
    const root=source.clone(true);const box=new Box3().setFromObject(root);
    const size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
    const scale=9/Math.max(size.x,size.z);
    root.scale.setScalar(scale);root.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
    return root;
  },[source]);
  const rotor=useMemo(()=>aircraft.getObjectByName('MAIN_ROTOR'),[aircraft]);
  const chassis=useRef<Group>(null!),heli=useRef<Group>(null!),leaf=useRef<Group>(null!),sling=useRef<Mesh>(null!);
  const time=useRef(0),ended=useRef(false);
  useFrame(({camera},dt)=>{
    if(!still)time.current=Math.min(RESCUE_DURATION,time.current+Math.min(dt,.06));
    const p=rescueFlight(still?4.4:time.current);
    if (rotor && !still) rotor.rotation.y=(rotor.rotation.y+dt*15)%(2*Math.PI);
    chassis.current.position.set(p.x,p.y,0);chassis.current.rotation.z=p.pitch;
    heli.current.position.set(p.helicopterX,p.helicopterY,0);
    sling.current.visible=p.sling>0;
    const length=Math.max(.05,p.helicopterY-p.y-roof)*p.sling;
    sling.current.scale.y=Math.max(.001,length);
    sling.current.position.set(p.helicopterX,p.helicopterY-length/2,0);
    leaf.current.rotation.z=p.bridge;
    camera.position.set(p.x+7,6.6+p.y*.34,15.5);camera.lookAt(p.x+1.3,p.y+1.8,0);
    if(time.current===RESCUE_DURATION&&!ended.current){ended.current=true;finish();}
  });
  return <group dispose={null}>
    <hemisphereLight args={['#f1d9af','#49586b',2]} /><directionalLight position={[-7,15,6]} intensity={3}/>
    <mesh position={[0,-1.35,0]}><boxGeometry args={[160,.3,95]}/><meshStandardMaterial color="#355a68" roughness={.34}/></mesh>
    {[-1,1].map(side=><group key={side} position={[side*16,0,0]}>
      <mesh><boxGeometry args={[16,2.4,6]}/><meshStandardMaterial color="#53606a"/></mesh>
      {[-6,5].map(x=><mesh key={x} position={[x,-1.4,2]}><boxGeometry args={[.65,3,.65]}/><meshStandardMaterial color="#64717b"/></mesh>)}
    </group>)}
    <group ref={leaf} position={[-8,1.2,0]}><mesh position={[3.5,-.15,0]}><boxGeometry args={[7,.3,5.8]}/><meshStandardMaterial color="#87959e"/></mesh></group>
    <group position={[8,1.2,0]} rotation={[0,0,-.4]}><mesh position={[-3.5,-.15,0]}><boxGeometry args={[7,.3,5.8]}/><meshStandardMaterial color="#87959e"/></mesh></group>
    <group ref={chassis}><primitive object={vehicle} rotation={[0,Math.PI/2,0]}/></group>
    <group ref={heli} rotation={[0,Math.PI,0]}><primitive object={aircraft}/></group>
    <mesh ref={sling}><cylinderGeometry args={[.035,.035,1,6]}/><meshStandardMaterial color="#e1c79c"/></mesh>
  </group>;
}
export default function RescueEmote({model,onClose}:{model:string;onClose:()=>void}) {
  const close=useRef<HTMLButtonElement>(null);
  const still=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  useEffect(()=>{close.current?.focus();},[]);
  return <div className="rescue-emote" aria-label="Helicopter extraction celebration">
    <SceneBoundary><Canvas dpr={[1,1.25]} frameloop={still?'demand':'always'} camera={{position:[8,7,16],fov:38}}>
      <color attach="background" args={['#9baabb']}/><fog attach="fog" args={['#9baabb',24,72]}/>
      <Suspense fallback={null}><Pickup model={model} still={still} finish={onClose}/></Suspense>
    </Canvas></SceneBoundary>
    <button ref={close} type="button" onClick={onClose}>{still?'Close':'Skip celebration'}</button>
  </div>;
}
