import {create} from 'zustand';
import {canDrive} from '../controls/inputRouting';
import {requestSocial} from '../net/socialClient';
import {useChatStore} from '../store/chat/chatStore';
import {useNetworkStore,type PhysicsEntitySnapshot,type PhysicsSnapshot} from '../store/session/networkStore';
import {useSocialStore} from '../store/social/socialStore';
import {isMechanicPlayer} from './reviveTargets';

export const HEAL_PACK_RANGE_M=30;
export const HEAL_PACK_COOLDOWN_S=1.25;
export const HEAL_PACK_HP=75;
export const HEAL_PACK_FUEL_L=.25;
const positionValid=(entity:PhysicsEntitySnapshot)=>entity.position?.length===3&&entity.position.every(Number.isFinite);
const living=(entity:PhysicsEntitySnapshot)=>entity.health?.defeated===false&&Number.isFinite(entity.health.hp)&&entity.health.hp>0;

/** Preview only: the server independently selects and checks line of sight.
 * Never send the preview's ID or any client-authored healing amount. */
export function nearestHealPackTarget(snapshot:PhysicsSnapshot|null,playerId:string):PhysicsEntitySnapshot|null{
 const me=snapshot?.entities.find(entity=>entity.id===playerId);
 if(!me||!positionValid(me)||!living(me)||!['red','blue'].includes(me.team??'')||snapshot?.match_state?.phase==='ended')return null;
 const distance=(entity:PhysicsEntitySnapshot)=>Math.hypot(entity.position[0]-me.position[0],entity.position[2]-me.position[2]);
 return (snapshot?.entities??[]).filter(entity=>entity.id!==playerId&&entity.room_id===me.room_id&&entity.team===me.team&&positionValid(entity)&&living(entity)&&Number.isFinite(entity.health?.max_hp)&&entity.health!.max_hp>entity.health!.hp&&Math.abs(entity.position[1]-me.position[1])<=6&&distance(entity)<=HEAL_PACK_RANGE_M)
  .sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id))[0]??null;
}

export const useHealPackRequestStore=create<{key:string|null;busy:boolean}>(()=>({key:null,busy:false}));
let nextAttempt=0,attemptKey='',lastNoticeAt=-Infinity;
const actorKey=()=>{const network=useNetworkStore.getState(),view=useSocialStore.getState().view;return `${view?.profile.id??''}:${network.playerId}:${network.getMe()?.room_id??''}:${view?.alpha?.active?.hero??''}`;};

/** Holding primary fire may call this at the input rate. One request can be in
 * flight and accepted shots wait for both the server cooldown and a local
 * minimum interval, avoiding a fresh-zero snapshot race after an ACK. */
export async function requestAssistedHealPack():Promise<boolean>{
 const now=performance.now(),network=useNetworkStore.getState(),me=network.getMe(),key=actorKey();
 if(key!==attemptKey){attemptKey=key;nextAttempt=0;}
 const age=now-(network.snapshot?.received_at_ms??-Infinity),cooldown=me?.support?.cooldown_s;
 if(document.visibilityState==='hidden'||!canDrive()||!isMechanicPlayer()||!me||age<0||age>1000||cooldown===undefined||!Number.isFinite(cooldown)||cooldown!==0||!Number.isFinite(me.fuel)||me.fuel<HEAL_PACK_FUEL_L||!nearestHealPackTarget(network.snapshot,network.playerId)||now<nextAttempt)return false;
 if(useHealPackRequestStore.getState().key===key&&useHealPackRequestStore.getState().busy)return false;
 nextAttempt=now+250;
 useHealPackRequestStore.setState({key,busy:true});
 try{
  await requestSocial('vehicle_heal_pack');
  if(actorKey()!==key)return false;
  nextAttempt=Math.max(nextAttempt,now+HEAL_PACK_COOLDOWN_S*1000);
  return true;
 }catch(error){
  if(actorKey()===key&&performance.now()-lastNoticeAt>1500){lastNoticeAt=performance.now();useChatStore.getState().notify(error instanceof Error?error.message:'Health pack could not launch. Move closer or clear the route.');}
  return false;
 }finally{
  if(useHealPackRequestStore.getState().key===key)useHealPackRequestStore.setState({key:null,busy:false});
 }
}

export function healTargetName(target:PhysicsEntitySnapshot|null){
 if(!target)return 'NO INJURED ALLY';
 const world=useSocialStore.getState().view?.worlds.find(world=>world.id===target.room_id);
 return world?.members.find(member=>member.player_id===target.id)?.name??'INJURED ALLY';
}
