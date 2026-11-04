import {useEffect,useRef} from 'react';
import {ControllerAction,ControllerButton} from '../../components/controller';
import {trapMenuFocus} from '../../components/menus/menuFocus';
import {HEROES} from '../../store/alpha/alphaStore';
import {useUIStore} from '../../store/menus/uiStore';
import {closeMatchResults,useMatchResultsStore} from '../../store/session/matchResultsStore';
import {HeroPortrait} from '../alpha/HeroPortrait';
import type {CareerAward,CareerMatch,CareerParticipant,CareerStats} from '../career/careerTypes';
import {MatchPlayerDetails,MatchStatsTable,MatchTeamComposition,MatchTeamFilterTabs} from '../stats/MatchPresentation';
import {formatStat,killDeathRatio} from '../stats/scoreboardData';
import {leaveMatchResults,playAgainFromResults} from './resultActions';
import {RESULT_TABS,resultDuration,resultOutcome,resultPlayers} from './resultData';
import './matchResults.css';

const AWARD_LABELS:Record<CareerAward,string>={mvp:'MVP',svp:'SVP',top_support:'TOP SUPPORT',play_of_the_game:'PLAY OF THE GAME'};
function AwardCard({award,player,record}:{award:CareerAward;player:CareerParticipant|undefined;record:CareerMatch}){
 const hero=HEROES.find(hero=>hero.id===player?.hero),play=record.play_of_game;
 const metric=player?award==='top_support'?`${formatStat(player.stats.healing_done)} HP RESTORED`:award==='play_of_the_game'&&play?`${resultDuration(play.start_s)} – ${resultDuration(play.end_s)}`:`${formatStat(player.stats.kills)} KILLS · ${formatStat(player.stats.assists)} ASSISTS`:null;
 return <article className="result-award" data-award={award} data-team={player?.team??'unknown'} data-empty={!player}>
  <header><span className="result-award-mark" aria-hidden="true">{award==='mvp'?'★':award==='svp'?'☆':award==='top_support'?'+':'▶'}</span><h2>{AWARD_LABELS[award]}</h2></header>
  {player?<><HeroPortrait hero={player.hero} appearance={player.appearance} className="result-award-portrait"/><div className="result-award-identity"><h3>{player.name}</h3><p>{hero?.name??player.hero} · {hero?.role.toUpperCase()??'VEHICLE'}{player.level!==undefined?` · LV ${player.level}`:''}</p></div><strong>{metric}</strong><small>{award==='mvp'?'WINNING TEAM':award==='svp'?'LOSING TEAM':award==='top_support'?'EFFECTIVE TEAM SUPPORT':'SERVER CONFIRMED HIGHLIGHT'}</small></>:<div className="result-award-empty"><strong>—</strong><p>{award==='svp'&&record.winner===null?'NO LOSING TEAM':record.training?'NO COMPETITIVE AWARD':'NO AWARD RECORDED'}</p></div>}
 </article>;
}
function Awards({record}:{record:CareerMatch}){
 const award=(kind:CareerAward)=>record.participants.find(player=>player.awards.includes(kind)&&(kind!=='mvp'||record.winner!==null&&player.team===record.winner)&&(kind!=='svp'||record.winner!==null&&player.team!==record.winner));
 const play=record.play_of_game,performer=play?record.participants.find(player=>player.profile_id===play.profile_id):undefined;
 return <><div className="result-awards-grid">{(['mvp','svp','top_support','play_of_the_game'] as const).map(kind=><AwardCard key={kind} award={kind} player={kind==='play_of_the_game'?performer:award(kind)} record={record}/>)}</div>
  <section className="result-highlight" aria-label="Play of the game summary"><div><small>MATCH HIGHLIGHT</small><h2>{performer?`${performer.name} · PLAY OF THE GAME`:'PLAY OF THE GAME'}</h2><p>{play?`${play.kills} killing blow${play.kills===1?'':'s'} · ${play.captures} capture${play.captures===1?'':'s'} · ${formatStat(play.damage)} damage during ${resultDuration(play.start_s)} – ${resultDuration(play.end_s)}.`:'No highlight was recorded for this session.'}</p></div><p className="result-pending">{play?'REPLAY CAPTURE · PENDING':'HIGHLIGHT DATA · UNAVAILABLE'}<span>{play?'Event summary saved. Cinematic replay recording is a future update.':'Awards appear only when confirmed by the game server.'}</span></p></section>
 </>;
}
const DETAIL_STATS:readonly {key:keyof CareerStats;label:string;decimals?:number;unit?:string}[]=[
 {key:'kills',label:'KILLING BLOWS'},{key:'deaths',label:'DEATHS'},{key:'assists',label:'KILL ASSISTS'},
 {key:'best_kill_streak',label:'BEST KILL STREAK'},{key:'damage_dealt',label:'DAMAGE DONE'},
 {key:'healing_done',label:'HEALING DONE'},{key:'self_healing',label:'SELF HEALING'},
 {key:'gas_burned_liters',label:'GAS BURNED',decimals:1,unit:' L'},{key:'gas_gained_liters',label:'GAS GAINED',decimals:1,unit:' L'},
 {key:'captures',label:'FLAG CAPTURES'},{key:'flag_returns',label:'FLAG RETURNS'},{key:'resurrections',label:'RESURRECTIONS'},{key:'respawns',label:'RESPAWNS'},
];
function PersonalStats({player,self}:{player:CareerParticipant|undefined;self:boolean}){
 if(!player)return <p className="result-empty">No participant statistics were included in this saved result.</p>;
 return <section className="result-personal" aria-label={`${player.name} final statistics`}><header><h2>{self?'YOUR MATCH':player.name.toUpperCase()}</h2><span>K / D {killDeathRatio(player.stats.kills,player.stats.deaths)} · {resultDuration(player.stats.play_time_s)} PLAYED{player.abandoned?' · LEFT EARLY':''}</span></header><dl>{DETAIL_STATS.map(stat=><div key={stat.key}><dt>{stat.label}</dt><dd>{formatStat(player.stats[stat.key],stat.decimals)}{stat.unit}</dd></div>)}<div><dt>MMR</dt><dd>— <small>PENDING RANKED SYSTEM</small></dd></div></dl><p>Healing includes self healing. Resurrections count teammate revivals; respawns are separate. Ranked rating remains pending.</p></section>;
}

/** The same frozen server result powers the post-match overlay and Career
 * history. The world/garage remains mounted underneath; history is read only. */
export function MatchResultsScreen(){
 const state=useMatchResultsStore(),root=useRef<HTMLElement>(null),scroll=useRef<HTMLDivElement>(null);
 const {record,source,profileId,tab,teamFilter,selectedPlayer,busy,error}=state;
 const history=source==='history',rows=record?resultPlayers(record,profileId):[],selected=record?.participants.find(player=>player.profile_id===selectedPlayer),outcome=record?resultOutcome(record,profileId):'completed';
 const close=()=>{if(history)closeMatchResults();else void leaveMatchResults();};
 useEffect(()=>{
  root.current?.focus({preventScroll:true});
  const navigate=(action:string)=>{
   if(useUIStore.getState().overlay!=='match_results')return;
   const current=useMatchResultsStore.getState();
   if(action==='back'){if(current.source==='history')closeMatchResults();else void leaveMatchResults();return;}
   if(action==='activate'){
    const active=document.activeElement as HTMLElement|null;
    if(active?.closest('.match-results')&&active!==root.current)active.click();
    else if(current.source==='history')closeMatchResults();else void playAgainFromResults();
    return;
   }
   if(action==='previous_option'||action==='next_option'){if(current.tab==='team')current.cycleTeamFilter(action==='previous_option'?-1:1);return;}
   if(['previous_tab','next_tab','left','right'].includes(action)){
    const index=RESULT_TABS.indexOf(current.tab),step=action==='previous_tab'||action==='left'?-1:1;
    current.selectTab(RESULT_TABS[(index+step+RESULT_TABS.length)%RESULT_TABS.length]);return;
   }
   if(action==='up'||action==='down'){
    const nodes=[...(root.current?.querySelectorAll<HTMLElement>('[data-result-player]')??[])];
    if(nodes.length){const savedIndex=nodes.findIndex(node=>node.dataset.resultPlayer===current.selectedPlayer),index=savedIndex>=0?savedIndex:nodes.findIndex(node=>node.getAttribute('aria-pressed')==='true'),step=action==='up'?-1:1;nodes[(index+step+nodes.length)%nodes.length]?.click();}
    else scroll.current?.scrollBy({top:action==='up'?-180:180,behavior:'smooth'});
   }
  };
  const panel=(event:Event)=>{if(useUIStore.getState().overlay!=='match_results')return;event.stopImmediatePropagation();navigate((event as CustomEvent<string>).detail);};
  const keyboard=(event:KeyboardEvent)=>{
   if(useUIStore.getState().overlay!=='match_results'||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
   if(['ArrowLeft','ArrowRight'].includes(event.code)&&(event.target as Element|null)?.closest?.('.match-team-filter-tabs'))return;
   const action=({Escape:'back',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyQ:'previous_tab',KeyE:'next_tab',PageUp:'previous_tab',PageDown:'next_tab',Digit1:'previous_option',Digit3:'next_option',Numpad1:'previous_option',Numpad3:'next_option',Enter:'activate',Space:'activate'} as Record<string,string>)[event.code];
   if(!action)return;
   event.preventDefault();event.stopImmediatePropagation();
   if(!event.repeat||action==='up'||action==='down')navigate(action);
  };
  window.addEventListener('avenlab:panel-action',panel,true);window.addEventListener('keydown',keyboard,true);
  return()=>{window.removeEventListener('avenlab:panel-action',panel,true);window.removeEventListener('keydown',keyboard,true);};
 },[]);
 useEffect(()=>{scroll.current?.scrollTo({top:0});},[tab]);
 if(!record)return null;
 const own=record.participants.find(player=>player.profile_id===profileId),visibleRows=teamFilter==='all'?rows:rows.filter(player=>player.team===teamFilter),activeRow=visibleRows.find(player=>player.id===selectedPlayer)??visibleRows.find(player=>player.self)??visibleRows[0];
 return <section ref={root} className="game-ui menu-surface match-results" data-source={source} data-outcome={outcome} role="dialog" aria-modal="true" aria-label={history?'Saved match result':'Match result'} tabIndex={-1} onKeyDown={trapMenuFocus} onPointerDown={event=>event.stopPropagation()}>
  <header className="match-results-header"><div className="result-outcome"><small>{history?'CAREER · MATCH HISTORY':record.training?'TRAINING SESSION':'MATCH COMPLETE'}</small><h1>{outcome==='completed'?'SESSION COMPLETE':outcome.toUpperCase()}</h1></div><div className="result-world"><strong>{record.map.replaceAll('_',' ').toUpperCase()}</strong><span>{record.mode.toUpperCase()} · {resultDuration(record.duration_s)}{record.training?' · TRAINING':''}</span></div><div className="result-final-score" aria-label={`Final score Red ${record.score[0]}, Blue ${record.score[1]}`}><span data-team="red">{record.score[0]}</span><small>FINAL</small><span data-team="blue">{record.score[1]}</span></div></header>
  <nav className="result-tabs" aria-label="Result sections" role="tablist"><span className="result-tab-hint"><ControllerButton button="LB"/></span>{RESULT_TABS.map(value=><button type="button" key={value} role="tab" id={`result-tab-${value}`} aria-controls={`result-panel-${value}`} aria-selected={tab===value} onClick={()=>state.selectTab(value)}>{value.toUpperCase()}</button>)}<span className="result-tab-hint"><ControllerButton button="RB"/></span><p>{history?'ARCHIVED SERVER RESULT':'SERVER CONFIRMED RESULT'}</p></nav>
  <div ref={scroll} className="result-scroll" role="tabpanel" id={`result-panel-${tab}`} aria-labelledby={`result-tab-${tab}`} tabIndex={0}>
   {tab==='awards'&&<><Awards record={record}/><PersonalStats player={own} self/></>}
   {tab==='team'&&<><MatchTeamFilterTabs filter={teamFilter} onChange={state.setTeamFilter}/><div className="result-team-layout"><MatchTeamComposition players={rows} teamFilter={teamFilter} selectedId={activeRow?.id} onSelect={state.selectPlayer}/><MatchPlayerDetails player={activeRow??null}/></div></>}
   {tab==='stats'&&<div className="result-stats-layout"><MatchStatsTable players={rows} selectedId={selectedPlayer} onSelect={state.selectPlayer}/><PersonalStats player={selected??own} self={(selected??own)?.profile_id===profileId}/></div>}
  </div>
  <footer className="match-results-footer"><div className="result-save-status" role={error?'alert':'status'} data-error={Boolean(error)}>{error??(busy?'CONTACTING GAME SERVER…':history?'READ ONLY · SAVED APPEARANCE & MATCH TOTALS':record.training?'TRAINING RECORD · SEPARATE FROM COMPETITIVE CAREER':'MATCH TOTALS · AVAILABLE IN CAREER HISTORY')}</div><div className="result-footer-actions"><ControllerAction button="B" disabled={busy} onClick={close}>{history?'BACK TO CAREER':'LEAVE'}</ControllerAction>{!history&&<ControllerAction button="A" disabled={busy} onClick={()=>void playAgainFromResults()}>PLAY AGAIN</ControllerAction>}</div></footer>
 </section>;
}
