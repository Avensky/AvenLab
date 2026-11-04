import {matchModeLabel,modeTeamSize} from '../../store/alpha/alphaStore';
import {useEffect,useState} from 'react';
import {isTypingTarget} from '../../controls/inputRouting';
import {ControllerAction} from '../../components/controller';
import {useScoreboardStore} from '../../store/hud/scoreboardStore';
import {useUIStore} from '../../store/menus/uiStore';
import {useNetworkStore} from '../../store/session/networkStore';
import {useSocialStore} from '../../store/social/socialStore';
import {scoreboardPlayers,type ScoreboardPlayer} from './scoreboardData';
import {MatchTeamComposition,MatchStatsTable,MatchPlayerDetails,MatchViewTabs,MatchTeamFilterTabs} from './MatchPresentation';
import './matchScoreboard.css';

type BoardData={session:string;players:ScoreboardPlayer[];stale:boolean;world:string;mode:string;teamSize:3|5};
function readBoard():BoardData{
 const network=useNetworkStore.getState(),view=useSocialStore.getState().view;
 const me=network.getMe(),received=network.snapshot?.received_at_ms;
 return {session:`${network.playerId}:${me?.room_id??network.room_id??''}`,players:scoreboardPlayers(network.snapshot,network.playerId,view),
  stale:received===undefined||!Number.isFinite(received)||performance.now()-received>1000,
  world:network.worldName??view?.worlds.find(world=>world.id===(me?.room_id??network.room_id))?.name??'CURRENT WORLD',
  mode:matchModeLabel(view?.alpha?.active?.mode??'practice',view?.alpha?.active?.team_size),teamSize:modeTeamSize(view?.alpha?.active?.mode??'',view?.alpha?.active?.team_size)};
}

/** Session totals update at a readable 4 Hz, never once per rendered physics
 * pose. This overlay keeps the world mounted and does not edit gameplay state. */
export function MatchScoreboard({onAbilities}:{onAbilities?:()=>void}){
 const open=useScoreboardStore(s=>s.held||s.pinned),close=useScoreboardStore(s=>s.close);
 const view=useScoreboardStore(s=>s.view),setView=useScoreboardStore(s=>s.setView);
 const teamFilter=useScoreboardStore(s=>s.teamFilter),setTeamFilter=useScoreboardStore(s=>s.setTeamFilter),cycleTeamFilter=useScoreboardStore(s=>s.cycleTeamFilter);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const visible=useUIStore(s=>s.screen==='sandbox'&&s.overlay===null&&!s.isModeLoading);
 const connected=useNetworkStore(s=>s.connected);
 const session=useNetworkStore(s=>`${s.playerId}:${s.getMe()?.room_id??s.room_id??''}`);
 const [data,setData]=useState<BoardData|null>(null);
 useEffect(()=>{
  const reset=()=>close(),hidden=()=>{if(document.visibilityState==='hidden')reset();};
  const stopUI=useUIStore.subscribe(state=>{if(state.screen!=='sandbox'||state.overlay!==null||state.isModeLoading)reset();});
  const stopNetwork=useNetworkStore.subscribe((state,previous)=>{if(!state.connected||state.playerId!==previous.playerId||(state.getMe()?.room_id??state.room_id)!==(previous.snapshot?.entities.find(entity=>entity.id===previous.playerId)?.room_id??previous.room_id))reset();});
  window.addEventListener('blur',reset);document.addEventListener('visibilitychange',hidden);
  return()=>{stopUI();stopNetwork();window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',hidden);close();};
 },[close]);
 useEffect(()=>{
  if(!open||!visible||!connected)return;
  const update=()=>setData(previous=>{const next=readBoard();return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});
  update();const timer=window.setInterval(update,250);
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}};
  const changeView=(event:KeyboardEvent)=>{
   if(isTypingTarget(event.target)||event.ctrlKey||event.altKey||event.metaKey)return;
   if(event.code==='PageUp'||event.code==='PageDown'){event.preventDefault();event.stopImmediatePropagation();setView(event.code==='PageUp'?'composition':'table');}
   else if(useScoreboardStore.getState().view==='composition'&&['Digit1','Digit3','Numpad1','Numpad3'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation();cycleTeamFilter(event.code.endsWith('1')?-1:1);}
  };
  window.addEventListener('keydown',escape,true);window.addEventListener('keydown',changeView,true);
  return()=>{window.clearInterval(timer);window.removeEventListener('keydown',escape,true);window.removeEventListener('keydown',changeView,true);};
 },[open,visible,connected,session,close,setView,cycleTeamFilter]);
 if(!open||!visible||!connected)return null;
 const rows=data?.session===session?data.players:[];
 const shownRows=view==='composition'&&teamFilter!=='all'?rows.filter(player=>player.team===teamFilter):rows;
 const selected=shownRows.find(player=>player.id===selectedId)??shownRows.find(player=>player.self)??shownRows[0]??null;
 return <section className="match-scoreboard" role="dialog" aria-modal="false" aria-label="Player statistics" onPointerDown={event=>event.stopPropagation()}>
  <header className="match-scoreboard-header"><div><small>{data?.world??'CURRENT WORLD'} · {data?.mode??'SESSION'}</small><h2>{view==='composition'?'TEAM COMPOSITION':'PLAYER STATISTICS'}</h2></div>
   <div className="match-scoreboard-tools">{onAbilities&&<button type="button" className="menu-control" onClick={()=>{close();onAbilities();}}>HERO ABILITIES</button>}<ControllerAction button="B" className="menu-control" aria-label="Close player statistics" onClick={close}>CLOSE</ControllerAction></div>
  </header>
  <div className="match-scoreboard-status" role="status">{data?.stale?'SNAPSHOT STALE · LAST CONFIRMED TOTALS':'LIVE SESSION TOTALS'}<span>LEVEL IS PROFILE PROGRESSION · MMR PENDING</span></div>
  <MatchViewTabs view={view} onChange={setView}/>
  {view==='composition'&&<MatchTeamFilterTabs filter={teamFilter} onChange={setTeamFilter}/>}
  <div className="match-scoreboard-body" data-view={view}>
   <div className="match-scoreboard-main">{view==='composition'?<MatchTeamComposition teamSize={data?.teamSize} players={rows} teamFilter={teamFilter} selectedId={selected?.id} onSelect={setSelectedId}/>:<MatchStatsTable teamSize={data?.teamSize} players={rows} selectedId={selected?.id} onSelect={setSelectedId}/>}</div>
   <MatchPlayerDetails player={selected}/>
  </div>
  <footer className="match-scoreboard-footer"><span>HOLD TAB · LB / RB: TEAM / STATS · LT / RT: ALL / RED / BLUE</span><span>HEALING INCLUDES SELF · — MEANS UNAVAILABLE</span></footer>
 </section>;
}
