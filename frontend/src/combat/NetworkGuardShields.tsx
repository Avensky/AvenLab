import {useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {DoubleSide,type Group,type Mesh,type MeshBasicMaterial} from 'three';
import {useVehiclePhysicsInterpolator} from '../hooks/usePhysicsInterpolator';
import {useNetworkStore} from '../store/session/networkStore';
import {readGuardBoost,guardActionKind} from './guardBoostState';
import {GUARD_ARC_HALF_ANGLE,guardShieldTransform,sampleGuardBreak,type GuardBreakState} from './guardShieldVisual';

function GuardShield({player}:{player:string}){
 const root=useRef<Group>(null),sheet=useRef<Mesh>(null),material=useRef<MeshBasicMaterial>(null);
 const broken=useRef<GuardBreakState>({sequence:null,at:-Infinity});
 const {getInterpolated}=useVehiclePhysicsInterpolator(player);
 useFrame(({clock})=>{
  const network=useNetworkStore.getState(),entity=network.snapshot?.entities.find(item=>item.id===player),guard=readGuardBoost(entity);
  const group=root.current,mesh=sheet.current,paint=material.current;
  if(!group||!mesh||!paint)return;
  const received=network.snapshot?.received_at_ms;
  if(!network.connected||!entity||entity.health?.defeated||!guard||received===undefined||performance.now()-received>1000){group.visible=false;return;}
  const flash=sampleGuardBreak(broken.current,guard.break_seq,clock.elapsedTime),active=guard.remaining_s>0&&guard.shield_hp>0;
  const pose=getInterpolated(player);
  group.visible=!!pose&&(active||flash>0);
  if(!group.visible||!pose)return;
  group.position.fromArray(pose.position);group.quaternion.fromArray(pose.rotation);
  const shape=guardShieldTransform(entity.collider);
  mesh.position.set(shape.x,shape.y,shape.z);
  const expansion=1+flash*.15;
  mesh.scale.set(shape.widthRadius*expansion,shape.height*expansion,shape.depthRadius*expansion);
  paint.opacity=active ? .12+.15*Math.min(1,guard.shield_hp/guard.shield_max_hp) : flash*.45;
  paint.color.set(active?(guardActionKind(entity,guard)==='tank_barrier'?'#67c3ff':'#8ccaff'):'#e7f5ff');
 });
 return <group ref={root} name={`guard-shield-${player}`} visible={false}>
  <mesh ref={sheet}><cylinderGeometry args={[1,1,1,16,1,true,-GUARD_ARC_HALF_ANGLE,2*GUARD_ARC_HALF_ANGLE]}/><meshBasicMaterial ref={material} color="#8ccaff" transparent opacity={.2} side={DoubleSide} depthWrite={false} toneMapped={false}/></mesh>
 </group>;
}

/** Stable entity membership only. Timers/poses are read inside the frame loop,
 * with shared interpolation and one small reusable arc per eligible body. */
export function NetworkGuardShields(){
 const ids=useNetworkStore(state=>{
  const room=state.getMe()?.room_id??state.room_id;
  return state.connected?(state.snapshot?.entities??[]).filter(entity=>entity.room_id===room&&(entity.vehicle_id==='brz'||entity.vehicle_id==='tank')).map(entity=>entity.id).sort().join('\0'):'';
 });
 return <group name="Confirmed front shields">{ids&&ids.split('\0').map(id=><GuardShield key={id} player={id}/>)}</group>;
}
