import { useMotionView } from "../store/session/networkViews";
import {useShallow} from 'zustand/react/shallow';

import {useSocialStore} from '../store/social/socialStore';
import {useUIStore} from '../store/menus/uiStore';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {useRenderSettingsStore} from '../store/presentation/renderSettingsStore';
import {combatKeyLabel} from '../store/preferences/keyBindings';
import {canDrive} from '../controls/inputRouting';
import {useCombatStore} from './combatStore';
import {AttackIcon} from './AttackIcon';
import {CooldownDial} from './CooldownClock';
import {cooldownProgress} from './weaponCooldown';
import {GUARD_COOLDOWN_S,TANK_BARRIER_COOLDOWN_S,guardBoostBlockReason,tankBarrierBlockReason,playerShield,readGuardBoost,requestGuardBoost,requestTankBarrier,guardRequestKey,useGuardBoostRequestStore} from './guardBoost';
import {DIVE_COOLDOWN_S,DIVE_DURATION_S,GUARD_DURATION_S} from './guardBoostState';
import {diveShieldBlockReason,requestDiveShield,type ShieldAction} from './guardBoost';
import './guardBoost.css';

export function GuardAbilityAction({kind}:{kind:ShieldAction}){
 const tank=kind==='tank_barrier',dive=kind==='dive_shield';
 const barrierKey=usePreferencesStore(state=>state.bindings.barrier);
 const view=useSocialStore(state=>state.view),request=useGuardBoostRequestStore();
 const visible=useUIStore(state=>state.screen==='sandbox'&&state.overlay===null&&!state.isModeLoading);
 const status=useMotionView(useShallow(state=>{
  const me=state.getMe(),guard=readGuardBoost(me);
  return {player:state.playerId,room:me?.room_id,eligible:playerShield(state,view)===kind,blocked:dive?diveShieldBlockReason(me,guard):tank?tankBarrierBlockReason(me,guard):guardBoostBlockReason(me,guard),
   cooldown:guard?Math.ceil((dive?(guard.dive_cooldown_s??0):guard.cooldown_s)*10)/10:undefined,remaining:guard?Math.ceil((dive?(guard.dive_remaining_s??0):guard.remaining_s)*10)/10:0,shield:guard?Math.ceil(guard.shield_hp):0,maxShield:guard?.shield_max_hp??1};
 }));
 if(!visible||!status.eligible)return null;
 const busy=request.busy&&request.key===guardRequestKey(kind);
 const allowed=canDrive(),active=tank?status.shield>0:status.remaining>0,ready=!busy&&allowed&&status.blocked==='';
 const name=dive?'Dive shield':tank?'Tank barrier':'Guard boost',controls=tank||dive?`${combatKeyLabel(barrierKey??'KeyP')} · DPAD LEFT`:'LB · SHIFT';
 const label=dive?(active?'DIVE ACTIVE':status.blocked||'DIVE SHIELD'):active?(status.shield>0?`${tank?'BARRIER':'SHIELD'} ${status.shield} HP`:tank?'BARRIER BROKEN':'STABILITY'):busy?'REQUESTING':status.blocked||(tank?'BARRIER':'GUARD BOOST');
 const recharge=cooldownProgress(status.cooldown,dive?DIVE_COOLDOWN_S:tank?TANK_BARRIER_COOLDOWN_S:GUARD_COOLDOWN_S);
 const remaining=tank?status.shield/status.maxShield:status.remaining/(dive?DIVE_DURATION_S:GUARD_DURATION_S);
 const description=dive?'Blink up to 12 m forward · 2 s shield · 18 s cooldown · 6 s fuel/heat strain.':tank?'10 m turret-facing team barrier · 500 HP · lasts until broken · 1 L fuel':'4 seconds · 200 HP front shield · 20 second cooldown · costs 3 L fuel and 4 seconds nitrous · stabilized steering, controlled drift and 60 HP frontal rush contact once per enemy; side/rear remain vulnerable';
 return <button type="button" className="guard-boost-action" aria-label={name} data-resource-warning={status.blocked==='LOW FUEL'?'Low fuel':undefined} data-ready={ready} data-active={active} data-guard-kind={kind} disabled={!ready} title={`${name} · ${controls} · ${description} · ${label}`} onClick={()=>void (dive?requestDiveShield():tank?requestTankBarrier():requestGuardBoost())}>
  <CooldownDial progress={active?Math.min(1,remaining):recharge} label={active?label:status.cooldown===undefined?`${name} unavailable`:status.cooldown>0?`${name} cooldown ${Math.ceil(status.cooldown)} seconds`:`${name} ready`}><AttackIcon kind={!tank&&!dive&&active&&status.shield===0?'boost':'shield'}/></CooldownDial>
  <span>{label}<small>{active?(tank?'HOLDING':`${status.remaining.toFixed(1)}s`):controls}</small></span>
 </button>;
}

export function GuardBoostAction(){return <GuardAbilityAction kind="brz_guard"/>;}

/** This role action remains available when its optional aiming HUD is hidden. */
export function GuardBoostFallback(){
 const enabled=useCombatStore(state=>state.enabled),hud=useRenderSettingsStore(state=>state.hud);
 const deck=usePreferencesStore(state=>state.hudGroups.turret);
 const view=useSocialStore(s=>s.view);
 const kind=useMotionView(s=>playerShield(s,view));
 return hud&&!(enabled&&deck)&&kind?<aside className="guard-boost-fallback"><GuardAbilityAction kind={kind}/></aside>:null;
}
