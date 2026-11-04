import {create} from 'zustand';
import {heroForVehicle} from '../store/alpha/alphaStore';
import {requestSocial} from '../net/socialClient';
import {canDrive} from '../controls/inputRouting';
import {useNetworkStore,type PhysicsEntitySnapshot} from '../store/session/networkStore';
import {useSocialStore,type SocialView} from '../store/social/socialStore';
import {useChatStore} from '../store/chat/chatStore';
import {GUARD_FUEL_LITERS,TANK_BARRIER_FUEL_LITERS,readGuardBoost,type GuardActionKind} from './guardBoostState';
export {GUARD_DURATION_S,GUARD_COOLDOWN_S,GUARD_SHIELD_HP,GUARD_FUEL_LITERS,TANK_BARRIER_COOLDOWN_S,TANK_BARRIER_HP,readGuardBoost} from './guardBoostState';
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** Validate the deployed chassis once for the deck, hotkeys and fallback HUD. */
export function playerShield(network=useNetworkStore.getState(),view:SocialView|null=useSocialStore.getState().view):ShieldAction|null{
 const me=network.getMe();
 if(!network.connected||!me?.vehicle_id||(network.room_id!==null && me.room_id!==network.room_id))return null;
 const hero=heroForVehicle(me.vehicle_id),seat=view?.alpha?.active;
 if(!hero || (seat ? seat.world_id!==me.room_id || seat.team!==me.team || seat.hero!==hero.id : !!network.snapshot?.match_state))return null;
 return hero.id==='tank'?'tank_barrier':hero.id==='brz'?'brz_guard':'dive_shield';
}
export function isGuardDpsPlayer(network=useNetworkStore.getState(),view=useSocialStore.getState().view){return playerShield(network,view)==='brz_guard';}
export function isDiveShieldPlayer(network=useNetworkStore.getState(),view=useSocialStore.getState().view){return playerShield(network,view)==='dive_shield';}
export function isTankBarrierPlayer(network=useNetworkStore.getState(),view=useSocialStore.getState().view){return playerShield(network,view)==='tank_barrier';}

export function guardBoostBlockReason(me:PhysicsEntitySnapshot|null|undefined,guard=readGuardBoost(me)){
 if(!guard)return 'SERVER UPDATE REQUIRED';
 if(!me||me.health?.defeated||!me.health||!(me.health.hp>0))return 'VEHICLE DISABLED';
 if(guard.remaining_s>0)return 'ACTIVE';
 if(guard.cooldown_s>0)return 'COOLDOWN';
 if(!(me.vehicle_mask&1))return 'START ENGINE';
 if(!finite(me.gear)||me.gear<=0)return 'SELECT DRIVE';
 if(!finite(me.fuel)||me.fuel<GUARD_FUEL_LITERS)return 'LOW FUEL';
 if(me.wheels&&me.wheels.filter(wheel=>wheel.grounded===true).length<2)return 'GROUND WHEELS';
 return '';
}

export function tankBarrierBlockReason(me:PhysicsEntitySnapshot|null|undefined,guard=readGuardBoost(me)){
 if(!guard)return 'SERVER UPDATE REQUIRED';
 if(!me||!me.health||me.health.defeated||!(me.health.hp>0))return 'VEHICLE DISABLED';
 if(guard.shield_hp>0)return 'ACTIVE';
 if(guard.cooldown_s>0)return 'COOLDOWN';
 if(!(me.vehicle_mask&1))return 'START ENGINE';
 if(!finite(me.fuel)||me.fuel<TANK_BARRIER_FUEL_LITERS)return 'LOW FUEL';
 return '';
}

export function diveShieldBlockReason(me:PhysicsEntitySnapshot|null|undefined,guard=readGuardBoost(me)){
 if(!guard||!finite(guard.dive_remaining_s)||!finite(guard.dive_cooldown_s))return 'SERVER UPDATE REQUIRED';
 if(!me?.health||me.health.defeated||me.health.hp<=0)return 'VEHICLE DISABLED';
 if(guard.dive_remaining_s>0)return 'ACTIVE';
 if(guard.dive_cooldown_s>0)return 'COOLDOWN';
 return me.vehicle_mask&1?'':'START ENGINE';
}
export type ShieldAction=GuardActionKind|'dive_shield';
export const useGuardBoostRequestStore=create<{key:string|null;busy:boolean}>(()=>({key:null,busy:false}));
export function guardRequestKey(kind:ShieldAction){const network=useNetworkStore.getState(),view=useSocialStore.getState().view,me=network.getMe();return `${view?.profile.id??''}:${network.playerId}:${me?.room_id??''}:${me?.vehicle_id??''}:${view?.alpha?.active?.hero??''}:${kind}`;}
async function requestGuardAction(kind:ShieldAction):Promise<boolean>{
 const network=useNetworkStore.getState(),me=network.getMe(),guard=readGuardBoost(me);
 const eligible=playerShield(network)===kind;
 const blocked=kind==='dive_shield'?diveShieldBlockReason(me,guard):kind==='tank_barrier'?tankBarrierBlockReason(me,guard):guardBoostBlockReason(me,guard);
 if(!canDrive()||!eligible||blocked)return false;
 const key=guardRequestKey(kind),pending=useGuardBoostRequestStore.getState();
 if(pending.busy&&pending.key===key)return false;
 useGuardBoostRequestStore.setState({key,busy:true});
 try{
  await requestSocial(kind==='brz_guard'?'dps_guard_boost':kind);
  return guardRequestKey(kind)===key;
 }catch(error){
  if(guardRequestKey(kind)===key)useChatStore.getState().notify(error instanceof Error?error.message:'Shield request failed. Try again.');
  return false;
 }finally{
  if(useGuardBoostRequestStore.getState().key===key)useGuardBoostRequestStore.setState({key:null,busy:false});
 }
}
export function requestGuardBoost(){return requestGuardAction('brz_guard');}
export function requestTankBarrier(){return requestGuardAction('tank_barrier');}

export function requestDiveShield(){return requestGuardAction('dive_shield');}
