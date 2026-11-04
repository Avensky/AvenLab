import {shallow} from 'zustand/vanilla/shallow';
import {HEROES,heroForVehicle} from '../../store/alpha/alphaStore';
import type {PhysicsEntitySnapshot,PhysicsSnapshot,VehicleSessionStats} from '../../store/session/networkStore';
import type {SocialView} from '../../store/social/socialStore';
import type {HeroAppearance} from '../../vehicles/cosmetics/heroLoadouts';

export type SessionCombatStats=VehicleSessionStats;
export type ScoreboardPlayer={
 id:string;profileId:string|null;name:string;team:'red'|'blue'|null;self:boolean;
 hero:string|null;appearance:HeroAppearance|null;waiting:boolean;defeated:boolean;
 kills:number|null;deaths:number|null;stats:SessionCombatStats|null;level:number|null;
 status?:'selecting'|'ready'|'active'|'defeated'|'reconnecting'|'completed';
 /** A generic mystery card must not derive artwork, role or pick status. */
 heroHidden?:boolean;
};
const nonnegative=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const count=(value:unknown):number|null=>{const n=nonnegative(value);return n===null?null:Math.floor(n);};
const team=(value:unknown):'red'|'blue'|null=>value==='red'||value==='blue'?value:null;

export function killDeathRatio(kills:number|null,deaths:number|null):string{
 if(kills===null||deaths===null)return '—';
 // With no deaths the ratio has no finite denominator; show the counts instead
 // of inventing a divide-by-one ratio or an infinite numeric score.
 return deaths===0?kills===0?'0.00':'UNDEFEATED':(kills/deaths).toFixed(2);
}
export function formatStat(value:number|null,decimals=0):string{
 return value===null?'—':decimals>0?value.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):Math.floor(value).toLocaleString();
}
function readStats(entity:PhysicsEntitySnapshot):SessionCombatStats|null{
 const s=entity.health?.stats;
 if(!s)return null;
 const values={damage_dealt:nonnegative(s.damage_dealt),healing_done:nonnegative(s.healing_done),self_healing:nonnegative(s.self_healing),gas_burned_liters:nonnegative(s.gas_burned_liters),gas_gained_liters:nonnegative(s.gas_gained_liters),assists:count(s.assists),resurrections:count(s.resurrections),respawns:count(s.respawns)};
 if(!Object.values(values).every(value=>value!==null))return null;
 // Streaks were added after the initial session totals. Older servers leave
 // them unavailable rather than showing a fabricated zero.
 const streaks=s as SessionCombatStats&{current_kill_streak?:number;best_kill_streak?:number};
 return {...values,...(count(streaks.current_kill_streak)!==null?{current_kill_streak:count(streaks.current_kill_streak)}:{}),...(count(streaks.best_kill_streak)!==null?{best_kill_streak:count(streaks.best_kill_streak)}:{})} as SessionCombatStats;
}

/** Physics IDs identify connections, while alpha cards identify profiles. Resolve
 * that relationship through this world's explicit membership, never by vehicle,
 * name or team (several players can use the same hero or display name). */
export function scoreboardPlayers(snapshot:PhysicsSnapshot|null,playerId:string,view:SocialView|null):ScoreboardPlayer[]{
 const entities=snapshot?.entities??[],me=entities.find(entity=>entity.id===playerId);
 const worldId=me?.room_id??view?.current_world_id??view?.alpha?.active?.world_id;
 if(worldId===null||worldId===undefined)return [];
 const members=view?.worlds.find(world=>world.id===worldId)?.members??[];
 const roster=(view?.alpha?.roster??[]).filter(card=>card.world_id===worldId||(card.world_id===undefined&&card.id===view?.profile.id&&view?.alpha?.active?.world_id===worldId));
 const seenProfiles=new Set<string>();
 const rows:ScoreboardPlayer[]=entities.filter(entity=>entity.room_id===worldId).map(entity=>{
  const self=entity.id===playerId,member=members.find(item=>item.player_id===entity.id);
  const profileId=self?view?.profile.id??member?.profile_id??null:member?.profile_id??null;
  if(profileId)seenProfiles.add(profileId);
  const card=profileId?roster.find(item=>item.id===profileId):undefined;
  const hidden=card?.hero_hidden===true,desired=self?view?.alpha?.active?.hero:card?.hero;
  const hero=hidden?undefined:HEROES.find(item=>item.id===desired&&item.vehicle===entity.vehicle_id)??heroForVehicle(entity.vehicle_id);
  const ownStyle=self&&hero?view?.profile.progression?.hero_loadouts?.[hero.vehicle]:undefined;
  return {id:entity.id,profileId,name:self?view?.profile.name??member?.name??'YOU':member?.name??card?.name??'UNKNOWN PLAYER',team:team(entity.team),self,
   hero:hero?.id??null,appearance:hidden?null:entity.appearance??card?.appearance??ownStyle??null,heroHidden:hidden,
   waiting:false,defeated:entity.health?.defeated===true,status:hidden?undefined:card?.reconnecting?'reconnecting':entity.health?.defeated===true?'defeated':'active',kills:hidden?null:count(entity.health?.kills),deaths:hidden?null:count(entity.health?.deaths),stats:hidden?null:readStats(entity),
   level:self?count(view?.profile.progression?.level):count(member?.level)} satisfies ScoreboardPlayer;
 });
 // A known teammate may still be choosing a hero or reconnecting. Their card is
 // useful, but absent vehicle totals remain unknown until a snapshot confirms.
 for(const card of roster){
  if(seenProfiles.has(card.id)||rows.some(row=>row.self&&view?.profile.id===card.id))continue;
  const self=card.id===view?.profile.id,hidden=card.hero_hidden===true,hero=hidden?undefined:HEROES.find(item=>item.id===(card.hero||card.showcase_hero)),member=members.find(item=>item.profile_id===card.id);
  rows.push({id:`profile:${card.id}`,profileId:card.id,name:card.name,team:team(card.team),self,hero:hero?.id??null,appearance:hidden?null:card.appearance??(self&&hero?view?.profile.progression?.hero_loadouts?.[hero.vehicle]:null)??null,heroHidden:hidden,waiting:true,defeated:false,status:hidden?undefined:card.reconnecting?'reconnecting':card.hero?'ready':'selecting',kills:null,deaths:null,stats:null,level:self?count(view?.profile.progression?.level):count(member?.level)});
 }
 // Guarantee our own card survives a malformed/overfull peer list. Stable sort
 // avoids place changes for pose-only snapshots and does not rank by score.
 return rows.sort((a,b)=>Number(b.self)-Number(a.self)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).slice(0,10);
}

/** Admission is the sole roster boundary before a physics body exists. A
 * showcase supplies artwork, never a confirmed pick or permission to deploy. */
export function preMatchEnemiesRevealed(view:SocialView|null,connected:boolean):boolean{
 const active=view?.alpha?.active;
 // The server publishes phase and round ID from the viewer's exact world.
 // A snapshot from another world/round is never reveal evidence here.
 return !!active&&connected&&Number.isSafeInteger(active.world_id)&&active.world_id>0&&
  (view.current_world_id===null||view.current_world_id===active.world_id)&&
  typeof active.match_id==='string'&&active.match_id.length>0&&
  ['running','overtime','ended'].includes(active.match_phase??'');
}

export function preMatchPlayers(view:SocialView|null,revealEnemies=false):ScoreboardPlayer[]{
 const active=view?.alpha?.active;
 if(!active)return [];
 return scoreboardPlayers(null,'',{...view,current_world_id:active.world_id}).filter(row=>{
  const card=view.alpha?.roster.find(member=>member.id===row.profileId);
  return card?.mode===active.mode;
 }).map(row=>{
  const card=view.alpha?.roster.find(member=>member.id===row.profileId);
  if(card?.hero_hidden||row.team!==active.team&&!revealEnemies)return {...row,hero:null,appearance:null,status:undefined,heroHidden:true,kills:null,deaths:null,stats:null};
  return row;
 });
}

/** Keep row and list identities when only world poses have changed. Appearance
 * and totals arrive as fresh objects on each decoded network snapshot. */
export function retainScoreboardPlayers(previous:ScoreboardPlayer[],next:ScoreboardPlayer[]) {
 const byId=new Map(previous.map(player=>[player.id,player]));
 let same=previous.length===next.length;
 for(let i=0;i<next.length;i++){
  const row=next[i],old=byId.get(row.id);
  if(old){
   if(shallow(row.appearance,old.appearance))row.appearance=old.appearance;
   if(shallow(row.stats,old.stats))row.stats=old.stats;
   if(shallow(row,old))next[i]=old;
  }
  if(next[i]!==previous[i])same=false;
 }
 return same?previous:next;
}
