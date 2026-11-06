import { useMotionView } from "../store/session/networkViews";
import {memo,useEffect,useState} from 'react';
import {useShallow} from 'zustand/react/shallow';

import {useUIStore} from '../store/menus/uiStore';
import {useInputStore} from '../store/input/inputStore';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {startVehicleTelemetry,useVehicleTelemetryStore} from '../store/telemetry/vehicleTelemetryStore';
import {ProgressOrbit} from '../components/controller/ProgressOrbit';
import {AttackIcon} from './AttackIcon';
import {activeVehicleEffects,readEffectSignals,type ActiveVehicleEffect} from './activeEffects';
import {onNavalDeck} from './navalDeckHold';
import './activeEffects.css';

const EffectBadge=memo(function EffectBadge(effect:ActiveVehicleEffect){
 const [inspect,setInspect]=useState(false);
 const timer=effect.remaining===null?'ACTIVE':`${effect.remaining.toFixed(1)}s`,descriptionId=`effect-${effect.id}-description`;
 const progress=effect.remaining!==null&&effect.duration?effect.remaining/effect.duration:1;
 return <li className="active-effect-item" data-nature={effect.nature} data-kind={effect.kind} data-inspecting={inspect}>
  <button type="button" className="active-effect-button" aria-label={`${effect.label} · ${effect.kind} · ${timer}`}
   aria-describedby={inspect?descriptionId:undefined}
   onPointerEnter={e=>{if(e.pointerType!=='touch')setInspect(true);}}
   onPointerLeave={()=>setInspect(false)}
   onPointerDown={e=>{if(e.pointerType==='touch'){e.currentTarget.setPointerCapture(e.pointerId);setInspect(true);}}}
   onPointerUp={e=>{if(e.pointerType==='touch')setInspect(false);}}
   onLostPointerCapture={()=>setInspect(false)} onPointerCancel={()=>setInspect(false)}
   onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))setInspect(true);}}
   onBlur={()=>setInspect(false)} onKeyDown={e=>{if(e.key==='Escape'&&inspect){e.preventDefault();e.stopPropagation();setInspect(false);}}}>
   <ProgressOrbit layered progress={progress} label={`${effect.label} duration`}><AttackIcon kind={effect.icon}/></ProgressOrbit>
  </button>
  {inspect&&<div id={descriptionId} className="active-effect-description" role="tooltip">
   <strong>{effect.label} · {effect.kind.toUpperCase()} · {timer}</strong><span>{effect.description}</span>
  </div>}
 </li>;
});

/** Only confirmed effects appear. Stale/disconnected snapshots cannot leave buffs
 * glowing indefinitely; opening a badge explains it without invoking an ability. */
export function ActiveEffectsBar(){
 useEffect(startVehicleTelemetry,[]);
 const boostHeld=useInputStore(s=>Boolean(s.input.vehicleMask&VehicleFlags.BOOST));
 const signals=useMotionView(useShallow(s=>{
  const me=s.connected?s.getMe():undefined;
  return readEffectSignals(me,boostHeld,onNavalDeck(me,s.snapshot));
 }));
 const live=useVehicleTelemetryStore(s=>s.data.signal==='live');
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 if(!visible||!live)return null;
 const effects=activeVehicleEffects(signals);
 if(effects.length===0)return null;
 return <section className="active-effects" aria-label="Active buffs and debuffs"><ul>{effects.map(effect=><EffectBadge key={effect.id} {...effect}/>)}</ul></section>;
}
