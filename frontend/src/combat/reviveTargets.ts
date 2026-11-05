import type { MotionState } from "../store/session/networkViews";
import {create} from 'zustand';
import {requestSocial} from '../net/socialClient';
import {useNetworkStore,type PhysicsEntitySnapshot,type PhysicsSnapshot} from '../store/session/networkStore';
import {useSocialStore,type SocialView} from '../store/social/socialStore';
import {useChatStore} from '../store/chat/chatStore';
import {canDrive} from '../controls/inputRouting';

export const REVIVE_RANGE_M=8;
export const REVIVE_COOLDOWN_S=20;
const validPosition=(entity:PhysicsEntitySnapshot)=>entity.position?.length===3&&entity.position.every(Number.isFinite);
const living=(entity:PhysicsEntitySnapshot)=>entity.health?.defeated===false&&Number.isFinite(entity.health.hp)&&entity.health.hp>0;
/** A chassis alone cannot grant the ability: actual server-confirmed hero and
 * world membership distinguish a Mechanic from an ordinary BRZ. */
export function isMechanicPlayer(network: MotionState = useNetworkStore.getState(),view:SocialView|null=useSocialStore.getState().view){
 const me=network.getMe(),active=view?.alpha?.active;
 return Boolean(network.connected&&me?.vehicle_id==='fortuner'&&active?.hero==='mechanic'&&active.world_id===me.room_id&&(network.room_id===null||network.room_id===me.room_id)&&active.team===me.team);
}
/** Client presentation only. Rust repeats every identity, distance, team,
 * timer, cooldown and safe-placement check before changing the vehicle. */
export function nearestReviveTarget(snapshot:PhysicsSnapshot|null,playerId:string):PhysicsEntitySnapshot|null{
 const me=snapshot?.entities.find(entity=>entity.id===playerId);
 if(!me||!validPosition(me)||!living(me)||!Number.isFinite(me.speed)||Math.abs(me.speed)>3||!['red','blue'].includes(me.team??'')||snapshot?.match_state?.phase==='ended')return null;
 const nearby=(snapshot?.entities??[]).filter(entity=>entity.id!==playerId&&entity.room_id===me.room_id&&entity.team===me.team&&validPosition(entity)&&entity.health?.defeated&&Number.isFinite(entity.health.respawn_remaining_s)&&entity.health.respawn_remaining_s>0&&typeof entity.health.recovery_window_s==='number'&&Number.isFinite(entity.health.recovery_window_s)&&entity.health.recovery_window_s>0&&Math.abs(entity.position[1]-me.position[1])<=4&&Math.hypot(entity.position[0]-me.position[0],entity.position[2]-me.position[2])<=REVIVE_RANGE_M);
 nearby.sort((a,b)=>Math.hypot(a.position[0]-me.position[0],a.position[2]-me.position[2])-Math.hypot(b.position[0]-me.position[0],b.position[2]-me.position[2])||a.id.localeCompare(b.id));
 return nearby[0]??null;
}
export const useReviveRequestStore=create<{key:string|null;busy:boolean}>(()=>({key:null,busy:false}));
function actorKey(){const network=useNetworkStore.getState();return `${useSocialStore.getState().view?.profile.id??''}:${network.playerId}:${network.getMe()?.room_id??''}`;}
export async function requestNearestRevive():Promise<boolean>{
 const network=useNetworkStore.getState(),me=network.getMe(),cooldown=me?.health?.revive_cooldown_s;
 if(!canDrive()||!isMechanicPlayer()||!me||cooldown===undefined||!Number.isFinite(cooldown)||cooldown!==0)return false;
 const target=nearestReviveTarget(network.snapshot,network.playerId),key=actorKey();
 if(!target||(useReviveRequestStore.getState().busy&&useReviveRequestStore.getState().key===key))return false;
 useReviveRequestStore.setState({key,busy:true});
 try{
  await requestSocial('vehicle_revive',{target:target.id});
  if(actorKey()!==key)return false;
  useChatStore.getState().notify(target.health?.disabled_reason==='fuel'?'Teammate refueled and recovered.':'Teammate revived.');
  return true;
 }catch(error){
  if(actorKey()===key)useChatStore.getState().notify(error instanceof Error?error.message:'Recovery request failed. Try again.');
  return false;
 }finally{
  if(useReviveRequestStore.getState().key===key)useReviveRequestStore.setState({key:null,busy:false});
 }
}
