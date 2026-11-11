import { useMotionView } from "../store/session/networkViews";
import {useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {DoubleSide,BufferGeometry,Float32BufferAttribute,type LineSegments,type LineBasicMaterial,type Group,type Mesh,type MeshBasicMaterial} from 'three';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';
import {snapshotEntity, useNetworkStore} from '../store/session/networkStore';
import {readGuardBoost,guardActionKind} from './guardBoostState';
import {GUARD_ARC_HALF_ANGLE,TANK_BARRIER_GLASS,guardShieldTransform,sampleGuardBreak,type GuardBreakState} from './guardShieldVisual';

// All blinks reuse one small radial spray. No dynamic lights or postprocessing.
const blastGeometry = new BufferGeometry();
const spokes: number[] = [];
for (let i=0;i<16;i++) {
 const y=1-2*(i+.5)/16, radius=Math.sqrt(1-y*y), angle=i*2.39996;
 const x=radius*Math.cos(angle), z=radius*Math.sin(angle);
 spokes.push(x*.62,y*.62,z*.62,x,y,z);
}
blastGeometry.setAttribute('position',new Float32BufferAttribute(spokes,3));

function GuardShield({player}:{player:string}){
 const root=useRef<Group>(null),sheet=useRef<Mesh>(null),material=useRef<MeshBasicMaterial>(null);
 const panel=useMotionView(s=>snapshotEntity(s.snapshot, player)?.guard?.panel?.length===4);
 const tankBarrier=useMotionView(s=>guardActionKind(snapshotEntity(s.snapshot,player))==='tank_barrier');
 const bubble=useRef<Mesh>(null),burst=useRef<LineSegments>(null),flare=useRef<LineBasicMaterial>(null);
 const broken=useRef<GuardBreakState>({sequence:null,at:-Infinity});
 const {getInterpolated}=useVehiclePhysicsInterpolator(player);
 useFrame(({clock})=>{
  const network=useNetworkStore.getState(),entity=snapshotEntity(network.snapshot, player),guard=readGuardBoost(entity);
  const group=root.current,mesh=sheet.current,paint=material.current;
  if(!group||!mesh||!paint)return;
  const received=network.snapshot?.received_at_ms;
  if(!network.connected||!entity||entity.health?.defeated||!guard||received===undefined||performance.now()-received>1000){group.visible=false;return;}
  const flash=sampleGuardBreak(broken.current,guard.break_seq,clock.elapsedTime),active=(guardActionKind(entity,guard)==='tank_barrier'||guard.remaining_s>0)&&guard.shield_hp>0;
  const diving=(guard.dive_remaining_s??0)>0;
  if(!active && !diving && flash<=0){group.visible=false;return;}
  const pose=getInterpolated(player);
  group.visible=!!pose&&(active||flash>0||diving);
  if(!group.visible||!pose)return;
  group.position.fromArray(pose.position);group.quaternion.fromArray(pose.rotation);
  if(bubble.current){
   bubble.current.visible=diving;
   const half=entity.collider?.chassis_half_extents??[1,.45,2.1];
   bubble.current.scale.set(half[0]+.6,half[1]+.8,half[2]+.55);
  }
  if(burst.current && flare.current){
   const age=2-(guard.dive_remaining_s??0);
   burst.current.visible=diving && age<0.32;
   if(burst.current.visible){
    burst.current.scale.setScalar(1.2+Math.max(0,age)*10);
    flare.current.opacity=.50*(1-Math.max(0,age)/.32);
   }
  }
  mesh.visible=active||flash>0;
  const shape=guardShieldTransform(entity.collider);
  const dimensions=entity.guard?.panel;
  if(panel && dimensions) {
   const [forward,y,width,height]=dimensions;
   const yaw=pose.guard?.panel_yaw??0;
   mesh.rotation.y=yaw;
   mesh.position.set(Math.sin(yaw)*forward,y,.1+Math.cos(yaw)*forward);
   mesh.scale.set(width,height,1);
  }else{
   mesh.rotation.y=0;
   mesh.position.set(shape.x,shape.y,shape.z);
  const expansion=1+flash*.15;
  mesh.scale.set(shape.widthRadius*expansion,shape.height*expansion,shape.depthRadius*expansion);
  }
  const strength=Math.min(1,guard.shield_hp/guard.shield_max_hp);
  paint.opacity=active ? (tankBarrier ? .26+.23*strength : .12+.15*strength) : flash*.45;
  paint.color.set(active?(tankBarrier?'#a6dcff':'#8ccaff'):'#e7f5ff');
 });
 return <group ref={root} name={`guard-shield-${player}`} visible={false}>
  <lineSegments ref={burst} visible={false}><primitive object={blastGeometry} attach="geometry"/><lineBasicMaterial ref={flare} color="#fff" transparent opacity={0} depthWrite={false} toneMapped={false}/></lineSegments>
  <mesh ref={bubble} visible={false}><sphereGeometry args={[1,20,12]}/><meshBasicMaterial color="#63f1d4" transparent opacity={.21} depthWrite={false} side={DoubleSide} toneMapped={false}/></mesh>
  <mesh ref={sheet} name={tankBarrier?'tank-glass-shield':'guard-shield-sheet'}>
   {panel?<planeGeometry args={[1,1]}/>:<cylinderGeometry args={[1,1,1,16,1,true,-GUARD_ARC_HALF_ANGLE,2*GUARD_ARC_HALF_ANGLE]}/>}
   <meshBasicMaterial ref={material} map={tankBarrier?TANK_BARRIER_GLASS:null} color="#8ccaff" transparent opacity={.2} side={DoubleSide} depthWrite={false} toneMapped={false}/>
  </mesh>
 </group>;
}

/** Stable entity membership only. Timers/poses are read inside the frame loop,
 * with shared interpolation and one small reusable arc per eligible body. */
export function NetworkGuardShields(){
 const ids=useMotionView(state=>{
  const room=state.getMe()?.room_id??state.room_id;
  return state.connected?(state.snapshot?.entities??[]).filter(entity=>entity.room_id===room&&(entity.vehicle_id==='brz'||entity.vehicle_id==='tank'||(entity.guard?.dive_remaining_s??0)>0)).map(entity=>entity.id).sort().join('\0'):'';
 });
 return <group name="Confirmed front shields">{ids&&ids.split('\0').map(id=><GuardShield key={id} player={id}/>)}</group>;
}
