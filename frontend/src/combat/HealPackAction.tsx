import { useMotionView } from "../store/session/networkViews";
import {HoldButton} from '../controls/TouchControls';
import {useShallow} from 'zustand/react/shallow';
import {canDrive} from '../controls/inputRouting';

import {useSocialStore} from '../store/social/socialStore';
import {useUIStore} from '../store/menus/uiStore';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {combatKeyLabel} from '../store/preferences/keyBindings';
import {combatIntent} from './combatStore';
import {AttackIcon} from './AttackIcon';
import {CooldownDial} from './CooldownClock';
import {cooldownProgress} from './weaponCooldown';
import {HEAL_PACK_COOLDOWN_S,HEAL_PACK_FUEL_L,healTargetName,nearestHealPackTarget,requestAssistedHealPack,useHealPackRequestStore} from './healPackTargets';
import {isMechanicPlayer} from './reviveTargets';
import './healPackAction.css';

export function HealPackAction(){
 const view=useSocialStore(state=>state.view),request=useHealPackRequestStore();
 const visible=useUIStore(state=>state.screen==='sandbox'&&state.overlay===null&&!state.isModeLoading);
 const key=usePreferencesStore(state=>state.bindings.fire);
 const actor=useMotionView(useShallow(state=>{
  const me=state.getMe(),target=nearestHealPackTarget(state.snapshot,state.playerId),cooldown=me?.support?.cooldown_s;
  return {living:me?.health?.defeated===false&&Number.isFinite(me.health.hp)&&me.health.hp>0,ended:state.snapshot?.match_state?.phase==='ended',player:state.playerId,room:me?.room_id,eligible:isMechanicPlayer(state,view),target:target?.id??null,name:healTargetName(target),hp:target?Math.ceil(target.health!.hp):0,maximum:target?Math.ceil(target.health!.max_hp):0,
   cooldown:typeof cooldown==='number'&&Number.isFinite(cooldown)?Math.ceil(cooldown*10)/10:undefined,fuel:!!me&&typeof me.fuel==="number"&&Number.isFinite(me.fuel)&&me.fuel>=HEAL_PACK_FUEL_L,
   healed:me?.support?.pack?.state==='hit'?Math.round(me.support.pack.healed_hp):0};
 }));
 if(!visible||!actor.eligible)return null;
 const cooldown=actor.cooldown,requestKey=`${view?.profile.id??''}:${actor.player}:${actor.room??''}:${view?.alpha?.active?.hero??''}`;
 const busy=request.busy&&request.key===requestKey,ready=actor.living&&!actor.ended&&!busy&&cooldown===0&&!!actor.target&&actor.fuel&&canDrive();
 const status=!actor.living||actor.ended?'DISABLED':!actor.fuel?'LOW FUEL':cooldown===undefined?'SERVER UPDATE REQUIRED':busy?'REQUESTING':actor.healed>0?`+${actor.healed} HP`:actor.target?`${actor.hp} / ${actor.maximum} HP`:'MOVE NEAR AN INJURED ALLY';
 return <HoldButton className="heal-pack-action" aria-label="Launch assisted health pack" disabled={!actor.living||actor.ended||!canDrive()||cooldown===undefined||!actor.fuel} data-resource-warning={!actor.fuel?'Low fuel':undefined} data-ready={ready} onHold={held=>{combatIntent.fire=held;if(held)void requestAssistedHealPack();}} onClick={event=>{if(event.detail===0)void requestAssistedHealPack();}} title={`Health pack · ${combatKeyLabel(key)} / RB · nearest injured ally within 30m · clear line of sight required · 75 HP · 0.25 L fuel`}>
  <CooldownDial progress={cooldownProgress(cooldown,HEAL_PACK_COOLDOWN_S)} label={cooldown===undefined?'Health pack cooldown unavailable':cooldown===0?'Health pack ready':`Health pack cooldown ${cooldown.toFixed(1)} seconds`}><AttackIcon kind="repair"/></CooldownDial>
  <span>HEALTH PACK</span><small>{actor.target?actor.name:'TARGET ASSIST'}</small><output aria-label="Health pack target status">{status}</output>
 </HoldButton>;
}
