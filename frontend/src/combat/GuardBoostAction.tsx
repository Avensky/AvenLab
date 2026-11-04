import {useShallow} from 'zustand/react/shallow';
import {useNetworkStore} from '../store/session/networkStore';
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
import {GUARD_COOLDOWN_S,TANK_BARRIER_COOLDOWN_S,guardBoostBlockReason,tankBarrierBlockReason,isGuardDpsPlayer,isTankBarrierPlayer,readGuardBoost,requestGuardBoost,requestTankBarrier,guardRequestKey,useGuardBoostRequestStore} from './guardBoost';
import type {GuardActionKind} from './guardBoostState';
import './guardBoost.css';

export function GuardAbilityAction({kind}:{kind:GuardActionKind}){
 const tank=kind==='tank_barrier';
 const barrierKey=usePreferencesStore(state=>state.bindings.barrier);
 const view=useSocialStore(state=>state.view),request=useGuardBoostRequestStore();
 const visible=useUIStore(state=>state.screen==='sandbox'&&state.overlay===null&&!state.isModeLoading);
 const status=useNetworkStore(useShallow(state=>{
  const me=state.getMe(),guard=readGuardBoost(me);
  return {player:state.playerId,room:me?.room_id,eligible:tank?isTankBarrierPlayer(state,view):isGuardDpsPlayer(state,view),blocked:tank?tankBarrierBlockReason(me,guard):guardBoostBlockReason(me,guard),
   cooldown:guard?Math.ceil(guard.cooldown_s*10)/10:undefined,remaining:guard?Math.ceil(guard.remaining_s*10)/10:0,shield:guard?Math.ceil(guard.shield_hp):0};
 }));
 if(!visible||!status.eligible)return null;
 const busy=request.busy&&request.key===guardRequestKey(kind);
 const allowed=canDrive(),active=status.remaining>0,ready=!busy&&allowed&&status.blocked==='';
 const name=tank?'Tank barrier':'Guard boost',controls=tank?`${combatKeyLabel(barrierKey??'KeyP')} · DPAD LEFT`:'LB · SHIFT';
 const label=active?(status.shield>0?`${tank?'BARRIER':'SHIELD'} ${status.shield} HP`:tank?'BARRIER BROKEN':'STABILITY'):busy?'REQUESTING':status.blocked||(tank?'BARRIER':'GUARD BOOST');
 const description=tank?'Personal 500 HP frontal shield · 5 seconds · 15 second cooldown · costs 1 L fuel · no boost or invulnerability; side/rear remain vulnerable':'4 seconds · 200 HP front shield · 20 second cooldown · costs 3 L fuel and 4 seconds nitrous · stabilized steering, controlled drift and 60 HP frontal rush contact once per enemy; side/rear remain vulnerable';
 return <button type="button" className="guard-boost-action" aria-label={name} data-ready={ready} data-active={active} data-guard-kind={kind} disabled={!ready} title={`${name} · ${controls} · ${description} · ${label}`} onClick={()=>void (tank?requestTankBarrier():requestGuardBoost())}>
  <CooldownDial progress={cooldownProgress(status.cooldown,tank?TANK_BARRIER_COOLDOWN_S:GUARD_COOLDOWN_S)} label={status.cooldown===undefined?`${name} unavailable`:status.cooldown>0?`${name} cooldown ${Math.ceil(status.cooldown)} seconds`:`${name} ready`}><AttackIcon kind={!tank&&active&&status.shield===0?'boost':'shield'}/></CooldownDial>
  <span>{label}<small>{active?`${status.remaining.toFixed(1)}s`:controls}</small></span>
 </button>;
}

export function GuardBoostAction(){return <GuardAbilityAction kind="brz_guard"/>;}

/** This role action remains available when its optional aiming HUD is hidden. */
export function GuardBoostFallback(){
 const enabled=useCombatStore(state=>state.enabled),hud=useRenderSettingsStore(state=>state.hud);
 const deck=usePreferencesStore(state=>state.hudGroups.turret);
 const tank=useNetworkStore(state=>state.getMe()?.vehicle_id==='tank');
 return hud&&!(enabled&&deck)?<aside className="guard-boost-fallback"><GuardAbilityAction kind={tank?'tank_barrier':'brz_guard'}/></aside>:null;
}
