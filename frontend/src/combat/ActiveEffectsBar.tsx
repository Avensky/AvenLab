import { useMotionView } from "../store/session/networkViews";
import {memo,useEffect} from 'react';
import {useShallow} from 'zustand/react/shallow';

import {useUIStore} from '../store/menus/uiStore';
import {useInputStore} from '../store/input/inputStore';
import {VehicleFlags} from '../store/input/protocol/inputMasks';
import {startVehicleFeedbackFreshness,useVehicleFeedbackFreshness} from './vehicleFeedbackFreshness';
import {ProgressOrbit} from '../components/controller/ProgressOrbit';
import {AttackIcon} from './AttackIcon';
import {activeVehicleEffects,readEffectSignals,type ActiveVehicleEffect} from './activeEffects';
import {onNavalDeck} from './navalDeckHold';
import {announceGame} from './combatNoticeStore';
import './activeEffects.css';

const EffectBadge=memo(function EffectBadge(effect:ActiveVehicleEffect){
 const timer=effect.remaining===null?'ACTIVE':`${effect.remaining.toFixed(1)}s`;
 const progress=effect.remaining!==null&&effect.duration?effect.remaining/effect.duration:1;
 return <li className="active-effect-item" data-nature={effect.nature} data-kind={effect.kind}>
  <button type="button" className="active-effect-button" aria-label={`${effect.label} · ${effect.kind} · ${timer}. ${effect.description}`}
   onClick={()=>announceGame(`${effect.label} · ${effect.kind.toUpperCase()} · ${timer}`,effect.kind,'effects')}>
   <ProgressOrbit layered progress={progress} label={`${effect.label} duration`}><AttackIcon kind={effect.icon}/></ProgressOrbit>
  </button>
 </li>;
});

/** Only confirmed effects appear. Stale/disconnected snapshots cannot leave buffs
 * glowing indefinitely; click/tap explains it through the same transient top
 * notification lane. No persistent prose or hover popovers cover the pedals. */
export function ActiveEffectsBar(){
 useEffect(startVehicleFeedbackFreshness,[]);
 const boostHeld=useInputStore(s=>Boolean(s.input.vehicleMask&VehicleFlags.BOOST));
 const signals=useMotionView(useShallow(s=>{
  const me=s.connected?s.getMe():undefined;
  return readEffectSignals(me,boostHeld,onNavalDeck(me,s.snapshot));
 }));
 const live=useVehicleFeedbackFreshness(s=>s.signal==='live');
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 if(!visible||!live)return null;
 const effects=activeVehicleEffects(signals);
 if(effects.length===0)return null;
 return <section className="active-effects" aria-label="Active buffs and debuffs"><ul>{effects.map(effect=><EffectBadge key={effect.id} {...effect}/>)}</ul></section>;
}
