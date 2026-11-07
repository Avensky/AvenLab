import type {CareerAward,CareerMatch,CareerParticipant,CareerStats} from '../career/careerTypes';
import type {ScoreboardPlayer} from '../stats/scoreboardData';

export const RESULT_TABS=['awards','team','stats'] as const;
export type ResultTab=typeof RESULT_TABS[number];
export const CAREER_STAT_FIELDS:readonly (keyof CareerStats)[]=['kills','deaths','assists','resurrections','respawns','captures','flag_returns','damage_dealt','healing_done','self_healing','gas_burned_liters','gas_gained_liters','play_time_s','best_kill_streak'];
const COUNT_FIELDS=new Set<keyof CareerStats>(['kills','deaths','assists','resurrections','respawns','captures','flag_returns','best_kill_streak']);
const AWARDS:readonly CareerAward[]=['mvp','svp','play_of_the_game','top_support'];
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max=160):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const number=(value:unknown,max=1e15):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max;
const integer=(value:unknown,max=Number.MAX_SAFE_INTEGER):value is number=>number(value,max)&&Number.isSafeInteger(value);
const side=(value:unknown)=>value===null||value==='red'||value==='blue';

function validStats(value:unknown):value is CareerStats{
 return object(value)&&CAREER_STAT_FIELDS.every(key=>COUNT_FIELDS.has(key)?integer(value[key]):number(value[key]));
}
function validParticipant(value:unknown):value is CareerParticipant{
 if(!object(value)||!text(value.profile_id,128)||!text(value.name,120)||!side(value.team)||!text(value.hero,80)||!validStats(value.stats)||typeof value.abandoned!=='boolean')return false;
 const appearance=value.appearance;
 if(!object(appearance)||!text(appearance.body,80)||!text(appearance.skin,120)||!['factory','frs','soft'].includes(String(appearance.finish))||!['factory','black','red'].includes(String(appearance.seats))||(appearance.metallic!==undefined&&(!number(appearance.metallic,1))))return false;
 if(!Array.isArray(value.awards)||value.awards.length>4||value.awards.some(award=>!AWARDS.includes(award))||new Set(value.awards).size!==value.awards.length)return false;
 if(value.level!==undefined&&!integer(value.level,1e9))return false;
 return true;
}

/** Socket and archive records share one bounded contract. Invalid values never
 * replace a visible result, and the browser never computes match awards. */
export function parseMatchResult(value:unknown):CareerMatch|null{
 if(!object(value))return null;
 if(value.type==='match_result')value=value.data;
 else if(object(value.match))value=value.match;
 if(!object(value)||!text(value.match_id,128)||!integer(value.world_id)||!text(value.mode,80)||!text(value.map,200)||!integer(value.ended_at)||!number(value.duration_s,31536000)||typeof value.training!=='boolean'||!side(value.winner))return null;
 if(value.team_size!==undefined&&value.team_size!==null&&value.team_size!==3&&value.team_size!==5&&!(value.team_size===1&&(value.mode==='sandbox'||value.mode==='editor')))return null;
 if(!Array.isArray(value.score)||value.score.length!==2||!value.score.every(score=>integer(score,1e9)))return null;
 if(!Array.isArray(value.participants)||value.participants.length>64||!value.participants.every(validParticipant))return null;
 const ids=value.participants.map(participant=>participant.profile_id);
 if(new Set(ids).size!==ids.length)return null;
 if(value.play_of_game!==null){
  const play=value.play_of_game;
  if(!object(play)||!text(play.profile_id,128)||!ids.includes(play.profile_id)||!number(play.start_s,value.duration_s)||!number(play.end_s,value.duration_s)||play.end_s<play.start_s||!number(play.score))return null;
  if(play.description!==undefined&&!text(play.description,1200))return null;
  if(play.replay_available!==undefined&&typeof play.replay_available!=='boolean')return null;
  if(!integer(play.kills)||!integer(play.captures)||!number(play.damage))return null;
 }
 // Freeze the boundary by copying the packet. Callers cannot mutate the saved
 // snapshot through a network object after the result is displayed.
 return structuredClone(value) as CareerMatch;
}

export function resultOutcome(record:CareerMatch,profileId:string|null):'victory'|'defeat'|'draw'|'completed'|'abandoned'{
 const own=record.participants.find(player=>player.profile_id===profileId);
 if(own?.abandoned)return 'abandoned';
 if(record.mode==='sandbox'||record.mode==='editor'||!own?.team)return 'completed';
 if(record.winner===null)return 'draw';
 return own.team===record.winner?'victory':'defeat';
}
export function resultDuration(seconds:number):string{
 const value=Math.floor(seconds),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),rest=String(value%60).padStart(2,'0');
 return hours?`${hours}:${String(minutes).padStart(2,'0')}:${rest}`:`${minutes}:${rest}`;
}
export function resultPlayers(record:CareerMatch,profileId:string|null):ScoreboardPlayer[]{
 return record.participants.map(player=>({id:player.profile_id,profileId:player.profile_id,name:player.name,team:player.team,self:player.profile_id===profileId,hero:player.hero,appearance:player.appearance,waiting:false,defeated:false,status:'completed' as const,kills:player.stats.kills,deaths:player.stats.deaths,stats:player.stats,level:player.level??null}));
}
