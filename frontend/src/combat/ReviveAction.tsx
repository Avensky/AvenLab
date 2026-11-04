import {useNetworkStore} from '../store/session/networkStore';
import {useSocialStore} from '../store/social/socialStore';
import {useUIStore} from '../store/menus/uiStore';
import {usePreferencesStore} from '../store/preferences/preferencesStore';
import {useRenderSettingsStore} from '../store/presentation/renderSettingsStore';
import {combatKeyLabel} from '../store/preferences/keyBindings';
import {useCombatStore} from './combatStore';
import {HealPackAction} from './HealPackAction';
import {canDrive} from '../controls/inputRouting';
import {AttackIcon} from './AttackIcon';
import {CooldownDial} from './CooldownClock';
import {cooldownProgress} from './weaponCooldown';
import {isMechanicPlayer,nearestReviveTarget,requestNearestRevive,REVIVE_COOLDOWN_S,useReviveRequestStore} from './reviveTargets';
import './reviveAction.css';

export function ReviveAction(){
 const snapshot=useNetworkStore(state=>state.snapshot),playerId=useNetworkStore(state=>state.playerId);
 const view=useSocialStore(state=>state.view);
 const request=useReviveRequestStore(),requestKey=`${view?.profile.id??''}:${playerId}:${snapshot?.entities.find(entity=>entity.id===playerId)?.room_id??''}`,busy=request.busy&&request.key===requestKey;
 const visible=useUIStore(state=>state.screen==='sandbox'&&state.overlay===null&&!state.isModeLoading);
 const key=usePreferencesStore(state=>state.bindings.revive);
 if(!visible||!isMechanicPlayer(useNetworkStore.getState(),view))return null;
 const me=snapshot?.entities.find(entity=>entity.id===playerId),target=nearestReviveTarget(snapshot,playerId),cooldown=me?.health?.revive_cooldown_s;
 const ready=typeof cooldown==='number'&&Number.isFinite(cooldown)&&cooldown===0;
 const status=busy?'REQUESTING':cooldown===undefined?'SERVER UPDATE REQUIRED':!canDrive()?'DISABLED':!ready?'COOLDOWN':target?'RECOVER ALLY':'MOVE NEAR ALLY';
 return <button type="button" className="revive-action" aria-label="Revive nearby teammate" disabled={busy||!canDrive()||!ready||!target} data-ready={ready&&!!target} title={`Mechanic recovery · ${combatKeyLabel(key)} / LB · 8m · stop near a disabled teammate · ${status}`} onClick={()=>void requestNearestRevive()}>
  <CooldownDial progress={cooldownProgress(cooldown,REVIVE_COOLDOWN_S)} label={cooldown===undefined?'Revive cooldown unavailable':ready?'Revive ready':`Revive cooldown ${Math.ceil(cooldown)} seconds`}><AttackIcon kind="repair"/></CooldownDial><span>REVIVE</span>
 </button>;
}
/** The ability remains accessible when optional aim/touch controls are hidden. */
export function ReviveActionFallback(){
 const enabled=useCombatStore(state=>state.enabled),hud=useRenderSettingsStore(state=>state.hud);
 const deck=usePreferencesStore(state=>state.hudGroups.turret);
 return hud&&!(enabled&&deck)?<aside className="revive-action-fallback" data-mechanic-support={true}><ReviveAction/><HealPackAction/></aside>:null;
}
