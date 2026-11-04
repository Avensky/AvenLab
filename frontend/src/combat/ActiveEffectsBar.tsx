import {useEffect,useRef,useState} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {useNetworkStore} from '../store/session/networkStore';
import {useUIStore} from '../store/menus/uiStore';
import {startVehicleTelemetry,useVehicleTelemetryStore} from '../store/telemetry/vehicleTelemetryStore';
import {ProgressOrbit} from '../components/controller/ProgressOrbit';
import {AttackIcon} from './AttackIcon';
import {activeVehicleEffects,readEffectSignals,type ActiveVehicleEffect} from './activeEffects';
import './activeEffects.css';

function EffectBadge({effect}:{effect:ActiveVehicleEffect}){
 const [open,setOpen]=useState(false),root=useRef<HTMLLIElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);};
 },[open]);
 const timer=effect.remaining===null?'ACTIVE':`${effect.remaining.toFixed(1)}s`,descriptionId=`effect-${effect.id}-description`;
 const progress=effect.remaining!==null&&effect.duration?effect.remaining/effect.duration:1;
 return <li ref={root} className="active-effect-item" data-nature={effect.nature} data-kind={effect.kind}>
  <button type="button" className="active-effect-button" aria-label={`${effect.label} · ${effect.kind} · ${timer}`} aria-expanded={open} aria-describedby={open?descriptionId:undefined} title={`${effect.label}: ${effect.description}`} onClick={()=>setOpen(v=>!v)}>
   <ProgressOrbit layered progress={progress} label={`${effect.label} duration`}><AttackIcon kind={effect.icon}/></ProgressOrbit>
   <span className="active-effect-time" aria-hidden="true">{timer}</span>
  </button>
  {open&&<div id={descriptionId} className="active-effect-description" role="tooltip"><strong>{effect.label} · {effect.kind.toUpperCase()}</strong><span>{effect.description}</span></div>}
 </li>;
}

/** Only confirmed effects appear. Stale/disconnected snapshots cannot leave buffs
 * glowing indefinitely; opening a badge explains it without invoking an ability. */
export function ActiveEffectsBar(){
 useEffect(startVehicleTelemetry,[]);
 const signals=useNetworkStore(useShallow(s=>readEffectSignals(s.connected?s.getMe():undefined)));
 const live=useVehicleTelemetryStore(s=>s.data.signal==='live');
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 const effects=activeVehicleEffects(signals);
 if(!visible||!live||effects.length===0)return null;
 return <section className="active-effects" aria-label="Active buffs and debuffs"><ul>{effects.map(effect=><EffectBadge key={effect.id} effect={effect}/>)}</ul></section>;
}
