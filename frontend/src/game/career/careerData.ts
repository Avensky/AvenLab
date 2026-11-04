import type {CareerBucket, CareerHistoryEntry, CareerStats, CareerSummary} from './careerTypes';

export const CAREER_MODES=[['all','All modes'],['quickplay','Quickplay'],['competitive','Competitive'],['skirmish','3v3 CTF'],['training','Training'],['sandbox','Sandbox'],['editor','World editor']] as const;
export const CAREER_STATS: {key:keyof CareerStats;label:string;kind?:'liters'|'duration'|'maximum'}[]=[
 {key:'kills',label:'Eliminations'},{key:'deaths',label:'Deaths'},{key:'assists',label:'Assists'},
 {key:'damage_dealt',label:'Damage dealt'},{key:'healing_done',label:'Healing done'},{key:'self_healing',label:'Self healing'},
 {key:'captures',label:'Flag captures'},{key:'flag_returns',label:'Flag returns'},
 {key:'resurrections',label:'Resurrections'},{key:'respawns',label:'Respawns'},
 {key:'gas_burned_liters',label:'Fuel burned',kind:'liters'},{key:'gas_gained_liters',label:'Fuel gained',kind:'liters'},
 {key:'play_time_s',label:'Time played',kind:'duration'},{key:'best_kill_streak',label:'Best elimination streak',kind:'maximum'},
];
const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
export function formatCareerValue(value:number|undefined,kind?:'liters'|'duration'|'maximum',average=false):string {
 if(value===undefined||!Number.isFinite(value))return '—';
 if(kind==='duration'){
  const seconds=Math.floor(Math.max(0,value));
  if(seconds>=3600)return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;
  if(seconds>=60)return `${Math.floor(seconds/60)}m ${seconds%60}s`;
  return `${seconds}s`;
 }
 if(kind==='liters')return `${decimal.format(value)} L`;
 return (average?decimal:number).format(value);
}
export function emptyCareerBucket():CareerBucket {
 const stats=Object.fromEntries(CAREER_STATS.map(row=>[row.key,0])) as CareerStats;
 return {sessions:0,matches:0,wins:0,losses:0,draws:0,abandoned:0,totals:{...stats},best:{...stats},mvp:0,svp:0,play_of_the_game:0,top_support:0};
}
/** Mode+hero must use the server's complete index, never a sample of history. */
export function selectCareerBucket(career:CareerSummary|undefined,mode:string,hero:string):CareerBucket|undefined {
 if(!career)return undefined;
 if(mode==='all'&&hero==='all')return career.summary;
 if(mode==='all')return career.by_hero[hero]??emptyCareerBucket();
 if(hero==='all')return career.by_mode[mode]??emptyCareerBucket();
 if(!career.by_mode_hero)return undefined;
 return career.by_mode_hero[mode]?.[hero]??emptyCareerBucket();
}
export function careerAverage(bucket:CareerBucket|undefined,key:keyof CareerStats):number|undefined {
 if(!bucket||bucket.sessions===0||key==='best_kill_streak')return undefined;
 return bucket.totals[key]/bucket.sessions;
}
export function historyMatchesFilters(entry:CareerHistoryEntry,mode:string,hero:string) {
 return (mode==='all'||(mode==='training'?entry.training:entry.mode===mode&&!entry.training))&&(hero==='all'||entry.hero===hero);
}
export function careerModeLabel(mode:string,training=false,teamSize?:number|null) {
 const label=training?'Training':CAREER_MODES.find(([id])=>id===mode)?.[1]??mode.replaceAll('_',' ');
 return !training&&(mode==='quickplay'||mode==='competitive')&&(teamSize===3||teamSize===5)?`${label} · ${teamSize}v${teamSize}`:label;
}
export const CAREER_AWARD_LABELS={mvp:'MVP',svp:'SVP',play_of_the_game:'Play of the game',top_support:'Top support'} as const;
