import {useMemo,useState,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import type {Group} from 'three';
import {useWorldStore} from '../../store/world/worldStore';
import {useMotionView} from '../../store/session/networkViews';
import {useNetworkStore} from '../../store/session/networkStore';
import {requestSocial} from '../../net/socialClient';
import {announceCombat,captureNoticeEvent} from '../../combat/combatNoticeStore';
import type {LayoutObject} from '../../worldBuilder/document/layoutDocument';
import './bridgeLever.css';

function useBridgeAction(){
  const [busy,setBusy]=useState(false);
  const current=useMotionView(s=>s.snapshot?.drawbridge?.broken?'broken':s.snapshot?.drawbridge?.target_angle?'raised':'lowered');
  const lockSeconds=useMotionView(s=>Math.max(0,Math.ceil(((s.snapshot?.drawbridge?.next_available_tick??0)-(s.snapshot?.tick??0))/60)));
  const command=current==='broken'?'repair':current==='raised'?'lower':'raise';
  async function pull(){
    if(busy || (lockSeconds>0 && current!=='broken'))return;
    const notice=captureNoticeEvent();
    setBusy(true);
    try{await requestSocial('bridge_control',{command});}
    catch(e){if(notice)announceCombat(e instanceof Error?e.message:'Bridge lever unavailable','warning',notice);}
    finally{setBusy(false);}
  }
  return {current,command,busy,lockSeconds,pull};
}
export function BridgeLever({item}:{item:LayoutObject}){
  const lever=useRef<Group>(null);
  const {pull}=useBridgeAction();
  useFrame(()=>{if(lever.current)lever.current.rotation.x=useNetworkStore.getState().snapshot?.drawbridge?.target_angle ? -.62 : .62;});
  return <group position={item.position} rotation={[0,item.yaw*Math.PI/180,0]} onClick={e=>{e.stopPropagation();void pull();}}>
    <mesh position={[0,.48,0]}><boxGeometry args={[.53,.96,.54]}/><meshStandardMaterial color="#485761"/></mesh>
    <group position={[0,.91,0]} ref={lever}>
      <mesh position={[0,.23,0]}><boxGeometry args={[.08,.46,.08]}/><meshStandardMaterial color="#b5a986"/></mesh>
      <mesh position={[0,.46,0]}><boxGeometry args={[.50,.13,.15]}/><meshStandardMaterial color="#db5a42"/></mesh>
    </group>
  </group>;
}
export function BridgeControls(){
  const layout=useWorldStore(s=>s.map?.authored_layout);
  const levers=useMemo(()=>layout?.objects.filter(o=>o.piece==='bridge-lever')??[],[layout]);
  const near=useMotionView(s=>{
    const me=s.getMe();
    return !!me && !!s.snapshot?.drawbridge && !me.health?.defeated && levers.some(o=>
      Math.hypot(me.position[0]-o.position[0],me.position[2]-o.position[2])<=14 &&
      Math.abs(me.position[1]-o.position[1])<=4);
  });
  const {current,command,busy,lockSeconds,pull}=useBridgeAction();
  if(!near)return null;
  return <button className="harbor-bridge-control" disabled={busy || (lockSeconds>0 && current!=='broken')} onClick={()=>void pull()}>
    <span>Drawbridge · {current}</span><strong>{lockSeconds>0 && current!=='broken'?`Ship passage · ${lockSeconds}s`:command==='repair'?'Repair fallen span':command==='lower'?'Lower bridge':'Raise jump ramps'}</strong>
  </button>;
}
