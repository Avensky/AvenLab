import {RecoveryCountdown} from './RecoveryCountdown';
import {recoveryStatus} from './recoveryStatus';
import {showVehicleHealthBar} from "../store/preferences/healthVisibility";
import {useEffect,useRef,useState} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {isDrivingScreen,useUIStore} from '../store/menus/uiStore';
import {useNetworkStore} from '../store/session/networkStore';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
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
  read();const stop=useNetworkStore.subscribe(read);
  return()=>{stop();window.clearTimeout(timeout);};
 },[]);
 return flash;
}

/** Passive combat HP, safe-spawn countdown and protection. The display samples
 * only useful primitives; pose snapshots never rerender the entire driving HUD. */
export function VehicleHealthHUD(){
 useEffect(startVehicleTelemetry,[]);
 const card=useRef<HTMLElement>(null),flash=useConfirmedDamageFlash();
 const mode=usePreferencesStore(s=>s.healthBars);
 const live=useVehicleTelemetryStore(s=>s.data.signal==='live');
 const visible=useUIStore(s=>isDrivingScreen(s.screen)&&s.overlay===null&&!s.isModeLoading);
 const drive=usePreferencesStore(s=>s.showDriveControls),touch=usePreferencesStore(s=>s.showTouchControls),wheel=usePreferencesStore(s=>s.hudGroups.wheel),drop=usePreferencesStore(s=>s.wheelDrop),layout=usePreferencesStore(s=>s.drivingLayout);
 const health=useNetworkStore(useShallow(s=>{
  const h=s.connected?s.getMe()?.health:undefined;
  if(!h||!finite(h.hp)||!finite(h.max_hp)||h.max_hp<=0||typeof h.defeated!=='boolean')return null;
  return {reason:h.disabled_reason,window:h.recovery_window_s,team:s.getMe()?.team,hp:Math.max(0,Math.min(h.max_hp,h.hp)),max:h.max_hp,dead:h.defeated,respawn:tenths(h.respawn_remaining_s),safe:tenths(h.spawn_protection_s),kills:finite(h.kills)?Math.max(0,Math.floor(h.kills)):0,deaths:finite(h.deaths)?Math.max(0,Math.floor(h.deaths)):0};
 }));
 const shown=visible&&live&&health!==null;
 const cardShown=shown&&showVehicleHealthBar(mode,health?.team,true);
 useEffect(()=>{
  const element=card.current;if(!cardShown||!element)return;
  const hud=element.closest('.driving-hud'),steering=hud?.querySelector('.wheel-stage .touch-stick'),chat=hud?.querySelector('.driving-chat .lobby-chat');
  const measure=()=>{
   const bounds=touch&&wheel?steering?.getBoundingClientRect():undefined;
   if(bounds&&bounds.width>0&&bounds.height>0){
    // Measure the actual wheel instead of duplicating its crop/portrait rules.
    element.style.bottom=`${Math.max(12,window.innerHeight-bounds.top+4)}px`;
    element.style.width=`${Math.min(176,Math.max(90,bounds.width*.86))}px`;
   }else{element.style.removeProperty('bottom');element.style.removeProperty('width');}
   const occupied=chat?.getBoundingClientRect(),current=element.getBoundingClientRect();
   if(occupied&&current.x<occupied.right&&current.right>occupied.x&&current.y<occupied.bottom&&current.bottom>occupied.y){
    element.style.bottom=`${Math.max(12,window.innerHeight-occupied.top+4)}px`;
   }
  };
  let frame=0;
  const schedule=()=>{window.cancelAnimationFrame(frame);frame=window.requestAnimationFrame(measure);};
  measure();window.addEventListener('resize',schedule);
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  if(hud)observer?.observe(hud);if(steering)observer?.observe(steering);if(chat)observer?.observe(chat);
  return()=>{observer?.disconnect();window.cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);};
 },[cardShown,drive,touch,wheel,drop,layout]);
 if(!shown||!health)return null;
 const fraction=health.hp/health.max;
 const recovery=recoveryStatus({defeated:health.dead,respawn_remaining_s:health.respawn,recovery_window_s:health.window,disabled_reason:health.reason});
 return <>
  {cardShown&&<section ref={card} className="vehicle-health-hud" aria-label="Vehicle combat health" data-defeated={health.dead} data-critical={fraction<=.25} data-protected={health.safe>0}>
   <div className="vehicle-health-heading"><span>{health.dead?health.reason==='fuel'?'FUEL EMPTY':'DEFEATED':health.safe>0?`SAFE ${health.safe.toFixed(1)}s`:'HULL HP'}</span><strong>{Math.ceil(health.hp)} / {Math.ceil(health.max)}</strong></div>
   <div className="vehicle-health-track" role="progressbar" aria-label="Vehicle HP" aria-valuemin={0} aria-valuemax={health.max} aria-valuenow={health.hp}><span style={{width:`${fraction*100}%`}}/></div>
   <div className="vehicle-health-note">{health.dead?health.respawn>0?`RESPAWN IN ${health.respawn.toFixed(1)}s`:'WAITING FOR SAFE SPAWN':`K ${health.kills} · D ${health.deaths}`}</div>
  </section>}
  {health.dead&&<div className="vehicle-defeated-banner" aria-label="Vehicle defeated">{recovery&&<RecoveryCountdown status={recovery}/>}<div><strong role="status">{health.reason==='fuel'?'FUEL EMPTY':'VEHICLE DISABLED'}</strong><span>{health.respawn>0?`RESPAWN IN ${health.respawn.toFixed(1)}s`:'WAITING FOR SAFE SPAWN'}</span><small>{recovery?.revivable?'A mechanic can recover you before the timer ends.':'Controls resume after safe recovery.'}</small></div></div>}
  {flash!==null&&<div key={flash} className="vehicle-damage-flash" aria-hidden="true"/>}
 </>;
}
