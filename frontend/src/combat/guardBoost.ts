import {create} from 'zustand';
import {requestSocial} from '../net/socialClient';
import {canDrive} from '../controls/inputRouting';
import {useNetworkStore,type PhysicsEntitySnapshot} from '../store/session/networkStore';
import {useSocialStore,type SocialView} from '../store/social/socialStore';
import {useChatStore} from '../store/chat/chatStore';
import {GUARD_FUEL_LITERS,TANK_BARRIER_FUEL_LITERS,readGuardBoost,type GuardActionKind} from './guardBoostState';
export {GUARD_DURATION_S,GUARD_COOLDOWN_S,GUARD_SHIELD_HP,GUARD_FUEL_LITERS,TANK_BARRIER_DURATION_S,TANK_BARRIER_COOLDOWN_S,TANK_BARRIER_HP,readGuardBoost} from './guardBoostState';
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** Mechanic shares the BRZ chassis; only the actual admitted DPS hero owns this
 * action. The server repeats this identity, world and team check. */
export function isGuardDpsPlayer(network=useNetworkStore.getState(),view:SocialView|null=useSocialStore.getState().view){
 const me=network.getMe(),active=view?.alpha?.active;
 return Boolean(network.connected&&me?.vehicle_id==='brz'&&active?.hero==='brz'&&active.world_id===me.room_id&&(network.room_id===null||network.room_id===me.room_id)&&active.team===me.team);
}

export function isTankBarrierPlayer(network=useNetworkStore.getState(),view:SocialView|null=useSocialStore.getState().view){
 const me=network.getMe(),active=view?.alpha?.active;
 return Boolean(network.connected&&me?.vehicle_id==='tank'&&active?.hero==='tank'&&active.world_id===me.room_id&&(network.room_id===null||network.room_id===me.room_id)&&active.team===me.team);
}

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
 if(guard.remaining_s>0)return 'ACTIVE';
 if(guard.cooldown_s>0)return 'COOLDOWN';
 if(!(me.vehicle_mask&1))return 'START ENGINE';
 if(!finite(me.fuel)||me.fuel<TANK_BARRIER_FUEL_LITERS)return 'LOW FUEL';
 return '';
}

export const useGuardBoostRequestStore=create<{key:string|null;busy:boolean}>(()=>({key:null,busy:false}));
export function guardRequestKey(kind:GuardActionKind){const network=useNetworkStore.getState(),view=useSocialStore.getState().view,me=network.getMe();return `${view?.profile.id??''}:${network.playerId}:${me?.room_id??''}:${me?.vehicle_id??''}:${view?.alpha?.active?.hero??''}:${kind}`;}
async function requestGuardAction(kind:GuardActionKind):Promise<boolean>{
 const network=useNetworkStore.getState(),me=network.getMe(),guard=readGuardBoost(me);
 const eligible=kind==='tank_barrier'?isTankBarrierPlayer():isGuardDpsPlayer();
 const blocked=kind==='tank_barrier'?tankBarrierBlockReason(me,guard):guardBoostBlockReason(me,guard);
 if(!canDrive()||!eligible||blocked)return false;
 const key=guardRequestKey(kind),pending=useGuardBoostRequestStore.getState();
 if(pending.busy&&pending.key===key)return false;
 useGuardBoostRequestStore.setState({key,busy:true});
 try{
  await requestSocial(kind==='tank_barrier'?'tank_barrier':'dps_guard_boost');
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
