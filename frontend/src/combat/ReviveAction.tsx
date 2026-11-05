import { useMotionView } from "../store/session/networkViews";
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
 const view=useSocialStore(state=>state.view);
 const eligible=useMotionView(state=>isMechanicPlayer(state,view));
 const visible=useUIStore(state=>state.screen==='sandbox'&&state.overlay===null&&!state.isModeLoading);
 return visible && eligible ? <MechanicReviveSwitch profile={view?.profile.id??''}/> : null;
}
function MechanicReviveSwitch({profile}:{profile:string}){
 const request=useReviveRequestStore();
 const requestKey=useMotionView(state=>`${profile}:${state.playerId}:${state.getMe()?.room_id??''}`);
 const target=useMotionView(state=>nearestReviveTarget(state.snapshot,state.playerId)?.id??null);
 const cooldown=useMotionView(state=>{
  const value=state.getMe()?.health?.revive_cooldown_s;
  return value===undefined?undefined:Math.ceil(value*10)/10;
 });
 const busy=request.busy&&request.key===requestKey;
 const key=usePreferencesStore(state=>state.bindings.revive);
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
