import { useMotionView } from "../store/session/networkViews";
import {RecoveryCountdown} from './RecoveryCountdown';
import {recoveryStatus} from './recoveryStatus';
import {useEffect,useState} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {isDrivingScreen,useUIStore} from '../store/menus/uiStore';
import {useNetworkStore} from '../store/session/networkStore';
import {startVehicleTelemetry,useVehicleTelemetryStore} from '../store/telemetry/vehicleTelemetryStore';
import './vehicleHealthHUD.css';

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const tenths=(value:number)=>finite(value)?Math.ceil(Math.max(0,value)*10)/10:0;

/** One brief flash per confirmed damage event. Initial/other-world snapshots are
 * a baseline, never a replay; no input action can create a damage indication. */
function useConfirmedDamageFlash(){
 const [flash,setFlash]=useState<number|null>(null);
 useEffect(()=>{
  let previousKey='',previousSeq=0,timeout:number|undefined;
  const read=()=>{
   const network=useNetworkStore.getState(),me=network.getMe(),seq=me?.health?.damage_seq??0;
   const key=network.connected&&me?.health?`${me.id}:${me.room_id}`:'';
   const ui=useUIStore.getState();
   if(key&&key===previousKey&&seq>previousSeq&&isDrivingScreen(ui.screen)&&ui.overlay===null&&!ui.isModeLoading&&document.visibilityState!=='hidden'){
    setFlash(seq);window.clearTimeout(timeout);timeout=window.setTimeout(()=>setFlash(null),180);
   }
   previousKey=key;previousSeq=seq;
  };
  read();const stop=useMotionView.subscribe(read);
  return()=>{stop();window.clearTimeout(timeout);};
 },[]);
 return flash;
}

/** Critical feedback remains independent of the optional instrument dashboard.
 * The retired standalone hull-HP card must not compete with either dashboard. */
export function VehicleHealthHUD(){
 useEffect(startVehicleTelemetry,[]);
 const flash=useConfirmedDamageFlash();
 const live=useVehicleTelemetryStore(s=>s.data.signal==='live');
 const visible=useUIStore(s=>isDrivingScreen(s.screen)&&s.overlay===null&&!s.isModeLoading);
 const health=useMotionView(useShallow(s=>{
  const h=s.connected?s.getMe()?.health:undefined;
  if(!h||!finite(h.hp)||!finite(h.max_hp)||h.max_hp<=0||typeof h.defeated!=='boolean')return null;
  return {reason:h.disabled_reason,cause:h.defeated?h.last_damage_kind:undefined,window:h.recovery_window_s,dead:h.defeated,respawn:tenths(h.respawn_remaining_s)};
 }));
 const shown=visible&&health!==null&&(live||health.dead);
 if(!shown||!health)return null;
 const recovery=recoveryStatus({defeated:health.dead,respawn_remaining_s:health.respawn,recovery_window_s:health.window,disabled_reason:health.reason,last_damage_kind:health.cause});
 return <>
  {health.dead&&recovery&&<div className="vehicle-defeated-banner" aria-label="Respawn countdown" data-delayed={!live}><RecoveryCountdown status={recovery}/></div>}
  {flash!==null&&<div key={flash} className="vehicle-damage-flash" aria-hidden="true"/>}
 </>;
}
