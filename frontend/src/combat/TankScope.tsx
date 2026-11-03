import {useEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {PerspectiveCamera} from '@react-three/drei';
import {BufferAttribute,BufferGeometry,Line,LineBasicMaterial,Quaternion,Vector3} from 'three';
import {useCombatStore} from './combatStore';
import {useNetworkStore} from '../store/session/networkStore';
import {useUIStore} from '../store/menus/uiStore';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {CANNON_SPEED,GRAVITY,ballisticPoint,elevationForRange,planeFlight} from './ballistics';
import {toggleTankScope} from './turretControls';
import './tankScope.css';

export function TankScopeHUD(){
 const zoom=useCombatStore(s=>s.scopeZoom);
 const scope=useCombatStore(s=>s.scope),me=useNetworkStore(s=>s.getMe()),visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 const [research,setResearch]=useState(false),[reference,setReference]=useState(250);
 if(!scope||!visible||me?.vehicle_id!=='tank'||!me.combat)return null;
 const c=me.combat,dir=new Vector3(-Math.sin(c.yaw)*Math.cos(c.pitch),Math.sin(c.pitch),-Math.cos(c.yaw)*Math.cos(c.pitch));
 const muzzle=new Vector3(c.x,c.y,c.z).applyQuaternion(new Quaternion(...me.rotation)).add(new Vector3(...me.position)).addScaledVector(dir,4.1);
 const height=Math.max(.1,muzzle.y),flight=planeFlight(c.pitch,height),required=elevationForRange(reference,height);
 const time=reference/Math.max(.01,CANNON_SPEED*Math.cos(c.pitch)),drop=.5*GRAVITY*time*time;
 return <section className="tank-scope-overlay" aria-label="Tank scope view">
  <div className="tank-scope-vignette"/>
  <svg className="tank-scope-reticle" viewBox="0 0 600 600" aria-hidden="true"><circle cx="300" cy="300" r="225"/><path d="M180 300h100m40 0h100M300 245v35m0 40v105M250 310v-20m-30 20v-20m130 20v-20m30 20v-20M290 340h20m-25 35h30m-35 35h40"/><circle cx="300" cy="300" r="3"/></svg>
  <div className="scope-top-controls"><button onClick={()=>useCombatStore.getState().setScopeZoom(useCombatStore.getState().scopeZoom===2?4:2)} aria-label="Scope magnification">{zoom}×</button><button onClick={()=>setResearch(!research)} aria-expanded={research}>RESEARCH</button><button onClick={toggleTankScope}>EXIT SCOPE</button></div>
  <output className="scope-range-readout">ELEV {(c.pitch*180/Math.PI).toFixed(1)}° · {c.reload&&c.reload>0?`LOAD ${c.reload.toFixed(1)}s`:'READY'}<br/>DATUM y=0 · RANGE {Math.round(flight.range)}m{flight.capped?' +':''} · {flight.time.toFixed(2)}s</output>
  {research&&<aside className="scope-research" aria-label="Ballistics research"><h2>CANNON · GRAVITY LAB</h2><div className="scope-reference"><button aria-label="Decrease reference range" onClick={()=>setReference(Math.max(50,reference-50))}>−</button><span>REFERENCE {reference} m</span><button aria-label="Increase reference range" onClick={()=>setReference(Math.min(1400,reference+50))}>+</button></div><p>v₀ = {CANNON_SPEED} m/s · g = {GRAVITY} m/s²</p><p>x(t) = v₀ cos(θ)t<br/>y(t) = y₀ + v₀ sin(θ)t − ½gt²</p><p>At {reference}m: {time.toFixed(2)}s, gravity drop {drop.toFixed(1)}m.<br/>Required elevation to datum: {required===null?'unreachable':`${(required*180/Math.PI).toFixed(2)}°`}.</p><p>Arc is a y=0 datum estimate, not terrain-aware or target tracking. No drag, wind or vehicle-velocity inheritance. Server checks obstacles along the same gravity arc at firing time; hits resolve instantly.</p></aside>}
 </section>;
}
/** This rig is the sole camera owner while scoped; the chase rig unmounts. */
export function TankScopeRig({playerId}:{playerId:string}){
 const zoom=useCombatStore(s=>s.scopeZoom),base=usePreferencesStore(s=>s.fov);
 const fov=2*Math.atan(Math.tan(base*Math.PI/360)/zoom)*180/Math.PI;
 return <><PerspectiveCamera makeDefault fov={fov} near={.1}/><ScopeCamera playerId={playerId}/></>;
}
function ScopeCamera({playerId}:{playerId:string}){
 const {camera}=useThree(),{getInterpolated}=useVehiclePhysicsInterpolator(playerId);
 const buffers=useMemo(()=>{const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(65*3),3));return {geometry,p:new Vector3(),q:new Quaternion(),direction:new Vector3(),origin:new Vector3(),look:new Vector3()};},[]);
 const path=useMemo(()=>new Line(buffers.geometry,new LineBasicMaterial({color:0x7cebe0,transparent:true,opacity:.65,depthTest:true})),[buffers]);
 const lastShot=useRef(-1),kick=useRef(0);
 const reduce=usePreferencesStore(s=>s.reducedMotion);
 useEffect(()=>()=>{buffers.geometry.dispose();(path.material as LineBasicMaterial).dispose();},[buffers,path]);
 useFrame((_,dt)=>{
  const pose=getInterpolated(playerId),c=useNetworkStore.getState().getMe()?.combat;if(!pose||!c)return;
  const {p,q,direction,origin,look}=buffers;p.fromArray(pose.position);q.fromArray(pose.rotation);direction.set(-Math.sin(c.yaw)*Math.cos(c.pitch),Math.sin(c.pitch),-Math.cos(c.yaw)*Math.cos(c.pitch));
  if(c.hull_locked&&c.lock_yaw!==undefined){const yaw=c.lock_yaw,pitch=c.lock_pitch??0;direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).applyQuaternion(q);}
  origin.set(c.x,c.y,c.z).applyQuaternion(q).add(p).addScaledVector(direction,4.1);
  if(lastShot.current>=0&&c.cannon_shot!==lastShot.current)kick.current=1;lastShot.current=c.cannon_shot??0;kick.current=Math.max(0,kick.current-dt*4);
  camera.position.copy(origin).addScaledVector(direction,-.5).addScaledVector(new Vector3(0,1,0),.12);
  camera.lookAt(look.copy(camera.position).add(direction).addScaledVector(new Vector3(0,1,0),reduce?0:kick.current*.028));
  const time=planeFlight(c.pitch,Math.max(.1,origin.y)).time,positions=buffers.geometry.attributes.position;
  for(let i=0;i<=64;i++){const t=time*i/64;const point=ballisticPoint([origin.x,origin.y,origin.z],[direction.x,direction.y,direction.z],t);positions.setXYZ(i,...point);}
  uploadTrajectory(buffers.geometry);
 },-1);
 return <primitive object={path} dispose={null}/>;
}

/** Imperative GPU upload; this buffer is not React render state. */
function uploadTrajectory(geometry:BufferGeometry){geometry.attributes.position.needsUpdate=true;geometry.computeBoundingSphere();}
